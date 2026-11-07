import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_4231_DM: FormationDefinition = {
  name: "4-2-3-1 (DM)",

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

    // Defensive Midfielders
    {
      id: "LDM",
      position: "DM",
      attackingPosition: { x: 41, y: 35 },
      defensivePosition: { x: 28, y: 35 },
    },
    {
      id: "RDM",
      position: "DM",
      attackingPosition: { x: 41, y: 65 },
      defensivePosition: { x: 28, y: 65 },
    },

    // Attacking Midfielders
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 72, y: 12 },
      defensivePosition: { x: 51, y: 12 },
    },
    {
      id: "AM",
      position: "AM",
      attackingPosition: { x: 67, y: 50 },
      defensivePosition: { x: 50, y: 50 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 72, y: 88 },
      defensivePosition: { x: 51, y: 88 },
    },

    // Striker
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 86, y: 50 },
      defensivePosition: { x: 67, y: 50 },
    },
  ],
};