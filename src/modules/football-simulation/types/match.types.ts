import type { Team } from "./team.types.js";
import type { TeamMatchState } from "./team-state.types.js";
import type { Vector2D } from "./pitch.types.js";

export type MatchStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "HALF_TIME"
  | "FINISHED";

export type PlayingDirection = "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";

export interface BallState {
  position: Vector2D;
  velocity: Vector2D;
  height: number;
  verticalVelocity: number;
  spin: number;
  possessionTeamId: string | null;
  possessionPlayerId: string | null;
}

export interface MatchClock {
  minute: number;
  second: number;
  elapsedSeconds: number;
  half: 1 | 2;
}

export interface MatchState {
  id: string;

  homeTeam: Team;
  awayTeam: Team;

  homeTeamState: TeamMatchState;
  awayTeamState: TeamMatchState;

  homeDirection: PlayingDirection;
  awayDirection: PlayingDirection;

  status: MatchStatus;

  clock: MatchClock;

  tick: number;

  ball: BallState;
}