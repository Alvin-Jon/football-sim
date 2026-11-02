import type { PlayerMatchState } from "../types/player-state.types.js";

export class PlayerStaminaService {
  static updateStamina(
    state: PlayerMatchState,
    deltaTime: number,
  ): PlayerMatchState {
    const speed = state.currentSpeed;

    let drainRate = 0;

    if (speed > 8) {
      drainRate = 0.8;
    } else if (speed > 6) {
      drainRate = 0.35;
    } else if (speed > 0.5) {
      drainRate = 0.1;
    }

    const stamina = Math.max(
      0,
      state.stamina - drainRate * deltaTime,
    );

    return {
      ...state,
      stamina,
    };
  }
}