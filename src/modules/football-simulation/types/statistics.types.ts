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

export interface TeamMatchStatistics {
  possessionSeconds: number;

  passesAttempted: number;
  passesCompleted: number;
  passBreakdown: PassBreakdown;

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