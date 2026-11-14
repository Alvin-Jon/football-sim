import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { Team } from "../../modules/football-simulation/types/team.types.js";
import { FORMATION_433, FORMATION_343, FORMATION_4231_CM, FORMATION_4231_DM  } from "../../modules/football-simulation/formations/index.js";
import {PLAYERS} from "../players/players.js";
import { type PlayerAttributes } from "../../modules/football-simulation/types/player.types.js";


const BAYVIEW_PLAYERS: Player[] = [
    PLAYERS.Marcus,
    PLAYERS.Victor,
    PLAYERS.Gabriel,
    PLAYERS.Daniel,
    PLAYERS.Andre,
    PLAYERS.Thomas,
    PLAYERS.Jones,
    PLAYERS.Elias,
    PLAYERS.kvarashikila,
    PLAYERS.Sebastian,
    PLAYERS.Alonso
]

const formation = FORMATION_343;

const debuff = (attributes: PlayerAttributes): PlayerAttributes => {
  const result = { ...attributes };

  for (const stat of Object.keys(result) as (keyof PlayerAttributes)[]) {
    result[stat] -= 10;
    if(result[stat] < 1) result[stat] = 1 
  }

  return result;
};

const players: Player[] = BAYVIEW_PLAYERS.map((player, index) => {
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
    //attributes: debuff(player.attributes)
  };
});

const setPieceTakerId = players.find(
  (player) => player.position === "CM",
)?.id;
if (!setPieceTakerId) {
  throw new Error("Bayview Athletic has no central midfielder for set pieces");
}

export const VALENCIA: Team = {
    id: "VALENCIA",
    name: "Valencia Royale",
    color: "blue",
    formation,   
    tactics: {
        style: "WING_PLAY",
        mentality: "ATTACKING",
        formationFluidity: "FLUID",
        setPieceTakerId,
        cornerAttackersInBox: 6,
        pressing:"MID_BLOCK",
        defensiveLine: "STANDARD",
    },
    players: players,
};