import type { PlayerTrait } from "../types/player-traits.types.js";
import type { DecisionAction } from "../types/decision.types.js";

const TRAIT_INFLUENCES: Partial<
  Record<PlayerTrait, Partial<Record<DecisionAction, number>>>
> = {
  // Passing
  TRIES_LONG_BALLS: {
    LONG_BALL: 12,
    PASS: -2,
  },

  LIKES_TO_SWITCH_BALL: {
    PASS: 5,
    LONG_BALL: 8,
  },

  PLAYS_SIMPLE_PASSES: {
    PASS: 10,
    THROUGH_BALL: -5,
    LONG_BALL: -5,
  },

  TRIES_RISKY_PASSES: {
    THROUGH_BALL: 12,
    LONG_BALL: 5,
  },

  // Shooting
  SHOOTS_FROM_DISTANCE: {
    SHOOT: 12,
  },

  PLACES_SHOTS: {
    SHOOT: 4,
  },

  SHOOTS_WITH_POWER: {
    SHOOT: 4,
  },

  // Dribbling
  RUNS_WITH_BALL: {
    DRIBBLE: 10,
  },

  TRICKSTER: {
    DRIBBLE: 12,
  },

  // Movement
  GETS_INTO_OPPOSITION_AREA: {
    MAKE_RUN: 12,
    SUPPORT: 3,
  },

  LIKES_TO_MOVE_INTO_CHANNELS: {
    MAKE_RUN: 10,
  },

  COMES_DEEP_TO_GET_BALL: {
    SUPPORT: 10,
    MAKE_RUN: -4,
  },

  MAKES_LATE_RUNS: {
    MAKE_RUN: 12,
  },

  LIKES_TO_CUT_INSIDE: {
    DRIBBLE: 6,
    MAKE_RUN: 5,
  },

  // Crossing
  EARLY_CROSSER: {
    CROSS: 12,
  },

  // Defending
  STOPPER: {
    PRESS: 5,
    MARK: 5,
    INTERCEPT: 3,
  },

  STAYS_BACK_AT_ALL_TIMES: {
    TRACK_BACK: 5,
    MAKE_RUN: -10,
  },

  DIVES_INTO_TACKLES: {
    PRESS: 5,
    INTERCEPT: 3,
  },

  MARKS_TIGHTLY: {
    MARK: 12,
  },
};

export class PlayerTraitService {
  static hasTrait(
    traits: PlayerTrait[],
    trait: PlayerTrait,
  ): boolean {
    return traits.includes(trait);
  }

  static getActionInfluence(
    traits: PlayerTrait[],
    action: DecisionAction,
  ): number {
    return traits.reduce((total, trait) => {
      return total + (TRAIT_INFLUENCES[trait]?.[action] ?? 0);
    }, 0);
  }
}