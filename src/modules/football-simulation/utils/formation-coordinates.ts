import type { Vector2D, PitchDimensions } from "../types/pitch.types.js";

export interface NormalizedPosition {
  x: number; 
  y: number; 
}

export const normalizePosition = (
  position: Vector2D,
  pitch: PitchDimensions,
): NormalizedPosition => ({
  x: (position.x / pitch.length) * 100,
  y: (position.y / pitch.width) * 100,
});

export const scalePosition = (
  position: NormalizedPosition,
  pitch: PitchDimensions,
): Vector2D => ({
  x: (position.x / 100) * pitch.length,
  y: (position.y / 100) * pitch.width,
});