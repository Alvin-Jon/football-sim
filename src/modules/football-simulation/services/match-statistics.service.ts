import type { MatchState } from "../types/match.types.js";
import {
  getPredictionBucket,
  getShotDistanceBand,
} from "../types/statistics.types.js";
import type {
  DuelKind,
  DuelResultKind,
  KeeperShotOutcome,
  PassBreakdown,
  PassFailureReason,
  PassKind,
  PassTypeStats,
} from "../types/statistics.types.js";

export interface DuelRecord {
  tacklerTeamId: string;
  tacklerId: string;
  carrierTeamId: string;
  carrierId: string;
  kind: DuelKind;
  result: DuelResultKind;
}

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

  // Team-level record of why a pass did not reach a teammate.
  static recordPassFailure(
    match: MatchState,
    teamId: string,
    kind: PassKind,
    reason: PassFailureReason,
  ): void {
    this.getTeamStatistics(match, teamId).passFailures[kind][reason]++;
  }

  // Compares the evaluator's predicted completion with the real outcome.
  static recordPassPrediction(
    match: MatchState,
    teamId: string,
    predicted: number,
    completed: boolean,
    reason?: PassFailureReason,
  ): void {
    const bucket =
      this.getTeamStatistics(match, teamId).passCalibration[
        getPredictionBucket(predicted)
      ];

    bucket.attempted++;
    bucket.predictedSum += predicted;
    if (completed) bucket.completed++;
    else if (reason) bucket.failures[reason]++;
  }

  // What the defending keeper did with a shot that ended as a save or goal.
  static recordKeeperShot(
    match: MatchState,
    defendingTeamId: string,
    outcome: KeeperShotOutcome,
    rollChance?: number,
    gapAtGoal?: number,
    keeperOut?: number,
    shotDistance?: number,
  ): void {
    const team = this.getTeamStatistics(match, defendingTeamId);

    team.keeperShots[outcome]++;

    if (gapAtGoal !== undefined) {
      team.keeperGapSum[outcome] += gapAtGoal;
    }

    if (keeperOut !== undefined) {
      team.keeperOutSum[outcome] += keeperOut;
    }

    if (shotDistance !== undefined) {
      team.shotDistanceSum[outcome] += shotDistance;
    }

    if (rollChance !== undefined) {
      team.saveRolls++;
      team.saveRollChanceSum += rollChance;
    }
  }

  // Shots and goals by how far the shooter was from goal.
  static recordShotByDistance(
    match: MatchState,
    teamId: string,
    distance: number,
    onTarget: boolean,
  ): void {
    const band =
      this.getTeamStatistics(match, teamId).shotsByDistance[
        getShotDistanceBand(distance)
      ];

    band.shots++;
    if (onTarget) band.onTarget++;
  }

  static recordGoalByDistance(
    match: MatchState,
    teamId: string,
    distance: number,
  ): void {
    this.getTeamStatistics(match, teamId).shotsByDistance[
      getShotDistanceBand(distance)
    ].goals++;
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

  /**
   * Records the detail of a tackle duel from both sides. Call it right
   * after recordTackle (which keeps counting attempts and clean wins).
   */
  static recordDuel(match: MatchState, duel: DuelRecord): void {
    const tacklerTeam = this.getTeamStatistics(match, duel.tacklerTeamId);
    const tacklerPlayer = match.statistics.players[duel.tacklerId];
    const carrierTeam = this.getTeamStatistics(match, duel.carrierTeamId);
    const carrierPlayer = match.statistics.players[duel.carrierId];

    // Tackler's side.
    if (duel.result === "LOOSE") {
      tacklerTeam.tacklesLoose++;
      if (tacklerPlayer) tacklerPlayer.tacklesLoose++;
    } else if (duel.result === "BEATEN") {
      tacklerTeam.tacklesBeaten++;
      if (tacklerPlayer) tacklerPlayer.tacklesBeaten++;
    }

    // Carrier's side.
    for (const holder of [carrierTeam, carrierPlayer]) {
      if (!holder) continue;

      const stats = holder.duelBreakdown[duel.kind];
      stats.faced++;

      if (duel.result === "BEATEN") stats.kept++;
      else if (duel.result === "WON") stats.dispossessed++;
      else stats.loose++;
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