import type {
  DecisionAction,
  DecisionContext,
} from "../types/decision.types.js";
import type { Vector2D } from "../types/pitch.types.js";
import type { PlayingDirection } from "../types/match.types.js";
import type {
  DefensiveLine,
  PressingStyle,
  TeamMentality,
  TeamStyle,
  TeamTactics,
} from "../types/team.types.js";
import type { TacticalModifiers } from "../types/tactics.types.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { PitchService } from "./pitch.service.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type AdditiveKey =
  | "lineHeight"
  | "directness"
  | "shootBias"
  | "dribbleBias"
  | "holdBias"
  | "crossBias";

type MultiplicativeKey = "width" | "holdTempo" | "riskTolerance";

interface Adjustment {
  add?: Partial<Record<AdditiveKey, number>>;
  mul?: Partial<Record<MultiplicativeKey, number>>;
}

interface PressingProfile {
  maxProgress: number;
  chasers: number;
  bonus: number;
}

export class TacticsService {
  static readonly CLOSE_PRESS_DISTANCE = 4;

  static readonly NEUTRAL: TacticalModifiers = Object.freeze({
    lineHeight: 0,
    defensiveLineHeight: 0,
    width: 1,
    pressChasers: 2,
    pressMaxProgress: 1,
    pressBonus: 0,
    holdTempo: 1,
    directness: 0,
    riskTolerance: 1,
    shootBias: 0,
    dribbleBias: 0,
    holdBias: 0,
    crossBias: 0,
  });

  // Mentality: how risky the team is and how high the midfield and attack sit.
  private static readonly MENTALITY: Record<TeamMentality, Adjustment> = {
    VERY_DEFENSIVE: {
      add: { lineHeight: -8, shootBias: -6, dribbleBias: -3, holdBias: 3 },
      mul: { riskTolerance: 0.6, holdTempo: 1.1 },
    },
    DEFENSIVE: {
      add: { lineHeight: -4, shootBias: -3, dribbleBias: -1, holdBias: 1.5 },
      mul: { riskTolerance: 0.8, holdTempo: 1.05 },
    },
    BALANCED: {},
    ATTACKING: {
      add: { lineHeight: 4, shootBias: 4, dribbleBias: 2, holdBias: -1 },
      mul: { riskTolerance: 1.2, holdTempo: 0.95 },
    },
    VERY_ATTACKING: {
      add: { lineHeight: 8, shootBias: 8, dribbleBias: 4, holdBias: -2 },
      mul: { riskTolerance: 1.4, holdTempo: 0.9 },
    },
  };

  // Style: how the team moves the ball.
  private static readonly STYLE: Record<TeamStyle, Adjustment> = {
    POSSESSION: {
      add: { directness: -6, dribbleBias: -1 },
      mul: { holdTempo: 1.2, width: 1.05, riskTolerance: 0.9 },
    },
    TIKI_TAKA: {
      add: { directness: -10, dribbleBias: -4, lineHeight: 2 },
      mul: { holdTempo: 0.85, width: 0.9, riskTolerance: 0.85 },
    },
    GEGENPRESS: {
      add: { directness: 4, lineHeight: 3 },
      mul: { holdTempo: 0.8, riskTolerance: 1.1 },
    },
    COUNTER_ATTACKING: {
      add: { directness: 10, lineHeight: -3, shootBias: 2 },
      mul: { holdTempo: 0.7, riskTolerance: 1.1 },
    },
    DIRECT: {
      add: { directness: 12, crossBias: 3 },
      mul: { holdTempo: 0.75, riskTolerance: 1.15 },
    },
    WING_PLAY: {
      add: { directness: 2, crossBias: 8, dribbleBias: 3 },
      mul: { width: 1.2 },
    },
  };

  private static readonly PRESSING: Record<PressingStyle, PressingProfile> = {
    ALL_OVER_PITCH: { maxProgress: 1.0, chasers: 3, bonus: 8 },
    MID_BLOCK: { maxProgress: 0.65, chasers: 2, bonus: 3 },
    OWN_HALF: { maxProgress: 0.5, chasers: 2, bonus: 2 },
  };

