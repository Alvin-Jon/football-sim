import type { MatchPhase } from "../types/pitch.types.js";

export class DecisionPhaseService {
  getPlayerPhase(
    playerTeamId: string,
    possessionTeamId: string | null,
  ): MatchPhase {
    if (possessionTeamId === null) {
      return "TRANSITION";
    }

    return possessionTeamId === playerTeamId
      ? "ATTACKING"
      : "DEFENDING";
  }
}