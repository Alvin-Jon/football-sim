import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

import { PitchService } from "./pitch.service.js";

export class DefensiveEvaluationService {
  evaluate(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    switch (candidate.action) {
      case "PRESS":
        return this.evaluatePress(context, candidate);

      case "MARK":
        return this.evaluateMark(context, candidate);

      case "INTERCEPT":
        return this.evaluateIntercept(context, candidate);

      case "TACKLE":
        return this.evaluateTackle(context, candidate, false);

      case "HARD_TACKLE":
        return this.evaluateTackle(context, candidate, true);

      case "TRACK_BACK":
        return this.evaluateTrackBack(context, candidate);

      default:
        return 0;
    }
  }

  // --------------------------------------------------
  // PRESSING
  // --------------------------------------------------

  private evaluatePress(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    const carrier = this.getBallCarrier(context);

    if (!carrier || !candidate.targetPosition) {
      return -100;
    }

    const distance = PitchService.getDistance(
      context.player.state.position,
      carrier.state.position,
    );

    let score = 0;

    // Distance to the ball carrier.
    if (distance <= 3) score += 15;
    else if (distance <= 7) score += 12;
    else if (distance <= 12) score += 7;
    else if (distance <= 20) score += 2;
    else score -= 8;

    // Aggression encourages pressing.
    score += context.player.player.attributes.aggression * 0.4;

    // Anticipation helps players identify pressing opportunities.
    score += context.player.player.attributes.anticipation * 0.3;

    // Teamwork encourages coordinated pressing.
    score += context.player.player.attributes.teamwork * 0.3;

    // Avoid everyone pressing the same opponent.
    const teammatesPressing = this.countTeammatesNearOpponent(
      carrier.state.position,
      context,
      5,
    );

    if (teammatesPressing >= 2) {
      score -= 12;
    } else if (teammatesPressing === 1) {
      score -= 4;
    }

    return score;
  }

  // --------------------------------------------------
  // MARKING
  // --------------------------------------------------

  private evaluateMark(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    if (!candidate.targetPlayerId) {
      return -100;
    }

    const opponent = context.opponents.find(
      (item) =>
        item.player.id === candidate.targetPlayerId,
    );

    if (!opponent) {
      return -100;
    }

    const distance = PitchService.getDistance(
      context.player.state.position,
      opponent.state.position,
    );

    let score = 0;

    if (distance <= 3) score += 12;
    else if (distance <= 6) score += 10;
    else if (distance <= 10) score += 6;
    else if (distance <= 15) score += 2;
    else score -= 5;

    score += context.player.player.attributes.positioning * 0.5;

    score += context.player.player.attributes.anticipation * 0.3;

    score += context.player.player.attributes.teamwork * 0.2;

    // Avoid unnecessarily marking an opponent already covered.
    const teammatesNearOpponent = this.countTeammatesNearOpponent(
      opponent.state.position,
      context,
      4,
    );

    if (teammatesNearOpponent > 0) {
      score -= 5 * teammatesNearOpponent;
    }

    return score;
  }

  // --------------------------------------------------
  // INTERCEPTION
  // --------------------------------------------------

  private evaluateIntercept(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    if (!candidate.targetPosition) {
      return -100;
    }

    const distance = PitchService.getDistance(
      context.player.state.position,
      candidate.targetPosition,
    );

    let score = 0;

    if (distance <= 3) score += 15;
    else if (distance <= 7) score += 12;
    else if (distance <= 12) score += 7;
    else if (distance <= 20) score += 2;
    else score -= 10;

    score += context.player.player.attributes.anticipation * 0.5;

    score += context.player.player.attributes.positioning * 0.3;

    score += context.player.player.attributes.decisions * 0.2;

    return score;
  }

  // --------------------------------------------------
  // TACKLING
  // --------------------------------------------------

  private evaluateTackle(
    context: DecisionContext,
    candidate: DecisionCandidate,
    isHardTackle: boolean,
  ): number {
    const carrier = this.getBallCarrier(context);

    if (!carrier) {
      return -100;
    }
    //if (match.ball.possessionPlayerId !== carrier.player.id) return;

    const distance = PitchService.getDistance(
      context.player.state.position,
      carrier.state.position,
    );

    // Tackles should only be considered when the player
    // is sufficiently close to the ball carrier.
    if (distance > 3) {
      return -100;
    }

    const attributes = context.player.player.attributes;

    let score = 20; // we should keep adjusting this 

    score += attributes.tackling * 0.5;
    score += attributes.anticipation * 0.3;
    score += attributes.decisions * 0.2;

    // Prefer tackling opportunities where the opponent
    // is close enough to challenge.
    if (distance <= 1.5) score += 15;
    else if (distance <= 2.5) score += 10;
    else score += 5;

    if (isHardTackle) {
      score += attributes.aggression * 0.4;
      score += attributes.strength * 0.2;

      // Hard tackles carry an additional risk.
      score -= 12;

      // Poor decisions and anticipation increase the risk.
      if (attributes.decisions < 8) {
        score -= 8;
      }

      if (attributes.anticipation < 8) {
        score -= 8;
      }
    }

    // A teammate already challenging the carrier reduces
    // the need for another player to dive into the challenge.
    const teammatesChallenging =
      this.countTeammatesNearOpponent(
        carrier.state.position,
        context,
        2,
      );

    if (teammatesChallenging > 0) {
      score -= 10;
    }

    return score;
  }

  // --------------------------------------------------
  // DEFENSIVE RECOVERY
  // --------------------------------------------------

  private evaluateTrackBack(
    context: DecisionContext,
    candidate: DecisionCandidate,
  ): number {
    if (!candidate.targetPosition) {
      return -100;
    }

    const playerPosition = context.player.state.position;

    const distance = PitchService.getDistance(
      playerPosition,
      candidate.targetPosition,
    );

    let score = 5;

    score += context.player.player.attributes.positioning * 0.4;

    score += context.player.player.attributes.teamwork * 0.3;

    score += context.player.player.attributes.decisions * 0.3;

    if (distance > 15) {
      score += 5;
    }

    return score;
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  private getBallCarrier(
    context: DecisionContext,
  ) {
    if (!context.ball.possessionPlayerId) {
      return undefined;
    }

    return context.opponents.find(
      (opponent) =>
        opponent.player.id === context.ball.possessionPlayerId,
    );
  }

  private countTeammatesNearOpponent(
    opponentPosition: { x: number; y: number },
    context: DecisionContext,
    radius: number,
  ): number {
    let count = 0;

    for (const teammate of context.teammates) {
      if (
        teammate.player.id === context.player.player.id
      ) {
        continue;
      }

      const distance = PitchService.getDistance(
        teammate.state.position,
        opponentPosition,
      );

      if (distance <= radius) {
        count++;
      }
    }

    return count;
  }
}