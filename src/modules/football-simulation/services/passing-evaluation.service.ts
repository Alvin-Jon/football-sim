import type {
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { PitchService } from "./pitch.service.js";
import { DecisionPositionService } from "./decision-position.service.js";

export class PassingEvaluationService {
  private readonly positionService =
    new DecisionPositionService();

  evaluate(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    if (
      candidate.action !== "PASS" &&
      candidate.action !== "THROUGH_BALL" &&
      candidate.action !== "LONG_BALL"
    ) {
      return 0;
    }

    if (!candidate.targetPosition) {
      return -100;
    }

    const passerPosition = context.player.state.position;
    const receiverPosition = candidate.targetPosition;

    const distance = PitchService.getDistance(
      passerPosition,
      receiverPosition,
    );

    const receiver = context.teammates.find(
      (teammate) =>
        teammate.player.id === candidate.targetPlayerId,
    );

    if (!receiver) {
      return -100;
    }

    const laneRisk = this.evaluatePassingLane(
      passerPosition,
      receiverPosition,
      context,
    );

    const receiverPressure = this.evaluateReceiverPressure(
      receiverPosition,
      context,
    );

    const passerPressure = this.evaluatePasserPressure(
      passerPosition,
      context,
    );

    const distanceScore = this.evaluateDistance(
      distance,
      candidate.action,
    );

    const forwardScore = this.evaluateForwardProgress(
      passerPosition,
      receiverPosition,
      candidate.action,
      context,
    );

    const spaceScore = this.evaluateReceiverSpace(
      receiverPosition,
      context,
    );

    return (
      laneRisk +
      receiverPressure +
      passerPressure +
      distanceScore +
      forwardScore +
      spaceScore
    );
  }

  private evaluatePassingLane(
    start: { x: number; y: number },
    end: { x: number; y: number },
    context: DecisionContext,
  ): number {
    let score = 0;

    for (const opponent of context.opponents) {
      const distance = this.getDistanceFromSegment(
        opponent.state.position,
        start,
        end,
      );

      if (distance < 1) {
        score -= 25;
      } else if (distance < 2) {
        score -= 15;
      } else if (distance < 3.5) {
        score -= 7;
      }
    }

    return score;
  }

  private evaluateReceiverPressure(
    receiverPosition: { x: number; y: number },
    context: DecisionContext,
  ): number {
    const nearestOpponent = this.getNearestOpponentDistance(
      receiverPosition,
      context,
    );

    if (nearestOpponent === null) {
      return 15;
    }

    if (nearestOpponent >= 10) return 15;
    if (nearestOpponent >= 6) return 10;
    if (nearestOpponent >= 3) return 3;
    if (nearestOpponent >= 1.5) return -8;

    return -15;
  }

  private evaluatePasserPressure(
    passerPosition: { x: number; y: number },
    context: DecisionContext,
  ): number {
    const nearestOpponent = this.getNearestOpponentDistance(
      passerPosition,
      context,
    );

    if (nearestOpponent === null) {
      return 5;
    }

    if (nearestOpponent >= 8) return 5;
    if (nearestOpponent >= 4) return 2;
    if (nearestOpponent >= 2) return 0;

    // A player under immediate pressure should favour
    // getting the ball away rather than holding it.
    return 5;
  }

  private evaluateDistance(
    distance: number,
    action: DecisionCandidate["action"],
  ): number {
    if (action === "PASS") {
      if (distance <= 10) return 8;
      if (distance <= 20) return 12;
      if (distance <= 30) return 5;
      return -8;
    }

    if (action === "THROUGH_BALL") {
      if (distance <= 15) return 5;
      if (distance <= 30) return 12;
      if (distance <= 40) return 5;
      return -12;
    }

    if (action === "LONG_BALL") {
      if (distance >= 30 && distance <= 50) return 12;
      if (distance > 50 && distance <= 65) return 5;
      return -8;
    }

    return 0;
  }

  private evaluateForwardProgress(
    passerPosition: { x: number; y: number },
    receiverPosition: { x: number; y: number },
    action: DecisionCandidate["action"],
    context: DecisionContext,
  ): number {
    const forwardDistance =
      this.positionService.getForwardDistance(
        passerPosition,
        receiverPosition,
        context.attackingDirection,
      );

    if (action === "THROUGH_BALL") {
      if (forwardDistance >= 15) return 15;
      if (forwardDistance >= 7) return 10;
      if (forwardDistance > 0) return 5;

      return -20;
    }

    if (forwardDistance >= 15) return 8;
    if (forwardDistance >= 5) return 5;

    if (forwardDistance < -10) return -3;

    return 0;
  }

  private evaluateReceiverSpace(
    receiverPosition: { x: number; y: number },
    context: DecisionContext,
  ): number {
    let nearbyOpponents = 0;

    for (const opponent of context.opponents) {
      const distance = PitchService.getDistance(
        receiverPosition,
        opponent.state.position,
      );

      if (distance < 5) {
        nearbyOpponents++;
      }
    }

    if (nearbyOpponents === 0) return 8;
    if (nearbyOpponents === 1) return 3;
    if (nearbyOpponents === 2) return -5;

    return -12;
  }

  private getNearestOpponentDistance(
    position: { x: number; y: number },
    context: DecisionContext,
  ): number | null {
    if (context.opponents.length === 0) {
      return null;
    }

    let nearestDistance = Infinity;

    for (const opponent of context.opponents) {
      const distance = PitchService.getDistance(
        position,
        opponent.state.position,
      );

      nearestDistance = Math.min(
        nearestDistance,
        distance,
      );
    }

    return nearestDistance;
  }

  private getDistanceFromSegment(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return PitchService.getDistance(point, start);
    }

    const projection = Math.max(
      0,
      Math.min(
        1,
        (
          (point.x - start.x) * dx +
          (point.y - start.y) * dy
        ) / lengthSquared,
      ),
    );

    const closestPoint = {
      x: start.x + projection * dx,
      y: start.y + projection * dy,
    };

    return PitchService.getDistance(
      point,
      closestPoint,
    );
  }
}