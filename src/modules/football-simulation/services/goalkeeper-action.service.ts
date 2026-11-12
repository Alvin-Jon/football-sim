import type { PlayerMatchState } from "../types/player-state.types.js";
import type { GoalkeeperDecision } from "../types/goalkeeper.types.js";

import { PitchService } from "./pitch.service.js";
import {
  DIVE_CONSTANTS,
  getDiveSpeed,
} from "../constants/goalkeeper-dive.constants.js";

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

  /**
   * An explosive lunge towards a shot's crossing point. Ordinary movement is
   * limited by acceleration, so a keeper standing still could only cover
   * about half a metre while a shot was in flight. Call once per tick while
   * the decision is DIVE.
   */
  dive(
    state: PlayerMatchState,
    targetPosition: { x: number; y: number },
    reflexes: number,
    deltaTime: number,
  ): void {
    const gap = PitchService.getDistance(state.position, targetPosition);

    if (gap <= 0.01 || gap > DIVE_CONSTANTS.MAX_DIVE_DISTANCE) return;

    const speed = getDiveSpeed(reflexes, state.stamina);

    const step = Math.min(gap, speed * deltaTime);
    const ratio = step / gap;

    state.direction = Math.atan2(
      targetPosition.y - state.position.y,
      targetPosition.x - state.position.x,
    );

    state.position = PitchService.clampPosition({
      x: state.position.x + (targetPosition.x - state.position.x) * ratio,
      y: state.position.y + (targetPosition.y - state.position.y) * ratio,
    });

    state.currentAction = "JUMPING";
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