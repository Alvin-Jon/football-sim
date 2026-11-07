import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_4231_CM: FormationDefinition = {
  name: "4-2-3-1 (CM)",

  slots: [
    // Goalkeeper
    {
      id: "GK",
      position: "GK",
      attackingPosition: { x: 5, y: 50 },
      defensivePosition: { x: 5, y: 50 },
    },

    // Defenders
    {
      id: "LCB",
      position: "CB",
      attackingPosition: { x: 27, y: 37 },
      defensivePosition: { x: 16, y: 37 },
    },
    {
      id: "RCB",
      position: "CB",
      attackingPosition: { x: 27, y: 63 },
      defensivePosition: { x: 16, y: 63 },
    },
    {
      id: "LB",
      position: "LB",
      attackingPosition: { x: 43, y: 12 },
      defensivePosition: { x: 21, y: 12 },
    },
    {
      id: "RB",
      position: "RB",
      attackingPosition: { x: 43, y: 88 },
      defensivePosition: { x: 21, y: 88 },
    },

    // Central Midfielders
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 48, y: 34 },
      defensivePosition: { x: 35, y: 34 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 48, y: 66 },
      defensivePosition: { x: 35, y: 66 },
    },

    // Attacking Midfielders
    {
      id: "AM",
      position: "AM",
      attackingPosition: { x: 67, y: 50 },
      defensivePosition: { x: 50, y: 50 },
    },
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 72, y: 12 },
      defensivePosition: { x: 51, y: 12 },
    },
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 86, y: 50 },
      defensivePosition: { x: 67, y: 50 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 72, y: 88 },
      defensivePosition: { x: 51, y: 88 },
    },
  ],
};