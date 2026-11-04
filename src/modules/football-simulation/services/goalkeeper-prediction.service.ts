import type { Vector2D } from "../types/pitch.types.js";
import type { GoalkeeperContext } from "../types/goalkeeper.types.js";
import type { BallState } from "../types/match.types.js";

import type { BallTrajectoryService } from "./ball-trajectory.service.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

export interface PredictedShot {
  willReachGoal: boolean;
  timeToGoal: number;
  crossingPosition: Vector2D;
  crossingHeight: number;
  isOnTarget: boolean;
}

export class GoalkeeperPredictionService {
  constructor(
    private readonly trajectoryService: BallTrajectoryService,
  ) {}

  predictShot(
    context: GoalkeeperContext,
    ball: BallState,
  ): PredictedShot | null {
    const trajectory = this.trajectoryService.predict(
      ball,
      GOALKEEPER_CONSTANTS.SHOT_PREDICTION_TIME,
      0.05,
    );

    const goalX = context.goalPosition.x;

    const direction =
      context.attackingDirection === "LEFT_TO_RIGHT"
        ? -1
        : 1;

    for (
      let index = 0;
      index < trajectory.samples.length - 1;
      index++
    ) {
      const current = trajectory.samples[index];
      const next = trajectory.samples[index + 1];

      if (!current || !next) {
        continue;
      }

      const crossedGoalLine =
        direction === -1
          ? current.position.x >= goalX &&
            next.position.x <= goalX
          : current.position.x <= goalX &&
            next.position.x >= goalX;

      if (!crossedGoalLine) {
        continue;
      }

      const xDistance =
        next.position.x - current.position.x;

      const ratio =
        Math.abs(xDistance) < 0.0001
          ? 0
          : (goalX - current.position.x) / xDistance;

      const crossingY =
        current.position.y +
        (next.position.y - current.position.y) * ratio;

      const crossingHeight =
        current.height +
        (next.height - current.height) * ratio;

      const timeToGoal =
        current.time +
        (next.time - current.time) * ratio;

      const halfGoalWidth =
        PITCH_DIMENSIONS.goalWidth / 2;

      const isOnTarget =
        crossingY >=
          context.goalPosition.y - halfGoalWidth &&
        crossingY <=
          context.goalPosition.y + halfGoalWidth &&
        crossingHeight >= 0 &&
        crossingHeight <= PITCH_DIMENSIONS.goalHeight;

      return {
        willReachGoal: true,
        timeToGoal,
        crossingPosition: {
          x: goalX,
          y: crossingY,
        },
        crossingHeight,
        isOnTarget,
      };
    }

    return null;
  }
}