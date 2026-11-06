import type {
  GoalkeeperContext,
  GoalkeeperSaveType,
} from "../types/goalkeeper.types.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";

import type { PredictedShot } from "./goalkeeper-prediction.service.js";

export interface GoalkeeperSaveResult {
  successful: boolean;
  saveType: GoalkeeperSaveType;
  saveChance: number;
  message: string;
}

export class GoalkeeperSaveService {
  constructor(
    private readonly random: () => number = Math.random,
  ) {}

  evaluateSave(
    context: GoalkeeperContext,
    shot: PredictedShot,
    saveType: GoalkeeperSaveType,
  ): GoalkeeperSaveResult {
    const attributes = context.goalkeeper.attributes;
    const c = GOALKEEPER_CONSTANTS;

    let chance =
      0.25 +
      attributes.reflexes * 0.025 +
      attributes.positioning * 0.012 +
      attributes.decisions * 0.008;

    if (saveType === "CATCH") {
      chance += attributes.handling * 0.012;
    }

    if (saveType === "PARRY") {
      chance += attributes.reflexes * 0.008;
    }

    if (saveType === "PUNCH") {
      chance += attributes.aerialAbility * 0.015;
    }

    chance -= shot.timeToGoal * 0.08;

    // Harder to save: further to cover, faster, and nearer the post.
    const keeper = context.goalkeeper.position;
    const reach = Math.hypot(
      keeper.x - shot.crossingPosition.x,
      keeper.y - shot.crossingPosition.y,
    );
    chance -= reach * c.SAVE_DISTANCE_PENALTY;

    const speed = Math.hypot(
      context.ball.velocity.x,
      context.ball.velocity.y,
    );
    chance -=
      Math.max(0, speed - c.SAVE_SPEED_THRESHOLD) * c.SAVE_SPEED_PENALTY;

    const halfGoal = PITCH_DIMENSIONS.goalWidth / 2;
    const offCentre = Math.min(
      1,
      Math.abs(shot.crossingPosition.y - context.goalPosition.y) / halfGoal,
    );
    chance -= offCentre * c.SAVE_CORNER_PENALTY;

    chance *= Math.max(
      0.75,
      context.goalkeeper.stamina / 100,
    );

    chance = Math.max(
      c.MIN_SAVE_CHANCE,
      Math.min(c.MAX_SAVE_CHANCE, chance),
    );

    const successful = this.random() <= chance;

    return {
      successful,
      saveType,
      saveChance: chance,
      message: successful
        ? `Goalkeeper successfully performed ${saveType.toLowerCase()}.`
        : `Goalkeeper failed to stop the shot.`,
    };
  }
}