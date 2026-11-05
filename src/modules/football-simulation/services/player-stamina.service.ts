import type { PlayerMatchState } from "../types/player-state.types.js";

import { STAMINA_CONSTANTS } from "../constants/stamina.constants.js";

export class PlayerStaminaService {
  static updateStamina(
    state: PlayerMatchState,
    deltaTime: number,
    staminaAttribute = 10,
  ): PlayerMatchState {
    if (deltaTime <= 0) {
      return state;
    }

    const c = STAMINA_CONSTANTS;
    const speed = state.currentSpeed;

    const attributeRatio =
      (Math.max(1, Math.min(20, staminaAttribute)) - 1) / 19;

    const drainMultiplier =
      c.MAX_DRAIN_MULTIPLIER -
      attributeRatio * (c.MAX_DRAIN_MULTIPLIER - c.MIN_DRAIN_MULTIPLIER);

    const recoveryMultiplier =
      c.MIN_RECOVERY_MULTIPLIER +
      attributeRatio * (c.MAX_RECOVERY_MULTIPLIER - c.MIN_RECOVERY_MULTIPLIER);

    // Positive = drain, negative = recovery (per second, before scaling).
    let drain = 0;
    let recovery = 0;

    if (speed > c.SPRINT_SPEED) {
      drain = c.SPRINT_DRAIN;
    } else if (speed > c.HIGH_SPEED) {
      drain = c.HIGH_SPEED_DRAIN;
    } else if (speed > c.JOG_SPEED) {
      drain = c.JOG_DRAIN;
    } else if (speed > c.WALK_SPEED) {
      recovery = c.WALK_RECOVERY;
    } else {
      recovery = c.IDLE_RECOVERY;
    }

    const change = (recovery * recoveryMultiplier - drain * drainMultiplier) * deltaTime;

    return {
      ...state,
      stamina: Math.max(0, Math.min(c.MAX_STAMINA, state.stamina + change)),
    };
  }

  /* Partial recovery at half-time. */
  static applyHalfTimeRecovery(state: PlayerMatchState): PlayerMatchState {
    return {
      ...state,
      stamina: Math.min(
        STAMINA_CONSTANTS.MAX_STAMINA,
        state.stamina + STAMINA_CONSTANTS.HALF_TIME_RECOVERY,
      ),
    };
  }
}