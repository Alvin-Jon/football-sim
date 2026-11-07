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

    interceptions: 0,
    saves: 0,
  };
}