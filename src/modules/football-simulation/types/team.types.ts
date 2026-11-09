import type { Player } from "./player.types.js";
import type {
  FormationDefinition,
  FormationFluidity,
} from "./formation.types.js";

export type TeamStyle =
  | "POSSESSION"
  | "TIKI_TAKA"
  | "GEGENPRESS"
  | "COUNTER_ATTACKING"
  | "DIRECT"
  | "WING_PLAY";

export type TeamMentality =
  | "VERY_DEFENSIVE"
  | "DEFENSIVE"
  | "BALANCED"
  | "ATTACKING"
  | "VERY_ATTACKING";


export type PressingStyle = "ALL_OVER_PITCH" | "MID_BLOCK" | "OWN_HALF";

export type DefensiveLine =
  | "VERY_DEEP"
  | "DEEP"
  | "STANDARD"
  | "HIGH"
  | "VERY_HIGH";

export interface TeamTactics {
  style: TeamStyle;
  mentality: TeamMentality;
  formationFluidity: FormationFluidity;
  setPieceTakerId: string;
  cornerAttackersInBox?: number;
  pressing?: PressingStyle;
  defensiveLine?: DefensiveLine;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  players: Player[];

  formation: FormationDefinition;

  tactics: TeamTactics;
}