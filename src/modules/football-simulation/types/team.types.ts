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

export interface TeamTactics {
  style: TeamStyle;
  mentality: TeamMentality;
  formationFluidity: FormationFluidity;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  players: Player[];

  formation: FormationDefinition;

  tactics: TeamTactics;
}