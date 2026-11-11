// How a pass was played. Keeper distribution counts as SHORT or LONG.
export type PassKind = "SHORT" | "THROUGH" | "LONG" | "CROSS";

export const PASS_KINDS: readonly PassKind[] = [
  "SHORT",
  "THROUGH",
  "LONG",
  "CROSS",
];

export interface PassTypeStats {
  attempted: number;
  completed: number;
}
export type PassBreakdown = Record<PassKind, PassTypeStats>;

export function createPassBreakdown(): PassBreakdown {
  return {
    SHORT: { attempted: 0, completed: 0 },
    THROUGH: { attempted: 0, completed: 0 },
    LONG: { attempted: 0, completed: 0 },
    CROSS: { attempted: 0, completed: 0 },
  };
}

// --- Tackle duels ------------------------------------------------------
// TAKE_ON: the carrier was dribbling / moving when tackled.
// SHIELD:  the carrier was stationary and protecting the ball.
export type DuelKind = "TAKE_ON" | "SHIELD";

// WON    - tackler took the ball cleanly.
// LOOSE  - ball knocked free.
// BEATEN - carrier got past the tackler and kept the ball.
export type DuelResultKind = "WON" | "LOOSE" | "BEATEN";

export const DUEL_KINDS: readonly DuelKind[] = ["TAKE_ON", "SHIELD"];

// Seen from the CARRIER's side.
export interface CarrierDuelStats {
  faced: number; // tackles attempted against him
  kept: number; // he beat the tackler and kept the ball
  dispossessed: number; // tackler won it cleanly
  loose: number; // ball knocked free
}
export type DuelBreakdown = Record<DuelKind, CarrierDuelStats>;

export function createDuelBreakdown(): DuelBreakdown {
  return {
    TAKE_ON: { faced: 0, kept: 0, dispossessed: 0, loose: 0 },
    SHIELD: { faced: 0, kept: 0, dispossessed: 0, loose: 0 },
  };
}

// --- Pass failures -----------------------------------------------------
// Why a pass ended without a teammate controlling it.
export type PassFailureReason =
  | "IN_LANE" // an opponent won it away from the target
  | "WON_AT_RECEIVER" // an opponent won it within ~3m of the intended receiver
  | "RECEIVER_MISCONTROL" // the intended receiver miscontrolled, opponent got it
  | "UNTARGETED" // no intended receiver (keeper punt etc.)
  | "RECOLLECTED" // the passer got his own pass back; it never reached anyone
  | "OUT_OF_PLAY";

export const PASS_FAILURE_REASONS: readonly PassFailureReason[] = [
  "IN_LANE",
  "WON_AT_RECEIVER",
  "RECEIVER_MISCONTROL",
  "UNTARGETED",
  "RECOLLECTED",
  "OUT_OF_PLAY",
];

export type PassFailureBreakdown = Record<
  PassKind,
  Record<PassFailureReason, number>
>;

export function createPassFailureBreakdown(): PassFailureBreakdown {
  const row = (): Record<PassFailureReason, number> => ({
    IN_LANE: 0,
    WON_AT_RECEIVER: 0,
    RECEIVER_MISCONTROL: 0,
    UNTARGETED: 0,
    RECOLLECTED: 0,
    OUT_OF_PLAY: 0,
  });

  return { SHORT: row(), THROUGH: row(), LONG: row(), CROSS: row() };
}

// --- Pass prediction calibration ---------------------------------------
// The evaluator's predicted completion probability vs what happened.
export const PREDICTION_BUCKETS = [
  "<50%",
  "50-60%",
  "60-70%",
  "70-80%",
  "80-90%",
  "90%+",
] as const;

export type PredictionBucket = (typeof PREDICTION_BUCKETS)[number];

export interface CalibrationStats {
  attempted: number;
  completed: number;
  predictedSum: number;
  failures: Record<PassFailureReason, number>;
}

export type PassCalibration = Record<PredictionBucket, CalibrationStats>;

export function createPassCalibration(): PassCalibration {
  const row = (): CalibrationStats => ({
    attempted: 0,
    completed: 0,
    predictedSum: 0,
    failures: {
      IN_LANE: 0,
      WON_AT_RECEIVER: 0,
      RECEIVER_MISCONTROL: 0,
      UNTARGETED: 0,
      RECOLLECTED: 0,
      OUT_OF_PLAY: 0,
    },
  });

  return {
    "<50%": row(),
    "50-60%": row(),
    "60-70%": row(),
    "70-80%": row(),
    "80-90%": row(),
    "90%+": row(),
  };
}

