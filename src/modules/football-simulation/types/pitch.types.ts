export interface Vector2D {
  x: number;
  y: number;
}

export interface PitchDimensions {
  length: number;
  width: number;
  goalWidth: number;
  goalHeight: number;
}

export type MatchPhase =
  | "ATTACKING"
  | "DEFENDING"
  | "TRANSITION";