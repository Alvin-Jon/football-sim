import type { Vector2D } from "../types/pitch.types.js";
import type { AttackingDirection } from "./decision-position.service.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { PitchService } from "./pitch.service.js";
import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";

export class GoalkeeperPositioningService {
  getOptimalPosition(
    ballPosition: Vector2D,
    goalPosition: Vector2D,
    direction: AttackingDirection,
  ): Vector2D {
    const attackSign = direction === "LEFT_TO_RIGHT" ? 1 : -1;

    const distanceToGoal = PitchService.getDistance(
      ballPosition,
      goalPosition,
    );

    const forwardDistance = Math.min(
      GOALKEEPER_CONSTANTS.MAX_POSITIONING_DISTANCE,
      Math.max(1, distanceToGoal * 0.12),
    );

    // The keeper stands IN FRONT of his own goal, towards the pitch. The goal
    // is at x = 0 when the team attacks left to right, so in front of it is
    // +x. (This used to subtract, which pushed him off the pitch and clamped
    // him onto the goal line.)
    const x =
      goalPosition.x +
      attackSign * forwardDistance;

    const y = this.calculateLateralPosition(
      ballPosition,
      goalPosition,
    );

    return PitchService.clampPosition({ x, y });
  }

  private calculateLateralPosition(
    ball: Vector2D,
    goal: Vector2D,
  ): number {
    const centerY = PITCH_DIMENSIONS.width / 2;
    const halfGoal = PITCH_DIMENSIONS.goalWidth / 2;

    const ballDistance = Math.abs(ball.x - goal.x);

    if (ballDistance < 0.1) {
      return centerY;
    }

    const ballOffset = ball.y - centerY;

    // Reduce lateral movement when the ball is far away.
    const influence = Math.min(1, 20 / ballDistance);

    const targetY = centerY + ballOffset * influence * 0.5;

    return Math.max(
      centerY - halfGoal,
      Math.min(centerY + halfGoal, targetY),
    );
  }

  shouldAdjustPosition(
    current: Vector2D,
    target: Vector2D,
  ): boolean {
    return (
      PitchService.getDistance(current, target) > 0.8
    );
  }
}