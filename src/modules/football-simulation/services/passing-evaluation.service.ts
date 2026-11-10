import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
  DecisionPlayer,
} from "../types/decision.types.js";
import type { Vector2D } from "../types/pitch.types.js";
import type { PassType } from "../types/passing.types.js";

import { MOVEMENT_CONSTANTS } from "../constants/movement.constants.js";

import { PitchService } from "./pitch.service.js";
import { DecisionPositionService } from "./decision-position.service.js";
import { PassingService } from "./passing.service.js";
import type { PassFlight } from "./passing.service.js";
import { ReceivingService } from "./receiving.service.js";
import { TacticsService } from "./tactics.service.js";
import { calculatePressure } from "../utils/pressure.utils.js";

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/**
 * Scores a pass as an expected value:
 *
 *   score = p(complete) * reward - (1 - p(complete)) * turnoverCost + extras
 *
 * p(complete) is built from the same maths the match uses (ball flight,
 * defender reach times, receiver control chance). The team's tactics change
 * how DANGEROUS the team perceives lanes and pressure to be, how much it
 * values progression, and the completion probability it demands, so a
 * possession side and a direct side look at the same pass differently.
 */
export class PassingEvaluationService {
  private static readonly EVAL = {
    ACCURATE_RADIUS: 1.5,
    MISCONTROL_LOSS_SHARE: 0.5,
    MAX_PRESSURE_LOSS: 0.3,
    MAX_FACING_LOSS: 0.08,
    RECEIVER_REACTION: 0.2,
    CATCH_WINDOW: 0.5, // seconds either side of "arrives together"
    ARRIVAL_PRESSURE_FULL: 1,
    ARRIVAL_PRESSURE_NONE: 6,
    TURNOVER_OWN_GOAL: 24,
    TURNOVER_FINAL_THIRD: 6,
    SHORTFALL_PENALTY: 60,
    RELEASE_URGENCY: 6,
  } as const;

  private readonly positionService = new DecisionPositionService();

