import type { Player, PlayerAttributes } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";

import {
  DUEL_CONSTANTS as D,
  SHIELD_ATTACK,
  SHIELD_DEFENCE,
  TAKE_ON_ATTACK,
  TAKE_ON_DEFENCE,
} from "../constants/duel.constants.js";
import type { AttributeWeights } from "../constants/duel.constants.js";

export type DuelMode = "TAKE_ON" | "SHIELD";

/**
 * WON    - tackler takes the ball cleanly.
 * LOOSE  - ball is knocked free; nobody has it.
 * BEATEN - carrier gets past; tackler is left behind and keeps the ball
 *          with the carrier.
 */
export type DuelResult = "WON" | "LOOSE" | "BEATEN";

export interface DuelInput {
  tackler: Player;
  tacklerState: PlayerMatchState;
  carrier: Player;
  carrierState: PlayerMatchState;
  hardTackle: boolean;
}

export interface DuelEstimate {
  mode: DuelMode;
  /** Probability the tackle disrupts the carrier at all. */
  tackleChance: number;
  /** Of those, the share that win the ball cleanly. */
  cleanShare: number;
  /** +1 tackler directly in front of the carrier's heading, -1 behind. */
  frontness: number;
}

export interface DuelOutcome extends DuelEstimate {
  result: DuelResult;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export class TackleDuelService {
  constructor(private readonly random: () => number = Math.random) {}

  /** The odds, without rolling. Used to decide whether to commit. */
  estimate(input: DuelInput): DuelEstimate {
    const { tackler, tacklerState, carrier, carrierState, hardTackle } = input;

    const mode = this.getMode(carrierState);
    const attack = this.rate(
      carrier.attributes,
      mode === "TAKE_ON" ? TAKE_ON_ATTACK : SHIELD_ATTACK,
    );
    const defence = this.rate(
      tackler.attributes,
      mode === "TAKE_ON" ? TAKE_ON_DEFENCE : SHIELD_DEFENCE,
    );

    const frontness = this.getFrontness(tacklerState, carrierState);
    const momentum =
      Math.max(0, carrierState.currentSpeed - D.MOMENTUM_FREE_SPEED) *
      D.MOMENTUM_PENALTY_PER_MS;

    const logit =
      (mode === "TAKE_ON" ? D.TAKE_ON_BIAS : D.SHIELD_BIAS) +
      (defence - attack) * D.K +
      frontness * D.FRONT_BONUS -
      (mode === "TAKE_ON" ? momentum : 0) +
      (hardTackle ? D.HARD_TACKLE_BONUS : 0);

    const tackleChance = clamp(
      sigmoid(logit),
      D.MIN_TACKLE_CHANCE,
      D.MAX_TACKLE_CHANCE,
    );

    const cleanShare = clamp(
      D.CLEAN_SHARE_BASE +
        D.CLEAN_SHARE_SKILL * (tackler.attributes.tackling / 20) -
        (hardTackle ? D.HARD_TACKLE_CLEAN_PENALTY : 0),
      D.CLEAN_SHARE_MIN,
      D.CLEAN_SHARE_MAX,
    );

    return { mode, tackleChance, cleanShare, frontness };
  }

  /** Minimum estimated chance at which this defender will commit. */
  getCommitThreshold(tackler: Player, nearOwnGoal: boolean): number {
    let threshold =
      D.COMMIT_BASE - tackler.attributes.aggression * D.COMMIT_PER_AGGRESSION;

    if (tackler.traits.includes("DIVES_INTO_TACKLES")) {
      threshold -= D.COMMIT_DIVER_DISCOUNT;
    }

    if (nearOwnGoal) threshold -= D.COMMIT_DANGER_DISCOUNT;

    return clamp(threshold, D.COMMIT_MIN, D.COMMIT_MAX);
  }

  resolve(input: DuelInput): DuelOutcome {
    const estimate = this.estimate(input);

    const roll = this.random();
    const result: DuelResult =
      roll < estimate.tackleChance * estimate.cleanShare
        ? "WON"
        : roll < estimate.tackleChance
          ? "LOOSE"
          : "BEATEN";

    return { ...estimate, result };
  }

  private getMode(carrierState: PlayerMatchState): DuelMode {
    return carrierState.currentAction === "DRIBBLING" ||
      carrierState.currentSpeed > D.SHIELD_MAX_SPEED
      ? "TAKE_ON"
      : "SHIELD";
  }

  // Cosine between the carrier's heading and the direction to the tackler.
  private getFrontness(
    tacklerState: PlayerMatchState,
    carrierState: PlayerMatchState,
  ): number {
    const toTackler = Math.atan2(
      tacklerState.position.y - carrierState.position.y,
      tacklerState.position.x - carrierState.position.x,
    );

    return Math.cos(carrierState.direction - toTackler);
  }

  private rate(attributes: PlayerAttributes, weights: AttributeWeights): number {
    let total = 0;

    for (const [key, weight] of Object.entries(weights) as Array<
      [keyof PlayerAttributes, number]
    >) {
      total += attributes[key] * weight;
    }

    return total;
  }
}