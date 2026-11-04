import type {
  GoalkeeperContext,
  GoalkeeperSaveType,
} from "../types/goalkeeper.types.js";

import { GOALKEEPER_CONSTANTS } from "../constants/goalkeeper.constants.js";

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

    chance *= Math.max(
      0.75,
      context.goalkeeper.stamina / 100,
    );

    chance = Math.max(
      GOALKEEPER_CONSTANTS.MIN_SAVE_CHANCE,
      Math.min(GOALKEEPER_CONSTANTS.MAX_SAVE_CHANCE, chance),
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