import type { MatchState } from "../types/match.types.js";
import type { Player } from "../types/player.types.js";
import type {
  PassKind,
  PlayerMatchStatistics,
} from "../types/statistics.types.js";
import { PASS_KINDS } from "../types/statistics.types.js";
import type { PlayerRole } from "./position-influence.service.js";
import { PositionInfluenceService } from "./position-influence.service.js";

type RatingRole = PlayerRole | "GOALKEEPER";

interface RoleWeights {
  chanceCreation: number;
  duels: number;
}

interface TeamWeights {
  scored: number;
  conceded: number;
  cleanSheet: number;
}

export interface PlayerRatingComponents {
  scoring: number;
  chanceCreation: number;
  passing: number;
  defending: number;
  duels: number;
  goalkeeping: number;
  teamResult: number;
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


interface MatchContext {
  interceptionAverage: Map<PlayerRole, number>;
  passRate: Record<PassKind, number>;
  blockValue: number;
}

const ROLE_WEIGHTS: Record<PlayerRole, RoleWeights> = {
  CENTRE_BACK: { chanceCreation: 0.7, duels: 1 },
  FULL_BACK: { chanceCreation: 1, duels: 1.05 },
  DEFENSIVE_MID: { chanceCreation: 0.8, duels: 1.05 },
  CENTRAL_MID: { chanceCreation: 1, duels: 1 },
  ATTACKING_MID: { chanceCreation: 1.2, duels: 1.05 },
  WINGER: { chanceCreation: 1.2, duels: 1.25 },
  STRIKER: { chanceCreation: 0.9, duels: 1.1 },
};

const TEAM_WEIGHTS: Record<RatingRole, TeamWeights> = {
  GOALKEEPER: { scored: 0.12, conceded: 0.12, cleanSheet: 0.25 },
  CENTRE_BACK: { scored: 0.12, conceded: 0.14, cleanSheet: 0.20 },
  FULL_BACK: { scored: 0.14, conceded: 0.12, cleanSheet: 0.15 },
  DEFENSIVE_MID: { scored: 0.15, conceded: 0.10, cleanSheet: 0.12 },
  CENTRAL_MID: { scored: 0.17, conceded: 0.08, cleanSheet: 0.08 },
  ATTACKING_MID: { scored: 0.20, conceded: 0.05, cleanSheet: 0.03 },
  WINGER: { scored: 0.20, conceded: 0.04, cleanSheet: 0.02 },
  STRIKER: { scored: 0.22, conceded: 0.03, cleanSheet: 0 },
};

export class MatchRatingService {
  private static readonly BASE_RATING = 6;
  private static readonly CURVE_STEEPNESS = 0.35;

  private static readonly MAX_GOALS_COUNTED = 6;
  private static readonly RESULT_VALUE = 0.25;

  private static readonly PASS_SURPLUS_VALUE = 0.02;
  private static readonly PASS_IMPACT_LIMIT = 0.6;
  private static readonly FALLBACK_PASS_RATE = 0.7;


  private static readonly INTERCEPTION_VALUE = 0.08;
  private static readonly INTERCEPTION_MIN = -0.6;
  private static readonly INTERCEPTION_MAX = 0.8;

  // A block is worth a goal's value times how often shots become goals.
  private static readonly GOAL_VALUE = 1.4;
  private static readonly FALLBACK_CONVERSION = 0.12;
  private static readonly BLOCK_VALUE_MIN = 0.15;
  private static readonly BLOCK_VALUE_MAX = 0.6;

  static ratePlayer(match: MatchState, playerId: string): PlayerMatchRating {
    const player = [...match.homeTeam.players, ...match.awayTeam.players].find(
      (candidate) => candidate.id === playerId,
    );

    if (!player) {
      throw new Error(`Unknown player: ${playerId}`);
    }

    const stats = match.statistics.players[playerId];
    if (!stats) {
      throw new Error(`Missing match statistics for player: ${playerId}`);
    }

    return this.calculatePlayerRating(
      match,
      player,
      stats,
      this.buildContext(match),
    );
  }

