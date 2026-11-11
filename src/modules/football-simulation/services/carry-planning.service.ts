import type { DecisionContext } from "../types/decision.types.js";
import type { PlayerPosition } from "../types/player.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { PitchService } from "./pitch.service.js";
import { TacticsService } from "./tactics.service.js";

export interface CarryOption {
  target: Vector2D;
  angle: number; // radians, relative to the straight-at-goal axis
  score: number;
  reason: string;
}

interface CarryPlan {
  target: Vector2D;
  angle: number;
  expiresAtTick: number;
}

interface CarryProfile {
  // Pitch progress (0 = own goal line, 1 = opponent goal line) the player
  // will not dribble forward past. Above 1 means "no limit".
  maxProgress: number;
  // Progress range before the cap over which the appetite fades 1 -> 0.
  softZone: number;
  // Multiplier on the reward for moving toward goal.
  forwardWeight: number;
  // + cut inside, - hug the touchline.
  insideBias: number;
}

/**
 * Decides WHERE a ball carrier runs with the ball, and how willing he is to
 * carry at all, based on his role and where he is on the pitch.
 *
 * - getAppetite(): 0..1, how much this player wants to carry from here.
 * - getOptions():  deterministic dribble candidates for the decision engine.
 * - plan():        committed carry target used while waiting to release.
 */
export class CarryPlanningService {
  // Tune these per role. maxProgress is the key "don't run the length of the
  // pitch" control.
  private static readonly PROFILES: Record<PlayerPosition, CarryProfile> = {
    GK: { maxProgress: 0.1, softZone: 0.05, forwardWeight: 0.3, insideBias: 0 },
    CB: { maxProgress: 0.42, softZone: 0.14, forwardWeight: 0.6, insideBias: 0 },
    LB: { maxProgress: 0.68, softZone: 0.16, forwardWeight: 0.8, insideBias: -0.6 },
    RB: { maxProgress: 0.68, softZone: 0.16, forwardWeight: 0.8, insideBias: -0.6 },
    DM: { maxProgress: 0.6, softZone: 0.15, forwardWeight: 0.7, insideBias: 0 },
    CM: { maxProgress: 0.78, softZone: 0.15, forwardWeight: 0.9, insideBias: 0 },
    AM: { maxProgress: 0.92, softZone: 0.12, forwardWeight: 1.0, insideBias: 0 },
    LAM: { maxProgress: 0.95, softZone: 0.12, forwardWeight: 1.0, insideBias: 0.7 },
    RAM: { maxProgress: 0.95, softZone: 0.12, forwardWeight: 1.0, insideBias: 0.7 },
    LW: { maxProgress: 1.2, softZone: 0.1, forwardWeight: 1.0, insideBias: 1.0 },
    RW: { maxProgress: 1.2, softZone: 0.1, forwardWeight: 1.0, insideBias: 1.0 },
    ST: { maxProgress: 1.2, softZone: 0.1, forwardWeight: 1.0, insideBias: 0 },
  };

  private static readonly ANGLES_DEG = [
    -120, -90, -75, -50, -30, -12, 0, 12, 30, 50, 75, 90, 120,
  ];
  private static readonly STRIDE = 7;
  private static readonly PLAN_TICKS = 24;
  private static readonly REACHED_DISTANCE = 1.5;
  private static readonly DANGER_RADIUS = 2.5;
  private static readonly SPACE_RANGE = 12;
  private static readonly EDGE_MARGIN = 3;
  private static readonly OWN_GOAL_ZONE = 30;
  private static readonly BACKWARD_PENALTY = 0.5;
  private static readonly PROGRESS_EPSILON = 0.002;

  private static readonly W_PROGRESS = 1.0;
  private static readonly W_SPACE = 1.2;
  private static readonly W_BLOCK = 1.5;
  private static readonly W_INSIDE = 0.7;
  private static readonly W_CENTRAL = 0.5;
  private static readonly W_EDGE = 1.0;
  private static readonly W_OWN_GOAL = 2.0;
  private static readonly W_COMMIT = 0.25;
  private static readonly NOISE = 0.2;

  private readonly plans = new Map<string, CarryPlan>();

