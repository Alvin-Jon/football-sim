import type { PlayerTrait } from "./player-traits.types.js";
import type { Vector2D, MatchPhase } from "./pitch.types.js";
import type { Player } from "./player.types.js";
import type { PlayerMatchState } from "./player-state.types.js";

export type DecisionAction =
  // On-ball
  | "PASS"
  | "THROUGH_BALL"
  | "LONG_BALL"
  | "SHOOT"
  | "CROSS"
  | "DRIBBLE"
  | "HOLD_BALL"

  // Off-ball
  | "MOVE"
  | "SUPPORT"
  | "MAKE_RUN"
  | "PRESS"
  | "MARK"
  | "TRACK_BACK"
  | "INTERCEPT";

export interface DecisionCandidate {
  action: DecisionAction;

  score: number;

  targetPosition?: Vector2D;

  targetPlayerId?: string;

  reasoning: string[];
}

export interface DecisionResult {
  playerId: string;

  action: DecisionAction;

  targetPosition?: Vector2D;

  targetPlayerId?: string;

  score: number;

  reasoning: string[];

  evaluatedAtTick: number;
}

export interface DecisionPlayer {
  player: Player;
  state: PlayerMatchState;
}

export interface DecisionContext {
  tick: number;

  phase: MatchPhase;

  ball: {
    position: Vector2D;
    possessionTeamId: string | null;
    possessionPlayerId: string | null;
  };

  player: DecisionPlayer;

  teammates: DecisionPlayer[];

  opponents: DecisionPlayer[];

  goalPosition: Vector2D;
}