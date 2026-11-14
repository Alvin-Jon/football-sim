import type {
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { PitchService } from "./pitch.service.js";

type Point = { x: number; y: number };

export class ShootingEvaluationService {
  // History: 14 with narrow bands meant nothing was shot from beyond about
  // 11 m (players carried the ball into the six-yard box). 10 with wide bands
  // fixed that but overshot: about 35 shots per team per match, half of them
  // from 12-18 m. 13 with the bands below should land in between: clear
  // chances out to about 14 m, and only players with SHOOTS_FROM_DISTANCE
  // shoot from 14-18 m. That still left about 27 shots per team per match
  // (real football about 12), 45% of them from 12-18 m, so it is now 16:
  // players without the trait shoot from inside about 11 m, those with it
  // from up to about 14 m, and from 14-18 m only when everything is clear.
  private static readonly MIN_SHOT_QUALITY = 13;
  private static readonly REJECTED_SHOT_SCORE = -60;
  private static readonly LONG_SHOOTER_BONUS = 10;

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
    else if (distance <= 14) score = 15;
    else if (distance <= 18) score = 6;
    else if (distance <= 24) score = -5;
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