import type { Vector2D } from "./pitch.types.js";

export interface BallTrajectorySample {
  time: number;
  position: Vector2D;
  velocity: Vector2D;
  height: number;
  verticalVelocity: number;
}

export interface BallTrajectory {
  samples: BallTrajectorySample[];
  duration: number;
}