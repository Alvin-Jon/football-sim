import type { BallState } from "../types/match.types.js";
import type { DecisionPlayer } from "../types/decision.types.js";
import type {
  InterceptionCandidate,
  InterceptionResult,
} from "../types/interception.types.js";

import { INTERCEPTION_CONSTANTS } from "../constants/interception.constants.js";

import { BallInteractionService } from "./ball-interaction.service.js";
import { BallTrajectoryService } from "./ball-trajectory.service.js";
import { PitchService } from "./pitch.service.js";

export class InterceptionService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
    private readonly trajectoryService: BallTrajectoryService,
    private readonly random: () => number
  ) {}

  resolveInterception(
    defenders: DecisionPlayer[],
    teamId: string,
    ball: BallState,
  ): InterceptionResult {
    if (
      defenders.length === 0 ||
      ball.possessionPlayerId !== null
    ) {
      return this.noInterception("No available interception.");
    }

    const trajectory = this.trajectoryService.predict(
      ball,
      INTERCEPTION_CONSTANTS.MAX_PREDICTION_TIME,
      INTERCEPTION_CONSTANTS.PREDICTION_INTERVAL,
    );

    const candidates: InterceptionCandidate[] = [];

    for (const defender of defenders) {
      const candidate = this.findInterceptionPoint(
        defender,
        trajectory.samples,
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) {
      return this.noInterception(
        "No defender can reach the predicted ball trajectory.",
      );
    }

    candidates.sort((a, b) => {
      if (a.interceptionTime !== b.interceptionTime) {
        return a.interceptionTime - b.interceptionTime;
      }

      return b.score - a.score;
    });

    const bestCandidate = candidates[0];

    if (!bestCandidate) {
      return this.noInterception();
    }

    const defender = defenders.find(
      (item) => item.player.id === bestCandidate.playerId,
    );

    if (!defender) {
      return this.noInterception("Selected defender not found.");
    }

    const currentBallDistance = PitchService.getDistance(
      defender.state.position,
      ball.position,
    );

    // The defender has reached the ball's current position.
    if (
      currentBallDistance <= INTERCEPTION_CONSTANTS.INTERCEPTION_RADIUS &&
      ball.height <= INTERCEPTION_CONSTANTS.MAX_INTERCEPTION_HEIGHT
    ) {
      const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.y);
      const a = defender.player.attributes;
      const chance = Math.max(0.05, Math.min(0.85,
        0.25 + a.anticipation * 0.02 + a.positioning * 0.01 - ballSpeed * 0.015,
      ));

      if (this.random() <= chance) {
      const intercepted = this.ballInteractionService.tryControl(
        defender.player,
        defender.state,
        teamId,
        ball,
      );

      if (intercepted) {
        return {
          intercepted: true,
          playerId: defender.player.id,
          interceptionPosition: { ...ball.position },
          message: "Ball successfully intercepted.",
        };
      }
    }
    }

    // Otherwise, move towards the predicted interception point.
    defender.state.targetPosition = bestCandidate.interceptionPosition;
    defender.state.isMoving = true;
    defender.state.currentAction = "MOVING";

    return {
      intercepted: false,
      playerId: defender.player.id,
      interceptionPosition: bestCandidate.interceptionPosition,
      message: "Defender moving towards predicted interception point.",
    };
  }

  private findInterceptionPoint(
    defender: DecisionPlayer,
    samples: Array<{
      time: number;
      position: { x: number; y: number };
      height: number;
    }>,
  ): InterceptionCandidate | null {
    const { player, state } = defender;

    const maxSpeed =
      INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED +
      ((player.attributes.pace - 1) / 19) *
        (
          INTERCEPTION_CONSTANTS.MAX_PLAYER_SPEED -
          INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED
        );

    const acceleration =
      INTERCEPTION_CONSTANTS.MIN_PLAYER_ACCELERATION +
      ((player.attributes.acceleration - 1) / 19) *
        (
          INTERCEPTION_CONSTANTS.MAX_PLAYER_ACCELERATION -
          INTERCEPTION_CONSTANTS.MIN_PLAYER_ACCELERATION
        );

    const staminaMultiplier = Math.max(
      0.75,
      Math.min(1, state.stamina / 100),
    );

    const effectiveMaxSpeed = maxSpeed * staminaMultiplier;
    const reactionTime = Math.max(0.1, 0.5 - player.attributes.anticipation * 0.02);

    for (const sample of samples) {
      const availableTime = sample.time - reactionTime;
      if (availableTime <= 0) continue;
      if (
        sample.height >
        INTERCEPTION_CONSTANTS.MAX_INTERCEPTION_HEIGHT
      ) {
        continue;
      }

      const distance = PitchService.getDistance(
        state.position,
        sample.position,
      );

      const reachableDistance = this.getReachableDistance(
        availableTime,
        effectiveMaxSpeed,
        acceleration,
        state.currentSpeed,
      );

      if (
        distance >
        reachableDistance +
          INTERCEPTION_CONSTANTS.INTERCEPTION_RADIUS
      ) {
        continue;
      }

      const estimatedArrivalTime = this.getArrivalTime(
        distance,
        effectiveMaxSpeed,
        acceleration,
        state.currentSpeed,
      );

      if (estimatedArrivalTime === null) {
        continue;
      }

      const anticipationBonus =
        player.attributes.anticipation *
        INTERCEPTION_CONSTANTS.ANTICIPATION_WEIGHT;

      const positioningBonus =
        player.attributes.positioning *
        INTERCEPTION_CONSTANTS.POSITIONING_WEIGHT;

      return {
        playerId: player.id,
        interceptionPosition: { ...sample.position },
        distanceToBall: distance,
        estimatedArrivalTime,
        interceptionTime: sample.time,
        score: anticipationBonus + positioningBonus,
      };
    }

    return null;
  }

  private getReachableDistance(
    time: number,
    maxSpeed: number,
    acceleration: number,
    currentSpeed: number,
  ): number {
    const initialSpeed = Math.min(
      Math.max(0, currentSpeed),
      maxSpeed,
    );

    const accelerationTime =
      (maxSpeed - initialSpeed) / acceleration;

    if (time <= accelerationTime) {
      return (
        initialSpeed * time +
        0.5 * acceleration * time * time
      );
    }

    const accelerationDistance =
      initialSpeed * accelerationTime +
      0.5 * acceleration * accelerationTime ** 2;

    return (
      accelerationDistance +
      maxSpeed * (time - accelerationTime)
    );
  }

  private getArrivalTime(
    distance: number,
    maxSpeed: number,
    acceleration: number,
    currentSpeed: number,
  ): number | null {
    const initialSpeed = Math.min(
      Math.max(0, currentSpeed),
      maxSpeed,
    );

    if (distance <= 0) {
      return 0;
    }

    const accelerationTime =
      (maxSpeed - initialSpeed) / acceleration;

    const accelerationDistance =
      initialSpeed * accelerationTime +
      0.5 * acceleration * accelerationTime ** 2;

    if (distance <= accelerationDistance) {
      return (
        -initialSpeed +
        Math.sqrt(
          initialSpeed ** 2 +
            2 * acceleration * distance,
        )
      ) / acceleration;
    }

    return (
      accelerationTime +
      (distance - accelerationDistance) / maxSpeed
    );
  }

  private noInterception(message = "No interception."): InterceptionResult {
    return {
      intercepted: false,
      playerId: null,
      interceptionPosition: null,
      message,
    };
  }
}