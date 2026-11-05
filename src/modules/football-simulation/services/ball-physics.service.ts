import type { BallState } from "../types/match.types.js";

import { BALL_CONSTANTS } from "../constants/ball.constants.js";

export class BallPhysicsService {
  update(ball: BallState, deltaTime: number): void {
    const dt = Math.min(
      Math.max(deltaTime, 0),
      BALL_CONSTANTS.MAX_DELTA_TIME,
    );

    if (dt === 0) return;

    // A ball under a player's possession is controlled by the
    // player-ball interaction system, not free-ball physics.
    if (ball.possessionPlayerId !== null) return;

    this.updateHorizontalMovement(ball, dt);
    this.updateVerticalMovement(ball, dt);
  }

  private updateHorizontalMovement(
    ball: BallState,
    deltaTime: number,
  ): void {
    const speed = Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
    );

    if (speed <= BALL_CONSTANTS.STOP_VELOCITY) {
      ball.velocity = { x: 0, y: 0 };
      return;
    }

    const friction = ball.height > 0
      ? BALL_CONSTANTS.AIR_DRAG * speed
      : BALL_CONSTANTS.GROUND_FRICTION;

    const deceleration = friction * deltaTime;
    const newSpeed = Math.max(0, speed - deceleration);

    const speedRatio = newSpeed / speed;

    ball.velocity.x *= speedRatio;
    ball.velocity.y *= speedRatio;

    ball.position.x += ball.velocity.x * deltaTime;
    ball.position.y += ball.velocity.y * deltaTime;
  }

  private updateVerticalMovement(
    ball: BallState,
    deltaTime: number,
  ): void {
    if (ball.height <= BALL_CONSTANTS.GROUND_LEVEL) {
      ball.height = BALL_CONSTANTS.GROUND_LEVEL;

      if (ball.verticalVelocity <= 0) {
        ball.verticalVelocity = 0;
        return;
      }
    }

    // Apply gravity.
    ball.verticalVelocity -=
      BALL_CONSTANTS.GRAVITY * deltaTime;

    // Update height.
    ball.height += ball.verticalVelocity * deltaTime;

    // Handle ground collision.
    if (ball.height < BALL_CONSTANTS.GROUND_LEVEL) {
      ball.height = BALL_CONSTANTS.GROUND_LEVEL;

      const impactVelocity = Math.abs(ball.verticalVelocity);

      // A hard landing scrubs horizontal speed too.
      if (impactVelocity >= BALL_CONSTANTS.BOUNCE_DAMPING_MIN_IMPACT) {
        ball.velocity.x *= BALL_CONSTANTS.BOUNCE_HORIZONTAL_RETENTION;
        ball.velocity.y *= BALL_CONSTANTS.BOUNCE_HORIZONTAL_RETENTION;
      }

      if (
        impactVelocity >= BALL_CONSTANTS.MIN_BOUNCE_VELOCITY
      ) {
        ball.verticalVelocity =
          impactVelocity * BALL_CONSTANTS.BOUNCE_RESTITUTION;
      } else {
        ball.verticalVelocity = 0;
      }
    }
  }

  isBallMoving(ball: BallState): boolean {
    const horizontalSpeed = Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
    );

    return (
      horizontalSpeed > BALL_CONSTANTS.STOP_VELOCITY ||
      Math.abs(ball.verticalVelocity) > BALL_CONSTANTS.STOP_VELOCITY
    );
  }

  getHorizontalSpeed(ball: BallState): number {
    return Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
    );
  }

  getTotalSpeed(ball: BallState): number {
    return Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
      ball.verticalVelocity,
    );
  }
}