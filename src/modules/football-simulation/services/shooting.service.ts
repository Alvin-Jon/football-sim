import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import type {
  ShotOptions,
  ShotResult,
} from "../types/shooting.types.js";

import { PitchService } from "./pitch.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";

import { SHOOTING_CONSTANTS } from "../constants/shooting.constants.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

export class ShootingService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
    private readonly random: () => number = Math.random,
  ) {}

  executeShot(
    player: Player,
    playerState: PlayerMatchState,
    ball: BallState,
    options: ShotOptions,
    opponents: PlayerMatchState[] = [],
  ): ShotResult {
    if (ball.possessionPlayerId !== player.id) {
      return this.failedResult(options, "Player does not possess the ball.");
    }

    const distance = PitchService.getDistance(
      playerState.position,
      options.goalPosition,
    );

    if (!this.isValidTarget(options.targetPosition, options.goalPosition)) {
      return this.failedResult(
        options,
        "Shot target is outside the goal mouth.",
      );
    }

    const pressure = this.calculatePressure(
      playerState,
      opponents,
    );

    const accuracy = this.calculateAccuracy(
      player,
      distance,
      pressure,
    );

    const actualTargetPosition = this.applyShotError(
      options.targetPosition,
      accuracy,
    );

    const direction = Math.atan2(
      actualTargetPosition.y - ball.position.y,
      actualTargetPosition.x - ball.position.x,
    );

    const power = this.calculatePower(
      player,
      options.type,
    );

    const verticalSpeed = this.getVerticalSpeed(
      options.type,
    );

    const released = this.ballInteractionService.releaseBall(
      player.id,
      ball,
      {
        horizontalSpeed: power,
        verticalSpeed,
        direction,
      },
    );

    if (!released) {
      return this.failedResult(
        options,
        "Ball release failed.",
      );
    }

    return {
      successful: true,
      type: options.type,
      targetPosition: options.targetPosition,
      actualTargetPosition,
      direction,
      power,
      verticalSpeed,
      accuracy,
      distance,
    };
  }

  private calculateAccuracy(
    player: Player,
    distance: number,
    pressure: number,
  ): number {
    const attributes = player.attributes;

    const attributeBonus =
      attributes.shooting *
        SHOOTING_CONSTANTS.SHOOTING_ACCURACY_WEIGHT +
      attributes.composure *
        SHOOTING_CONSTANTS.COMPOSURE_ACCURACY_WEIGHT;

    const distancePenalty =
      distance * SHOOTING_CONSTANTS.DISTANCE_PENALTY;

    const pressurePenalty =
      pressure * SHOOTING_CONSTANTS.PRESSURE_PENALTY;

    const accuracy =
      SHOOTING_CONSTANTS.BASE_ACCURACY +
      attributeBonus -
      distancePenalty -
      pressurePenalty;

    return Math.max(
      SHOOTING_CONSTANTS.MIN_ACCURACY,
      Math.min(
        SHOOTING_CONSTANTS.MAX_ACCURACY,
        accuracy,
      ),
    );
  }

  private calculatePower(
    player: Player,
    type: ShotOptions["type"],
  ): number {
    const attributes = player.attributes;

    const normalizedStrength =
      (attributes.strength - 1) / 19;

    const normalizedShooting =
      (attributes.shooting - 1) / 19;

    const basePower =
      SHOOTING_CONSTANTS.MIN_SHOT_POWER +
      normalizedStrength *
        (
          SHOOTING_CONSTANTS.MAX_SHOT_POWER -
          SHOOTING_CONSTANTS.MIN_SHOT_POWER
        );

    // Shooting ability contributes to execution power.
    const shootingBonus = normalizedShooting * 2;

    const multiplier = this.getPowerMultiplier(type);

    return (basePower + shootingBonus) * multiplier;
  }

  private getPowerMultiplier(
    type: ShotOptions["type"],
  ): number {
    switch (type) {
      case "PLACED":
        return SHOOTING_CONSTANTS.PLACED_POWER_MULTIPLIER;

      case "POWER":
        return SHOOTING_CONSTANTS.POWER_SHOT_MULTIPLIER;

      case "CHIP":
        return SHOOTING_CONSTANTS.CHIP_POWER_MULTIPLIER;
    }
  }

  private getVerticalSpeed(
    type: ShotOptions["type"],
  ): number {
    switch (type) {
      case "PLACED":
        return SHOOTING_CONSTANTS.PLACED_VERTICAL_SPEED;

      case "POWER":
        return SHOOTING_CONSTANTS.POWER_VERTICAL_SPEED;

      case "CHIP":
        return SHOOTING_CONSTANTS.CHIP_VERTICAL_SPEED;
    }
  }

  private calculatePressure(
    playerState: PlayerMatchState,
    opponents: PlayerMatchState[],
  ): number {
    if (opponents.length === 0) return 0;

    const nearestOpponent = Math.min(
      ...opponents.map((opponent) =>
        PitchService.getDistance(
          playerState.position,
          opponent.position,
        ),
      ),
    );

    if (nearestOpponent < 1.5) return 2;
    if (nearestOpponent < 3) return 1;
    if (nearestOpponent < 5) return 0.5;

    return 0;
  }

  private applyShotError(
    target: Vector2D,
    accuracy: number,
  ): Vector2D {
    const errorDistance =
      (1 - accuracy) *
      SHOOTING_CONSTANTS.MAX_ERROR_DISTANCE;

    const angle = this.random() * Math.PI * 2;
    const magnitude = this.random() * errorDistance;

    return {
      x: target.x + Math.cos(angle) * magnitude,
      y: target.y + Math.sin(angle) * magnitude,
    };
  }

  private isValidTarget(
    target: Vector2D,
    goal: Vector2D,
  ): boolean {
    const halfGoalWidth = PITCH_DIMENSIONS.goalWidth / 2;

    const minY = goal.y - halfGoalWidth;
    const maxY = goal.y + halfGoalWidth;

    return (
      Math.abs(target.x - goal.x) <=
        SHOOTING_CONSTANTS.GOAL_MOUTH_TOLERANCE &&
      target.y >= minY &&
      target.y <= maxY
    );
  }

  private failedResult(
    options: ShotOptions,
    message: string,
  ): ShotResult {
    return {
      successful: false,
      type: options.type,
      targetPosition: options.targetPosition,
      actualTargetPosition: options.targetPosition,
      direction: 0,
      power: 0,
      verticalSpeed: 0,
      accuracy: 0,
      distance: 0,
      message,
    };
  }
}