  evaluate(context: DecisionContext, candidate: DecisionCandidate): number {
    const passType = this.toPassType(candidate.action);
    if (!passType) return 0;

    if (!candidate.targetPosition) return -100;

    const receiver = context.teammates.find(
      (teammate) => teammate.player.id === candidate.targetPlayerId,
    );
    if (!receiver) return -100;

    const E = PassingEvaluationService.EVAL;
    const t = context.tactics;
    const passer = context.player;
    const from = passer.state.position;
    const to = candidate.targetPosition;

    const distance = PitchService.getDistance(from, to);
    if (distance < 0.1) return -100;

    const flight = PassingService.getFlight(passType, distance);
    const passerPressure = calculatePressure(from, context.opponents);

    // The receiver may need longer than the ball to get to a through ball.
    const receiverReach =
      PitchService.getDistance(receiver.state.position, to) /
      this.getRunSpeed(receiver);
    const collectTime = Math.max(
      flight.totalTime,
      receiverReach + E.RECEIVER_REACTION,
    );

    // --- Can the pass be delivered? ------------------------------------
    const accuracy = PassingService.getAccuracy(passer.player.attributes, passType);
    const errorRadius = PassingService.getErrorRadius(
      accuracy,
      distance,
      passerPressure,
      passer.player.attributes.composure,
    );
    const pAccurate = Math.min(1, E.ACCURATE_RADIUS / Math.max(errorRadius, 0.01));

    // --- Will a defender get there first? ------------------------------
    const laneBlock = this.getLaneBlockProbability(
      from,
      to,
      distance,
      passType,
      flight,
      collectTime,
      context,
    );

    // --- Can the receiver control it, and keep it? ----------------------
    const receiverAttributes = receiver.player.attributes;
    const control = ReceivingService.estimateControlChance(
      receiverAttributes,
      flight.speedAt(distance),
    );
    // A miscontrol is not always a lost ball.
    const effectiveControl = 1 - (1 - control) * E.MISCONTROL_LOSS_SHARE;

    const arrivalPressure = this.getArrivalPressure(to, collectTime, context);
    const resilience =
      (receiverAttributes.ballControl + receiverAttributes.composure) / 40;
    const pressureLoss =
      arrivalPressure * E.MAX_PRESSURE_LOSS * (1.25 - 0.5 * resilience);

    // Receiving a simple pass with his back to the passer is awkward.
    // Not applied to through/long balls (running onto them is the point).
    let facingLoss = 0;
    if (passType === "SHORT" && receiver.state.currentSpeed < 2.5) {
      const toPasser = Math.atan2(
        from.y - receiver.state.position.y,
        from.x - receiver.state.position.x,
      );
      const facing = Math.cos(receiver.state.direction - toPasser);
      facingLoss =
        E.MAX_FACING_LOSS * ((1 - facing) / 2) * (0.5 + arrivalPressure);
    }

    // The tactic decides how threatening lanes and pressure LOOK.
    const perceivedBlock = Math.min(0.95, laneBlock * t.passLaneWeight);
    const perceivedLoss = Math.min(0.8, pressureLoss * t.passPressureWeight);

    const pPerceived =
      pAccurate *
      (1 - perceivedBlock) *
      effectiveControl *
      (1 - perceivedLoss) *
      (1 - facingLoss);

    // --- Reward and cost -------------------------------------------------
    const forwardDistance = this.positionService.getForwardDistance(
      from,
      to,
      context.attackingDirection,
    );

    const progression = this.evaluateForwardProgress(forwardDistance, passType);
    const progressionPoints =
      progression > 0 ? progression * t.passProgressionWeight : progression;

    // Safe recycling passes are worth more when the passer is under pressure.
    const recyclePoints =
      forwardDistance < 5
        ? t.passRecycleBias * (0.6 + 0.8 * passerPressure)
        : 0;

    const reward = progressionPoints + recyclePoints;

    const progressAtLoss =
      (TacticsService.ballProgress(from, context.attackingDirection) +
        TacticsService.ballProgress(to, context.attackingDirection)) /
      2;
    const turnoverCost =
      (E.TURNOVER_OWN_GOAL +
        (E.TURNOVER_FINAL_THIRD - E.TURNOVER_OWN_GOAL) * progressAtLoss) *
      t.passTurnoverCost;

    const fit = this.evaluateDistance(distance, passType);
    const space = this.scalePenalty(
      this.evaluateReceiverSpace(to, context),
      t.passPressureWeight,
    );
    const urgency = passerPressure * E.RELEASE_URGENCY;

    let score =
      pPerceived * reward -
      (1 - pPerceived) * turnoverCost +
      fit +
      space +
      urgency;

    // A soft floor (a multiplier would make negative scores BETTER).
    const shortfall = Math.max(0, t.passMinCompletion - pPerceived);
    score -= shortfall * E.SHORTFALL_PENALTY;

    return score;
  }

  private toPassType(action: DecisionAction): PassType | null {
    switch (action) {
      case "PASS":
        return "SHORT";
      case "THROUGH_BALL":
        return "THROUGH";
      case "LONG_BALL":
        return "LONG";
      default:
        return null;
    }
  }

  private scalePenalty(value: number, scale: number): number {
    return value < 0 ? value * scale : value;
  }

  // ---------------------------------------------------------------------
  // Lane: "can a defender arrive before the ball?"
  // ---------------------------------------------------------------------

