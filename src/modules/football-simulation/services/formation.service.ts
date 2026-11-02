import { FORMATION_433 } from "../formations/4-3-3.formation.js";

import type {
  FormationDefinition,
  FormationSlot,
} from "../types/formation.types.js";

export class FormationService {
  static getFormation(name: string): FormationDefinition {
    const formations: Record<string, FormationDefinition> = {
      "4-3-3": FORMATION_433,
    };

    const formation = formations[name];

    if (!formation) {
      throw new Error(`Formation ${name} does not exist`);
    }

    return formation;
  }

  static getSlot(
    formation: FormationDefinition,
    slotId: string,
  ): FormationSlot | undefined {
    return formation.slots.find((slot) => slot.id === slotId);
  }
}