  private static readonly DEFAULT_PRESSING: Record<TeamStyle, PressingStyle> = {
    POSSESSION: "MID_BLOCK",
    TIKI_TAKA: "ALL_OVER_PITCH",
    GEGENPRESS: "ALL_OVER_PITCH",
    COUNTER_ATTACKING: "OWN_HALF",
    DIRECT: "MID_BLOCK",
    WING_PLAY: "MID_BLOCK",
  };

  private static readonly DEFENSIVE_LINE_METRES: Record<DefensiveLine, number> =
    {
      VERY_DEEP: -10,
      DEEP: -5,
      STANDARD: 0,
      HIGH: 5,
      VERY_HIGH: 10,
    };

  private static readonly DEFAULT_DEFENSIVE_LINE: Record<
    TeamMentality,
    DefensiveLine
  > = {
    VERY_DEFENSIVE: "VERY_DEEP",
    DEFENSIVE: "DEEP",
    BALANCED: "STANDARD",
    ATTACKING: "HIGH",
    VERY_ATTACKING: "VERY_HIGH",
  };

  private static readonly cache = new Map<string, TacticalModifiers>();

  static resolve(tactics: TeamTactics): TacticalModifiers {
    const pressingStyle =
      tactics.pressing ?? this.DEFAULT_PRESSING[tactics.style];
    const defensiveLine =
      tactics.defensiveLine ?? this.DEFAULT_DEFENSIVE_LINE[tactics.mentality];

    const key = [
      tactics.style,
      tactics.mentality,
      pressingStyle,
      defensiveLine,
    ].join("|");

    const cached = this.cache.get(key);
    if (cached) return cached;

    const modifiers: Mutable<TacticalModifiers> = { ...this.NEUTRAL };

    this.apply(modifiers, this.MENTALITY[tactics.mentality]);
    this.apply(modifiers, this.STYLE[tactics.style]);

    const pressing = this.PRESSING[pressingStyle];
    modifiers.pressMaxProgress = pressing.maxProgress;
    modifiers.pressChasers = pressing.chasers;
    modifiers.pressBonus = pressing.bonus;

    modifiers.defensiveLineHeight = this.DEFENSIVE_LINE_METRES[defensiveLine];

    modifiers.width = this.clamp(modifiers.width, 0.8, 1.25);
    modifiers.holdTempo = this.clamp(modifiers.holdTempo, 0.5, 1.5);
    modifiers.riskTolerance = this.clamp(modifiers.riskTolerance, 0.4, 1.6);

    const frozen = Object.freeze(modifiers);
    this.cache.set(key, frozen);
    return frozen;
  }


  static ballProgress(
    ballPosition: Vector2D,
    direction: PlayingDirection,
  ): number {
    const local = PitchService.transformPosition(ballPosition, direction);
    return local.x / PITCH_DIMENSIONS.length;
  }

  // True when the ball is inside the area where this team presses.
  static isInPressZone(context: DecisionContext): boolean {
    return (
      this.ballProgress(context.ball.position, context.attackingDirection) <=
      context.tactics.pressMaxProgress
    );
  }

  // True for the players allowed to leave shape and chase the ball.
  static isChaser(ballRank: number, tactics: TacticalModifiers): boolean {
    return ballRank < tactics.pressChasers;
  }

  static getActionBias(
    tactics: TacticalModifiers,
    action: DecisionAction,
  ): number {
    switch (action) {
      case "LONG_BALL":
        return tactics.directness;
      case "THROUGH_BALL":
        return tactics.directness * 0.6;
      case "PASS":
        return -tactics.directness * 0.4;
      case "CROSS":
        return tactics.crossBias;
      case "SHOOT":
        return tactics.shootBias;
      case "DRIBBLE":
        return tactics.dribbleBias;
      case "HOLD_BALL":
        return tactics.holdBias;
      default:
        return 0;
    }
  }

  static scaleHoldTicks(ticks: number, tactics: TacticalModifiers): number {
    return Math.max(1, Math.round(ticks * tactics.holdTempo));
  }


  private static apply(
    target: Mutable<TacticalModifiers>,
    adjustment: Adjustment,
  ): void {
    for (const [key, value] of Object.entries(adjustment.add ?? {}) as Array<
      [AdditiveKey, number]
    >) {
      target[key] += value;
    }

    for (const [key, value] of Object.entries(adjustment.mul ?? {}) as Array<
      [MultiplicativeKey, number]
    >) {
      target[key] *= value;
    }
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}