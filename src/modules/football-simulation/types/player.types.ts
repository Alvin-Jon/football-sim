import type { PlayerTrait } from "./player-traits.types.js";

export type PlayerPosition =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "DM"
  | "LAM"
  | "RAM"
  | "CM"
  | "AM"
  | "LW"
  | "RW"
  | "ST";

export type PlayerPersonality =
  | "AGGRESSIVE"
  | "ADVENTUROUS"
  | "CAUTIOUS"
  | "NORMAL";

export interface PlayerAttributes {
  // Physical
  pace: number;
  acceleration: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;

  // Technical
  passing: number;
  shooting: number;
  crossing: number;
  dribbling: number;
  ballControl: number;
  tackling: number;

  // Mental
  vision: number;
  decisions: number;
  positioning: number;
  anticipation: number;
  composure: number;
  aggression: number;
  teamwork: number;
  concentration: number;

  // Goalkeeping attributes
  reflexes: number;
  handling: number;
  oneOnOnes: number;
  aerialAbility: number;
  commandOfArea: number;
  communication: number;
}

export interface Player {
  id: string;
  name: string;

  position: PlayerPosition;
  personality: PlayerPersonality;

  attributes: PlayerAttributes;

  traits: PlayerTrait[];
}