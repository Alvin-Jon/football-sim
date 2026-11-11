import type { PlayerAttributes } from "../types/player.types.js";

export type AttributeWeights = Partial<Record<keyof PlayerAttributes, number>>;

export const DUEL_CONSTANTS = {
  // A carrier slower than this (and not dribbling) is shielding the ball.
  SHIELD_MAX_SPEED: 1.5,

  // logit = BIAS + edge * K + front/momentum/hard terms.
  // edge = defender rating - attacker rating (both 0..20).
  K: 0.28,
  TAKE_ON_BIAS: -0.1, // equal ratings: ~47% the tackler disrupts
  SHIELD_BIAS: 0.25, // equal ratings: ~56%

  // Defender in front of the carrier's heading is better placed;
  // trailing from behind is worse.
  FRONT_BONUS: 0.45,

  // A carrier at speed is harder to stop.
  MOMENTUM_FREE_SPEED: 3,
  MOMENTUM_PENALTY_PER_MS: 0.08,

  HARD_TACKLE_BONUS: 0.5,
  HARD_TACKLE_CLEAN_PENALTY: 0.1,

  MIN_TACKLE_CHANCE: 0.05,
  MAX_TACKLE_CHANCE: 0.9,

  // Of the tackles that disrupt the carrier, the share that win the ball
  // cleanly (the rest squirt loose).
  CLEAN_SHARE_BASE: 0.4,
  CLEAN_SHARE_SKILL: 0.4, // x tackling / 20
  CLEAN_SHARE_MIN: 0.3,
  CLEAN_SHARE_MAX: 0.85,

  LOOSE_BALL_SPREAD: 1.6, // radians, total
  LOOSE_BALL_MIN_SPEED: 2.5,
  LOOSE_BALL_MAX_SPEED: 6,

  // Tackler beaten by a take-on.
  BEATEN_SPEED_RETENTION: 0.3,
  BEATEN_EXTRA_COOLDOWN_TICKS: 30,
  BEATEN_ESCAPE_SHIELD_TICKS: 15,

  // Stamina (0..100 scale).
  STAMINA_COST_DRIBBLER_WIN: 0.8,
  STAMINA_COST_TACKLER: 0.5,
  STAMINA_COST_DISPOSSESSED: 0.5,

  // A defender only commits to a tackle when his estimated chance of
  // disrupting the carrier clears a threshold; otherwise he stays on him.
  // threshold = BASE - aggression * PER_AGGRESSION (- discounts), clamped.
  COMMIT_BASE: 0.72,
  COMMIT_PER_AGGRESSION: 0.012,
  COMMIT_DIVER_DISCOUNT: 0.15, // DIVES_INTO_TACKLES trait
  COMMIT_DANGER_DISCOUNT: 0.12, // carrier close to the defender's own goal
  COMMIT_MIN: 0.2,
  COMMIT_MAX: 0.7,
  DANGER_DISTANCE: 25,
} as const;

export const TAKE_ON_ATTACK: AttributeWeights = {
  dribbling: 0.3,
  ballControl: 0.2,
  agility: 0.2,
  acceleration: 0.1,
  strength: 0.1,
  composure: 0.1,
};

export const TAKE_ON_DEFENCE: AttributeWeights = {
  tackling: 0.35,
  anticipation: 0.2,
  positioning: 0.15,
  strength: 0.1,
  agility: 0.1,
  pace: 0.1,
};

export const SHIELD_ATTACK: AttributeWeights = {
  strength: 0.35,
  ballControl: 0.25,
  composure: 0.15,
  dribbling: 0.15,
  agility: 0.1,
};

export const SHIELD_DEFENCE: AttributeWeights = {
  tackling: 0.35,
  strength: 0.25,
  aggression: 0.15,
  anticipation: 0.15,
  positioning: 0.1,
};