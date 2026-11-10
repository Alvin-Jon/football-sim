import type { Player, PlayerAttributes } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { BallState } from "../types/match.types.js";
import type {
  ReceivingResult,
} from "../types/receiving.types.js";
import { BALL_INTERACTION_CONSTANTS } from "../constants/ball-interaction.constants.js";
import { PitchService } from "./pitch.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";

import { RECEIVING_CONSTANTS } from "../constants/receiving.constants.js";

export class ReceivingService {
  constructor(
    private readonly ballInteractionService: BallInteractionService,
    private readonly random: () => number = Math.random,
  ) {}

  static estimateControlChance(
    attributes: PlayerAttributes,
    ballSpeed: number,
  ): number {
    const attributeScore =
      attributes.ballControl *
        RECEIVING_CONSTANTS.BALL_CONTROL_WEIGHT +
      attributes.anticipation *
        RECEIVING_CONSTANTS.ANTICIPATION_WEIGHT +
      attributes.decisions *
        RECEIVING_CONSTANTS.DECISIONS_WEIGHT +
      attributes.composure *
        RECEIVING_CONSTANTS.COMPOSURE_WEIGHT;

    const chance =
      RECEIVING_CONSTANTS.BASE_CONTROL_CHANCE +
      attributeScore -
      ballSpeed * RECEIVING_CONSTANTS.SPEED_DIFFICULTY_WEIGHT;

    return Math.max(
      RECEIVING_CONSTANTS.MIN_CONTROL_CHANCE,
      Math.min(RECEIVING_CONSTANTS.MAX_CONTROL_CHANCE, chance),
    );
  }

attemptReceive(
  player: Player,
  playerState: PlayerMatchState,
  teamId: string,
  ball: BallState,
  allowChase = true,
): ReceivingResult {
  const distance = PitchService.getDistance(playerState.position, ball.position);

  if (ball.possessionPlayerId !== null) {
    return this.result(player.id, "NOT_READY", 0, distance);
  }

  if (distance > RECEIVING_CONSTANTS.ANTICIPATION_RADIUS) {
    return this.result(player.id, "NOT_READY", 0, distance);
  }

  if (distance > RECEIVING_CONSTANTS.RECEIVING_RADIUS) {
    // Players who are not designated chasers hold their position.
    if (!allowChase) {
      return this.result(player.id, "NOT_READY", 0, distance);
    }

    playerState.targetPosition = { ...ball.position };
    playerState.isMoving = true;
    playerState.currentAction = "MOVING";

    return this.result(player.id, "MOVING_TO_BALL", 0, distance);
  }

  // Too high to control: don't touch it (and don't slow it down).
  if (ball.height > BALL_INTERACTION_CONSTANTS.MAX_CONTROL_HEIGHT) {
    return this.result(player.id, "NOT_READY", 0, distance);
  }

  const controlChance = this.calculateControlChance(player, ball);

  if (this.random() > controlChance) {
    return this.result(player.id, "MISCONTROLLED", controlChance, distance);
  }

  const originalVelocity = { ...ball.velocity };
  ball.velocity.x *= RECEIVING_CONSTANTS.FIRST_TOUCH_SPEED_RETENTION;
  ball.velocity.y *= RECEIVING_CONSTANTS.FIRST_TOUCH_SPEED_RETENTION;

  const controlled = this.ballInteractionService.tryControl(
    player,
    playerState,
    teamId,
    ball,
  );

  if (!controlled) {
    ball.velocity = originalVelocity;
    return this.result(player.id, "NOT_READY", controlChance, distance);
  }

  playerState.targetPosition = null;
  playerState.isMoving = false;
  playerState.currentAction = "IDLE";

  return this.result(player.id, "CONTROLLED", controlChance, distance);
}

  private calculateControlChance(
    player: Player,
    ball: BallState,
  ): number {
    return ReceivingService.estimateControlChance(
      player.attributes,
      Math.hypot(ball.velocity.x, ball.velocity.y),
    );
  }

  private result(
    playerId: string,
    outcome: ReceivingResult["outcome"],
    controlChance: number,
    distanceToBall: number,
  ): ReceivingResult {
    return {
      playerId,
      outcome,
      controlChance,
      distanceToBall,
    };
  }
}