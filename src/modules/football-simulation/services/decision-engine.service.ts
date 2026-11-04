import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
  DecisionResult,
} from "../types/decision.types.js";
import { DecisionEvaluationService } from "./decision-evaluation.service.js";
import { DecisionPositionService } from "./decision-position.service.js";
import { PassingEvaluationService } from "./passing-evaluation.service.js";
import { PitchService } from "./pitch.service.js";
import { MovementEvaluationService } from "./movement-evaluation.service.js";
import { PositioningService } from "./positioning.service.js";
import { DefensiveEvaluationService } from "./defensive-evaluation.service.js";

import type { FormationSlot } from "../types/formation.types.js";
import type { FormationFluidity } from "../types/formation.types.js";

export class DecisionEngineService {
  private readonly positionService = new DecisionPositionService();
  private readonly evaluationService = new DecisionEvaluationService();
  private readonly pitchService = new PitchService();
  private readonly passingEvaluationService = new PassingEvaluationService();
  private readonly movementEvaluationService = new MovementEvaluationService();
  private readonly defensiveEvaluationService = new DefensiveEvaluationService();
  private generateOnBallActions(
    context: DecisionContext,
  ): DecisionCandidate[] {
    const candidates: DecisionCandidate[] = [];

    const playerPosition = context.player.state.position;

    const goalPosition = context.goalPosition;

    const distanceToGoal = PitchService.getDistance(
      playerPosition,
      goalPosition,
    );

    // Shooting
    candidates.push({
      action: "SHOOT",
      score: 0,
      reasoning: ["Player has possession"],
    });

    // Dribbling
    const dribbleTarget = PitchService.clampPosition(
      this.positionService.getForwardPosition(
        playerPosition,
        10,
        context.attackingDirection,
      ),
    );

    candidates.push({
      action: "DRIBBLE",
      score: 0,
      targetPosition: dribbleTarget,
      reasoning: ["Progress with the ball"],
    });

    // Crossing
    if (distanceToGoal < 35) {
      candidates.push({
        action: "CROSS",
        score: 0,
        targetPosition: goalPosition,
        reasoning: ["Deliver the ball into the attacking area"],
      });
    }

    // Passing options
    for (const teammate of context.teammates) {
      if (teammate.player.id === context.player.player.id) {
        continue;
      }

      const teammatePosition = teammate.state.position;

      const distance = PitchService.getDistance(
        playerPosition,
        teammatePosition,
      );

      const forwardDistance =
        this.positionService.getForwardDistance(
          playerPosition,
          teammatePosition,
          context.attackingDirection,
        );

      const isAhead = forwardDistance > 5;

      // Long-distance passing
      if (distance > 35) {
        candidates.push({
          action: "LONG_BALL",
          score: 0,
          targetPlayerId: teammate.player.id,
          targetPosition: teammatePosition,
          reasoning: ["Long-distance passing option"],
        });

        continue;
      }

      // Normal passing
      candidates.push({
        action: "PASS",
        score: 0,
        targetPlayerId: teammate.player.id,
        targetPosition: teammatePosition,
        reasoning: ["Available teammate"],
      });

      // Through ball
      if (isAhead) {
        candidates.push({
          action: "THROUGH_BALL",
          score: 0,
          targetPlayerId: teammate.player.id,
          targetPosition: teammatePosition,
          reasoning: ["Teammate is ahead of the ball"],
        });
      }
    }

    // Retain possession
    candidates.push({
      action: "HOLD_BALL",
      score: 0,
      reasoning: ["Retain possession"],
    });

    return candidates;
  }

