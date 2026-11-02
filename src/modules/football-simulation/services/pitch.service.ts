import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import type { Vector2D } from "../types/pitch.types.js";
import type { PlayingDirection } from "../types/match.types.js";

export class PitchService {
  static getDimensions() {
    return PITCH_DIMENSIONS;
  }

  static isInsidePitch(position: Vector2D): boolean {
    const { length, width } = PITCH_DIMENSIONS;

    return (
      position.x >= 0 &&
      position.x <= length &&
      position.y >= 0 &&
      position.y <= width
    );
  }

  static clampPosition(position: Vector2D): Vector2D {
    const { length, width } = PITCH_DIMENSIONS;

    return {
      x: Math.max(0, Math.min(length, position.x)),
      y: Math.max(0, Math.min(width, position.y)),
    };
  }

  static getDistance(a: Vector2D, b: Vector2D): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  static transformPosition(
    position: Vector2D,
    direction: PlayingDirection,
  ): Vector2D {
    if (direction === "LEFT_TO_RIGHT") {
      return { ...position };
    }

    return {
      x: PITCH_DIMENSIONS.length - position.x,
      y: PITCH_DIMENSIONS.width - position.y,
    };
  }

  static getDirectionVector(
    direction: PlayingDirection,
  ): Vector2D {
    return direction === "LEFT_TO_RIGHT"
      ? { x: 1, y: 0 }
      : { x: -1, y: 0 };
  }
}