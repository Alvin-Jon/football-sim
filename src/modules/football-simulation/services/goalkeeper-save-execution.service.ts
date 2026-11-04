import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type {
  GoalkeeperContext,
  GoalkeeperSaveType,
} from "../types/goalkeeper.types.js";

import { BallInteractionService } from "./ball-interaction.service.js";
import { PitchService } from "./pitch.service.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";

export class GoalkeeperSaveExecutionService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
  ) {}

  execute(
    context: GoalkeeperContext,
    goalkeeperState: PlayerMatchState,
    ball: BallState,
    saveType: GoalkeeperSaveType,
  ): boolean {
    const distance = PitchService.getDistance(
      goalkeeperState.position,
      ball.position,
    );

    // The goalkeeper must physically reach the ball.
    if (distance > GOALKEEPER_CONSTANTS.SAVE_CONTACT_RADIUS) {
      return false;
    }

    switch (saveType) {
      case "CATCH":
        return this.catchBall(
          context,
          goalkeeperState,
          ball,
        );

      case "PARRY":
        this.parryBall(context, ball);
        return true;

      case "PUNCH":
        this.punchBall(context, ball);
        return true;
    }
  }

  private catchBall(
    context: GoalkeeperContext,
    goalkeeperState: PlayerMatchState,
    ball: BallState,
  ): boolean {
    if (
      ball.height > GOALKEEPER_CONSTANTS.MAX_SAVE_HEIGHT
    ) {
      return false;
    }

    this.ballInteractionService.assignPossession(
      context.goalkeeper.playerId,
      context.goalkeeper.teamId,
      ball,
    );

    this.ballInteractionService.updateControlledBall(
      goalkeeperState,
      ball,
    );

    return true;
  }

  private parryBall(
    context: GoalkeeperContext,
    ball: BallState,
  ): void {
    const goalToBallDirection = Math.atan2(
      ball.position.y - context.goalPosition.y,
      ball.position.x - context.goalPosition.x,
    );

    const horizontalSpeed =
      Math.hypot(ball.velocity.x, ball.velocity.y) *
      GOALKEEPER_CONSTANTS.PARRY_SPEED_MULTIPLIER;

    this.ballInteractionService.deflectBall(
      ball,
      goalToBallDirection,
      Math.max(5, horizontalSpeed),
      GOALKEEPER_CONSTANTS.PARRY_VERTICAL_SPEED,
    );
  }

  private punchBall(
    context: GoalkeeperContext,
    ball: BallState,
  ): void {
    const direction =
      context.attackingDirection === "LEFT_TO_RIGHT"
        ? Math.PI
        : 0;

    this.ballInteractionService.deflectBall(
      ball,
      direction,
      GOALKEEPER_CONSTANTS.PUNCH_SPEED,
      GOALKEEPER_CONSTANTS.PUNCH_VERTICAL_SPEED,
    );
  }
}