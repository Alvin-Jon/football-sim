import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_343: FormationDefinition = {
  name: "3-4-3",

  slots: [
    // Goalkeeper
    {
      id: "GK",
      position: "GK",
      attackingPosition: { x: 5, y: 34 },
      defensivePosition: { x: 5, y: 34 },
    },

    // Centre Backs
    {
      id: "LCB",
      position: "CB",
      attackingPosition: { x: 30, y: 18 },
      defensivePosition: { x: 18, y: 18 },
    },
    {
      id: "CB",
      position: "CB",
      attackingPosition: { x: 28, y: 34 },
      defensivePosition: { x: 16, y: 34 },
    },
    {
      id: "RCB",
      position: "CB",
      attackingPosition: { x: 30, y: 50 },
      defensivePosition: { x: 18, y: 50 },
    },

    // Wingbacks
    {
      id: "LAM",
      position: "AM",
      attackingPosition: { x: 65, y: 5 },
      defensivePosition: { x: 35, y: 5 },
    },
    {
      id: "RAM",
      position: "AM",
      attackingPosition: { x: 65, y: 63 },
      defensivePosition: { x: 35, y: 63 },
    },

    // Central Midfielders
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 55, y: 24 },
      defensivePosition: { x: 40, y: 24 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 55, y: 44 },
      defensivePosition: { x: 40, y: 44 },
    },

    // Attackers
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 82, y: 10 },
      defensivePosition: { x: 60, y: 10 },
    },
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 88, y: 34 },
      defensivePosition: { x: 70, y: 34 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 82, y: 58 },
      defensivePosition: { x: 60, y: 58 },
    },
  ],
};
