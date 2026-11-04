import type { Vector2D } from "./pitch.types.js";

export interface InterceptionCandidate {
  playerId: string;
  interceptionPosition: Vector2D;
  distanceToBall: number;
  estimatedArrivalTime: number;
  interceptionTime: number;
  score: number;
}

export interface InterceptionResult {
  intercepted: boolean;
  playerId: string | null;
  interceptionPosition: Vector2D | null;
  message?: string;
}