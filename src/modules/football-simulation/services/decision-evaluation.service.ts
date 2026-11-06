import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { DecisionPositionService } from "./decision-position.service.js";
import { PlayerTraitService } from "./player-traits.service.js";

export class DecisionEvaluationService {
  private static readonly positionService = new DecisionPositionService();

  private static distance(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private static clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private static getAttributeInfluence(
    context: DecisionContext,
    action: DecisionAction,
  ): number {
    const attributes = context.player.player.attributes;

    switch (action) {
      case "PASS":
      case "THROUGH_BALL":
      case "LONG_BALL":
        return (
          attributes.passing * 0.5 +
          attributes.vision * 0.3 +
          attributes.decisions * 0.2
        );

      case "SHOOT":
        return (
          attributes.shooting * 0.5 +
          attributes.composure * 0.2 +
          attributes.decisions * 0.3
        );

      case "DRIBBLE":
        return (
          attributes.dribbling * 0.4 +
          attributes.ballControl * 0.3 +
          attributes.agility * 0.3
        );

      case "CROSS":
        return (
          attributes.crossing * 0.5 +
          attributes.vision * 0.3 +
          attributes.decisions * 0.2
        );

      case "PRESS":
      case "INTERCEPT":
      case "MARK":
        return (
          attributes.tackling * 0.4 +
          attributes.anticipation * 0.3 +
          attributes.aggression * 0.3
        );

      case "TACKLE":
        return (
          attributes.tackling * 0.5 +
          attributes.anticipation * 0.3 +
          attributes.decisions * 0.2
        );

      case "HARD_TACKLE":
        return (
          attributes.tackling * 0.4 +
          attributes.aggression * 0.4 +
          attributes.strength * 0.2
        );

      case "MAKE_RUN":
      case "SUPPORT":
      case "MOVE":
        return (
          attributes.positioning * 0.4 +
          attributes.anticipation * 0.3 +
          attributes.teamwork * 0.3
        );

      default:
        return attributes.decisions;
    }
  }

  private static getPersonalityInfluence(
    context: DecisionContext,
    action: DecisionAction,
  ): number {
    const personality = context.player.player.personality;

    const influences = {
      AGGRESSIVE: {
        PRESS: 8,
        INTERCEPT: 5,
        SHOOT: 3,
      },

      ADVENTUROUS: {
        THROUGH_BALL: 8,
        DRIBBLE: 7,
        MAKE_RUN: 6,
        LONG_BALL: 3,
      },

      CAUTIOUS: {
        PASS: 7,
        HOLD_BALL: 5,
        DRIBBLE: -5,
        THROUGH_BALL: -5,
      },

      NORMAL: {},
    };

    return (
      influences[personality][
        action as keyof typeof influences[typeof personality]
      ] ?? 0
    );
  }

  private static getSituationalScore(
    context: DecisionContext,
    action: DecisionAction,
    target?: { x: number; y: number },
  ): number {
    const playerPosition = context.player.state.position;

    const distanceToGoal = this.distance(
      playerPosition,
      context.goalPosition,
    );

    const nearestOpponent = Math.min(
      ...context.opponents.map((opponent) =>
        this.distance(
          playerPosition,
          opponent.state.position,
        ),
      ),
    );

    switch (action) {
      case "SHOOT":
        // Scored by chance quality (distance, angle, pressure, blocked lane)
        // in ShootingEvaluationService.
        return 0;

      case "DRIBBLE":
        return nearestOpponent > 5
          ? 18
          : nearestOpponent > 2
            ? 10
            : -5;

      case "PASS":
        return context.teammates.length > 0 ? 15 : -20;

      case "THROUGH_BALL":
        // "Ahead" depends on which way the team is attacking.
        return context.teammates.some(
          (teammate) =>
            this.positionService.getForwardDistance(
              playerPosition,
              teammate.state.position,
              context.attackingDirection,
            ) > 5,
        )
          ? 20
          : -10;

      case "LONG_BALL":
        return 8;

      case "CROSS":
        return distanceToGoal < 30 ? 20 : -10;

      case "PRESS":
        return nearestOpponent < 2
          ? 5
          : nearestOpponent < 8
            ? 20
            : -5;

      case "TACKLE":
        return nearestOpponent < 1.5
          ? 20
          : nearestOpponent < 3
            ? 12
            : -20;

      case "HARD_TACKLE":
        return nearestOpponent < 1.5
          ? 14
          : nearestOpponent < 3
            ? 8
            : -25;

      case "MARK":
        return nearestOpponent < 15 ? 15 : 0;

      case "INTERCEPT":
        return nearestOpponent < 10 ? 15 : -5;

      case "MAKE_RUN":
      case "SUPPORT":
      case "MOVE":
        return target ? 15 : 0;

      case "TRACK_BACK":
        return 12;

      case "HOLD_BALL":
        return nearestOpponent < 3 ? 10 : 0;

      default:
        return 0;
    }
  }

  static evaluate(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    const action = candidate.action;

    const attributeInfluence = this.getAttributeInfluence(
      context,
      action,
    );

    const traitInfluence =
      PlayerTraitService.getActionInfluence(
        context.player.player.traits,
        action,
      );

    const personalityInfluence =
      this.getPersonalityInfluence(context, action);

    const situationalScore = this.getSituationalScore(
      context,
      action,
      candidate.targetPosition,
    );

    const teamworkInfluence =
      ["PASS", "THROUGH_BALL", "SUPPORT", "MAKE_RUN"].includes(action)
        ? context.player.player.attributes.teamwork * 0.3
        : 0;

    return this.clamp(
      candidate.score +
      attributeInfluence +
      traitInfluence +
      personalityInfluence +
      situationalScore +
      teamworkInfluence,
    );
  }
}