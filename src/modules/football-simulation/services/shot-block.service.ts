import type { BallState } from "../types/match.types.js";
import type {
  BlockOpportunity,
  DecisionPlayer,
} from "../types/decision.types.js";
import type { Player } from "../types/player.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { INTERCEPTION_CONSTANTS } from "../constants/interception.constants.js";
import { BallTrajectoryService } from "./ball-trajectory.service.js";
import { PitchService } from "./pitch.service.js";

export interface ShotReference {
  shooterId: string;
  teamId: string;
  tick: number;
}

export interface Deflection {
  direction: number;
  speed: number;
  verticalSpeed: number;
}

export class ShotBlockService {
  // How close the ball's path must pass to a defender for a block attempt.
  static readonly BLOCK_RADIUS = 1.0;

  // Balls above this height go over a defender.
  static readonly MAX_BLOCK_HEIGHT = 1.8;

  // Slower balls are passes or rebounds, not shots.
  static readonly MIN_SHOT_SPEED = 8;

  // At most this many defenders commit to blocking one shot.
  static readonly MAX_BLOCKERS = 2;

  // Seconds a defender needs to see the shot and set off.
  static readonly REACTION_TIME = 0.25;

  // How far ahead (seconds) the ball's path is checked, and the step used.
  static readonly LOOKAHEAD = 1.5;
  static readonly STEP = 0.05;

  // One block roll per defender per shot. Rolling every tick while the ball
  // passes would give a defender several attempts at the same shot.
  private readonly rolls = new Map<
    string,
    { key: string; players: Set<string> }
  >();

  constructor(
    private readonly trajectory: BallTrajectoryService,
    private readonly random: () => number = Math.random,
  ) {}

  // Called once per tick while a shot is in flight. Returns the (at most two)
  // defenders who can reach the shot's path in time, keyed by player id.
  assess(
    ball: BallState,
    shot: ShotReference,
    defenders: DecisionPlayer[],
    ownGoalX: number,
  ): Map<string, BlockOpportunity> {
    const result = new Map<string, BlockOpportunity>();

    if (ball.possessionPlayerId !== null) return result;

    const shotSpeed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (shotSpeed < ShotBlockService.MIN_SHOT_SPEED) return result;

    // The shot must be travelling towards the defending team's goal.
    const direction = Math.sign(ownGoalX - ball.position.x);
    if (direction === 0 || ball.velocity.x * direction <= 0) return result;

    // The part of the ball's path that is in front of the goal line.
    const path = this.trajectory.predict(
      ball,
      ShotBlockService.LOOKAHEAD,
      ShotBlockService.STEP,
    ).samples;

    const inFront: typeof path = [];
    for (const sample of path) {
      if ((sample.position.x - ownGoalX) * direction >= 0) break;
      inFront.push(sample);
    }

    const found: Array<{ id: string; opportunity: BlockOpportunity }> = [];

    for (const defender of defenders) {
      const opportunity = this.findOpportunity(
        defender,
        inFront,
        shotSpeed,
        shot.shooterId,
      );

      if (opportunity) {
        found.push({ id: defender.player.id, opportunity });
      }
    }

    // The defenders who meet the ball earliest (closest to the shooter) go.
    found.sort((a, b) => a.opportunity.time - b.opportunity.time);

    for (const { id, opportunity } of found.slice(
      0,
      ShotBlockService.MAX_BLOCKERS,
    )) {
      result.set(id, opportunity);
    }

    return result;
  }

  // Called once per tick, after the ball has moved. Any defender whose body
  // the ball passed through this tick gets one roll at blocking it.
  // Returns the defender who blocked it, if any.
  resolve(
    matchId: string,
    ball: BallState,
    previousPosition: Vector2D,
    previousHeight: number,
    shot: ShotReference,
    defenders: DecisionPlayer[],
    committedIds: ReadonlySet<string>,
  ): DecisionPlayer | null {
    if (ball.possessionPlayerId !== null) return null;

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed < ShotBlockService.MIN_SHOT_SPEED) return null;

