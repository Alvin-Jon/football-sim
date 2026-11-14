import type {
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { DecisionPositionService } from "./decision-position.service.js";
import { PitchService } from "./pitch.service.js";
import { PositionInfluenceService } from "./position-influence.service.js";
import type { PlayerRole } from "./position-influence.service.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { hash01 } from "../utils/carry-direction.util.js";

type Point = { x: number; y: number };

export class DribbleEvaluationService {
  private readonly positionService = new DecisionPositionService();

  // How far a player may carry the ball (metres, from where he got it)
  // before carrying starts to look worse than releasing it. Without this a
  // free defensive midfielder ran the whole length of the pitch.
  private static readonly CARRY_ALLOWANCE: Record<PlayerRole, number> = {
    CENTRE_BACK: 8,
    FULL_BACK: 15,
    DEFENSIVE_MID: 10,
    CENTRAL_MID: 15,
    ATTACKING_MID: 14,
    WINGER: 20,
    STRIKER: 14,
  };

  private static readonly CARRY_PENALTY_PER_METRE = 3.5;
  private static readonly MAX_CARRY_PENALTY = 80;

  evaluate(context: DecisionContext, candidate: DecisionCandidate): number {
    if (candidate.action !== "DRIBBLE") return 0;
    if (!candidate.targetPosition) return -100;

    const from = context.player.state.position;
    const target = candidate.targetPosition;

    return (
      this.evaluatePath(from, target, context) +
      this.evaluateSpace(target, context) +
      this.evaluatePressure(from, context) +
      this.evaluateProgress(from, target, context) +
      this.evaluateDirection(from, target, context) +
      this.evaluateCarry(context) +
      this.jitter(context, target)
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

  // Which way he is heading, not just how far forward. A lean towards goal is
  // worth a little, running along the touchline is not, and a wide player
  // with LIKES_TO_CUT_INSIDE is rewarded for carrying infield.
  private evaluateDirection(
    from: Point,
    target: Point,
    context: DecisionContext,
  ): number {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.01) return 0;

    const goal = context.goalPosition;
    const toGoalX = goal.x - from.x;
    const toGoalY = goal.y - from.y;
    const goalLength = Math.hypot(toGoalX, toGoalY) || 1;

    let score = 6 * ((dx * toGoalX + dy * toGoalY) / (length * goalLength));

    const margin = Math.min(target.y, PITCH_DIMENSIONS.width - target.y);
    if (margin < 3) score -= 10;
    else if (margin < 6) score -= 4;

    if (context.player.player.traits.includes("LIKES_TO_CUT_INSIDE")) {
      const centreY = PITCH_DIMENSIONS.width / 2;

      if (Math.abs(from.y - centreY) > 18) {
        // +1 = straight towards the middle, -1 = straight out to the touchline.
        const inward =
          (Math.abs(from.y - centreY) - Math.abs(target.y - centreY)) / length;

        score += inward > 0 ? 12 * inward : 6 * inward;
      }
    }

    return score;
  }

  // The longer he has already carried it, the less this looks like a good
  // idea, by role (see CARRY_ALLOWANCE).
  private evaluateCarry(context: DecisionContext): number {
    const carried = context.carry?.distance ?? 0;
    const role = PositionInfluenceService.getRole(
      context.player.player.position,
    );

    let allowance = DribbleEvaluationService.CARRY_ALLOWANCE[role];
    if (context.player.player.traits.includes("RUNS_WITH_BALL")) {
      allowance += 10;
    }

    const excess = Math.max(0, carried - allowance);

    return -Math.min(
      DribbleEvaluationService.MAX_CARRY_PENALTY,
      excess * DribbleEvaluationService.CARRY_PENALTY_PER_METRE,
    );
  }

  // Equal options used to resolve to the first one every time, which is the
  // dead-straight carry. A small repeatable variation per player and moment
  // lets a run drift and bend.
  private jitter(context: DecisionContext, target: Point): number {
    const key = `${context.player.player.id}:${Math.floor(context.tick / 15)}:${Math.round(target.x)}:${Math.round(target.y)}`;

    return (hash01(key) - 0.5) * 4;
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