import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_433: FormationDefinition = {
  name: "4-3-3",

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

    // Midfielders
    {
      id: "DM",
      position: "DM",
      attackingPosition: { x: 41, y: 50 },
      defensivePosition: { x: 27, y: 50 },
    },
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 56, y: 32 },
      defensivePosition: { x: 41, y: 32 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 56, y: 68 },
      defensivePosition: { x: 41, y: 68 },
    },

    // Attackers
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 77, y: 12 },
      defensivePosition: { x: 51, y: 12 },
    },
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 85, y: 50 },
      defensivePosition: { x: 67, y: 50 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 77, y: 88 },
      defensivePosition: { x: 51, y: 88 },
    },
  ],
};