  // Only used for tie-breaking noise in plan(); getOptions() is deterministic.
  constructor(private readonly random: () => number = () => 0.5) {}

  clear(playerId: string): void {
    this.plans.delete(playerId);
  }

  clearAll(): void {
    this.plans.clear();
  }

  // 1 = happy to carry forward, 0 = at his limit, should pass or recycle.
  getAppetite(context: DecisionContext): number {
    const profile = this.getProfile(context);
    const progress = TacticsService.ballProgress(
      context.player.state.position,
      context.attackingDirection,
    );

    return this.clamp((profile.maxProgress - progress) / profile.softZone, 0, 1);
  }

  // Up to three distinct dribble candidates: the best overall plus the best
  // on each other side, so the engine can compare cut-in / straight / wide.
  getOptions(context: DecisionContext): CarryOption[] {
    const options = this.evaluate(context);
    const picked: CarryOption[] = [];

    const add = (option: CarryOption | undefined): void => {
      if (option && !picked.includes(option) && picked.length < 3) {
        picked.push(option);
      }
    };

    const best = options[0];
    if (!best) return picked;

    add(best);
    const side = Math.sign(best.angle);
    for (const wanted of [-1, 1]) {
      if (wanted !== side) {
        add(options.find((option) => Math.sign(option.angle) === wanted));
      }
    }

    return picked;
  }

  // Committed carry target for the "waiting to release" phase.
  plan(tick: number, context: DecisionContext): Vector2D {
    const playerId = context.player.player.id;
    const existing = this.plans.get(playerId);

    if (existing && this.isStillValid(existing, tick, context)) {
      return existing.target;
    }

    const best = this.evaluate(context, existing?.angle, true)[0];
    const target = best?.target ?? { ...context.player.state.position };

    this.plans.set(playerId, {
      target,
      angle: best?.angle ?? 0,
      expiresAtTick: tick + CarryPlanningService.PLAN_TICKS,
    });

    return target;
  }

  // ---------------------------------------------------------------------

  private isStillValid(
    plan: CarryPlan,
    tick: number,
    context: DecisionContext,
  ): boolean {
    const C = CarryPlanningService;
    const position = context.player.state.position;

    if (tick >= plan.expiresAtTick) return false;
    if (PitchService.getDistance(position, plan.target) < C.REACHED_DISTANCE) {
      return false;
    }

    for (const opponent of context.opponents) {
      const { distance, rawT } = this.segmentDistance(
        opponent.state.position,
        position,
        plan.target,
      );
      if (rawT > 0.05 && distance < C.DANGER_RADIUS * 0.8) return false;
    }

    return true;
  }

