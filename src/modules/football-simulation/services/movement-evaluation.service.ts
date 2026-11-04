import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { DecisionPositionService } from "./decision-position.service.js";
import { PitchService } from "./pitch.service.js";

export class MovementEvaluationService {
  private readonly positionService =
    new DecisionPositionService();

  generateCandidates(
    context: DecisionContext,
  ): DecisionCandidate[] {
    const candidates: DecisionCandidate[] = [];

    const playerPosition = context.player.state.position;
    const ballPosition = context.ball.position;

    const sign = this.positionService.getAttackSign(
      context.attackingDirection,
    );

    const makeTarget = (
      x: number,
      y: number,
    ) =>
      PitchService.clampPosition({ x, y });

    // --------------------------------------------------
    // SUPPORT POSITIONS
    // --------------------------------------------------

    candidates.push({
      action: "SUPPORT",
      score: 0,
      targetPosition: makeTarget(
        ballPosition.x - sign * 7,
        ballPosition.y,
      ),
      reasoning: ["Provide a supporting passing option"],
    });

    // Support on either side of the ball carrier.
    candidates.push({
      action: "SUPPORT",
      score: 0,
      targetPosition: makeTarget(
        ballPosition.x - sign * 3,
        ballPosition.y - 8,
      ),
      reasoning: ["Provide a wide supporting option"],
    });

    candidates.push({
      action: "SUPPORT",
      score: 0,
      targetPosition: makeTarget(
        ballPosition.x - sign * 3,
        ballPosition.y + 8,
      ),
      reasoning: ["Provide an alternative supporting angle"],
    });

    // --------------------------------------------------
    // ATTACKING RUNS
    // --------------------------------------------------

    // Direct forward run.
    candidates.push({
      action: "MAKE_RUN",
      score: 0,
      targetPosition: makeTarget(
        playerPosition.x + sign * 15,
        playerPosition.y,
      ),
      reasoning: ["Make a forward attacking run"],
    });

    // Run into the left channel.
    candidates.push({
      action: "MAKE_RUN",
      score: 0,
      targetPosition: makeTarget(
        playerPosition.x + sign * 12,
        playerPosition.y - 7,
      ),
      reasoning: ["Attack space in the left channel"],
    });

    // Run into the right channel.
    candidates.push({
      action: "MAKE_RUN",
      score: 0,
      targetPosition: makeTarget(
        playerPosition.x + sign * 12,
        playerPosition.y + 7,
      ),
      reasoning: ["Attack space in the right channel"],
    });

    // --------------------------------------------------
    // POSITIONAL MOVEMENT
    // --------------------------------------------------

    candidates.push({
      action: "MOVE",
      score: 0,
      targetPosition: makeTarget(
        playerPosition.x + sign * 5,
        playerPosition.y - 6,
      ),
      reasoning: ["Move into an alternative attacking position"],
    });

    candidates.push({
      action: "MOVE",
      score: 0,
      targetPosition: makeTarget(
        playerPosition.x + sign * 5,
        playerPosition.y + 6,
      ),
      reasoning: ["Move into available attacking space"],
    });

    return candidates;
  }

 //evaluate the movement candidates based on available space, congestion, forward progress, ball distance, and movement distance
  evaluate(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    if (
      !["MOVE", "SUPPORT", "MAKE_RUN"].includes(
        candidate.action,
      )
    ) {
      return 0;
    }

    if (!candidate.targetPosition) {
      return -100;
    }

    const target = candidate.targetPosition;

    const playerPosition = context.player.state.position;

    const nearestOpponentDistance =
      this.getNearestDistance(
        target,
        context.opponents,
      );

    const nearestTeammateDistance =
      this.getNearestDistance(
        target,
        context.teammates.filter(
          (teammate) =>
            teammate.player.id !== context.player.player.id,
        ),
      );

    const spaceScore = this.evaluateAvailableSpace(
      nearestOpponentDistance,
    );

    const congestionScore = this.evaluateCongestion(
      nearestTeammateDistance,
    );

    const forwardScore = this.evaluateForwardProgress(
      playerPosition,
      target,
      context,
    );

    const ballDistanceScore = this.evaluateBallDistance(
      target,
      context.ball.position,
      candidate.action,
    );

    const movementDistanceScore =
      this.evaluateMovementDistance(
        playerPosition,
        target,
      );

    return (
      spaceScore +
      congestionScore +
      forwardScore +
      ballDistanceScore +
      movementDistanceScore
    );
  }

  private evaluateAvailableSpace(
    nearestOpponentDistance: number | null,
  ): number {
    if (nearestOpponentDistance === null) {
      return 15;
    }

    if (nearestOpponentDistance >= 12) return 15;
    if (nearestOpponentDistance >= 8) return 12;
    if (nearestOpponentDistance >= 5) return 7;
    if (nearestOpponentDistance >= 3) return 0;

    return -12;
  }

  private evaluateCongestion(
    nearestTeammateDistance: number | null,
  ): number {
    if (nearestTeammateDistance === null) {
      return 5;
    }

    if (nearestTeammateDistance >= 10) return 8;
    if (nearestTeammateDistance >= 6) return 4;
    if (nearestTeammateDistance >= 3) return -3;

    return -10;
  }

  private evaluateForwardProgress(
    playerPosition: { x: number; y: number },
    target: { x: number; y: number },
    context: DecisionContext,
  ): number {
    const forwardDistance =
      this.positionService.getForwardDistance(
        playerPosition,
        target,
        context.attackingDirection,
      );

    if (forwardDistance >= 10) return 10;
    if (forwardDistance >= 5) return 6;
    if (forwardDistance >= 0) return 2;

    return -5;
  }

  private evaluateBallDistance(
    target: { x: number; y: number },
    ballPosition: { x: number; y: number },
    action: DecisionAction,
  ): number {
    const distance = PitchService.getDistance(
      target,
      ballPosition,
    );

    if (action === "SUPPORT") {
      if (distance >= 6 && distance <= 15) return 12;
      if (distance < 6) return -5;
      if (distance <= 25) return 5;

      return -8;
    }

    if (action === "MAKE_RUN") {
      if (distance >= 8 && distance <= 25) return 12;
      if (distance < 8) return 0;
      if (distance <= 35) return 5;

      return -5;
    }

    return distance <= 20 ? 5 : 0;
  }

  private evaluateMovementDistance(
    current: { x: number; y: number },
    target: { x: number; y: number },
  ): number {
    const distance = PitchService.getDistance(
      current,
      target,
    );

    if (distance < 3) return -5;
    if (distance <= 12) return 5;
    if (distance <= 20) return 3;

    return -5;
  }

  private getNearestDistance(
    position: { x: number; y: number },
    players: DecisionContext["opponents"],
  ): number | null {
    if (players.length === 0) {
      return null;
    }

    let nearestDistance = Infinity;

    for (const player of players) {
      const distance = PitchService.getDistance(
        position,
        player.state.position,
      );

      nearestDistance = Math.min(
        nearestDistance,
        distance,
      );
    }

    return nearestDistance;
  }
}