import type { Vector2D } from "./pitch.types.js";

export type ShotType = "PLACED" | "POWER" | "CHIP";

export interface ShotOptions {
  type: ShotType;
  targetPosition: Vector2D;
  goalPosition: Vector2D;
}

export interface ShotResult {
  successful: boolean;
  type: ShotType;
  targetPosition: Vector2D;
  actualTargetPosition: Vector2D;
  direction: number;
  power: number;
  verticalSpeed: number;
  accuracy: number;
  distance: number;
  message?: string;
}