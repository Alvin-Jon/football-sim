import type { MatchState } from "../types/match.types.js";
import type { Team } from "../types/team.types.js";

export class MatchService {
  static createMatch(
    id: string,
    homeTeam: Team,
    awayTeam: Team,
  ): MatchState {
    return {
      id,

      homeTeam,
      awayTeam,

      status: "NOT_STARTED",

      minute: 0,
      tick: 0,

      ball: {
        position: {
          x: 52.5,
          y: 34,
        },

        velocity: {
          x: 0,
          y: 0,
        },

        height: 0,

        possessionTeamId: null,
        possessionPlayerId: null,
      },
    };
  }
}