import { MOVEMENT_CONSTANTS } from "../constants/movement.constants.js";

import type { Player } from "../types/player.types.js";

import type {
  PlayerMatchState,
} from "../types/player-state.types.js";

import type { Vector2D } from "../types/pitch.types.js";

export class PlayerMovementService {
  // Turning: how fast a moving player can change heading (radians/second).
  // The rate shrinks as speed rises, so sprinters swing wide and slow players
  // pivot sharply. Agility raises the rate.
  private static readonly BASE_TURN_RATE = 3;
  private static readonly AGILITY_TURN_RATE = 4;
  private static readonly TURN_SPEED_PENALTY = 0.6;
  // Below this speed the player may turn freely.
  private static readonly TURN_MIN_SPEED = 1;
  // How much desired speed is shed on a full 180 degree turn.
  private static readonly TURN_SPEED_LOSS = 1;

  // Ball carriers run slightly slower than the same player without the ball.
  private static readonly CARRY_SPEED_BASE = 0.9;
  private static readonly CARRY_SPEED_DRIBBLING = 0.08;

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

  // Speed multiplier while carrying the ball. state.currentAction is still
  // "DRIBBLING" from the previous tick's action step when this runs.
  private static getCarryMultiplier(
    player: Player,
    state: PlayerMatchState,
  ): number {
    if (state.currentAction !== "DRIBBLING") return 1;

    return (
      this.CARRY_SPEED_BASE +
      this.CARRY_SPEED_DRIBBLING * (player.attributes.dribbling / 20)
    );
  }

  // Rotates the desired velocity toward the current heading so a moving
  // player curves into a new direction instead of snapping to it, and sheds
  // a little speed on sharp turns.
  private static limitTurn(
    player: Player,
    state: PlayerMatchState,
    desired: Vector2D,
    dt: number,
  ): Vector2D {
    const desiredSpeed = this.magnitude(desired);
    const currentSpeed = this.magnitude(state.velocity);

    if (desiredSpeed < 0.01 || currentSpeed < this.TURN_MIN_SPEED) {
      return desired;
    }

    const currentHeading = Math.atan2(state.velocity.y, state.velocity.x);
    const desiredHeading = Math.atan2(desired.y, desired.x);

    // Signed difference wrapped to [-PI, PI].
    const raw = desiredHeading - currentHeading;
    const difference = Math.atan2(Math.sin(raw), Math.cos(raw));

    const agility = player.attributes.agility / 20;
    const speedRatio = this.clamp(
      currentSpeed / this.getMaximumSpeed(player),
      0,
      1,
    );

    const turnRate =
      (this.BASE_TURN_RATE + this.AGILITY_TURN_RATE * agility) *
      (1 - this.TURN_SPEED_PENALTY * speedRatio);

    const maximumTurn = turnRate * dt;
    const heading =
      currentHeading + this.clamp(difference, -maximumTurn, maximumTurn);

    const speed =
      desiredSpeed *
      (1 - this.TURN_SPEED_LOSS * (Math.abs(difference) / Math.PI));

    return {
      x: Math.cos(heading) * speed,
      y: Math.sin(heading) * speed,
    };
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
          this.getStaminaMultiplier(state.stamina) *
          this.getCarryMultiplier(player, state);

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

    desiredVelocity = this.limitTurn(
      player,
      state,
      desiredVelocity,
      dt,
    );

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