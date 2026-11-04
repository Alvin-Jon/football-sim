import type { Vector2D } from "../types/pitch.types.js";
import type { DecisionPlayer } from "../types/decision.types.js";

import { PitchService } from "./pitch.service.js";
import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";

export interface DistributionResult {
  targetPosition: Vector2D;
  targetPlayerId?: string;
  type: "SHORT" | "LONG";
}

export class GoalkeeperDistributionService {
  selectDistributionTarget(
    goalkeeperPosition: Vector2D,
    teammates: DecisionPlayer[],
  ): DistributionResult | null {
    if (teammates.length === 0) {
      return null;
    }

    const candidates = teammates
      .map(({ player, state }) => ({
        playerId: player.id,
        position: state.position,
        distance: PitchService.getDistance(
          goalkeeperPosition,
          state.position,
        ),
      }))
      .filter(
        (candidate) =>
          candidate.distance >=
            GOALKEEPER_CONSTANTS.MIN_DISTRIBUTION_DISTANCE &&
          candidate.distance <=
            GOALKEEPER_CONSTANTS.DISTRIBUTION_DISTANCE,
      );

    if (candidates.length === 0) {
      return null;
    }

    // Prefer a nearby teammate as the initial distribution option.
    candidates.sort((a, b) => a.distance - b.distance);

    const target = candidates[0];

    if (!target) {
      return null;
    }

    return {
      targetPosition: target.position,
      targetPlayerId: target.playerId,
      type: target.distance > 20 ? "LONG" : "SHORT",
    };
  }
}