import type {
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { DecisionPositionService } from "./decision-position.service.js";
import { PitchService } from "./pitch.service.js";

type Point = { x: number; y: number };

export class DribbleEvaluationService {
  private readonly positionService = new DecisionPositionService();

  evaluate(context: DecisionContext, candidate: DecisionCandidate): number {
    if (candidate.action !== "DRIBBLE") return 0;
    if (!candidate.targetPosition) return -100;

    const from = context.player.state.position;
    const target = candidate.targetPosition;

    return (
      this.evaluatePath(from, target, context) +
      this.evaluateSpace(target, context) +
      this.evaluatePressure(from, context) +
      this.evaluateProgress(from, target, context)
    );
  }

  // Opponents standing on or near the line the carrier would run.
  private evaluatePath(
    from: Point,
    target: Point,
    context: DecisionContext,
  ): number {
    let score = 0;

    for (const opponent of context.opponents) {
      const distance = this.distanceFromSegment(
        opponent.state.position,
        from,
        target,
      );

      if (distance < 1.5) score -= 30;
      else if (distance < 3) score -= 15;
      else if (distance < 4.5) score -= 5;
    }

    return score;
  }

  // Room to move where the carry ends.
  private evaluateSpace(target: Point, context: DecisionContext): number {
    const nearest = this.nearestOpponentDistance(target, context);

    if (nearest === null || nearest >= 8) return 15;
    if (nearest >= 5) return 8;
    if (nearest >= 3) return 0;

    return -12;
  }

  // How hard the carrier is being closed down right now.
  private evaluatePressure(from: Point, context: DecisionContext): number {
    const nearest = this.nearestOpponentDistance(from, context);

    if (nearest === null || nearest >= 5) return 5;
    if (nearest >= 3) return 0;
    if (nearest >= 1.5) return -8;

    return -20;
  }

  private evaluateProgress(
    from: Point,
    target: Point,
    context: DecisionContext,
  ): number {
    const forward = this.positionService.getForwardDistance(
      from,
      target,
      context.attackingDirection,
    );

    let score = 0;

    if (forward >= 6) score += 12;
    else if (forward >= 2) score += 5;
    else if (forward < 0) score -= 10;

    // Close to goal: stop carrying and shoot or pass.
    const distanceToGoal = PitchService.getDistance(from, context.goalPosition);

    if (distanceToGoal < 18) score -= 35;
    else if (distanceToGoal < 28) score -= 15;

    return score;
  }

  private nearestOpponentDistance(
    position: Point,
    context: DecisionContext,
  ): number | null {
    let nearest: number | null = null;

    for (const opponent of context.opponents) {
      const distance = PitchService.getDistance(
        position,
        opponent.state.position,
      );

      if (nearest === null || distance < nearest) nearest = distance;
    }

    return nearest;
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