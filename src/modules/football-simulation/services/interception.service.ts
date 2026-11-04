import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type {
  InterceptionCandidate,
  InterceptionResult,
} from "../types/interception.types.js";

import { PitchService } from "./pitch.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";

import { BALL_CONSTANTS } from "../constants/ball.constants.js";
import { INTERCEPTION_CONSTANTS } from "../constants/interception.constants.js";

export interface InterceptionPlayer {
  player: Player;
  state: PlayerMatchState;
  teamId: string;
}

export class InterceptionService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
  ) {}

  resolveInterception(
    defenders: InterceptionPlayer[],
    ball: BallState,
  ): InterceptionResult {
    if (ball.possessionPlayerId !== null) {
      return this.noInterception("Ball is already controlled.");
    }

    if (defenders.length === 0) {
      return this.noInterception("No eligible defenders.");
    }

    const candidates = defenders
      .map((defender) => this.evaluateCandidate(defender, ball))
      .filter(
        (candidate): candidate is InterceptionCandidate =>
          candidate !== null,
      )
      .sort(
        (a, b) =>
          a.interceptionTime - b.interceptionTime ||
          b.score - a.score,
      );

    if (candidates.length === 0) {
      return this.noInterception("No viable interception found.");
    }

    const bestCandidate = candidates[0];

    if (!bestCandidate) {
      return this.noInterception();
    }

    const defender = defenders.find(
      (item) => item.player.id === bestCandidate.playerId,
    );

    if (!defender) {
      return this.noInterception("Defender could not be found.");
    }

    const currentDistance = PitchService.getDistance(
      defender.state.position,
      ball.position,
    );

    // The defender hasn't reached the ball yet.
    if (
      currentDistance > INTERCEPTION_CONSTANTS.INTERCEPTION_RADIUS ||
      ball.height > INTERCEPTION_CONSTANTS.MAX_INTERCEPTION_HEIGHT
    ) {
      defender.state.targetPosition =
        bestCandidate.interceptionPosition;

      defender.state.isMoving = true;
      defender.state.currentAction = "MOVING";

      return {
        intercepted: false,
        playerId: defender.player.id,
        interceptionPosition: bestCandidate.interceptionPosition,
        message: "Defender moving to interception point.",
      };
    }

    const controlled = this.ballInteractionService.tryControl(
      defender.player,
      defender.state,
      defender.teamId,
      ball,
    );

    if (!controlled) {
      return this.noInterception(
        "Defender reached the ball but could not control it.",
      );
    }

    defender.state.targetPosition = null;
    defender.state.isMoving = false;
    defender.state.currentAction = "IDLE";

    return {
      intercepted: true,
      playerId: defender.player.id,
      interceptionPosition: ball.position,
      message: "Ball successfully intercepted.",
    };
  }

  private evaluateCandidate(
    defender: InterceptionPlayer,
    ball: BallState,
  ): InterceptionCandidate | null {
    const attributes = defender.player.attributes;

    const anticipation =
      attributes.anticipation *
      INTERCEPTION_CONSTANTS.ANTICIPATION_WEIGHT;

    const positioning =
      attributes.positioning *
      INTERCEPTION_CONSTANTS.POSITIONING_WEIGHT;

    const attributeBonus = anticipation + positioning;

    const playerSpeed = this.getPlayerSpeed(defender.player);

    let bestCandidate: InterceptionCandidate | null = null;

    const interval =
      INTERCEPTION_CONSTANTS.PREDICTION_INTERVAL;

    const maxTime =
      INTERCEPTION_CONSTANTS.MAX_PREDICTION_TIME;

    for (
      let time = interval;
      time <= maxTime;
      time += interval
    ) {
      const predictedBall = this.predictBallPosition(ball, time);

      // Without aerial challenges, ignore balls that are too high.
      if (
        predictedBall.height >
        INTERCEPTION_CONSTANTS.MAX_INTERCEPTION_HEIGHT
      ) {
        continue;
      }

      const distance = PitchService.getDistance(
        defender.state.position,
        predictedBall.position,
      );

      const estimatedArrivalTime = distance / playerSpeed;

      if (estimatedArrivalTime > time) {
        continue;
      }

      const score =
        100 -
        estimatedArrivalTime * 15 +
        attributeBonus;

      if (
        score <
        INTERCEPTION_CONSTANTS.MIN_INTERCEPTION_SCORE
      ) {
        continue;
      }

      const candidate: InterceptionCandidate = {
        playerId: defender.player.id,
        interceptionPosition: predictedBall.position,
        distanceToBall: distance,
        estimatedArrivalTime,
        interceptionTime: time,
        score,
      };

      if (
        bestCandidate === null ||
        candidate.interceptionTime < bestCandidate.interceptionTime ||
        (
          candidate.interceptionTime === bestCandidate.interceptionTime &&
          candidate.score > bestCandidate.score
        )
      ) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  private predictBallPosition(
    ball: BallState,
    time: number,
  ): {
    position: { x: number; y: number };
    height: number;
  } {
    const friction = ball.height > 0
      ? BALL_CONSTANTS.AIR_DRAG
      : BALL_CONSTANTS.GROUND_FRICTION;

    const speed = Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
    );

    const newSpeed = Math.max(
      0,
      speed - friction * time,
    );

    const speedRatio = speed > 0
      ? newSpeed / speed
      : 0;

    const averageSpeed = (speed + newSpeed) / 2;

    const distance = averageSpeed * time;

    const directionX = speed > 0
      ? ball.velocity.x / speed
      : 0;

    const directionY = speed > 0
      ? ball.velocity.y / speed
      : 0;

    const height =
      ball.height +
      ball.verticalVelocity * time -
      0.5 * BALL_CONSTANTS.GRAVITY * time * time;

    return {
      position: {
        x: ball.position.x + directionX * distance,
        y: ball.position.y + directionY * distance,
      },
      height: Math.max(0, height),
    };
  }

  private getPlayerSpeed(player: Player): number {
    const pace = player.attributes.pace;

    const normalizedPace = (pace - 1) / 19;

    return (
      INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED +
      normalizedPace *
        (
          INTERCEPTION_CONSTANTS.MAX_PLAYER_SPEED -
          INTERCEPTION_CONSTANTS.MIN_PLAYER_SPEED
        )
    );
  }

  private noInterception(message?: string): InterceptionResult {
    return {
      intercepted: false,
      playerId: null,
      interceptionPosition: null,
      ...(message ? { message } : {}),
    };
  }
}