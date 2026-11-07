import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type { Vector2D } from "../types/pitch.types.js";
import type {
  PassOptions,
  PassResult,
} from "../types/passing.types.js";

import { PitchService } from "./pitch.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";

import { PASSING_CONSTANTS } from "../constants/passing.constants.js";
import { BALL_CONSTANTS } from "../constants/ball.constants.js";

export class PassingService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
    private readonly random: () => number = Math.random,
  ) {}

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
    );

    const distance = PitchService.getDistance(
      passerState.position,
      targetPosition,
    );

    if (distance < 0.1) {
      return this.failedResult(options, "Pass target is too close.");
    }

    const accuracy = this.calculateAccuracy(passer);

    const actualTargetPosition = this.applyPassingError(
      targetPosition,
      accuracy,
      distance
    );

    const direction = Math.atan2(
      actualTargetPosition.y - ball.position.y,
      actualTargetPosition.x - ball.position.x,
    );

    const speed = this.getPassSpeed(options.type, distance);

    const verticalSpeed = this.getVerticalSpeed(options.type);

    const released = this.ballInteractionService.releaseBall(
      passer.id,
      ball,
      {
        horizontalSpeed: speed,
        verticalSpeed,
        direction,
      },
    );

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
  ): Vector2D {
    if (!receiverState || options.type !== "THROUGH") {
      return options.targetPosition;
    }

    const distance = PitchService.getDistance(
      receiverState.position,
      options.targetPosition,
    );

    const leadRatio = distance > PASSING_CONSTANTS.MAX_LEAD_DISTANCE
      ? PASSING_CONSTANTS.MAX_LEAD_DISTANCE / distance
      : 1;

    return {
      x:
        receiverState.position.x +
        receiverState.velocity.x * 0.5 +
        (options.targetPosition.x - receiverState.position.x) * leadRatio,

      y:
        receiverState.position.y +
        receiverState.velocity.y * 0.5 +
        (options.targetPosition.y - receiverState.position.y) * leadRatio,
    };
  }

  private calculateAccuracy(player: Player): number {
    const attributeBonus =
      player.attributes.passing *
      PASSING_CONSTANTS.ATTRIBUTE_ACCURACY_WEIGHT;

    return Math.min(
      0.98,
      PASSING_CONSTANTS.BASE_ACCURACY + attributeBonus,
    );
  }

  private applyPassingError(
  target: Vector2D,
  accuracy: number,
  distance: number,
): Vector2D {
  const distanceFactor = Math.max(1, distance / 20);

  const errorStrength =
    (1 - accuracy) *
    PASSING_CONSTANTS.MAX_ERROR_DISTANCE *
    distanceFactor;

  const angle = this.random() * Math.PI * 2;
  const magnitude = this.random() * errorStrength;

  return PitchService.clampPosition({
    x: target.x + Math.cos(angle) * magnitude,
    y: target.y + Math.sin(angle) * magnitude,
  });
}

  // Passes are launched with just enough speed to reach the receiver, rather
  // than at a fixed speed that overshoots short passes.
  private getPassSpeed(type: PassOptions["type"], distance: number): number {
    switch (type) {
      case "SHORT":
        return this.getGroundPassSpeed(
          distance,
          PASSING_CONSTANTS.SHORT_PASS_ARRIVAL_SPEED,
          PASSING_CONSTANTS.SHORT_PASS_MIN_SPEED,
          PASSING_CONSTANTS.SHORT_PASS_MAX_SPEED,
        );

      case "THROUGH":
        return this.getGroundPassSpeed(
          distance,
          PASSING_CONSTANTS.THROUGH_BALL_ARRIVAL_SPEED,
          PASSING_CONSTANTS.THROUGH_BALL_MIN_SPEED,
          PASSING_CONSTANTS.THROUGH_BALL_MAX_SPEED,
        );

      case "LONG": {
        // Horizontal speed so the ball lands near the target after its flight.
        const flightTime =
          (2 * PASSING_CONSTANTS.LONG_PASS_VERTICAL_SPEED) /
          BALL_CONSTANTS.GRAVITY;

        return Math.max(
          PASSING_CONSTANTS.LONG_PASS_MIN_SPEED,
          Math.min(
            PASSING_CONSTANTS.LONG_PASS_MAX_SPEED,
            distance / flightTime,
          ),
        );
      }
    }
  }

  // v0 = sqrt(arrival² + 2 × friction × distance)
  private getGroundPassSpeed(
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

  private getVerticalSpeed(type: PassOptions["type"]): number {
    switch (type) {
      case "SHORT":
        return PASSING_CONSTANTS.SHORT_PASS_VERTICAL_SPEED;

      case "THROUGH":
        return PASSING_CONSTANTS.THROUGH_BALL_VERTICAL_SPEED;

      case "LONG":
        return PASSING_CONSTANTS.LONG_PASS_VERTICAL_SPEED;
    }
  }

  private failedResult(
    options: PassOptions,
    message: string,
  ): PassResult {
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