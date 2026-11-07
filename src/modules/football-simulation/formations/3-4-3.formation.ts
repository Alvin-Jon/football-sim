import type { FormationDefinition } from "../types/formation.types.js";

export const FORMATION_343: FormationDefinition = {
  name: "3-4-3",

  slots: [
    // Goalkeeper
    {
      id: "GK",
      position: "GK",
      attackingPosition: { x: 5, y: 50 },
      defensivePosition: { x: 5, y: 50 },
    },

    // Centre Backs
    {
      id: "LCB",
      position: "CB",
      attackingPosition: { x: 29, y: 26 },
      defensivePosition: { x: 17, y: 26 },
    },
    {
      id: "CB",
      position: "CB",
      attackingPosition: { x: 27, y: 50 },
      defensivePosition: { x: 15, y: 50 },
    },
    {
      id: "RCB",
      position: "CB",
      attackingPosition: { x: 29, y: 74 },
      defensivePosition: { x: 17, y: 74 },
    },

    // Wingbacks
    {
      id: "LAM",
      position: "LAM",
      attackingPosition: { x: 62, y: 8 },
      defensivePosition: { x: 34, y: 8 },
    },
    {
      id: "RAM",
      position: "RAM",
      attackingPosition: { x: 62, y: 92 },
      defensivePosition: { x: 34, y: 92 },
    },

    // Central Midfielders
    {
      id: "LCM",
      position: "CM",
      attackingPosition: { x: 52, y: 35 },
      defensivePosition: { x: 38, y: 35 },
    },
    {
      id: "RCM",
      position: "CM",
      attackingPosition: { x: 52, y: 65 },
      defensivePosition: { x: 38, y: 65 },
    },

    // Attackers
    {
      id: "LW",
      position: "LW",
      attackingPosition: { x: 80, y: 15 },
      defensivePosition: { x: 58, y: 15 },
    },
    {
      id: "ST",
      position: "ST",
      attackingPosition: { x: 86, y: 50 },
      defensivePosition: { x: 68, y: 50 },
    },
    {
      id: "RW",
      position: "RW",
      attackingPosition: { x: 80, y: 85 },
      defensivePosition: { x: 58, y: 85 },
    },
  ],
};