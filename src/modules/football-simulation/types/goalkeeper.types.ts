import type { Vector2D } from "./pitch.types.js";
import type { PlayerAttributes } from "./player.types.js";

export type GoalkeeperAction =
  | "HOLD_POSITION"
  | "ADJUST_POSITION"
  | "RUSH_OUT"
  | "CATCH"
  | "PARRY"
  | "PUNCH"
  | "DIVE"
  | "CLAIM_CROSS"
  | "DISTRIBUTE";

export type GoalkeeperSaveType =
  | "CATCH"
  | "PARRY"
  | "PUNCH";

export interface GoalkeeperDecision {
  goalkeeperId: string;
  action: GoalkeeperAction;
  saveType?: GoalkeeperSaveType;
  targetPosition?: Vector2D;
  targetPlayerId?: string;
  reasoning: string[];
  evaluatedAtTick: number;
}

export interface GoalkeeperContext {
  tick: number;

   goalkeeper: {
      playerId: string;
      teamId: string;
      position: Vector2D;
      velocity: Vector2D;
      direction: number;
      attributes: PlayerAttributes;
      stamina: number;
    };

  ball: {
    position: Vector2D;
    velocity: Vector2D;
    height: number;
    spin: number;
    verticalVelocity: number;
    possessionTeamId: string | null;
    possessionPlayerId: string | null;
  };

  goalPosition: Vector2D;

  attackingDirection: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";

  opponents: Array<{
    playerId: string;
    position: Vector2D;
  }>;

  teammates: Array<{
    playerId: string;
    position: Vector2D;
  }>;
}