  private evaluate(
    context: DecisionContext,
    previousAngle?: number,
    withNoise = false,
  ): CarryOption[] {
    const C = CarryPlanningService;
    const position = context.player.state.position;
    const profile = this.getProfile(context);
    const appetite = this.getAppetite(context);

    const sign = context.attackingDirection === "LEFT_TO_RIGHT" ? 1 : -1;
    const centreY = PITCH_DIMENSIONS.width / 2;
    const towardCentre = Math.sign(centreY - position.y);

    const goalDistance = PitchService.getDistance(position, context.goalPosition);
    const finalThird = goalDistance < PITCH_DIMENSIONS.length * 0.3;
    const progress = TacticsService.ballProgress(
      position,
      context.attackingDirection,
    );

    const ownGoal = {
      x: context.goalPosition.x === 0 ? PITCH_DIMENSIONS.length : 0,
      y: centreY,
    };
    const ownGoalDistance = PitchService.getDistance(position, ownGoal);

    const dribbling = context.player.player.attributes.dribbling / 20;
    const options: CarryOption[] = [];

    for (const degrees of C.ANGLES_DEG) {
      const angle = (degrees * Math.PI) / 180;
      const direction = { x: Math.cos(angle) * sign, y: Math.sin(angle) };
      const end = PitchService.clampPosition({
        x: position.x + direction.x * C.STRIDE,
        y: position.y + direction.y * C.STRIDE,
      });

      // Hard limit: never carry forward beyond this role's cap.
      const endProgress = TacticsService.ballProgress(
        end,
        context.attackingDirection,
      );
      if (
        endProgress > profile.maxProgress &&
        endProgress > progress + C.PROGRESS_EPSILON
      ) {
        continue;
      }

      let score = 0;

      // Progress toward goal, scaled by role and appetite. Moving away from
      // goal costs a little, so sideways/back carries stay possible.
      const newGoalDistance = PitchService.getDistance(end, context.goalPosition);
      const gain = (goalDistance - newGoalDistance) / C.STRIDE;
      score +=
        gain > 0
          ? gain * C.W_PROGRESS * profile.forwardWeight * appetite
          : gain * C.BACKWARD_PENALTY;

      // Space / blockers ahead on the path.
      let clearance = C.SPACE_RANGE;
      for (const opponent of context.opponents) {
        const { distance, rawT } = this.segmentDistance(
          opponent.state.position,
          position,
          end,
        );
        if (rawT <= 0.05) continue;
        clearance = Math.min(clearance, distance);
      }
      score += (clearance / C.SPACE_RANGE) * C.W_SPACE;

      if (clearance < C.DANGER_RADIUS) {
        const nerve = 1.1 - 0.5 * dribbling;
        score -=
          ((C.DANGER_RADIUS - clearance) / C.DANGER_RADIUS) *
          C.W_BLOCK *
          nerve;
      }

      // Role preference: cut inside vs hug the line.
      score += direction.y * towardCentre * profile.insideBias * C.W_INSIDE;

      // Final third: drift toward the central channel.
      if (finalThird) {
        const before = Math.abs(position.y - centreY);
        const after = Math.abs(end.y - centreY);
        score += ((before - after) / C.STRIDE) * C.W_CENTRAL;
      }

      // Touchline avoidance.
      const edgeDistance = Math.min(end.y, PITCH_DIMENSIONS.width - end.y);
      if (edgeDistance < C.EDGE_MARGIN) {
        score -= ((C.EDGE_MARGIN - edgeDistance) / C.EDGE_MARGIN) * C.W_EDGE;
      }

      // Don't carry toward your own goal when you are already near it.
      if (ownGoalDistance < C.OWN_GOAL_ZONE) {
        const closer = ownGoalDistance - PitchService.getDistance(end, ownGoal);
        if (closer > 0) {
          score -=
            (closer / C.STRIDE) *
            C.W_OWN_GOAL *
            (1 - ownGoalDistance / C.OWN_GOAL_ZONE);
        }
      }

      if (previousAngle !== undefined && Math.abs(angle - previousAngle) < 0.01) {
        score += C.W_COMMIT;
      }

      if (withNoise) score += (this.random() - 0.5) * C.NOISE;

      options.push({
        target: end,
        angle,
        score,
        reason: this.describe(degrees, direction.y * towardCentre),
      });
    }

    options.sort((a, b) => b.score - a.score);

    // Everything excluded (e.g. pinned against a line): stay on the ball.
    if (options.length === 0) {
      options.push({
        target: { ...position },
        angle: 0,
        score: -1,
        reason: "Shield the ball",
      });
    }

    return options;
  }

  private describe(degrees: number, towardCentre: number): string {
    if (Math.abs(degrees) >= 90) return "Turn away from pressure with the ball";
    if (Math.abs(degrees) <= 12) return "Run at goal with the ball";
    return towardCentre > 0
      ? "Cut inside with the ball"
      : "Drive down the flank with the ball";
  }

  private getProfile(context: DecisionContext): CarryProfile {
    return CarryPlanningService.PROFILES[context.player.player.position];
  }

  private segmentDistance(
    p: Vector2D,
    a: Vector2D,
    b: Vector2D,
  ): { distance: number; rawT: number } {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSquared = abx * abx + aby * aby;

    if (lengthSquared === 0) {
      return { distance: PitchService.getDistance(p, a), rawT: 0 };
    }

    const rawT = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared;
    const t = this.clamp(rawT, 0, 1);

    return {
      distance: PitchService.getDistance(p, {
        x: a.x + abx * t,
        y: a.y + aby * t,
      }),
      rawT,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}