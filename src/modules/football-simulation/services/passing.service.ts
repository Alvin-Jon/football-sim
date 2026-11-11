import type { Player, PlayerAttributes } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type { Vector2D } from "../types/pitch.types.js";
import type {
  PassOptions,
  PassResult,
  PassType,
} from "../types/passing.types.js";

import { PitchService } from "./pitch.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";

import { PASSING_CONSTANTS } from "../constants/passing.constants.js";
import { BALL_CONSTANTS } from "../constants/ball.constants.js";

export interface PassFlight {
  /** Launch speed (horizontal). */
  speed: number;
  /** Seconds until the ball reaches the target. */
  totalTime: number;
  /** Seconds until the ball is `along` metres down the pass. */
  timeAt(along: number): number;
  /** Ball horizontal speed `along` metres down the pass. */
  speedAt(along: number): number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export class PassingService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
    private readonly random: () => number = Math.random,
  ) {}

  // ---------------------------------------------------------------------
  // Static helpers (shared with PassingEvaluationService so the AI judges
  // a pass with the same maths the pass is executed with)
  // ---------------------------------------------------------------------

  /** Effective passing rating differs by pass type. */
  static getAccuracy(attributes: PlayerAttributes, type: PassType): number {
    const rating =
      type === "SHORT"
        ? attributes.passing
        : type === "THROUGH"
          ? attributes.passing * 0.6 + attributes.vision * 0.4
          : attributes.passing * 0.75 + attributes.vision * 0.25;

    return Math.min(
      0.98,
      PASSING_CONSTANTS.BASE_ACCURACY +
        rating * PASSING_CONSTANTS.ATTRIBUTE_ACCURACY_WEIGHT,
    );
  }

  /** Maximum aiming error radius in metres. */
  static getErrorRadius(
    accuracy: number,
    distance: number,
    pressure = 0,
    composure = 10,
  ): number {
    const distanceFactor = Math.max(1, distance / 20);
    // Pressure hurts everyone; composed players cope better.
    const pressureFactor =
      1 + clamp(pressure, 0, 1) * (1.4 - (0.8 * composure) / 20);

    return (
      (1 - accuracy) *
      PASSING_CONSTANTS.MAX_ERROR_DISTANCE *
      distanceFactor *
      pressureFactor
    );
  }

  static getFlight(type: PassType, distance: number): PassFlight {
    const d = Math.max(0.1, distance);

    if (type === "LONG") {
      const flight = PassingService.getLongPassFlightTime(d);
      const horizontal = d / flight;

      return {
        speed: PassingService.getPassSpeed(type, d),
        totalTime: flight,
        timeAt: (along) => flight * clamp(along / d, 0, 1),
        speedAt: () => horizontal,
      };
    }

    const speed = PassingService.getPassSpeed(type, d);
    const friction = BALL_CONSTANTS.GROUND_FRICTION;

    const speedAt = (along: number): number =>
      friction > 0
        ? Math.sqrt(Math.max(0, speed * speed - 2 * friction * Math.min(along, d)))
        : speed;

    const timeAt = (along: number): number => {
      const s = Math.min(Math.max(0, along), d);
      if (friction <= 0) return s / speed;
      return (speed - speedAt(s)) / friction;
    };

    return { speed, totalTime: timeAt(d), timeAt, speedAt };
  }

  // ---------------------------------------------------------------------

  executePass(
    passer: Player,
    passerState: PlayerMatchState,
    teamId: string,
    ball: BallState,
    options: PassOptions,
    receiverState?: PlayerMatchState,
  ): PassResult {
    if (
      ball.possessionPlayerId !== passer.id ||
      ball.possessionTeamId !== teamId
    ) {
      return this.failedResult(options, "Player does not possess the ball.");
    }

    if (
      options.targetPlayerId &&
      receiverState?.playerId !== options.targetPlayerId
    ) {
      return this.failedResult(options, "Invalid receiver.");
    }

    const targetPosition = this.getTargetPosition(
      options,
      receiverState,
      passerState,
    );

    const distance = PitchService.getDistance(
      passerState.position,
      targetPosition,
    );

    if (distance < 0.1) {
      return this.failedResult(options, "Pass target is too close.");
    }

    const accuracy = PassingService.getAccuracy(passer.attributes, options.type);

    const actualTargetPosition = this.applyPassingError(
      targetPosition,
      passerState.position,
      accuracy,
      distance,
      options.type,
      options.pressure ?? 0,
      passer.attributes.composure,
    );

    const direction = Math.atan2(
      actualTargetPosition.y - ball.position.y,
      actualTargetPosition.x - ball.position.x,
    );

    const speed = PassingService.getPassSpeed(options.type, distance);
    const verticalSpeed = PassingService.getVerticalSpeed(options.type, distance);

    const released = this.ballInteractionService.releaseBall(passer.id, ball, {
      horizontalSpeed: speed,
      verticalSpeed,
      direction,
    });

    if (!released) {
      return this.failedResult(options, "Ball release failed.");
    }

    return {
      successful: true,
      type: options.type,
      targetPosition,
      actualTargetPosition,
      direction,
      speed,
      verticalSpeed,
      accuracy,
    };
  }

  private getTargetPosition(
    options: PassOptions,
    receiverState?: PlayerMatchState,
    passerState?: PlayerMatchState,
  ): Vector2D {
    if (!receiverState || !passerState) {
      return options.targetPosition;
    }

    const distance = PitchService.getDistance(
      passerState.position,
      receiverState.position,
    );

    if (options.type === "LONG") {
      const flightTime = PassingService.getLongPassFlightTime(distance);
      const lead = {
        x: receiverState.velocity.x * flightTime,
        y: receiverState.velocity.y * flightTime,
      };
      const leadDistance = Math.hypot(lead.x, lead.y);
      const leadRatio =
        leadDistance > PASSING_CONSTANTS.MAX_LEAD_DISTANCE
          ? PASSING_CONSTANTS.MAX_LEAD_DISTANCE / leadDistance
          : 1;

      return PitchService.clampPosition({
        x: receiverState.position.x + lead.x * leadRatio,
        y: receiverState.position.y + lead.y * leadRatio,
      });
    }

    // SHORT and THROUGH: aim at where the receiver is NOW (the decision that
    // led here can be several ticks old), led by his velocity over the
    // ball's flight so a moving receiver is not passed behind.
    const flightTime = PassingService.getFlight(
      options.type,
      distance,
    ).totalTime;
    const leadTime = Math.min(
      flightTime,
      options.type === "THROUGH" ? 1.2 : 0.6,
    );
    const maxLead =
      options.type === "THROUGH" ? PASSING_CONSTANTS.MAX_LEAD_DISTANCE : 3;

    const lead = {
      x: receiverState.velocity.x * leadTime,
      y: receiverState.velocity.y * leadTime,
    };
    const leadDistance = Math.hypot(lead.x, lead.y);
    const leadRatio = leadDistance > maxLead ? maxLead / leadDistance : 1;

    return PitchService.clampPosition({
      x: receiverState.position.x + lead.x * leadRatio,
      y: receiverState.position.y + lead.y * leadRatio,
    });
  }

  /**
   * Error is an ellipse in the pass's own frame: weight (along the pass) is
   * harder to judge than direction on lofted and through balls, and a
   * pressured passer is less precise.
   */
  private applyPassingError(
    target: Vector2D,
    from: Vector2D,
    accuracy: number,
    distance: number,
    type: PassType,
    pressure: number,
    composure: number,
  ): Vector2D {
    const radius = PassingService.getErrorRadius(
      accuracy,
      distance,
      pressure,
      composure,
    );

    const heading = Math.atan2(target.y - from.y, target.x - from.x);
    const angle = this.random() * Math.PI * 2;
    const magnitude = this.random() * radius;

    const alongScale = type === "SHORT" ? 1 : 1.3;
    const lateralScale = type === "SHORT" ? 1 : 0.8;

    const along = Math.cos(angle) * magnitude * alongScale;
    const lateral = Math.sin(angle) * magnitude * lateralScale;

    return PitchService.clampPosition({
      x: target.x + Math.cos(heading) * along - Math.sin(heading) * lateral,
      y: target.y + Math.sin(heading) * along + Math.cos(heading) * lateral,
    });
  }

  // Passes are launched with just enough speed to reach the receiver, rather
  // than at a fixed speed that overshoots short passes.
  private static getPassSpeed(type: PassType, distance: number): number {
    switch (type) {
      case "SHORT":
        return PassingService.getGroundPassSpeed(
          distance,
          PASSING_CONSTANTS.SHORT_PASS_ARRIVAL_SPEED,
          PASSING_CONSTANTS.SHORT_PASS_MIN_SPEED,
          PASSING_CONSTANTS.SHORT_PASS_MAX_SPEED,
        );

      case "THROUGH":
        return PassingService.getGroundPassSpeed(
          distance,
          PASSING_CONSTANTS.THROUGH_BALL_ARRIVAL_SPEED,
          PASSING_CONSTANTS.THROUGH_BALL_MIN_SPEED,
          PASSING_CONSTANTS.THROUGH_BALL_MAX_SPEED,
        );

      case "LONG": {
        const flightTime = PassingService.getLongPassFlightTime(distance);

        return Math.max(
          PASSING_CONSTANTS.LONG_PASS_MIN_SPEED,
          Math.min(PASSING_CONSTANTS.LONG_PASS_MAX_SPEED, distance / flightTime),
        );
      }
    }
  }

  // v0 = sqrt(arrival² + 2 × friction × distance)
  private static getGroundPassSpeed(
    distance: number,
    arrivalSpeed: number,
    minSpeed: number,
    maxSpeed: number,
  ): number {
    const speed = Math.sqrt(
      arrivalSpeed * arrivalSpeed +
        2 * BALL_CONSTANTS.GROUND_FRICTION * distance,
    );

    return Math.max(minSpeed, Math.min(maxSpeed, speed));
  }

  private static getLongPassFlightTime(distance: number): number {
    const minimumFlightTime =
      (2 * PASSING_CONSTANTS.LONG_PASS_VERTICAL_SPEED) / BALL_CONSTANTS.GRAVITY;

    return Math.max(
      minimumFlightTime,
      distance / PASSING_CONSTANTS.LONG_PASS_MAX_SPEED,
    );
  }

  private static getVerticalSpeed(type: PassType, distance: number): number {
    switch (type) {
      case "SHORT":
        return PASSING_CONSTANTS.SHORT_PASS_VERTICAL_SPEED;

      case "THROUGH":
        return PASSING_CONSTANTS.THROUGH_BALL_VERTICAL_SPEED;

      case "LONG":
        return (
          (BALL_CONSTANTS.GRAVITY *
            PassingService.getLongPassFlightTime(distance)) /
          2
        );
    }
  }

  private failedResult(options: PassOptions, message: string): PassResult {
    return {
      successful: false,
      type: options.type,
      targetPosition: options.targetPosition,
      actualTargetPosition: options.targetPosition,
      direction: 0,
      speed: 0,
      verticalSpeed: 0,
      accuracy: 0,
      message,
    };
  }
}