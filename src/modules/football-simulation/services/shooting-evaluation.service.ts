import type {
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { PitchService } from "./pitch.service.js";

type Point = { x: number; y: number };

export class ShootingEvaluationService {
  // Lowered from 14 and the distance bands widened: with the old numbers no
  // shot could pass the threshold from beyond about 11 m, so players kept
  // carrying the ball into the six-yard box (goals were being scored from
  // 0.8 m, and nothing was ever shot from outside 12 m).
  private static readonly MIN_SHOT_QUALITY = 10;
  private static readonly REJECTED_SHOT_SCORE = -60;
  private static readonly LONG_SHOOTER_BONUS = 8;

  evaluate(context: DecisionContext, candidate: DecisionCandidate): number {
    if (candidate.action !== "SHOOT") return 0;

    const from = context.player.state.position;
    const goal = context.goalPosition;

    const distance = PitchService.getDistance(from, goal);
    const longShooter = context.player.player.traits.includes(
      "SHOOTS_FROM_DISTANCE",
    );

    const quality =
      this.evaluateDistance(distance, longShooter) +
      this.evaluateAngle(from, goal) +
      this.evaluatePressure(from, context) +
      this.evaluateLane(from, goal, context);

    if (quality < ShootingEvaluationService.MIN_SHOT_QUALITY) {
      return ShootingEvaluationService.REJECTED_SHOT_SCORE;
    }

    return quality;
  }

  private evaluateDistance(distance: number, longShooter: boolean): number {
    let score: number;

    if (distance <= 5) score = 40;
    else if (distance <= 8) score = 32;
    else if (distance <= 11) score = 22;
    else if (distance <= 14) score = 16;
    else if (distance <= 18) score = 10;
    else if (distance <= 24) score = 2;
    else score = -35;

    // A player who likes a shot from range sees more of the pitch as shootable.
    if (longShooter && distance > 12 && distance <= 28) {
      score += ShootingEvaluationService.LONG_SHOOTER_BONUS;
    }

    return score;
  }

  // Wide of the goal means a small target. 0 = straight in front,
  // 1 = 45 degrees off, larger = near the goal line.
  private evaluateAngle(from: Point, goal: Point): number {
    const alongPitch = Math.max(1, Math.abs(goal.x - from.x));
    const across = Math.abs(from.y - goal.y);
    const ratio = across / alongPitch;

    if (ratio <= 0.4) return 0;
    if (ratio <= 0.9) return -6;
    if (ratio <= 1.5) return -16;

    return -30;
  }

  // A defender on top of the shooter.
  private evaluatePressure(from: Point, context: DecisionContext): number {
    let nearest = Infinity;

    for (const opponent of context.opponents) {
      nearest = Math.min(
        nearest,
        PitchService.getDistance(from, opponent.state.position),
      );
    }

    if (nearest < 1.5) return -15;
    if (nearest < 3) return -8;

    return 0;
  }

  // Outfield defenders standing in the line to goal. The goalkeeper is
  // ignored because he is always near the goal.
  private evaluateLane(
    from: Point,
    goal: Point,
    context: DecisionContext,
  ): number {
    let score = 0;

    for (const opponent of context.opponents) {
      const position = opponent.state.position;

      if (PitchService.getDistance(position, goal) < 4) continue;

      if (this.distanceFromSegment(position, from, goal) < 1.5) {
        score -= 12;
      }
    }

    return score;
  }

  private distanceFromSegment(point: Point, start: Point, end: Point): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return PitchService.getDistance(point, start);

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      ),
    );

    return PitchService.getDistance(point, {
      x: start.x + t * dx,
      y: start.y + t * dy,
    });
  }
}