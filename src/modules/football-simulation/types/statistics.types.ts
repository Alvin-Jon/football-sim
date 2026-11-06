export interface TeamMatchStatistics {
  possessionSeconds: number;

  passesAttempted: number;
  passesCompleted: number;

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

  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists:number;

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

    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists:0,

    tacklesAttempted: 0,
    tacklesWon: 0,

    interceptions: 0,
    saves: 0,
  };
}