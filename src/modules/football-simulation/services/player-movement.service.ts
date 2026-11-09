import { MOVEMENT_CONSTANTS } from "../constants/movement.constants.js";

import type { Player } from "../types/player.types.js";

import type {
  PlayerAction,
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

  private static getMaximumSpeed(
    player: Player,
    action: PlayerAction,
  ): number {
    const { MIN_SPEED, MAX_SPEED } = MOVEMENT_CONSTANTS;
    const playerMaximumSpeed = MIN_SPEED +
      ((player.attributes.pace - 1) / 19) *
      (MAX_SPEED - MIN_SPEED);

    let actionSpeedLimit: number;
    switch (action) {
      case "SPRINTING":
      case "INTERCEPTING":
      case "JUMPING":
        actionSpeedLimit = MAX_SPEED;
        break;
      case "RUNNING":
        actionSpeedLimit = MOVEMENT_CONSTANTS.RUN_SPEED;
        break;
      case "PRESSING":
        actionSpeedLimit = MOVEMENT_CONSTANTS.PRESS_SPEED;
        break;
      case "DRIBBLING":
        actionSpeedLimit = MOVEMENT_CONSTANTS.DRIBBLE_SPEED;
        break;
      case "MARKING":
        actionSpeedLimit = MOVEMENT_CONSTANTS.WALK_SPEED;
        break;
      case "MOVING":
        actionSpeedLimit = MOVEMENT_CONSTANTS.JOG_SPEED;
        break;
      default:
        actionSpeedLimit = MOVEMENT_CONSTANTS.WALK_SPEED;
        break;
    }

    return Math.min(playerMaximumSpeed, actionSpeedLimit);
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

  private static getAvoidanceDirection(
    playerId: string,
    position: Vector2D,
    direction: Vector2D,
    nearbyPlayers: readonly PlayerMatchState[],
  ): Vector2D {
    const perpendicular = { x: -direction.y, y: direction.x };
    let avoidance = { x: 0, y: 0 };

    for (const nearbyPlayer of nearbyPlayers) {
      if (nearbyPlayer.playerId === playerId) continue;

      const offset = {
        x: nearbyPlayer.position.x - position.x,
        y: nearbyPlayer.position.y - position.y,
      };
      const forwardDistance =
        offset.x * direction.x + offset.y * direction.y;
      if (
        forwardDistance <= 0 ||
        forwardDistance >= MOVEMENT_CONSTANTS.AVOIDANCE_LOOKAHEAD
      ) {
        continue;
      }

      const lateralDistance = Math.abs(
        offset.x * perpendicular.x + offset.y * perpendicular.y,
      );
      if (lateralDistance >= MOVEMENT_CONSTANTS.AVOIDANCE_RADIUS) {
        continue;
      }

      const weight =
        (1 - forwardDistance / MOVEMENT_CONSTANTS.AVOIDANCE_LOOKAHEAD) *
        (1 - lateralDistance / MOVEMENT_CONSTANTS.AVOIDANCE_RADIUS);
      const side = playerId.localeCompare(nearbyPlayer.playerId) < 0 ? 1 : -1;
      avoidance.x += perpendicular.x * side * weight;
      avoidance.y += perpendicular.y * side * weight;
    }

    const avoidanceMagnitude = this.magnitude(avoidance);
    if (avoidanceMagnitude === 0) return direction;

    const cappedAvoidance =
      avoidanceMagnitude > 1
        ? this.normalize(avoidance)
        : avoidance;
    return this.normalize({
      x: direction.x +
        cappedAvoidance.x * MOVEMENT_CONSTANTS.AVOIDANCE_STRENGTH,
      y: direction.y +
        cappedAvoidance.y * MOVEMENT_CONSTANTS.AVOIDANCE_STRENGTH,
    });
  }

  private static limitTurnRate(
    currentVelocity: Vector2D,
    desiredVelocity: Vector2D,
    deltaTime: number,
  ): Vector2D {
    const currentSpeed = this.magnitude(currentVelocity);
    if (currentSpeed < 0.25) return desiredVelocity;

    const desiredSpeed = this.magnitude(desiredVelocity);
    if (desiredSpeed === 0) return desiredVelocity;
    if (
      currentVelocity.x * desiredVelocity.x +
        currentVelocity.y * desiredVelocity.y <=
      0
    ) {
      return desiredVelocity;
    }

    const currentAngle = Math.atan2(currentVelocity.y, currentVelocity.x);
    const desiredAngle = Math.atan2(desiredVelocity.y, desiredVelocity.x);
    const angleDifference = Math.atan2(
      Math.sin(desiredAngle - currentAngle),
      Math.cos(desiredAngle - currentAngle),
    );
    const turnRate =
      currentSpeed < 2
        ? MOVEMENT_CONSTANTS.LOW_SPEED_TURN_RATE
        : MOVEMENT_CONSTANTS.MAX_TURN_RATE;
    const maxTurn = turnRate * deltaTime;
    const angle = currentAngle + this.clamp(angleDifference, -maxTurn, maxTurn);

    return {
      x: Math.cos(angle) * desiredSpeed,
      y: Math.sin(angle) * desiredSpeed,
    };
  }

  static updateMovement(
    player: Player,
    state: PlayerMatchState,
    deltaTime: number,
    nearbyPlayers: readonly PlayerMatchState[] = [],
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
        const directDirection = this.normalize(direction);
        const avoidanceEnabled =
          state.currentAction !== "PRESSING" &&
          state.currentAction !== "MARKING" &&
          state.currentAction !== "INTERCEPTING" &&
          state.currentAction !== "TACKLING";
        const normalizedDirection = this.getAvoidanceDirection(
          player.id,
          state.position,
          directDirection,
          avoidanceEnabled ? nearbyPlayers : [],
        );
        const steeringAlignment = Math.max(
          0,
          directDirection.x * normalizedDirection.x +
            directDirection.y * normalizedDirection.y,
        );

        const maximumSpeed =
          this.getMaximumSpeed(player, state.currentAction) *
          this.getStaminaMultiplier(state.stamina);

        const isMovingAway =
          currentVelocity.x * direction.x +
            currentVelocity.y * direction.y <
          0;
        const desiredSpeed = isMovingAway
          ? 0
          : Math.min(
              maximumSpeed,
              Math.sqrt(
                2 *
                MOVEMENT_CONSTANTS.MAX_DECELERATION *
                distance,
              ) *
                (0.5 + steeringAlignment * 0.5),
            );

        desiredVelocity = this.limitTurnRate(
          currentVelocity,
          {
            x: normalizedDirection.x * desiredSpeed,
            y: normalizedDirection.y * desiredSpeed,
          },
          dt,
        );
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

      currentAction:
        state.targetPosition || isMoving
          ? state.currentAction
          : "IDLE",
    };
  }
}