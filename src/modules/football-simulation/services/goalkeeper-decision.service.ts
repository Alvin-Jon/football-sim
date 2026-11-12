import type {
  GoalkeeperContext,
  GoalkeeperDecision,
} from "../types/goalkeeper.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";
import {
  DIVE_CONSTANTS,
  getDiveSpeed,
} from "../constants/goalkeeper-dive.constants.js";

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

      // Where along the ball's path can he meet it? Not only where it will
      // cross the goal line: a keeper who has come out can meet it earlier.
      const intercept = this.predictionService.findInterceptPoint(
        context,
        ball,
        getDiveSpeed(goalkeeper.attributes.reflexes, goalkeeper.stamina),
        DIVE_CONSTANTS.MAX_DIVE_DISTANCE +
          GOALKEEPER_CONSTANTS.SAVE_REACH_RADIUS,
        predictedShot.timeToGoal,
      );

      const saveTarget = intercept?.position ?? predictedShot.crossingPosition;

      const distance = PitchService.getDistance(
        goalkeeper.position,
        saveTarget,
      );

      if (distance > GOALKEEPER_CONSTANTS.SAVE_REACH_RADIUS) {
        return baseDecision("DIVE", {
          targetPosition: saveTarget,
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
        targetPosition: saveTarget,
      });
    }

    // Rush out only at an attacker who has the ball and is bearing down on
    // goal. Previously ANY attacker near the box triggered a rush, which
    // dragged the keeper away from his goal.
    const carrier = context.opponents.find(
      (opponent) => opponent.playerId === ball.possessionPlayerId,
    );

    if (carrier) {
      const distance = PitchService.getDistance(
        goalkeeper.position,
        carrier.position,
      );

      const distanceToGoal = PitchService.getDistance(
        carrier.position,
        context.goalPosition,
      );

      if (
        distance < GOALKEEPER_CONSTANTS.MAX_RUSH_DISTANCE &&
        distanceToGoal < GOALKEEPER_CONSTANTS.RUSH_ZONE_DISTANCE &&
        goalkeeper.attributes.oneOnOnes >= 8
      ) {
        reasoning.push("Attacker with the ball approaching the goalkeeper.");

        return baseDecision("RUSH_OUT", {
          targetPosition: this.limitFromGoal(carrier.position, context),
          targetPlayerId: carrier.playerId,
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

  // Keeps a rush target within MAX_RUSH_FROM_GOAL of the goal.
  private limitFromGoal(
    position: Vector2D,
    context: GoalkeeperContext,
  ): Vector2D {
    const goal = context.goalPosition;
    const dx = position.x - goal.x;
    const dy = position.y - goal.y;
    const distance = Math.hypot(dx, dy);
    const max = GOALKEEPER_CONSTANTS.MAX_RUSH_FROM_GOAL;

    if (distance <= max) return position;

    const ratio = max / distance;

    return {
      x: goal.x + dx * ratio,
      y: goal.y + dy * ratio,
    };
  }
}