  private generateOffBallActions(
    context: DecisionContext,
  ): DecisionCandidate[] {
    const candidates: DecisionCandidate[] = [];

    const playerPosition = context.player.state.position;

    const nearestOpponent = this.findNearestOpponent(
      playerPosition,
      context,
    );

    const nearestOpponentToBall = this.findNearestOpponent(
      context.ball.position,
      context,
    );

    const ballCarrier = context.opponents.find((opponent) => opponent.player.id === context.ball.possessionPlayerId);



    const defensiveTarget = ballCarrier ?? nearestOpponent;

    if (context.phase === "DEFENDING") {
      // Press the opponent closest to the ball
      if (defensiveTarget) {
        candidates.push({
          action: "PRESS",
          score: 0,
          targetPosition: defensiveTarget.state.position,
          targetPlayerId: defensiveTarget.player.id,
          reasoning: ["Apply pressure to the opposition"],
        });

        const distance = PitchService.getDistance(
          playerPosition,
          defensiveTarget.state.position,
        );

        if (ballCarrier && distance <= 3) {
          candidates.push({
            action: "TACKLE",
            score: 0,
            targetPosition: ballCarrier.state.position,
            targetPlayerId: ballCarrier.player.id,
            reasoning: ["Attempt a normal tackle"],
          });

          candidates.push({
            action: "HARD_TACKLE",
            score: 0,
            targetPosition: ballCarrier.state.position,
            targetPlayerId: ballCarrier.player.id,
            reasoning: ["Attempt an aggressive tackle"],
          });
        }
      }

      // Mark nearest opponent
      if (nearestOpponent) {
        candidates.push({
          action: "MARK",
          score: 0,
          targetPosition: nearestOpponent.state.position,
          targetPlayerId: nearestOpponent.player.id,
          reasoning: ["Opponent available to mark"],
        });
      }

      // Intercept
      candidates.push({
        action: "INTERCEPT",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Attempt to intercept possession"],
      });

      // Defensive recovery
      candidates.push({
        action: "TRACK_BACK",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Defensive recovery"],
      });
    } else if (context.phase === "ATTACKING") {
        candidates.push(
          ...this.movementEvaluationService.generateCandidates(
            context,
          ),
    );
  } else {
      // No clear possession: transition
      candidates.push({
        action: "MOVE",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Move towards the developing play"],
      });

      candidates.push({
        action: "SUPPORT",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Provide support during transition"],
      });
    }

    return candidates;
  }

  private findNearestOpponent(
    position: { x: number; y: number },
    context: DecisionContext,
  ) {
    let nearestOpponent:
      | DecisionContext["opponents"][number]
      | undefined;

    let shortestDistance = Infinity;

    for (const opponent of context.opponents) {
      const distance = PitchService.getDistance(
        position,
        opponent.state.position,
      );

      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestOpponent = opponent;
      }
    }

    return nearestOpponent;
  }

  decide(context: DecisionContext): DecisionResult {
    const hasBall =
      context.ball.possessionPlayerId ===
      context.player.player.id;

    const candidates = hasBall
      ? this.generateOnBallActions(context)
      : this.generateOffBallActions(context);

    const evaluatedCandidates = candidates.map(
      (candidate) => {
        const baseScore =
          DecisionEvaluationService.evaluate(
            context,
            candidate,
          );

        const passingScore =
          this.passingEvaluationService.evaluate(
            context,
            candidate,
          );

        const movementScore =
          this.movementEvaluationService.evaluate(
            context,
            candidate,
          );

        const defensiveScore =
          this.defensiveEvaluationService.evaluate(
            context,
            candidate,
          );

        return {
          ...candidate,
          score:
            baseScore +
            passingScore +
            movementScore +
            defensiveScore,
        };
      },
    );

    evaluatedCandidates.sort(
      (a, b) => b.score - a.score,
    );

    const selected = evaluatedCandidates[0];

    if (!selected) {
      throw new Error(
        `No decision candidates available for player ${context.player.player.id} at tick ${context.tick}`,
      );
    }

    return {
      playerId: context.player.player.id,
      action: selected.action,

      ...(selected.targetPosition !== undefined && {
        targetPosition: selected.targetPosition,
      }),

      ...(selected.targetPlayerId !== undefined && {
        targetPlayerId: selected.targetPlayerId,
      }),

      score: selected.score,
      reasoning: selected.reasoning,
      evaluatedAtTick: context.tick,
    };
  }

  evaluatePosition(
    position: { x: number; y: number },
    slot: FormationSlot,
    phase: "ATTACKING" | "DEFENDING",
    fluidity: FormationFluidity,
  ): number {
    return PositioningService.getPositioningPreference(
      position,
      slot,
      phase,
      fluidity,
    );
  }
}