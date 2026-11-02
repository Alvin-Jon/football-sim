import type { PlayerPosition } from "./player.types.js";
import type { Vector2D } from "./pitch.types.js";

export type FormationFluidity = "RIGID" | "FLUID";

export interface FormationSlot {
  id: string;

  position: PlayerPosition;

  attackingPosition: Vector2D;
  defensivePosition: Vector2D;
}

export interface FormationDefinition {
  name: string;
  slots: FormationSlot[];
}