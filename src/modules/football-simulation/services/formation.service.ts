import { FORMATION_433, FORMATION_343, FORMATION_4231_CM, FORMATION_4231_DM } from "../formations/index.js";

import type {
  FormationDefinition,
  FormationSlot,
} from "../types/formation.types.js";

export class FormationService {
  static getFormation(name: string): FormationDefinition {
    const formations: Record<string, FormationDefinition> = {
      "4-3-3": FORMATION_433,
      "3-4-3": FORMATION_343,
      "4-2-3-1(CM)": FORMATION_4231_CM,
      "4-2-3-1(DM)": FORMATION_4231_DM,
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