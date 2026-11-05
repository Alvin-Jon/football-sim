import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { Team } from "../../modules/football-simulation/types/team.types.js";

import {
  FORMATION_343,
  FORMATION_433,
  FORMATION_4231_CM,
  FORMATION_4231_DM,
} from "../../modules/football-simulation/formations/index.js";

import { PLAYERS } from "../players/players.js";

const MANFIELD_PLAYERS: Player[] = [
  PLAYERS.Harold_C,
  PLAYERS.Neto,
  PLAYERS.Gavi,
  PLAYERS.Xavier,
  PLAYERS.Alvin_J,
  PLAYERS.Pitrarch,
  PLAYERS.Brain_Allen,
  PLAYERS.Diego_Lopez,
  PLAYERS.Ahmed_Lucas,
  PLAYERS.A_Gomez,
  PLAYERS.Rodrigo,
];

const formation = FORMATION_343;

const players: Player[] = MANFIELD_PLAYERS.map((player, index) => {
  const slot = formation.slots[index];

  if (!slot) {
    throw new Error(
      `No formation slot found for ${player.name} at index ${index}`,
    );
  }

  return {
    ...player,
    position: slot.position,
  };
});

export const MANFIELD: Team = {
  id: "MANFIELD",
  name: "Manfield United",
  formation,

  tactics: {
    style: "POSSESSION",
    mentality: "BALANCED",
    formationFluidity: "FLUID",
  },

  players,
};