import type {
  FormationFluidity,
  FormationSlot,
} from "../types/formation.types.js";

import type {
  MatchPhase,
  Vector2D,
} from "../types/pitch.types.js";

export class PositioningService {
  private static readonly FLUIDITY_SPREAD = {
    RIGID: 0.85,
    FLUID: 1.25,
  };

  static getPositioningPreference(
    position: Vector2D,
    slot: FormationSlot,
    phase: MatchPhase,
    fluidity: FormationFluidity,
  ): number {
    const anchor =
      phase === "ATTACKING"
        ? slot.attackingPosition
        : slot.defensivePosition;

    const spreadMultiplier = this.FLUIDITY_SPREAD[fluidity];

    // Initial positional spread.
    const spreadX = 10 * spreadMultiplier;
    const spreadY = 9 * spreadMultiplier;

    const dx = (position.x - anchor.x) / spreadX;
    const dy = (position.y - anchor.y) / spreadY;

    const distanceSquared = dx * dx + dy * dy;

    const preference = Math.exp(-0.5 * distanceSquared);

    return Math.max(0, Math.min(1, preference));
  }

  static getPreferredPosition(
    slot: FormationSlot,
    phase: MatchPhase,
  ): Vector2D {
    return phase === "ATTACKING"
      ? { ...slot.attackingPosition }
      : { ...slot.defensivePosition };
  }
}