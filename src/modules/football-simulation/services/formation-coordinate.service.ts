import type { FormationPosition } from "../types/formation.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

export class FormationCoordinatesService {
  static toPitch(position: FormationPosition): Vector2D {
    return {
      x: (position.x / 100) * PITCH_DIMENSIONS.length,
      y: (position.y / 100) * PITCH_DIMENSIONS.width,
    };
  }

  static fromPitch(position: Vector2D): FormationPosition {
    return {
      x: (position.x / PITCH_DIMENSIONS.length) * 100,
      y: (position.y / PITCH_DIMENSIONS.width) * 100,
    };
  }
}