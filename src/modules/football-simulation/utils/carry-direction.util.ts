import type { Vector2D } from "../types/pitch.types.js";
import { PitchService } from "../services/pitch.service.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

// Small deterministic hash -> [0, 1), so choices vary between players and
// moments but a run stays repeatable.
export function hash01(key: string): number {
  let h = 2166136261;

  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return (h >>> 0) / 4294967296;
}

// How far ahead the waiting carry aims each tick. Movement speeds up while
// the target is far and eases off as it gets close, so a shorter step means a
// slower, shorter carry while the player waits to release the ball.
export const CARRY_STEP = 3;

const ANGLES_DEGREES = [-50, -25, 0, 25, 50];
const LOOKAHEAD = 8;

/**
 * Where a carrier who is made to wait should carry the ball next. The old
 * rule was "3 m straight ahead", so anyone who waited ran dead straight at
 * goal. This looks ahead along a few directions and prefers the one with the
 * most room, a lean towards goal, and distance from the touchline, with a
 * little per-player variation so equal options are not always resolved the
 * same way.
 */
export function chooseCarryTarget(
  position: Vector2D,
  attackSign: number,
  goal: Vector2D,
  opponents: ReadonlyArray<{ state: { position: Vector2D } }>,
  seed: string,
  step = CARRY_STEP,
): Vector2D {
  let best: { target: Vector2D; score: number } | undefined;

  for (const degrees of ANGLES_DEGREES) {
    const radians = (degrees * Math.PI) / 180;
    const dx = attackSign * Math.cos(radians);
    const dy = Math.sin(radians);

    const ahead = PitchService.clampPosition({
      x: position.x + dx * LOOKAHEAD,
      y: position.y + dy * LOOKAHEAD,
    });

    let nearest = Infinity;
    for (const opponent of opponents) {
      nearest = Math.min(
        nearest,
        PitchService.getDistance(ahead, opponent.state.position),
      );
    }

    const toGoalX = goal.x - position.x;
    const toGoalY = goal.y - position.y;
    const goalLength = Math.hypot(toGoalX, toGoalY) || 1;
    const alignment = (dx * toGoalX + dy * toGoalY) / goalLength;

    const margin = Math.min(ahead.y, PITCH_DIMENSIONS.width - ahead.y);

    const score =
      Math.min(nearest, 10) +
      3 * alignment -
      (margin < 3 ? 6 : 0) +
      hash01(`${seed}:${degrees}`) * 1.5;

    if (!best || score > best.score) {
      best = {
        score,
        target: PitchService.clampPosition({
          x: position.x + dx * step,
          y: position.y + dy * step,
        }),
      };
    }
  }

  return best!.target;
}