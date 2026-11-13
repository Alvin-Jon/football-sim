import type { MatchState } from "../types/match.types.js";
import type { Player } from "../types/player.types.js";
import type { PlayerMatchStatistics } from "../types/statistics.types.js";
import { KEEPER_SHOT_OUTCOMES } from "../types/statistics.types.js";
import type { PlayerRole } from "./position-influence.service.js";
import { PositionInfluenceService } from "./position-influence.service.js";

type RatingRole = PlayerRole | "GOALKEEPER";

interface RatingWeights {
  chanceCreation: number;
  passing: number;
  defending: number;
  duels: number;
}

export interface PlayerRatingComponents {
  scoring: number;
  chanceCreation: number;
  passing: number;
  defending: number;
  duels: number;
  goalkeeping: number;
}

export interface PlayerMatchRating {
  playerId: string;
  playerName: string;
  position: string;
  role: RatingRole;
  rating: number;
  impact: number;
  components: PlayerRatingComponents;
}

const ROLE_WEIGHTS: Record<PlayerRole, RatingWeights> = {
  CENTRE_BACK: {
    chanceCreation: 0.7,
    passing: 0.7, //0.9
    defending: 1.3,
    duels: 1,
  },
  FULL_BACK: {
    chanceCreation: 1,
    passing: 0.6, //1
    defending: 1.1,
    duels: 1.05,
  },
  DEFENSIVE_MID: {
    chanceCreation: 0.8,
    passing: 0.6, //1.1
    defending: 1.25,
    duels: 1.05,
  },
  CENTRAL_MID: {
    chanceCreation: 1,
    passing: 0.7, //1.15
    defending: 1,
    duels: 1,
  },
  ATTACKING_MID: {
    chanceCreation: 1.2,
    passing: 0.5, //1.05
    defending: 0.8,
    duels: 1.05,
  },
  WINGER: {
    chanceCreation: 1.2,
    passing: 0.6, //0.9
    defending: 0.75,
    duels: 1.25,
  },
  STRIKER: {
    chanceCreation: 0.9,
    passing: 0.5, //0.8
    defending: 0.65,
    duels: 1.1,
  },
};

export class MatchRatingService {
  private static readonly BASE_RATING = 6;
  private static readonly CURVE_STEEPNESS = 0.45;
  private static readonly PASS_ACCURACY_BASELINE = 0.75;
  private static readonly FULL_PASS_SAMPLE = 20;

  static ratePlayer(match: MatchState, playerId: string): PlayerMatchRating {
    const player = [...match.homeTeam.players, ...match.awayTeam.players]
      .find((candidate) => candidate.id === playerId);

    if (!player) {
      throw new Error(`Unknown player: ${playerId}`);
    }

    const stats = match.statistics.players[playerId];
    if (!stats) {
      throw new Error(`Missing match statistics for player: ${playerId}`);
    }

    return this.calculatePlayerRating(match, player, stats);
  }

  static rateAll(match: MatchState): PlayerMatchRating[] {
    return [...match.homeTeam.players, ...match.awayTeam.players].map(
      (player) => {
        const stats = match.statistics.players[player.id];
        if (!stats) {
          throw new Error(
            `Missing match statistics for player: ${player.id}`,
          );
        }

        return this.calculatePlayerRating(match, player, stats);
      },
    );
  }

  private static calculatePlayerRating(
    match: MatchState,
    player: Player,
    stats: PlayerMatchStatistics,
  ): PlayerMatchRating {
    const role: RatingRole = player.position === "GK"
      ? "GOALKEEPER"
      : PositionInfluenceService.getRole(player.position);
    const weights = role === "GOALKEEPER"
      ? undefined
      : ROLE_WEIGHTS[role];
    const attemptsOffTarget = Math.max(0, stats.shots - stats.shotsOnTarget);

    const components: PlayerRatingComponents = {
      scoring:
        stats.goals * 1.4 +
        stats.shotsOnTarget * 0.1 -
        attemptsOffTarget * 0.05,
      chanceCreation:
        stats.assists * 0.5 + stats.chancesCreated * 0.35,
      passing: this.getPassingImpact(stats),
      defending:
        stats.tacklesWon * 0.25 +
        stats.tacklesLoose * 0.1 -
        stats.tacklesBeaten * 0.18 +
        stats.interceptions * 0.22,
      duels:
        this.getDuelImpact(stats.duelBreakdown.TAKE_ON) +
        this.getDuelImpact(stats.duelBreakdown.SHIELD),
      goalkeeping: player.position === "GK"
        ? this.getGoalkeepingImpact(match, player, stats)
        : 0,
    };

    const impact = weights
      ? components.scoring +
        components.chanceCreation * weights.chanceCreation +
        components.passing * weights.passing +
        components.defending * weights.defending +
        components.duels * weights.duels
      : components.scoring +
        components.chanceCreation * 0.8 +
        components.passing * 0.8 +
        components.goalkeeping;

    return {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      role,
      rating: this.toRating(impact),
      impact: this.round(impact, 2),
      components: {
        scoring: this.round(components.scoring, 2),
        chanceCreation: this.round(components.chanceCreation, 2),
        passing: this.round(components.passing, 2),
        defending: this.round(components.defending, 2),
        duels: this.round(components.duels, 2),
        goalkeeping: this.round(components.goalkeeping, 2),
      },
    };
  }

  private static getPassingImpact(stats: PlayerMatchStatistics): number {
    if (stats.passesAttempted === 0) return 0;

    const accuracy = stats.passesCompleted / stats.passesAttempted;
    const sampleWeight = Math.min(
      1,
      stats.passesAttempted / MatchRatingService.FULL_PASS_SAMPLE,
    );

    return (
      (accuracy - MatchRatingService.PASS_ACCURACY_BASELINE) *
      2 *
      sampleWeight
    );
  }

  private static getDuelImpact(
    duel: PlayerMatchStatistics["duelBreakdown"]["TAKE_ON"],
  ): number {
    return duel.kept * 0.18 -
      duel.dispossessed * 0.2 -
      duel.loose * 0.1;
  }

  private static getGoalkeepingImpact(
    match: MatchState,
    player: Player,
    stats: PlayerMatchStatistics,
  ): number {
    const teamStatistics = match.homeTeam.players.some(
      (candidate) => candidate.id === player.id,
    )
      ? match.statistics.home
      : match.statistics.away;
    const goalsConceded = KEEPER_SHOT_OUTCOMES
      .filter((outcome) => outcome !== "SAVED")
      .reduce(
        (total, outcome) => total + teamStatistics.keeperShots[outcome],
        0,
      );
    const expectedSaves = teamStatistics.saveRollChanceSum;

    return (
      (stats.saves - expectedSaves) * 0.5 +
      stats.saves * 0.1 -
      goalsConceded * 0.15
    );
  }

  private static toRating(impact: number): number {
    const odds = Math.exp(
      MatchRatingService.CURVE_STEEPNESS * impact,
    ) * (MatchRatingService.BASE_RATING /
      (10 - MatchRatingService.BASE_RATING));
    const rating = (10 * odds) / (1 + odds);

    return this.round(Math.max(0, Math.min(10, rating)), 1);
  }

  private static round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
