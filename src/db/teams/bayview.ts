import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { Team } from "../../modules/football-simulation/types/team.types.js";
import { FORMATION_433, FORMATION_343, FORMATION_4231_CM, FORMATION_4231_DM  } from "../../modules/football-simulation/formations/index.js";
import {PLAYERS} from "../players/players.js";

const BAYVIEW_PLAYERS: Player[] = [
    PLAYERS.Giddy_L,
    PLAYERS.Ramos,
    PLAYERS.Cuburasi,
    PLAYERS.Xavi,
    PLAYERS.Trent_A,
    PLAYERS.Bischhof,
    PLAYERS.Jason_Todd,
    PLAYERS.D_Wright,
    PLAYERS.Rapheal,
    PLAYERS.P_Coleman,
    PLAYERS.Lamine_Yamal
]

const formation = FORMATION_433;

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
  };
});

export const BAYVIEW: Team = {
    id: "BAYVIEW",
    name: "Bayview Athletic",
    color: "white",
    formation,   
    tactics: {
        style: "COUNTER_ATTACKING",
        mentality: "ATTACKING",
        formationFluidity: "FLUID",
        pressing:"ALL_OVER_PITCH",
        defensiveLine: "HIGH",
    },
    players: players,
};