export function getPredictionBucket(probability: number): PredictionBucket {
  if (probability < 0.5) return "<50%";
  if (probability < 0.6) return "50-60%";
  if (probability < 0.7) return "60-70%";
  if (probability < 0.8) return "70-80%";
  if (probability < 0.9) return "80-90%";
  return "90%+";
}

// --- What the goalkeeper did with shots he faced ----------------------
// Counted for the DEFENDING team. Only shots that ended as a save or a goal.
export type KeeperShotOutcome =
  | "SAVED"
  | "GOAL_NO_ATTEMPT" // he never even tried to move for it
  | "GOAL_NO_REACH" // he was sent diving but could not get within save reach
  | "GOAL_ROLL_FAILED" // within reach; the save roll failed
  | "GOAL_NO_CONTACT" // roll succeeded but he never got to the ball
  | "GOAL_UNPREDICTED"; // the shot was not predicted on target (deflection etc.)

export const KEEPER_SHOT_OUTCOMES: readonly KeeperShotOutcome[] = [
  "SAVED",
  "GOAL_NO_ATTEMPT",
  "GOAL_NO_REACH",
  "GOAL_ROLL_FAILED",
  "GOAL_NO_CONTACT",
  "GOAL_UNPREDICTED",
];

export type KeeperShotBreakdown = Record<KeeperShotOutcome, number>;

export function createKeeperShotBreakdown(): KeeperShotBreakdown {
  return {
    SAVED: 0,
    GOAL_NO_ATTEMPT: 0,
    GOAL_NO_REACH: 0,
    GOAL_ROLL_FAILED: 0,
    GOAL_NO_CONTACT: 0,
    GOAL_UNPREDICTED: 0,
  };
}

export interface TeamMatchStatistics {
  possessionSeconds: number;

  passesAttempted: number;
  passesCompleted: number;
  passBreakdown: PassBreakdown;
  passFailures: PassFailureBreakdown;
  passCalibration: PassCalibration;

  keeperShots: KeeperShotBreakdown;
  saveRolls: number;
  saveRollChanceSum: number;

  shots: number;
  shotsOnTarget: number;

  goals: number;

  tacklesAttempted: number;
  tacklesWon: number;
  tacklesLoose: number;
  tacklesBeaten: number;
  duelBreakdown: DuelBreakdown;

  interceptions: number;
  saves: number;
}

export interface PlayerMatchStatistics {
  passesAttempted: number;
  passesCompleted: number;
  passBreakdown: PassBreakdown;

  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;

  tacklesAttempted: number;
  tacklesWon: number;
  tacklesLoose: number;
  tacklesBeaten: number;
  duelBreakdown: DuelBreakdown;

  interceptions: number;
  saves: number;
}

export interface MatchStatistics {
  home: TeamMatchStatistics;
  away: TeamMatchStatistics;

  players: Record<string, PlayerMatchStatistics>;
}

export function createTeamStatistics(): TeamMatchStatistics {
  return {
    possessionSeconds: 0,

    passesAttempted: 0,
    passesCompleted: 0,
    passBreakdown: createPassBreakdown(),
    passFailures: createPassFailureBreakdown(),
    passCalibration: createPassCalibration(),

    keeperShots: createKeeperShotBreakdown(),
    saveRolls: 0,
    saveRollChanceSum: 0,

    shots: 0,
    shotsOnTarget: 0,

    goals: 0,

    tacklesAttempted: 0,
    tacklesWon: 0,
    tacklesLoose: 0,
    tacklesBeaten: 0,
    duelBreakdown: createDuelBreakdown(),

    interceptions: 0,
    saves: 0,
  };
}

export function createPlayerStatistics(): PlayerMatchStatistics {
  return {
    passesAttempted: 0,
    passesCompleted: 0,
    passBreakdown: createPassBreakdown(),

    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists: 0,

    tacklesAttempted: 0,
    tacklesWon: 0,
    tacklesLoose: 0,
    tacklesBeaten: 0,
    duelBreakdown: createDuelBreakdown(),

    interceptions: 0,
    saves: 0,
  };
}