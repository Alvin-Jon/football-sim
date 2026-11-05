import type { Player } from "../../modules/football-simulation/types/player.types.js";

const Brain_Allen: Player = {
  id: "brain-allen",
  name: "Brain Allen",
  position: "DM",
  personality: "AGGRESSIVE",
  traits: [],
  attributes: {
    pace: 14,
    acceleration: 14,
    stamina: 16,
    strength: 13,
    agility: 14,
    jumping: 13,

    passing: 14,
    shooting: 13,
    crossing: 13,
    dribbling: 14,
    ballControl: 14,
    tackling: 13,

    vision: 14,
    decisions: 14,
    positioning: 14,
    anticipation: 14,
    composure: 14,
    aggression: 12,
    teamwork: 15,
    concentration: 14,

    reflexes: 12,
    handling: 12,
    oneOnOnes: 12,
    aerialAbility: 12,
    commandOfArea: 12,
    communication: 12,
  },
};

export const PLAYERS: Player[] = [Brain_Allen];