  static rateAll(match: MatchState): PlayerMatchRating[] {
    const context = this.buildContext(match);
    const ratings: PlayerMatchRating[] = [];

    for (const player of [...match.homeTeam.players, ...match.awayTeam.players]) {
      const stats = match.statistics.players[player.id];

      if (!stats) continue;

      ratings.push(this.calculatePlayerRating(match, player, stats, context));
    }

    return ratings;
  }

  private static buildContext(match: MatchState): MatchContext {
    const interceptionTotals = new Map<
      PlayerRole,
      { players: number; interceptions: number }
    >();

    const passTotals = Object.fromEntries(
      PASS_KINDS.map((kind) => [kind, { attempted: 0, completed: 0 }]),
    ) as Record<PassKind, { attempted: number; completed: number }>;

    for (const player of [...match.homeTeam.players, ...match.awayTeam.players]) {
      if (player.position === "GK") continue;

      const stats = match.statistics.players[player.id];
      if (!stats) continue;

      const role = PositionInfluenceService.getRole(player.position);
      const entry = interceptionTotals.get(role) ?? {
        players: 0,
        interceptions: 0,
      };

      entry.players++;
      entry.interceptions += stats.interceptions;
      interceptionTotals.set(role, entry);

      for (const kind of PASS_KINDS) {
        passTotals[kind].attempted += stats.passBreakdown[kind].attempted;
        passTotals[kind].completed += stats.passBreakdown[kind].completed;
      }
    }

    const interceptionAverage = new Map<PlayerRole, number>();
    for (const [role, entry] of interceptionTotals) {
      interceptionAverage.set(role, entry.interceptions / entry.players);
    }

    const passRate = Object.fromEntries(
      PASS_KINDS.map((kind) => [
        kind,
        passTotals[kind].attempted === 0
          ? this.FALLBACK_PASS_RATE
          : passTotals[kind].completed / passTotals[kind].attempted,
      ]),
    ) as Record<PassKind, number>;

    const shots = match.statistics.home.shots + match.statistics.away.shots;
    const goals = match.statistics.home.goals + match.statistics.away.goals;
    const conversion = shots > 0 ? goals / shots : this.FALLBACK_CONVERSION;

    return {
      interceptionAverage,
      passRate,
      blockValue: this.clamp(
        this.GOAL_VALUE * conversion,
        this.BLOCK_VALUE_MIN,
        this.BLOCK_VALUE_MAX,
      ),
    };
  }

  private static calculatePlayerRating(
    match: MatchState,
    player: Player,
    stats: PlayerMatchStatistics,
    context: MatchContext,
  ): PlayerMatchRating {
    const isKeeper = player.position === "GK";
    const outfieldRole = isKeeper
      ? undefined
      : PositionInfluenceService.getRole(player.position);
    const role: RatingRole = outfieldRole ?? "GOALKEEPER";

    const isHome = match.homeTeam.players.some(
      (candidate) => candidate.id === player.id,
    );
    const own = isHome ? match.statistics.home : match.statistics.away;
    const opposition = isHome ? match.statistics.away : match.statistics.home;

    const attemptsOffTarget = Math.max(0, stats.shots - stats.shotsOnTarget);

    const scoring =
      stats.goals * 1.4 +
      stats.shotsOnTarget * 0.1 -
      attemptsOffTarget * 0.05;

    const chanceCreation =
      stats.assists * 0.5 +
      Math.max(0, stats.chancesCreated - stats.assists) * 0.35;

    const passing = this.getPassingImpact(stats, context, isKeeper);

    const defending = outfieldRole
      ? this.getDefendingImpact(stats, outfieldRole, context)
      : 0;

    const duels = this.clamp(
      this.getDuelImpact(stats.duelBreakdown.TAKE_ON) +
        this.getDuelImpact(stats.duelBreakdown.SHIELD),
      -1,
      1,
    );

    const goalkeeping = isKeeper
      ? this.getGoalkeepingImpact(own, stats)
      : 0;

    const teamResult = this.getTeamResult(
      role,
      own.goals,
      opposition.goals,
    );

    const roleWeights = outfieldRole ? ROLE_WEIGHTS[outfieldRole] : undefined;

    const impact = roleWeights
      ? scoring +
        chanceCreation * roleWeights.chanceCreation +
        passing +
        defending +
        duels * roleWeights.duels +
        teamResult
      : scoring +
        chanceCreation * 0.8 +
        passing * 0.5 +
        goalkeeping +
        teamResult;

    return {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      role,
      rating: this.toRating(impact),
      impact: this.round(impact, 2),
      components: {
        scoring: this.round(scoring, 2),
        chanceCreation: this.round(chanceCreation, 2),
        passing: this.round(passing, 2),
        defending: this.round(defending, 2),
        duels: this.round(duels, 2),
        goalkeeping: this.round(goalkeeping, 2),
        teamResult: this.round(teamResult, 2),
      },
    };
  }

