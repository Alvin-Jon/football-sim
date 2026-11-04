import type {
  GoalkeeperContext,
  GoalkeeperDecision,
} from "../types/goalkeeper.types.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";

import { GoalkeeperPositioningService } from "./goalkeeper-positioning.service.js";
import { GoalkeeperPredictionService } from "./goalkeeper-prediction.service.js";

import { PitchService } from "./pitch.service.js";

export class GoalkeeperDecisionService {
  constructor(
    private readonly positioningService: GoalkeeperPositioningService,
    private readonly predictionService: GoalkeeperPredictionService,
  ) {}

  decide(context: GoalkeeperContext): GoalkeeperDecision {
    const { goalkeeper, ball } = context;

    const reasoning: string[] = [];

    const baseDecision = (
      action: GoalkeeperDecision["action"],
      extra: Partial<GoalkeeperDecision> = {},
    ): GoalkeeperDecision => ({
      goalkeeperId: goalkeeper.playerId,
      action,
      reasoning,
      evaluatedAtTick: context.tick,
      ...extra,
    });

    // The goalkeeper already has possession.
    if (ball.possessionPlayerId === goalkeeper.playerId) {
      reasoning.push("Goalkeeper already has possession.");

      return baseDecision("DISTRIBUTE");
    }

    // A teammate has possession.
    if (ball.possessionTeamId !== null &&
        ball.possessionPlayerId !== null &&
        context.teammates.some(
          (player) => player.playerId === ball.possessionPlayerId,
        )) {
      const targetPosition = this.positioningService.getOptimalPosition(
        ball.position,
        context.goalPosition,
        context.attackingDirection,
      );

      reasoning.push("Teammate has possession.");

      return baseDecision("ADJUST_POSITION", {
        targetPosition,
      });
    }

    // Predict an incoming shot.
    const predictedShot = this.predictionService.predictShot(context, ball);

    if (predictedShot?.isOnTarget) {
      reasoning.push("Ball trajectory is heading towards goal.");

      const distance = PitchService.getDistance(
        goalkeeper.position,
        predictedShot.crossingPosition,
      );

      if (distance > GOALKEEPER_CONSTANTS.SAVE_REACH_RADIUS) {
        return baseDecision("DIVE", {
          targetPosition: predictedShot.crossingPosition,
        });
      }

      const saveType =
        goalkeeper.attributes.handling >= 14 &&
        Math.hypot(ball.velocity.x, ball.velocity.y) <=
          GOALKEEPER_CONSTANTS.CATCH_MAX_BALL_SPEED
          ? "CATCH"
          : "PARRY";

      return baseDecision(saveType, {
        saveType,
        targetPosition: predictedShot.crossingPosition,
      });
    }

    // Assess an approaching attacker.
    const nearestOpponent = this.getNearestOpponent(context);

    if (nearestOpponent) {
      const distance = PitchService.getDistance(
        goalkeeper.position,
        nearestOpponent.position,
      );

      const distanceToGoal = PitchService.getDistance(
        nearestOpponent.position,
        context.goalPosition,
      );

      if (
        distance < GOALKEEPER_CONSTANTS.MAX_RUSH_DISTANCE &&
        distanceToGoal < GOALKEEPER_CONSTANTS.MAX_RUSH_DISTANCE &&
        goalkeeper.attributes.oneOnOnes >= 8
      ) {
        reasoning.push("Attacker approaching the goalkeeper.");

        return baseDecision("RUSH_OUT", {
          targetPosition: nearestOpponent.position,
          targetPlayerId: nearestOpponent.playerId,
        });
      }
    }

    // Assess a potential cross or aerial ball.
    const distanceToBall = PitchService.getDistance(
      goalkeeper.position,
      ball.position,
    );

    if (
      ball.height > 0.5 &&
      distanceToBall < GOALKEEPER_CONSTANTS.CLAIM_CROSS_RADIUS &&
      ball.possessionTeamId === null
    ) {
      reasoning.push("Unclaimed aerial ball near goalkeeper.");

      if (goalkeeper.attributes.aerialAbility >= 12) {
        return baseDecision("CLAIM_CROSS", {
          targetPosition: ball.position,
        });
      }

      return baseDecision("PUNCH", {
        saveType: "PUNCH",
        targetPosition: ball.position,
      });
    }

    // Otherwise maintain the optimal position.
    const targetPosition = this.positioningService.getOptimalPosition(
      ball.position,
      context.goalPosition,
      context.attackingDirection,
    );

    reasoning.push("Maintaining defensive goalkeeping position.");

    if (
      this.positioningService.shouldAdjustPosition(
        goalkeeper.position,
        targetPosition,
      )
    ) {
      return baseDecision("ADJUST_POSITION", {
        targetPosition,
      });
    }

    return baseDecision("HOLD_POSITION");
  }

  private getNearestOpponent(context: GoalkeeperContext) {
    if (context.opponents.length === 0) {
      return null;
    }

    return context.opponents.reduce((nearest, current) => {
      const nearestDistance = PitchService.getDistance(
        context.goalkeeper.position,
        nearest.position,
      );

      const currentDistance = PitchService.getDistance(
        context.goalkeeper.position,
        current.position,
      );

      return currentDistance < nearestDistance ? current : nearest;
    });
  }
}