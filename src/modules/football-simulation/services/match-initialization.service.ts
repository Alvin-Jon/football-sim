import { PlayerService } from "./player.service.js";
import { PitchService } from "./pitch.service.js";
import { FormationCoordinatesService } from "./formation-coordinate.service.js";
import {
  createPlayerStatistics,
  createTeamStatistics,
} from "../types/statistics.types.js";
const { length, width } = PitchService.getDimensions();
import type { Team } from "../types/team.types.js";
import type { TeamMatchState } from "../types/team-state.types.js";

import type {
  MatchState,
  PlayingDirection,
} from "../types/match.types.js";

import type { Player } from "../types/player.types.js";

export class MatchInitializationService {
  private static validateTeam(team: Team): void {
    if (team.players.length !== 11) {
      throw new Error(
        `${team.name} must have exactly 11 players`,
      );
    }

    if (team.formation.slots.length !== 11) {
      throw new Error(
        `${team.name} formation must have exactly 11 slots`,
      );
    }

    if (!team.players.some((player) => player.id === team.tactics.setPieceTakerId)) {
      throw new Error(
        `${team.name} set-piece taker must be one of its players`,
      );
    }

    const cornerAttackersInBox = team.tactics.cornerAttackersInBox ?? 6;
    if (
      !Number.isInteger(cornerAttackersInBox) ||
      cornerAttackersInBox < 1 ||
      cornerAttackersInBox > 9
    ) {
      throw new Error(
        `${team.name} corner attackers in the box must be an integer from 1 to 9`,
      );
    }

    const playerIds = new Set(
      team.players.map((player) => player.id),
    );

    if (playerIds.size !== 11) {
      throw new Error(
        `${team.name} contains duplicate player IDs`,
      );
    }

    const slotIds = new Set(
      team.formation.slots.map((slot) => slot.id),
    );

    if (slotIds.size !== 11) {
      throw new Error(
        `${team.name} formation contains duplicate slot IDs`,
      );
    }

    const positions = team.formation.slots.map(
      (slot) => slot.position,
    );

    if (positions.filter((position) => position === "GK").length !== 1) {
      throw new Error(
        `${team.name} formation must have exactly one goalkeeper`,
      );
    }

    for (const player of team.players) {
      if (!Number.isInteger(player.attributes.pace) ||
          player.attributes.pace < 1 ||
          player.attributes.pace > 20) {
        throw new Error(
          `Invalid pace attribute for player ${player.name}`,
        );
      }
    }
  }

  private static createTeamState(
    team: Team,
    direction: PlayingDirection,
  ): TeamMatchState {
    const playerStates: TeamMatchState["playerStates"] = {};

    const availablePlayers = [...team.players];

    for (const slot of team.formation.slots) {
      const playerIndex = availablePlayers.findIndex(
        (player) => player.position === slot.position,
      );

      if (playerIndex === -1) {
        throw new Error(
          `${team.name} does not have a player for slot ${slot.id} (${slot.position})`,
        );
      }

      const [player] = availablePlayers.splice(playerIndex, 1);

      if(!player) {
        throw new Error(
          `Player for slot ${slot.id} (${slot.position}) not found in team ${team.name}`,
        );
      }

      const pitchPosition = FormationCoordinatesService.toPitch(
        slot.defensivePosition,
      );

      const position = PitchService.transformPosition(
        pitchPosition,
        direction,
      );

      playerStates[player.id] = PlayerService.createPlayerState(
        player,
        position,
      );
    }

    return {
      teamId: team.id,
      score: 0,
      playerStates,
      hasPossession: false,
    };
  }

  static initialize(
    id: string,
    homeTeam: Team,
    awayTeam: Team,
  ): MatchState {
    this.validateTeam(homeTeam);
    this.validateTeam(awayTeam);

    if (homeTeam.id === awayTeam.id) {
      throw new Error("A team cannot play against itself");
    }

    const homeDirection: PlayingDirection = "LEFT_TO_RIGHT";
    const awayDirection: PlayingDirection = "RIGHT_TO_LEFT";

    const statistics = {
        home: createTeamStatistics(),
        away: createTeamStatistics(),

        players: Object.fromEntries(
          [...homeTeam.players, ...awayTeam.players].map((player) => [
            player.id,
            createPlayerStatistics(),
          ]),
        ),
      };

    return {
      id,

      homeTeam,
      awayTeam,

      homeTeamState: this.createTeamState(
        homeTeam,
        homeDirection,
      ),

      awayTeamState: this.createTeamState(
        awayTeam,
        awayDirection,
      ),

      homeDirection,
      awayDirection,

      status: "NOT_STARTED",

      clock: {
        minute: 0,
        second: 0,
        elapsedSeconds: 0,
        half: 1,
      },

      tick: 0,

      ball: {
        position: {
            x: length / 2,
            y: width / 2,
        },  
        velocity: { x: 0, y: 0 },
        height: 0,
        verticalVelocity: 0,
        spin: 0,
        possessionTeamId: null,
        possessionPlayerId: null,
        lastTouchTeamId: null,
      },
      restart: null,
      events: [],
      statistics,
    };
  }
}