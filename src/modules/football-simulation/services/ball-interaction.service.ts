import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type { Vector2D } from "../types/pitch.types.js";

import { PitchService } from "./pitch.service.js";
import { BALL_INTERACTION_CONSTANTS } from "../constants/ball-interaction.constants.js";

export interface BallReleaseOptions {
  horizontalSpeed: number;
  verticalSpeed?: number;
  direction?: number;
  spin?: number;
}

export class BallInteractionService {
  tryControl(
    player: Player,
    playerState: PlayerMatchState,
    teamId: string,
    ball: BallState,
  ): boolean {
    // Another player already controls the ball.
    if (ball.possessionPlayerId !== null) {
      return ball.possessionPlayerId === player.id;
    }

    if (
      ball.height >
      BALL_INTERACTION_CONSTANTS.MAX_CONTROL_HEIGHT
    ) {
      return false;
    }

    const distance = PitchService.getDistance(
      playerState.position,
      ball.position,
    );

    if (distance > BALL_INTERACTION_CONSTANTS.CONTROL_RADIUS) {
      return false;
    }

    const speed = Math.hypot(
      ball.velocity.x,
      ball.velocity.y,
    );

    if (speed > BALL_INTERACTION_CONSTANTS.MAX_CONTROL_SPEED) {
      return false;
    }

    this.assignPossession(player.id, teamId, ball);

    this.updateControlledBall(playerState, ball);

    return true;
  }

  deflectBall(
  ball: BallState,
  direction: number,
  horizontalSpeed: number,
  verticalSpeed = 0,
): void {
  ball.velocity = {
    x: Math.cos(direction) * horizontalSpeed,
    y: Math.sin(direction) * horizontalSpeed,
  };

  ball.verticalVelocity = verticalSpeed;
  ball.height = Math.max(0, ball.height);
  ball.possessionPlayerId = null;
  ball.possessionTeamId = null;
}

  assignPossession(
    playerId: string,
    teamId: string,
    ball: BallState,
  ): void {
    ball.possessionPlayerId = playerId;
    ball.possessionTeamId = teamId;

    ball.velocity = { x: 0, y: 0 };
    ball.verticalVelocity = 0;
    ball.height = 0;
  }

  updateControlledBall(
    playerState: PlayerMatchState,
    ball: BallState,
  ): void {
    if (ball.possessionPlayerId !== playerState.playerId) {
      return;
    }

    const offset = BALL_INTERACTION_CONSTANTS.CONTROL_OFFSET;

    const targetPosition: Vector2D = {
      x: playerState.position.x + Math.cos(playerState.direction) * offset,
      y: playerState.position.y + Math.sin(playerState.direction) * offset,
    };

    ball.position = PitchService.clampPosition(targetPosition);

    // A controlled ball inherits the player's movement velocity.
    ball.velocity = {
      x: playerState.velocity.x,
      y: playerState.velocity.y,
    };

    ball.height = 0;
    ball.verticalVelocity = 0;
  }

  releaseBall(
    playerId: string,
    ball: BallState,
    options: BallReleaseOptions,
  ): boolean {
    if (ball.possessionPlayerId !== playerId) {
      return false;
    }

    const direction = options.direction ?? 0;

    ball.velocity = {
      x: Math.cos(direction) * options.horizontalSpeed,
      y: Math.sin(direction) * options.horizontalSpeed,
    };

    ball.verticalVelocity = options.verticalSpeed ?? 0;
    ball.height = 0;
    ball.spin = options.spin ?? 0;

    ball.possessionPlayerId = null;
    ball.possessionTeamId = null;

    return true;
  }

  isControlledBy(playerId: string, ball: BallState): boolean {
    return ball.possessionPlayerId === playerId;
  }

  isPossessed(ball: BallState): boolean {
    return ball.possessionPlayerId !== null;
  }

  getPossessionTeam(ball: BallState): string | null {
    return ball.possessionTeamId;
  }
}