  // Goals scored and conceded, a clean sheet, and the result itself. Every
  // role is affected, by different amounts.
  private static getTeamResult(
    role: RatingRole,
    scored: number,
    conceded: number,
  ): number {
    const weights = TEAM_WEIGHTS[role];
    const cap = MatchRatingService.MAX_GOALS_COUNTED;

    const resultValue =
      scored > conceded
        ? MatchRatingService.RESULT_VALUE
        : scored < conceded
          ? -MatchRatingService.RESULT_VALUE
          : 0;

    return (
      Math.min(scored, cap) * weights.scored -
      Math.min(conceded, cap) * weights.conceded +
      (conceded === 0 ? weights.cleanSheet : 0) +
      resultValue
    );
  }

  
  private static getPassingImpact(
    stats: PlayerMatchStatistics,
    context: MatchContext,
    isKeeper: boolean,
  ): number {
    const kinds: readonly PassKind[] = isKeeper ? ["SHORT"] : PASS_KINDS;

    let surplus = 0;

    for (const kind of kinds) {
      const record = stats.passBreakdown[kind];
      surplus += record.completed - record.attempted * context.passRate[kind];
    }

    return this.clamp(
      surplus * MatchRatingService.PASS_SURPLUS_VALUE,
      -MatchRatingService.PASS_IMPACT_LIMIT,
      MatchRatingService.PASS_IMPACT_LIMIT,
    );
  }

  private static getDefendingImpact(
    stats: PlayerMatchStatistics,
    role: PlayerRole,
    context: MatchContext,
  ): number {
    const average = context.interceptionAverage.get(role) ?? stats.interceptions;

    const interceptions = this.clamp(
      (stats.interceptions - average) * MatchRatingService.INTERCEPTION_VALUE,
      MatchRatingService.INTERCEPTION_MIN,
      MatchRatingService.INTERCEPTION_MAX,
    );

    const tackles = this.clamp(
      stats.tacklesWon * 0.25 +
        stats.tacklesLoose * 0.1 -
        stats.tacklesBeaten * 0.18,
      -1,
      1,
    );

    return interceptions + tackles + stats.blocks * context.blockValue;
  }

  private static getDuelImpact(
    duel: PlayerMatchStatistics["duelBreakdown"]["TAKE_ON"],
  ): number {
    return duel.kept * 0.18 - duel.dispossessed * 0.2 - duel.loose * 0.1;
  }

  
  private static getGoalkeepingImpact(
    team: MatchState["statistics"]["home"],
    stats: PlayerMatchStatistics,
  ): number {
    const expectedSaves = team.saveRollChanceSum;

    return (
      (stats.saves - expectedSaves) * 0.5 +
      stats.saves * 0.05 +
      stats.interceptions * 0.03
    );
  }

  private static toRating(impact: number): number {
    const odds =
      Math.exp(MatchRatingService.CURVE_STEEPNESS * impact) *
      (MatchRatingService.BASE_RATING / (10 - MatchRatingService.BASE_RATING));
    const rating = (10 * odds) / (1 + odds);

    return this.round(Math.max(0, Math.min(10, rating)), 1);
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private static round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}