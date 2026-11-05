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
import { DecisionPersistenceService } from "./decision-persistence.service.js";

import type { FormationSlot } from "../types/formation.types.js";
import type { FormationFluidity } from "../types/formation.types.js";

export class DecisionEngineService {
  // How many players per team may leave their position to chase the ball.
  private static readonly CHASER_COUNT = 2;

  // How many players (by closeness to the ball) offer close support.
  private static readonly SUPPORT_COUNT = 3;

  // Maximum score bonus for standing exactly on the shape position.
  private static readonly SHAPE_BONUS = 30;

  // Score lost per metre outside the roam radius.
  private static readonly SHAPE_PENALTY_PER_METRE = 3;

  private readonly positionService = new DecisionPositionService();
  private readonly evaluationService = new DecisionEvaluationService();
  private readonly pitchService = new PitchService();
  private readonly passingEvaluationService = new PassingEvaluationService();
  private readonly movementEvaluationService = new MovementEvaluationService();
  private readonly defensiveEvaluationService = new DefensiveEvaluationService();
  private readonly persistenceService = new DecisionPersistenceService();

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
    let candidates: DecisionCandidate[] = [];

    const formation = context.formation;
    const playerPosition = context.player.state.position;

    // Only the players closest to the ball may chase it.
    const isChaser =
      !formation ||
      formation.ballRank < DecisionEngineService.CHASER_COUNT;

    const nearestOpponent = this.findNearestOpponent(
      playerPosition,
      context,
    );

    const ballCarrier = context.opponents.find(
      (opponent) => opponent.player.id === context.ball.possessionPlayerId,
    );

    const defensiveTarget = ballCarrier ?? nearestOpponent;

    if (context.phase === "DEFENDING") {
      if (defensiveTarget) {
        const distance = PitchService.getDistance(
          playerPosition,
          defensiveTarget.state.position,
        );

        // Press only if you are a designated chaser or already close.
        if (isChaser || distance <= 6) {
          candidates.push({
            action: "PRESS",
            score: 0,
            targetPosition: defensiveTarget.state.position,
            targetPlayerId: defensiveTarget.player.id,
            reasoning: ["Apply pressure to the opposition"],
          });
        }

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

      // Zonal marking: only mark opponents inside your own zone.
      if (
        nearestOpponent &&
        (!formation ||
          PitchService.getDistance(
            nearestOpponent.state.position,
            formation.shapePosition,
          ) <= formation.roamRadius)
      ) {
        candidates.push({
          action: "MARK",
          score: 0,
          targetPosition: nearestOpponent.state.position,
          targetPlayerId: nearestOpponent.player.id,
          reasoning: ["Opponent available to mark"],
        });
      }

      // Recover to the defensive shape (NOT to the ball).
      candidates.push({
        action: "TRACK_BACK",
        score: 0,
        targetPosition: formation?.shapePosition ?? context.ball.position,
        reasoning: ["Recover to defensive shape"],
      });
    } else if (context.phase === "ATTACKING") {
      candidates = this.movementEvaluationService.generateCandidates(context);

      if (formation) {
        // Only the players nearest the ball offer close support.
        if (formation.ballRank > DecisionEngineService.SUPPORT_COUNT) {
          candidates = candidates.filter(
            (candidate) => candidate.action !== "SUPPORT",
          );
        }

        candidates.push({
          action: "MOVE",
          score: 0,
          targetPosition: formation.shapePosition,
          reasoning: ["Hold attacking shape"],
        });
      }
    } else if (isChaser) {
      // Loose ball: only the nearest players go for it.
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

      candidates.push({
        action: "INTERCEPT",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Attempt to win the loose ball"],
      });
    } else {
      candidates.push({
        action: "MOVE",
        score: 0,
        targetPosition: formation?.shapePosition ?? context.ball.position,
        reasoning: ["Hold shape while others contest the ball"],
      });
    }

    return candidates;
  }

  // Rewards targets near the player's shape position and penalises targets
  // outside their roam radius, so the formation is respected.
  private evaluateShapeAdherence(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    const formation = context.formation;

    if (!formation || !candidate.targetPosition) return 0;

    const constrained: DecisionAction[] = [
      "MOVE",
      "SUPPORT",
      "MAKE_RUN",
      "MARK",
      "TRACK_BACK",
    ];

    if (!constrained.includes(candidate.action)) return 0;

    const isChaser =
      formation.ballRank < DecisionEngineService.CHASER_COUNT;

    // Chasers may abandon their position to win a loose ball.
    if (isChaser && context.phase === "TRANSITION") return 0;

    const roam = formation.roamRadius * (isChaser ? 1.6 : 1);

    const distance = PitchService.getDistance(
      candidate.targetPosition,
      formation.shapePosition,
    );

    const sigma = roam * 0.6;

    let score =
      DecisionEngineService.SHAPE_BONUS *
      Math.exp(-0.5 * (distance / sigma) ** 2);

    if (distance > roam) {
      score -=
        (distance - roam) *
        DecisionEngineService.SHAPE_PENALTY_PER_METRE;
    }

    return score;
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

  private calculateDecision(context: DecisionContext): DecisionResult {
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

        const shapeScore = this.evaluateShapeAdherence(
          context,
          candidate,
        );

        return {
          ...candidate,
          score:
            baseScore +
            passingScore +
            movementScore +
            defensiveScore +
            shapeScore,
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

  decide(context: DecisionContext): DecisionResult {
    return this.persistenceService.getDecision(
      context,
      () => this.calculateDecision(context),
    );
  }

  // Explicitly invalidate a player's current decision.
  invalidateDecision(playerId: string): void {
    this.persistenceService.invalidate(playerId);
  }

  clearDecisions(): void {
    this.persistenceService.clear();
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