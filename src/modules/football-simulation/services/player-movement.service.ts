import { MOVEMENT_CONSTANTS } from "../constants/movement.constants.js";

import type { Player } from "../types/player.types.js";

import type {
  PlayerMatchState,
} from "../types/player-state.types.js";

import type { Vector2D } from "../types/pitch.types.js";

export class PlayerMovementService {
  private static clamp(
    value: number,
    min: number,
    max: number,
  ): number {
    return Math.max(min, Math.min(max, value));
  }

  private static magnitude(vector: Vector2D): number {
    return Math.sqrt(
      vector.x * vector.x +
      vector.y * vector.y,
    );
  }

  private static normalize(vector: Vector2D): Vector2D {
    const magnitude = this.magnitude(vector);

    if (magnitude === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: vector.x / magnitude,
      y: vector.y / magnitude,
    };
  }

  private static getMaximumSpeed(player: Player): number {
    const { MIN_SPEED, MAX_SPEED } = MOVEMENT_CONSTANTS;

    return MIN_SPEED +
      ((player.attributes.pace - 1) / 19) *
      (MAX_SPEED - MIN_SPEED);
  }

  private static getAcceleration(player: Player): number {
    const { MIN_ACCELERATION, MAX_ACCELERATION } =
      MOVEMENT_CONSTANTS;

    return MIN_ACCELERATION +
      ((player.attributes.acceleration - 1) / 19) *
      (MAX_ACCELERATION - MIN_ACCELERATION);
  }

  private static getStaminaMultiplier(
    stamina: number,
  ): number {
    const {
      MIN_STAMINA_MULTIPLIER,
    } = MOVEMENT_CONSTANTS;

    return MIN_STAMINA_MULTIPLIER +
      (stamina / 100) *
      (1 - MIN_STAMINA_MULTIPLIER);
  }

  static updateMovement(
    player: Player,
    state: PlayerMatchState,
    deltaTime: number,
  ): PlayerMatchState {
    if (deltaTime <= 0) {
      return state;
    }

    const dt = Math.min(
      deltaTime,
      MOVEMENT_CONSTANTS.MAX_DELTA_TIME,
    );

    const target = state.targetPosition;

    const currentVelocity = state.velocity;

    let desiredVelocity: Vector2D = {
      x: 0,
      y: 0,
    };

    if (target) {
      const direction = {
        x: target.x - state.position.x,
        y: target.y - state.position.y,
      };

      const distance = this.magnitude(direction);

      if (distance > MOVEMENT_CONSTANTS.STOPPING_DISTANCE) {
        const normalizedDirection = this.normalize(direction);

        const maximumSpeed =
          this.getMaximumSpeed(player) *
          this.getStaminaMultiplier(state.stamina);

        const desiredSpeed = Math.min(
          maximumSpeed,
          Math.sqrt(
            2 *
            MOVEMENT_CONSTANTS.MAX_DECELERATION *
            distance,
          ),
        );

        desiredVelocity = {
          x: normalizedDirection.x * desiredSpeed,
          y: normalizedDirection.y * desiredSpeed,
        };
      }
    }

    const velocityDifference = {
      x: desiredVelocity.x - currentVelocity.x,
      y: desiredVelocity.y - currentVelocity.y,
    };

    const differenceMagnitude =
      this.magnitude(velocityDifference);

    const acceleration =
      this.getAcceleration(player);

    const maximumVelocityChange = acceleration * dt;

    let newVelocity: Vector2D;

    if (differenceMagnitude <= maximumVelocityChange) {
      newVelocity = desiredVelocity;
    } else {
      const normalizedDifference =
        this.normalize(velocityDifference);

      newVelocity = {
        x:
          currentVelocity.x +
          normalizedDifference.x * maximumVelocityChange,

        y:
          currentVelocity.y +
          normalizedDifference.y * maximumVelocityChange,
      };
    }

    const currentSpeed = this.magnitude(newVelocity);

    const newPosition = {
      x: state.position.x + newVelocity.x * dt,
      y: state.position.y + newVelocity.y * dt,
    };

    const isMoving = currentSpeed > 0.05;

    const direction = isMoving
      ? Math.atan2(newVelocity.y, newVelocity.x)
      : state.direction;

    return {
      ...state,

      position: newPosition,

      velocity: newVelocity,

      currentSpeed,

      direction,

      isMoving,

      currentAction: isMoving ? "MOVING" : "IDLE",
    };
  }
}