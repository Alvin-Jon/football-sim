import type { BallState } from "../types/match.types.js";
import type {
  BallTrajectory,
  BallTrajectorySample,
} from "../types/ball-trajectory.types.js";

import { BallPhysicsService } from "./ball-physics.service.js";

export class BallTrajectoryService {
  constructor(
    private readonly ballPhysicsService: BallPhysicsService,
  ) {}

  predict(
    ball: BallState,
    duration = 3,
    interval = 0.1,
  ): BallTrajectory {
    if (duration <= 0 || interval <= 0) {
      throw new Error(
        "Duration and interval must be greater than zero.",
      );
    }

    // Never mutate the actual match ball during prediction.
    const simulatedBall: BallState = {
      ...ball,
      position: { ...ball.position },
      velocity: { ...ball.velocity },
    };

    const samples: BallTrajectorySample[] = [];

    let elapsedTime = 0;

    samples.push(this.createSample(simulatedBall, elapsedTime));

    while (elapsedTime < duration) {
      const deltaTime = Math.min(
        interval,
        duration - elapsedTime,
      );

      this.ballPhysicsService.update(
        simulatedBall,
        deltaTime,
      );

      elapsedTime += deltaTime;

      samples.push(
        this.createSample(simulatedBall, elapsedTime),
      );

      // Stop predicting if the ball has effectively stopped.
      if (
        simulatedBall.height === 0 &&
        simulatedBall.verticalVelocity === 0 &&
        Math.hypot(
          simulatedBall.velocity.x,
          simulatedBall.velocity.y,
        ) < 0.01
      ) {
        break;
      }
    }

    return {
      samples,
      duration: elapsedTime,
    };
  }

  getPositionAtTime(
    trajectory: BallTrajectory,
    time: number,
  ): BallTrajectorySample | null {
    const { samples } = trajectory;

    if (
      samples.length === 0 ||
      time < 0 ||
      time > trajectory.duration
    ) {
      return null;
    }

    for (let index = 0; index < samples.length - 1; index++) {
      const current = samples[index];
      const next = samples[index + 1];

      if (!current || !next) {
        continue;
      }

      if (
        time >= current.time &&
        time <= next.time
      ) {
        const interval = next.time - current.time;

        const ratio =
          interval === 0
            ? 0
            : (time - current.time) / interval;

        return {
          time,
          position: this.interpolateVector(
            current.position,
            next.position,
            ratio,
          ),
          velocity: this.interpolateVector(
            current.velocity,
            next.velocity,
            ratio,
          ),
          height:
            current.height +
            (next.height - current.height) * ratio,
          verticalVelocity:
            current.verticalVelocity +
            (next.verticalVelocity -
              current.verticalVelocity) * ratio,
        };
      }
    }

    return samples[samples.length - 1] ?? null;
  }

  private createSample(
    ball: BallState,
    time: number,
  ): BallTrajectorySample {
    return {
      time,
      position: { ...ball.position },
      velocity: { ...ball.velocity },
      height: ball.height,
      verticalVelocity: ball.verticalVelocity,
    };
  }

  private interpolateVector(
    from: { x: number; y: number },
    to: { x: number; y: number },
    ratio: number,
  ) {
    return {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };
  }
}