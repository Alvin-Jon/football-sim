import type { Vector2D } from "../types/pitch.types.js";
import type { GoalkeeperContext } from "../types/goalkeeper.types.js";
import type { BallState } from "../types/match.types.js";

import type { BallTrajectoryService } from "./ball-trajectory.service.js";
import { PitchService } from "./pitch.service.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";
import { DIVE_CONSTANTS } from "../constants/goalkeeper-dive.constants.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

export interface PredictedShot {
  willReachGoal: boolean;
  timeToGoal: number;
  crossingPosition: Vector2D;
  crossingHeight: number;
  isOnTarget: boolean;
}

export interface InterceptPoint {
  position: Vector2D;
  time: number;
  height: number;
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

  /**
   * The earliest point on the ball's path, before it reaches the goal line,
   * that the keeper can get to in time. A keeper who has come off his line
   * can meet a shot well before the goal line, and the old logic only ever
   * looked at where the ball would CROSS the line (which was often 11 m
   * from a keeper who had rushed out).
   */
  findInterceptPoint(
    context: GoalkeeperContext,
    ball: BallState,
    keeperSpeed: number,
    maxDistance: number,
    latestTime: number,
  ): InterceptPoint | null {
    const trajectory = this.trajectoryService.predict(
      ball,
      GOALKEEPER_CONSTANTS.SHOT_PREDICTION_TIME,
      0.05,
    );

    const keeper = context.goalkeeper.position;

    for (const sample of trajectory.samples) {
      if (sample.time > latestTime) break;
      if (sample.height > PITCH_DIMENSIONS.goalHeight) continue;

      const gap = PitchService.getDistance(keeper, sample.position);
      if (gap > maxDistance) continue;

      // He must cover everything beyond his own reach radius, after
      // reacting, before the ball gets there.
      const toCover = Math.max(0, gap - GOALKEEPER_CONSTANTS.SAVE_REACH_RADIUS);
      const timeNeeded =
        DIVE_CONSTANTS.REACTION_TIME + toCover / keeperSpeed;

      if (timeNeeded <= sample.time) {
        return {
          position: { ...sample.position },
          time: sample.time,
          height: sample.height,
        };
      }
    }

    return null;
  }
}