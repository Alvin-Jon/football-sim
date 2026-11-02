import type { Player } from "../types/player.types.js";

import type {
  PlayerMatchState,
} from "../types/player-state.types.js";

import type { Vector2D } from "../types/pitch.types.js";

export class PlayerService {
  static createPlayerState(
    player: Player,
    startingPosition: Vector2D,
  ): PlayerMatchState {
    return {
      playerId: player.id,

      position: { ...startingPosition },

      velocity: {
        x: 0,
        y: 0,
      },

      direction: 0,

      currentSpeed: 0,

      stamina: 100,

      currentAction: "IDLE",

      targetPosition: null,

      isMoving: false,
    };
  }

  static setTargetPosition(
    state: PlayerMatchState,
    target: Vector2D,
  ): PlayerMatchState {
    return {
      ...state,

      targetPosition: { ...target },

      isMoving: true,
    };
  }

  static clearTargetPosition(
    state: PlayerMatchState,
  ): PlayerMatchState {
    return {
      ...state,

      targetPosition: null,

      isMoving: false,
    };
  }
}