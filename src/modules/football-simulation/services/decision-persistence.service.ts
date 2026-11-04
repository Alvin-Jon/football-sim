import type {
  DecisionContext,
  DecisionResult,
} from "../types/decision.types.js";

import type { DecisionMemory } from "../types/decision-memory.types.js";

export class DecisionPersistenceService {
  private readonly decisions = new Map<string, DecisionMemory>();

  private readonly decisionDurations: Record<string, number> = {
    PASS: 2,
    THROUGH_BALL: 2,
    LONG_BALL: 2,
    SHOOT: 2,
    CROSS: 2,
    DRIBBLE: 5,
    HOLD_BALL: 3,

    MOVE: 8,
    SUPPORT: 8,
    MAKE_RUN: 10,

    PRESS: 5,
    MARK: 10,
    TRACK_BACK: 8,
    INTERCEPT: 4,

    TACKLE: 1,
    HARD_TACKLE: 1,
  };

  getDecision(
    context: DecisionContext,
    calculateDecision: () => DecisionResult,
  ): DecisionResult {
    const playerId = context.player.player.id;

    const existing = this.decisions.get(playerId);

    if (
      existing &&
      !this.shouldReassess(context, existing)
    ) {
      return existing.decision;
    }

    const decision = calculateDecision();

    this.storeDecision(playerId, decision);

    return decision;
  }

  // player's decision should be reassessed if the context has changed in a way that invalidates the previous decision
  private shouldReassess(
    context: DecisionContext,
    memory: DecisionMemory,
  ): boolean {
    const { decision, expiresAtTick } = memory;

    // Decision has expired.
    if (context.tick >= expiresAtTick) {
      return true;
    }

    // Player's team phase has changed.
    const previousWasAttacking =
      this.isOnBallAction(decision.action);

    const currentlyHasBall =
      context.ball.possessionPlayerId ===
      context.player.player.id;

    if (previousWasAttacking !== currentlyHasBall) {
      return true;
    }

    // A decision targeting another player is no longer
    // valid if that player is no longer available.
    if (decision.targetPlayerId) {
      const targetExists = [
        ...context.teammates,
        ...context.opponents,
      ].some(
        (player) =>
          player.player.id === decision.targetPlayerId,
      );

      if (!targetExists) {
        return true;
      }
    }

    // Movement decisions should be reconsidered when
    // the player reaches their destination.
    if (
      decision.targetPosition &&
      this.isMovementAction(decision.action)
    ) {
      const distance = Math.hypot(
        context.player.state.position.x -
          decision.targetPosition.x,
        context.player.state.position.y -
          decision.targetPosition.y,
      );

      if (distance <= 1.5) {
        return true;
      }
    }

    // A player who loses possession or enters a new
    // phase should not continue an outdated decision.
    if (
      context.phase === "DEFENDING" &&
      previousWasAttacking
    ) {
      return true;
    }

    return false;
  }

  private storeDecision(
    playerId: string,
    decision: DecisionResult,
  ): void {
    const duration =
      this.decisionDurations[decision.action] ?? 5;

    this.decisions.set(playerId, {
      decision,
      decidedAtTick: decision.evaluatedAtTick,
      expiresAtTick:
        decision.evaluatedAtTick + duration,
    });
  }

  private isOnBallAction(
    action: DecisionResult["action"],
  ): boolean {
    return [
      "PASS",
      "THROUGH_BALL",
      "LONG_BALL",
      "SHOOT",
      "CROSS",
      "DRIBBLE",
      "HOLD_BALL",
    ].includes(action);
  }

  private isMovementAction(
    action: DecisionResult["action"],
  ): boolean {
    return [
      "MOVE",
      "SUPPORT",
      "MAKE_RUN",
      "PRESS",
      "MARK",
      "TRACK_BACK",
      "INTERCEPT",
    ].includes(action);
  }

  // Explicitly invalidate a player's current decision.
   
  invalidate(playerId: string): void {
    this.decisions.delete(playerId);
  }

  // Clear decisions when a match finishes or is reset.
  clear(): void {
    this.decisions.clear();
  }
}