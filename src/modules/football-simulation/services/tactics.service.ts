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
  | "lineHeight" // in % of pitch length while accumulating, metres once resolved
  | "directness"
  | "shootBias"
  | "dribbleBias"
  | "holdBias"
  | "crossBias"
  | "passMinCompletion"
  | "passRecycleBias";

type MultiplicativeKey =
  | "width"
  | "holdTempo"
  | "riskTolerance"
  | "passLaneWeight"
  | "passPressureWeight"
  | "passProgressionWeight"
  | "passTurnoverCost";

interface Adjustment {
  add?: Partial<Record<AdditiveKey, number>>;
  mul?: Partial<Record<MultiplicativeKey, number>>;
}

interface PressingProfile {
  maxProgress: number;
  chasers: number;
  bonus: number;
}

export interface ResolvedTactics {
  pressing: PressingStyle;
  defensiveLine: DefensiveLine;
  modifiers: TacticalModifiers;
}

export class TacticsService {
  static readonly CLOSE_PRESS_DISTANCE = 4;
  private static readonly MAX_LINE_SHIFT_PERCENT = 12;

  // Everything neutral: reproduces the behaviour from before tactics existed.
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
    passLaneWeight: 1,
    passPressureWeight: 1,
    passProgressionWeight: 1,
    passMinCompletion: 0.55,
    passRecycleBias: 0,
    passTurnoverCost: 1,
  });


  private static readonly MENTALITY: Record<TeamMentality, Adjustment> = {
    VERY_DEFENSIVE: {
      add: {
        lineHeight: -8,
        shootBias: -6,
        dribbleBias: -3,
        holdBias: 3,
        passMinCompletion: 0.1,
        passRecycleBias: 3,
      },
      mul: {
        riskTolerance: 0.6,
        holdTempo: 1.1,
        passLaneWeight: 1.3,
        passPressureWeight: 1.2,
        passProgressionWeight: 0.7,
        passTurnoverCost: 1.3,
      },
    },
    DEFENSIVE: {
      add: {
        lineHeight: -4,
        shootBias: -3,
        dribbleBias: -1,
        holdBias: 1.5,
        passMinCompletion: 0.05,
        passRecycleBias: 1.5,
      },
      mul: {
        riskTolerance: 0.8,
        holdTempo: 1.05,
        passLaneWeight: 1.15,
        passPressureWeight: 1.1,
        passProgressionWeight: 0.85,
        passTurnoverCost: 1.15,
      },
    },
    BALANCED: {},
    ATTACKING: {
      add: {
        lineHeight: 4,
        shootBias: 4,
        dribbleBias: 2,
        holdBias: -1,
        passMinCompletion: -0.05,
        passRecycleBias: -1,
      },
      mul: {
        riskTolerance: 1.2,
        holdTempo: 0.95,
        passLaneWeight: 0.9,
        passPressureWeight: 0.9,
        passProgressionWeight: 1.2,
        passTurnoverCost: 0.85,
      },
    },
    VERY_ATTACKING: {
      add: {
        lineHeight: 8,
        shootBias: 8,
        dribbleBias: 4,
        holdBias: -2,
        passMinCompletion: -0.1,
        passRecycleBias: -2,
      },
      mul: {
        riskTolerance: 1.4,
        holdTempo: 0.9,
        passLaneWeight: 0.8,
        passPressureWeight: 0.8,
        passProgressionWeight: 1.4,
        passTurnoverCost: 0.7,
      },
    },
  };

  private static readonly STYLE: Record<TeamStyle, Adjustment> = {
    POSSESSION: {
      add: {
        directness: -5,
        dribbleBias: -1,
        passMinCompletion: 0.12,
        passRecycleBias: 4,
      },
      mul: {
        holdTempo: 1.2,
        width: 1.05,
        riskTolerance: 0.9,
        passLaneWeight: 1.3,
        passPressureWeight: 1.2,
        passProgressionWeight: 0.7,
        passTurnoverCost: 1.2,
      },
    },
    TIKI_TAKA: {
      add: {
        directness: -8,
        dribbleBias: -4,
        lineHeight: 2,
        passMinCompletion: 0.15,
        passRecycleBias: 5,
      },
      mul: {
        holdTempo: 0.85,
        width: 0.9,
        riskTolerance: 0.85,
        passLaneWeight: 1.2,
        passPressureWeight: 1,
        passProgressionWeight: 0.65,
        passTurnoverCost: 1.1,
      },
    },
    GEGENPRESS: {
      add: {
        directness: 3,
        lineHeight: 3,
        passMinCompletion: -0.03,
        passRecycleBias: -1,
      },
      mul: {
        holdTempo: 0.8,
        riskTolerance: 1.1,
        passLaneWeight: 0.9,
        passPressureWeight: 0.9,
        passProgressionWeight: 1.3,
        passTurnoverCost: 0.9,
      },
    },
    COUNTER_ATTACKING: {
      add: {
        directness: 8,
        lineHeight: -3,
        shootBias: 2,
        passMinCompletion: -0.15,
        passRecycleBias: -2,
      },
      mul: {
        holdTempo: 0.7,
        riskTolerance: 1.1,
        passLaneWeight: 0.75,
        passPressureWeight: 0.8,
        passProgressionWeight: 1.5,
        passTurnoverCost: 0.8,
      },
    },
    DIRECT: {
      add: {
        directness: 10,
        crossBias: 3,
        passMinCompletion: -0.17,
        passRecycleBias: -3,
      },
      mul: {
        holdTempo: 0.75,
        riskTolerance: 1.15,
        passLaneWeight: 0.7,
        passPressureWeight: 0.75,
        passProgressionWeight: 1.4,
        passTurnoverCost: 0.75,
      },
    },
    WING_PLAY: {
      add: {
        directness: 2,
        crossBias: 8,
        dribbleBias: 3,
        passMinCompletion: -0.03,
      },
      mul: { width: 1.2, passProgressionWeight: 1.1 },
    },
  };

  // --- Pressing ---------------------------------------------------------

  private static readonly PRESSING: Record<PressingStyle, PressingProfile> = {
    ALL_OVER_PITCH: { maxProgress: 1.0, chasers: 3, bonus: 8 },
    MID_BLOCK: { maxProgress: 0.65, chasers: 2, bonus: 3 },
    OWN_HALF: { maxProgress: 0.5, chasers: 2, bonus: 2 },
  };

  private static readonly PRESSING_ORDER: readonly PressingStyle[] = [
    "OWN_HALF",
    "MID_BLOCK",
    "ALL_OVER_PITCH",
  ];

  private static readonly STYLE_PRESSING_LEVEL: Record<TeamStyle, number> = {
    POSSESSION: 1,
    TIKI_TAKA: 2,
    GEGENPRESS: 2,
    COUNTER_ATTACKING: 0,
    DIRECT: 1,
    WING_PLAY: 1,
  };


  private static readonly MENTALITY_PRESSING_STEP: Record<
    TeamMentality,
    number
  > = {
    VERY_DEFENSIVE: -1,
    DEFENSIVE: 0,
    BALANCED: 0,
    ATTACKING: 0,
    VERY_ATTACKING: 1,
  };

  private static readonly DEFENSIVE_LINE_ORDER: readonly DefensiveLine[] = [
    "VERY_DEEP",
    "DEEP",
    "STANDARD",
    "HIGH",
    "VERY_HIGH",
  ];

  private static readonly DEFENSIVE_LINE_PERCENT: Record<
    DefensiveLine,
    number
  > = {
    VERY_DEEP: -9,
    DEEP: -4.5,
    STANDARD: 0,
    HIGH: 4.5,
    VERY_HIGH: 9,
  };

  private static readonly MENTALITY_LINE_STEP: Record<TeamMentality, number> = {
    VERY_DEFENSIVE: -2,
    DEFENSIVE: -1,
    BALANCED: 0,
    ATTACKING: 1,
    VERY_ATTACKING: 2,
  };

  private static readonly STYLE_LINE_STEP: Record<TeamStyle, number> = {
    POSSESSION: 0,
    TIKI_TAKA: 1,
    GEGENPRESS: 1,
    COUNTER_ATTACKING: -1,
    DIRECT: 0,
    WING_PLAY: 0,
  };

  // resolve() is called per player per tick, so results are cached.
  private static readonly cache = new Map<string, ResolvedTactics>();

  // ---------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------

  static resolve(tactics: TeamTactics): TacticalModifiers {
    return this.explain(tactics).modifiers;
  }

  // Same as resolve(), but also returns the pressing and defensive line that
  // were actually used, which is useful for the UI and for debugging.
  static explain(tactics: TeamTactics): ResolvedTactics {
    const pressing = this.getEffectivePressing(tactics);
    const defensiveLine = this.getEffectiveDefensiveLine(tactics);

    const key = [tactics.style, tactics.mentality, pressing, defensiveLine].join(
      "|",
    );

    const cached = this.cache.get(key);
    if (cached) return cached;

    // Metres per 1% of pitch length. Tables above are in percent so the same
    // tactic looks the same on any pitch size.
    const metresPerPercent = PITCH_DIMENSIONS.length / 100;

    const modifiers: Mutable<TacticalModifiers> = { ...this.NEUTRAL };

    this.apply(modifiers, this.MENTALITY[tactics.mentality] ?? {});
    this.apply(modifiers, this.STYLE[tactics.style] ?? {});

    modifiers.lineHeight =
      this.clamp(
        modifiers.lineHeight,
        -this.MAX_LINE_SHIFT_PERCENT,
        this.MAX_LINE_SHIFT_PERCENT,
      ) * metresPerPercent;

    modifiers.defensiveLineHeight =
      this.DEFENSIVE_LINE_PERCENT[defensiveLine] * metresPerPercent;

    const profile = this.PRESSING[pressing];
    modifiers.pressMaxProgress = profile.maxProgress;
    modifiers.pressChasers = profile.chasers;
    modifiers.pressBonus = profile.bonus;

    // Stacked style + mentality multipliers must not run away.
    modifiers.width = this.clamp(modifiers.width, 0.8, 1.25);
    modifiers.holdTempo = this.clamp(modifiers.holdTempo, 0.5, 1.5);
    modifiers.riskTolerance = this.clamp(modifiers.riskTolerance, 0.4, 1.6);
    modifiers.passLaneWeight = this.clamp(modifiers.passLaneWeight, 0.5, 1.6);
    modifiers.passPressureWeight = this.clamp(
      modifiers.passPressureWeight,
      0.5,
      1.5,
    );
    modifiers.passProgressionWeight = this.clamp(
      modifiers.passProgressionWeight,
      0.5,
      1.8,
    );
    modifiers.passTurnoverCost = this.clamp(
      modifiers.passTurnoverCost,
      0.6,
      1.6,
    );
    modifiers.passMinCompletion = this.clamp(
      modifiers.passMinCompletion,
      0.2,
      0.85,
    );

    const resolved: ResolvedTactics = {
      pressing,
      defensiveLine,
      modifiers: Object.freeze(modifiers),
    };

    this.cache.set(key, resolved);
    return resolved;
  }

  static getEffectivePressing(tactics: TeamTactics): PressingStyle {
    if (tactics.pressing) return tactics.pressing;

    const level =
      (this.STYLE_PRESSING_LEVEL[tactics.style] ?? 1) +
      (this.MENTALITY_PRESSING_STEP[tactics.mentality] ?? 0);

    return (
      this.PRESSING_ORDER[this.clampIndex(level, this.PRESSING_ORDER.length)] ??
      "MID_BLOCK"
    );
  }

  static getEffectiveDefensiveLine(tactics: TeamTactics): DefensiveLine {
    if (tactics.defensiveLine) return tactics.defensiveLine;

    const standard = this.DEFENSIVE_LINE_ORDER.indexOf("STANDARD");
    const level =
      standard +
      (this.MENTALITY_LINE_STEP[tactics.mentality] ?? 0) +
      (this.STYLE_LINE_STEP[tactics.style] ?? 0);

    return (
      this.DEFENSIVE_LINE_ORDER[
        this.clampIndex(level, this.DEFENSIVE_LINE_ORDER.length)
      ] ?? "STANDARD"
    );
  }

  static ballProgress(
    ballPosition: Vector2D,
    direction: PlayingDirection,
  ): number {
    const local = PitchService.transformPosition(ballPosition, direction);
    return local.x / PITCH_DIMENSIONS.length;
  }

  static isInPressZone(context: DecisionContext): boolean {
    return (
      this.ballProgress(context.ball.position, context.attackingDirection) <=
      context.tactics.pressMaxProgress
    );
  }

  static isChaser(ballRank: number, tactics: TacticalModifiers): boolean {
    return ballRank < tactics.pressChasers;
  }

  // Score added to an action by the team's style and mentality.
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

  // Scales the minimum time a carrier keeps the ball.
  static scaleHoldTicks(ticks: number, tactics: TacticalModifiers): number {
    return Math.max(1, Math.round(ticks * tactics.holdTempo));
  }

  // ---------------------------------------------------------------------

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

  private static clampIndex(value: number, length: number): number {
    return Math.max(0, Math.min(length - 1, Math.round(value)));
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}