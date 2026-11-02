import type { PlayerMatchState } from "./player-state.types.js";

export interface TeamMatchState {
  teamId: string;

  score: number;

  playerStates: Record<string, PlayerMatchState>;

  hasPossession: boolean;
}