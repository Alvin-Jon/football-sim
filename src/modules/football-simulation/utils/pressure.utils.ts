import type { Vector2D } from "../types/pitch.types.js";
import { PitchService } from "../services/pitch.service.js";

const FULL_PRESSURE_DISTANCE = 1.5;
const NO_PRESSURE_DISTANCE = 7;
const SECOND_DEFENDER_WEIGHT = 0.3;

function pressureFromDistance(distance: number): number {
  const t =
    (NO_PRESSURE_DISTANCE - distance) /
    (NO_PRESSURE_DISTANCE - FULL_PRESSURE_DISTANCE);
  return Math.max(0, Math.min(1, t));
}

/**
 * Graded pressure on a position, 0 (free) to 1 (swarmed).
 * Driven mostly by the nearest opponent, with a smaller contribution
 * from the second nearest so two defenders feel worse than one.
 */
export function calculatePressure(
  position: Vector2D,
  opponents: ReadonlyArray<{ state: { position: Vector2D } }>,
): number {
  let first = Infinity;
  let second = Infinity;

  for (const opponent of opponents) {
    const distance = PitchService.getDistance(position, opponent.state.position);
    if (distance < first) {
      second = first;
      first = distance;
    } else if (distance < second) {
      second = distance;
    }
  }

  if (first === Infinity) return 0;

  const p1 = pressureFromDistance(first);
  const p2 = second === Infinity ? 0 : pressureFromDistance(second);

  return Math.min(1, p1 + SECOND_DEFENDER_WEIGHT * p2);
}