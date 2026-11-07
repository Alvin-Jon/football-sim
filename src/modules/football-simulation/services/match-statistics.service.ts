import type { MatchState } from "../types/match.types.js";
import type {
  PassBreakdown,
  PassKind,
  PassTypeStats,
} from "../types/statistics.types.js";

export class MatchStatisticsService {
  static recordPossession(
    match: MatchState,
    deltaTime: number,
  ): void {
    const teamId = match.ball.possessionTeamId;

    if (!teamId) return;

    if (teamId === match.homeTeam.id) {
      match.statistics.home.possessionSeconds += deltaTime;
    } else if (teamId === match.awayTeam.id) {
      match.statistics.away.possessionSeconds += deltaTime;
    }
  }

  static recordPass(
    match: MatchState,
    teamId: string,
    playerId: string,
    kind: PassKind = "SHORT",
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[playerId];

    team.passesAttempted++;
    this.addPass(team, kind, "attempted");

    if (player) {
      player.passesAttempted++;
      this.addPass(player, kind, "attempted");
    }
  }

  static completePass(
    match: MatchState,
    teamId: string,
    playerId: string,
    kind: PassKind = "SHORT",
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[playerId];

    team.passesCompleted++;
    this.addPass(team, kind, "completed");

    if (player) {
      player.passesCompleted++;
      this.addPass(player, kind, "completed");
    }
  }

  static recordShot(
    match: MatchState,
    teamId: string,
    playerId: string,
    onTarget: boolean,
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[playerId];

    team.shots++;

    if (onTarget) {
      team.shotsOnTarget++;
    }

    if (player) {
      player.shots++;

      if (onTarget) {
        player.shotsOnTarget++;
      }
    }
  }

  static recordGoal(
    match: MatchState,
    teamId: string,
    scorerId?: string,
  ): void {
    const team = this.getTeamStatistics(match, teamId);

    team.goals++;

    if (scorerId) {
      const player = match.statistics.players[scorerId];

      if (player) {
        player.goals++;
      }
    }
  }

  static recordTackle(
    match: MatchState,
    teamId: string,
    playerId: string,
    successful: boolean,
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[playerId];

    team.tacklesAttempted++;

    if (successful) {
      team.tacklesWon++;
    }

    if (player) {
      player.tacklesAttempted++;

      if (successful) {
        player.tacklesWon++;
      }
    }
  }

  static recordInterception(
    match: MatchState,
    teamId: string,
    playerId: string,
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[playerId];

    team.interceptions++;

    if (player) {
      player.interceptions++;
    }
  }

  static recordAssist(
    match: MatchState,
    assisterId: string,
  ): void {
    const player = match.statistics.players[assisterId];

    if (player) {
      player.assists++;
    }
  }

  static recordSave(
    match: MatchState,
    teamId: string,
    goalkeeperId: string,
  ): void {
    const team = this.getTeamStatistics(match, teamId);
    const player = match.statistics.players[goalkeeperId];

    team.saves++;

    if (player) {
      player.saves++;
    }
  }

  static getPossessionPercentage(match: MatchState) {
    const home = match.statistics.home.possessionSeconds;
    const away = match.statistics.away.possessionSeconds;

    const total = home + away;

    if (total === 0) {
      return { home: 0, away: 0 };
    }

    const homePercentage = (home / total) * 100;

    return {
      home: Number(homePercentage.toFixed(1)),
      away: Number((100 - homePercentage).toFixed(1)),
    };
  }

  static getPassingAccuracy(match: MatchState) {
    const calculate = (
      attempted: number,
      completed: number,
    ) => attempted === 0
      ? 0
      : Number(((completed / attempted) * 100).toFixed(1));

    return {
      home: calculate(
        match.statistics.home.passesAttempted,
        match.statistics.home.passesCompleted,
      ),

      away: calculate(
        match.statistics.away.passesAttempted,
        match.statistics.away.passesCompleted,
      ),
    };
  }

  // Attempts and completions for one pass type, for a team or a player.
  static getPassTypeStats(
    stats: { passBreakdown: PassBreakdown },
    kind: PassKind,
  ): PassTypeStats {
    return stats.passBreakdown[kind];
  }

  private static addPass(
    holder: { passBreakdown: PassBreakdown },
    kind: PassKind,
    field: "attempted" | "completed",
  ): void {
    holder.passBreakdown[kind][field]++;
  }

  private static getTeamStatistics(
    match: MatchState,
    teamId: string,
  ) {
    if (teamId === match.homeTeam.id) {
      return match.statistics.home;
    }

    if (teamId === match.awayTeam.id) {
      return match.statistics.away;
    }

    throw new Error(`Unknown team: ${teamId}`);
  }
}