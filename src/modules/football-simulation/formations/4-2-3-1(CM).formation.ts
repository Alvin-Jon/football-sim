import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_4231_CM: FormationDefinition = {
  name: "4-2-3-1 (CM)",

  slots: [
    // Goalkeeper
    {
      id: "GK",
      position: "GK",
      attackingPosition: { x: 5, y: 34 },
      defensivePosition: { x: 5, y: 34 },
    },

    // Defenders
    {
      id: "LB",
      position: "LB",
      attackingPosition: { x: 45, y: 8 },
      defensivePosition: { x: 22, y: 8 },
    },
    {
      id: "LCB",
      position: "CB",
      attackingPosition: { x: 28, y: 25 },
      defensivePosition: { x: 17, y: 25 },
    },
    {
      id: "RCB",
      position: "CB",
      attackingPosition: { x: 28, y: 43 },
      defensivePosition: { x: 17, y: 43 },
    },
    {
      id: "RB",
      position: "RB",
      attackingPosition: { x: 45, y: 60 },
      defensivePosition: { x: 22, y: 60 },
    },

    // Central Midfielders
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 50, y: 23 },
      defensivePosition: { x: 37, y: 23 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 50, y: 45 },
      defensivePosition: { x: 37, y: 45 },
    },

    // Attacking Midfielders
    {
      id: "AM",
      position: "AM",
      attackingPosition: { x: 70, y: 34 },
      defensivePosition: { x: 52, y: 34 },
    },
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 75, y: 8 },
      defensivePosition: { x: 53, y: 8 },
    },
    // Striker
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 88, y: 34 },
      defensivePosition: { x: 69, y: 34 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 75, y: 60 },
      defensivePosition: { x: 53, y: 60 },
    },
  ],
};
