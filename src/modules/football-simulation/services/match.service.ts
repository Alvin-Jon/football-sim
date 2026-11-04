import type { MatchState } from "../types/match.types.js";
import type { Team } from "../types/team.types.js";
import { MatchInitializationService } from "./match-initialization.service.js";

export class MatchService {
  static createMatch(
    id: string,
    homeTeam: Team,
    awayTeam: Team,
  ): MatchState {
    return MatchInitializationService.initialize(
      id,
      homeTeam,
      awayTeam,
    );
  }
}