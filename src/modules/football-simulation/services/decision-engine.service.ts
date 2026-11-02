import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
  DecisionResult,
} from "../types/decision.types.js";

import { DecisionEvaluationService } from "./decision-evaluation.service.js";
import { PitchService } from "./pitch.service.js";
import { PositioningService } from "./positioning.service.js";

import type { FormationSlot } from "../types/formation.types.js";
import type { FormationFluidity } from "../types/formation.types.js";

export class DecisionEngineService {
  private static generateOnBallActions(
    context: DecisionContext,
  ): DecisionCandidate[] {
    const candidates: DecisionCandidate[] = [];

    const playerPosition = context.player.state.position;

    // Shooting
    candidates.push({
      action: "SHOOT",
      score: 0,
      reasoning: ["Player has possession"],
    });

    // Dribbling
    candidates.push({
      action: "DRIBBLE",
      score: 0,
      targetPosition: {
        x: playerPosition.x + 10,
        y: playerPosition.y,
      },
      reasoning: ["Progress with the ball"],
    });

    // Passing options
    for (const teammate of context.teammates) {
      const distance = PitchService.getDistance(
        playerPosition,
        teammate.state.position,
      );

      if (distance > 35) {
        candidates.push({
          action: "LONG_BALL",
          score: 0,
          targetPlayerId: teammate.player.id,
          targetPosition: teammate.state.position,
          reasoning: ["Long-distance passing option"],
        });

        continue;
      }

      candidates.push({
        action: "PASS",
        score: 0,
        targetPlayerId: teammate.player.id,
        targetPosition: teammate.state.position,
        reasoning: ["Available teammate"],
      });

      if (
        teammate.state.position.x >
        playerPosition.x + 5
      ) {
        candidates.push({
          action: "THROUGH_BALL",
          score: 0,
          targetPlayerId: teammate.player.id,
          targetPosition: teammate.state.position,
          reasoning: ["Teammate is ahead"],
        });
      }
    }

    candidates.push({
      action: "HOLD_BALL",
      score: 0,
      reasoning: ["Retain possession"],
    });

    return candidates;
  }

  private static generateOffBallActions(
    context: DecisionContext,
  ): DecisionCandidate[] {
    const candidates: DecisionCandidate[] = [];

    const playerPosition = context.player.state.position;

    const nearestOpponent = context.opponents
      .map((opponent) => ({
        ...opponent,
        distance: PitchService.getDistance(
          playerPosition,
          opponent.state.position,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    const nearestOpponentToBall = context.opponents
      .map((opponent) => ({
        ...opponent,
        distance: PitchService.getDistance(
          context.ball.position,
          opponent.state.position,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (context.phase === "DEFENDING") {
      if (nearestOpponentToBall) {
        candidates.push({
          action: "PRESS",
          score: 0,
          targetPosition: nearestOpponentToBall.state.position,
          targetPlayerId: nearestOpponentToBall.player.id,
          reasoning: ["Opposition player has the ball"],
        });
      }

      if (nearestOpponent) {
        candidates.push({
          action: "MARK",
          score: 0,
          targetPosition: nearestOpponent.state.position,
          targetPlayerId: nearestOpponent.player.id,
          reasoning: ["Opponent available to mark"],
        });
      }

      candidates.push({
        action: "INTERCEPT",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Attempt to intercept possession"],
      });

      candidates.push({
        action: "TRACK_BACK",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Defensive recovery"],
      });
    } else {
      candidates.push({
        action: "SUPPORT",
        score: 0,
        targetPosition: context.ball.position,
        reasoning: ["Support the player in possession"],
      });

      candidates.push({
        action: "MAKE_RUN",
        score: 0,
        targetPosition: {
          x: playerPosition.x + 12,
          y: playerPosition.y,
        },
        reasoning: ["Create an attacking option"],
      });
    }

    return candidates;
  }

  static decide(
    context: DecisionContext,
  ): DecisionResult {
    const hasBall =
      context.ball.possessionPlayerId ===
      context.player.player.id;

    const candidates = hasBall
      ? this.generateOnBallActions(context)
      : this.generateOffBallActions(context);

    const evaluatedCandidates = candidates.map((candidate) => ({
      ...candidate,
      score: DecisionEvaluationService.evaluate(
        context,
        candidate,
      ),
    }));

    evaluatedCandidates.sort(
      (a, b) => b.score - a.score,
    );

    const selected = evaluatedCandidates[0];
    if(!selected) {
      throw new Error(
        `No decision candidates available for player ${context.player.player.id} at tick ${context.tick}`,
      );
    }

    return {
      playerId: context.player.player.id,

      action: selected.action,

      targetPosition: selected.targetPosition,

      targetPlayerId: selected.targetPlayerId,

      score: selected.score,

      reasoning: selected.reasoning,

      evaluatedAtTick: context.tick,
    };
  }

  static evaluatePosition(
  position: { x: number; y: number },
  slot: FormationSlot,
  phase: "ATTACKING" | "DEFENDING",
  fluidity: FormationFluidity,
): number {
  return PositioningService.getPositioningPreference(
    position,
    slot,
    phase,
    fluidity,
  );
}
}