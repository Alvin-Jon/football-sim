import type { PlayerMatchState } from "../types/player-state.types.js";
import type { GoalkeeperDecision } from "../types/goalkeeper.types.js";

import { PitchService } from "./pitch.service.js";

export class GoalkeeperActionService {
  execute(
    state: PlayerMatchState,
    decision: GoalkeeperDecision,
  ): void {
    switch (decision.action) {
      case "HOLD_POSITION": {
        state.targetPosition = null;
        state.isMoving = false;
        state.currentAction = "IDLE";
        break;
      }

      case "ADJUST_POSITION":
      case "RUSH_OUT":
      case "DIVE":
      case "CLAIM_CROSS": {
        if (!decision.targetPosition) {
          return;
        }

        state.targetPosition = PitchService.clampPosition(
          decision.targetPosition,
        );

        state.isMoving = true;
        state.currentAction =
          decision.action === "DIVE"
            ? "JUMPING"
            : "MOVING";

        break;
      }

      case "CATCH":
      case "PARRY":
      case "PUNCH":
      case "DISTRIBUTE": {
        // These actions require ball interaction handlers.
        // Do not mark them as completed here.
        break;
      }
    }
  }

  hasReachedTarget(state: PlayerMatchState): boolean {
    if (!state.targetPosition) {
      return true;
    }

    return (
      PitchService.getDistance(
        state.position,
        state.targetPosition,
      ) <= 0.5
    );
  }
}