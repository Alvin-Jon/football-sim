import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_433: FormationDefinition = {
  name: "4-3-3",

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

    // Midfielders
    {
      id: "DM",
      position: "DM",
      attackingPosition: { x: 43, y: 34 },
      defensivePosition: { x: 29, y: 34 },
    },
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 59, y: 22 },
      defensivePosition: { x: 43, y: 22 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 59, y: 46 },
      defensivePosition: { x: 43, y: 46 },
    },

    // Attackers
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 80, y: 8 },
      defensivePosition: { x: 54, y: 8 },
    },
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 87, y: 34 },
      defensivePosition: { x: 69, y: 34 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 80, y: 60 },
      defensivePosition: { x: 54, y: 60 },
    },
  ],
};