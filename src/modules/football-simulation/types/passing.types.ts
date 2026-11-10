import type { Vector2D } from "./pitch.types.js";

export type PassType = "SHORT" | "THROUGH" | "LONG";

export interface PassOptions {
  type: PassType;
  targetPosition: Vector2D;
  targetPlayerId?: string;
  pressure?: number;
}

export interface PassResult {
  successful: boolean;
  type: PassType;
  targetPosition: Vector2D;
  actualTargetPosition: Vector2D;
  direction: number;
  speed: number;
  verticalSpeed: number;
  accuracy: number;
  message?: string;
}