    const height = (previousHeight + ball.height) / 2;
    if (height > ShotBlockService.MAX_BLOCK_HEIGHT) return null;

    const key = `${shot.shooterId}:${shot.tick}`;
    const existing = this.rolls.get(matchId);
    const record =
      existing && existing.key === key
        ? existing
        : { key, players: new Set<string>() };
    this.rolls.set(matchId, record);

    // A ball at shot speed moves more than a metre per tick, so the whole
    // segment it covered this tick is tested, not just where it ended up.
    const touching = defenders
      .map((defender) => ({
        defender,
        gap: this.distanceToSegment(
          defender.state.position,
          previousPosition,
          ball.position,
        ),
      }))
      .filter(
        ({ defender, gap }) =>
          gap <= ShotBlockService.BLOCK_RADIUS &&
          !record.players.has(defender.player.id),
      )
      .sort((a, b) => a.gap - b.gap);

    for (const { defender } of touching) {
      record.players.add(defender.player.id);

      const chance = this.chance(
        defender.player,
        speed,
        committedIds.has(defender.player.id),
      );

      if (this.random() <= chance) return defender;
    }

    return null;
  }

  // Where a blocked shot goes: back and to the side, much slower, and low.
  computeDeflection(ball: BallState): Deflection {
    const incoming = Math.atan2(ball.velocity.y, ball.velocity.x);
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);

    return {
      // Roughly back towards the shooter, spread up to about 63 degrees.
      direction: incoming + Math.PI + (this.random() - 0.5) * 2.2,
      speed: speed * (0.2 + this.random() * 0.3),
      verticalSpeed: 1 + this.random() * 3,
    };
  }

  // Chance that a defender blocks a shot he is in the path of. A defender who
  // has set himself for the block (committed) is better placed.
  chance(player: Player, shotSpeed: number, committed: boolean): number {
    const a = player.attributes;
    const norm = (value: number): number => (value - 1) / 19;

    const raw =
      0.15 +
      0.2 * norm(a.anticipation) +
      0.15 * norm(a.positioning) +
      0.1 * norm(a.agility) +
      (committed ? 0.15 : 0) -
      0.012 * Math.max(0, shotSpeed - 12);

    return Math.max(0.05, Math.min(0.75, raw));
  }

  private findOpportunity(
    defender: DecisionPlayer,
    path: Array<{ time: number; position: Vector2D; height: number }>,
    shotSpeed: number,
    shooterId: string,
  ): BlockOpportunity | null {
    const { player, state } = defender;

    const topSpeed =
      INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED +
      ((player.attributes.pace - 1) / 19) *
        (INTERCEPTION_CONSTANTS.MAX_PLAYER_SPEED -
          INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED);

    const staminaMultiplier = Math.max(0.75, Math.min(1, state.stamina / 100));

    // 0.9 allows for acceleration from where he is standing.
    const speed = topSpeed * staminaMultiplier * 0.9;

    for (const sample of path) {
      if (sample.height > ShotBlockService.MAX_BLOCK_HEIGHT) continue;

      const gap = PitchService.getDistance(state.position, sample.position);

      const timeNeeded =
        ShotBlockService.REACTION_TIME +
        Math.max(0, gap - ShotBlockService.BLOCK_RADIUS) / speed;

      if (timeNeeded <= sample.time) {
        return {
          point: { ...sample.position },
          time: sample.time,
          margin: sample.time - timeNeeded,
          chance: this.chance(player, shotSpeed, true),
          shooterId,
        };
      }
    }

    return null;
  }

  private distanceToSegment(
    point: Vector2D,
    start: Vector2D,
    end: Vector2D,
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
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      ),
    );

    return PitchService.getDistance(point, {
      x: start.x + projection * dx,
      y: start.y + projection * dy,
    });
  }
}