  private getLaneBlockProbability(
    from: Vector2D,
    to: Vector2D,
    distance: number,
    passType: PassType,
    flight: PassFlight,
    collectTime: number,
    context: DecisionContext,
  ): number {
    const E = PassingEvaluationService.EVAL;

    // A lofted ball flies over the lane; only the landing area matters.
    const steps =
      passType === "LONG" ? 1 : clamp(Math.ceil(distance / 4), 1, 12);

    let clearProbability = 1;

    for (const opponent of context.opponents) {
      const a = opponent.player.attributes;
      const speed = this.getRunSpeed(opponent);
      const reaction = Math.max(0.1, 0.5 - a.anticipation * 0.02);

      let best = 0;

      for (let i = 1; i <= steps; i++) {
        const f = passType === "LONG" ? 1 : i / steps;
        const along = f * distance;
        const point = {
          x: from.x + (to.x - from.x) * f,
          y: from.y + (to.y - from.y) * f,
        };

        // At the end of the pass the ball is only collected once the
        // receiver is actually there.
        const ballTime = f === 1 ? collectTime : flight.timeAt(along);
        const defenderTime =
          reaction + PitchService.getDistance(opponent.state.position, point) / speed;

        const margin = ballTime - defenderTime; // > 0: defender is there first
        if (margin <= -E.CATCH_WINDOW / 2) continue;

        const danger = clamp((margin + E.CATCH_WINDOW / 2) / E.CATCH_WINDOW, 0, 1);

        // Mirrors InterceptionService's chance to win the ball.
        const chance = clamp(
          0.25 +
            a.anticipation * 0.02 +
            a.positioning * 0.01 -
            flight.speedAt(along) * 0.015,
          0.05,
          0.85,
        );

        best = Math.max(best, danger * chance);
      }

      clearProbability *= 1 - best;
    }

    return 1 - clearProbability;
  }

  // Openness of the receiver when the ball actually gets there.
  private getArrivalPressure(
    to: Vector2D,
    collectTime: number,
    context: DecisionContext,
  ): number {
    const E = PassingEvaluationService.EVAL;
    let nearest = Infinity;

    for (const opponent of context.opponents) {
      const closing =
        this.getRunSpeed(opponent) * 0.45 * Math.min(collectTime, 2);
      const distance = Math.max(
        0,
        PitchService.getDistance(opponent.state.position, to) - closing,
      );
      nearest = Math.min(nearest, distance);
    }

    if (nearest === Infinity) return 0;

    return clamp(
      (E.ARRIVAL_PRESSURE_NONE - nearest) /
        (E.ARRIVAL_PRESSURE_NONE - E.ARRIVAL_PRESSURE_FULL),
      0,
      1,
    );
  }

  private getRunSpeed(player: DecisionPlayer): number {
    const pace = player.player.attributes.pace;
    const base =
      MOVEMENT_CONSTANTS.MIN_SPEED +
      ((pace - 1) / 19) *
        (MOVEMENT_CONSTANTS.MAX_SPEED - MOVEMENT_CONSTANTS.MIN_SPEED);

    const stamina = clamp(
      player.state.stamina / 100,
      MOVEMENT_CONSTANTS.MIN_STAMINA_MULTIPLIER,
      1,
    );

    // 0.9: players are rarely at top speed the instant they react.
    return Math.max(1, base * stamina * 0.9);
  }

  // ---------------------------------------------------------------------
  // Value terms carried over from the previous version
  // ---------------------------------------------------------------------

  private evaluateDistance(distance: number, passType: PassType): number {
    if (passType === "SHORT") {
      if (distance <= 10) return 8;
      if (distance <= 20) return 12;
      if (distance <= 30) return 5;
      return -8;
    }

    if (passType === "THROUGH") {
      if (distance <= 15) return 5;
      if (distance <= 30) return 12;
      if (distance <= 40) return 5;
      return -12;
    }

    if (distance >= 30 && distance <= 50) return 12;
    if (distance > 50 && distance <= 65) return 5;
    return -8;
  }

  private evaluateForwardProgress(
    forwardDistance: number,
    passType: PassType,
  ): number {
    if (passType === "THROUGH") {
      if (forwardDistance >= 15) return 15;
      if (forwardDistance >= 7) return 10;
      if (forwardDistance > 0) return 5;
      return -20;
    }

    if (forwardDistance >= 15) return 8;
    if (forwardDistance >= 5) return 5;
    if (forwardDistance < -10) return -3;

    return 0;
  }

  private evaluateReceiverSpace(
    position: Vector2D,
    context: DecisionContext,
  ): number {
    let nearbyOpponents = 0;

    for (const opponent of context.opponents) {
      if (PitchService.getDistance(position, opponent.state.position) < 5) {
        nearbyOpponents++;
      }
    }

    if (nearbyOpponents === 0) return 8;
    if (nearbyOpponents === 1) return 3;
    if (nearbyOpponents === 2) return -5;

    return -12;
  }
}