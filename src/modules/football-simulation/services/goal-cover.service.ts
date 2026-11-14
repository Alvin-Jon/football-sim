import type {
  DecisionContext,
  DecisionPlayer,
} from "../types/decision.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { PitchService } from "./pitch.service.js";

export type CoverRole = "RUNNER" | "POST" | "CENTRE";

export interface CoverAssignment {
  role: CoverRole;
  point: Vector2D;
}

// When the opponent's ball carrier is close to our goal, the defenders who
// are not engaging him are given jobs instead of drifting back to shape:
//   RUNNER  stand goal-side of the most dangerous attacker without the ball
//   POST    cover the post on the carrier's side
//   CENTRE  stand in the lane between the carrier and the middle of the goal
//
// Every defender runs this on the same snapshot of the match, so they all
// reach the same assignment without talking to each other.
export class GoalCoverService {
  // Carrier within this share of the pitch length from our goal = danger.
  private static readonly DANGER_ZONE = 0.22;

  // An attacker without the ball this close to our goal needs marking.
  private static readonly RUNNER_ZONE = 0.1;

  // Defenders further than this share of the pitch from their own goal
  // are not asked to cover it.
  private static readonly MAX_COVER_RANGE = 0.4;

  // Metres in front of the goal line for the post and central positions.
  private static readonly POST_DEPTH = 2.5;
  private static readonly CENTRE_DISTANCE = 9;

  // Metres a runner's marker stands goal-side of him.
  private static readonly RUNNER_GAP = 2;

  static getAssignment(context: DecisionContext): CoverAssignment | null {
    const carrier = context.opponents.find(
      (opponent) => opponent.player.id === context.ball.possessionPlayerId,
    );

    if (!carrier) return null;

    const length = PITCH_DIMENSIONS.length;

    // Our own goal is the one at the opposite end to the goal we attack.
    const goal: Vector2D = {
      x: length - context.goalPosition.x,
      y: PITCH_DIMENSIONS.width / 2,
    };

    const carrierPosition = carrier.state.position;

    if (
      PitchService.getDistance(carrierPosition, goal) >
      this.DANGER_ZONE * length
    ) {
      return null;
    }

    // Which way is "into the pitch" from our goal line.
    const inward = goal.x <= 0 ? 1 : -1;

    const self = context.player;
    const defenders = [self, ...context.teammates].filter(
      (candidate) => candidate.player.position !== "GK",
    );

    // The players already closing the carrier down are not assigned a job.
    const byCarrier = [...defenders].sort(
      (a, b) =>
        PitchService.getDistance(a.state.position, carrierPosition) -
          PitchService.getDistance(b.state.position, carrierPosition) ||
        a.player.id.localeCompare(b.player.id),
    );

    const engaged = new Set(
      byCarrier
        .slice(0, context.tactics.pressChasers)
        .map((candidate) => candidate.player.id),
    );

    if (engaged.has(self.player.id)) return null;

    let available = defenders.filter(
      (candidate) =>
        !engaged.has(candidate.player.id) &&
        PitchService.getDistance(candidate.state.position, goal) <=
          this.MAX_COVER_RANGE * length,
    );

    const slots: CoverAssignment[] = [];

    // The most dangerous attacker without the ball, if there is one.
    let runner: DecisionPlayer | undefined;
    let runnerDistance = Infinity;

    for (const opponent of context.opponents) {
      if (opponent.player.id === carrier.player.id) continue;
      if (opponent.player.position === "GK") continue;

      const distance = PitchService.getDistance(opponent.state.position, goal);

      if (distance < this.RUNNER_ZONE * length && distance < runnerDistance) {
        runner = opponent;
        runnerDistance = distance;
      }
    }

    if (runner) {
      slots.push({
        role: "RUNNER",
        point: PitchService.clampPosition(
          this.towards(runner.state.position, goal, this.RUNNER_GAP),
        ),
      });
    }

    // The post on the carrier's side.
    const side = Math.sign(carrierPosition.y - goal.y) || 1;

    slots.push({
      role: "POST",
      point: PitchService.clampPosition({
        x: goal.x + inward * this.POST_DEPTH,
        y: goal.y + side * (PITCH_DIMENSIONS.goalWidth / 2 - 0.5),
      }),
    });

    // The lane between the carrier and the middle of the goal.
    const carrierToGoal = PitchService.getDistance(carrierPosition, goal);

    slots.push({
      role: "CENTRE",
      point: PitchService.clampPosition(
        this.towards(
          goal,
          carrierPosition,
          Math.min(this.CENTRE_DISTANCE, carrierToGoal * 0.6),
        ),
      ),
    });

    // Hand out the jobs in priority order, each to the nearest free defender.
    for (const slot of slots) {
      let best: DecisionPlayer | undefined;
      let bestDistance = Infinity;

      for (const candidate of available) {
        const distance = PitchService.getDistance(
          candidate.state.position,
          slot.point,
        );

        if (
          distance < bestDistance ||
          (distance === bestDistance &&
            best !== undefined &&
            candidate.player.id < best.player.id)
        ) {
          best = candidate;
          bestDistance = distance;
        }
      }

      if (!best) break;

      const picked = best;

      if (picked.player.id === self.player.id) return slot;

      available = available.filter((candidate) => candidate !== picked);
    }

    return null;
  }

  // The point `distance` metres from `from`, in the direction of `to`.
  private static towards(
    from: Vector2D,
    to: Vector2D,
    distance: number,
  ): Vector2D {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) return { ...from };

    return {
      x: from.x + (dx / length) * distance,
      y: from.y + (dy / length) * distance,
    };
  }
}