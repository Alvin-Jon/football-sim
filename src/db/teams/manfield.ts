import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { Team } from "../../modules/football-simulation/types/team.types.js";

import {
  FORMATION_343,
  FORMATION_433,
  FORMATION_4231_CM,
  FORMATION_4231_DM,
} from "../../modules/football-simulation/formations/index.js";

import { PLAYERS } from "../players/players.js";
import { type PlayerAttributes } from "../../modules/football-simulation/types/player.types.js";

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

const formation = FORMATION_4231_DM;

const debuff = (attributes: PlayerAttributes, multiplier: number): PlayerAttributes => {
  const result = { ...attributes };

  for (const stat of Object.keys(result) as (keyof PlayerAttributes)[]) {
    result[stat] -= 10;
  }

  return result;
};

const players: Player[] = MANFIELD_PLAYERS.map((player, index) => {
  const slot = formation.slots[index];

  if (!slot) {
    throw new Error(
      `No formation slot found for ${player.name} at index ${index}`,
    );
  }

  return {
    ...player,
    id: slot.id + (Math.random()*2),
    position: slot.position,
   // attributes: debuff(player.attributes, 0.9)
  };
});

const setPieceTakerId = players.find(
  (player) => player.position === "AM",
)?.id;
if (!setPieceTakerId) {
  throw new Error("Manfield United has no attacking midfielder for set pieces");
}

export const MANFIELD: Team = {
  id: "MANFIELD",
  name: "Manfield United",
  formation,
  color: "red",
  tactics: {
    style: "COUNTER_ATTACKING",
    mentality: "VERY_DEFENSIVE",
    formationFluidity: "FLUID",
    setPieceTakerId,
    cornerAttackersInBox: 6,
    pressing: "OWN_HALF",
    defensiveLine: "VERY_DEEP"
  },

  players,
};