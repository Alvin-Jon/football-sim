import type { Vector2D } from "./pitch.types.js";

export type PlayerAction =
  | "IDLE"
  | "MOVING"
  | "PASSING"
  | "SHOOTING"
  | "DRIBBLING"
  | "TACKLING"
  | "MARKING"
  | "PRESSING"
  | "JUMPING"
  | "RUNNING"
  | "SPRINTING";

export interface PlayerMatchState {
  playerId: string;

  position: Vector2D;

  velocity: Vector2D;

  direction: number;

  currentSpeed: number;

  stamina: number;

  currentAction: PlayerAction;

  targetPosition: Vector2D | null;

  isMoving: boolean;
}