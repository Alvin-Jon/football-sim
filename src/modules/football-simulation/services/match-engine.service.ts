import { PlayerMovementService } from "./player-movement.service.js";
import { PlayerStaminaService } from "./player-stamina.service.js";
import { MatchClockService } from "./match-clock.service.js";
import { MatchActionService } from "./match-action.service.js";
import { MatchStatisticsService } from "./match-statistics.service.js";

import type { MatchState } from "../types/match.types.js";

import type { Team } from "../types/team.types.js";

export class MatchEngineService {
  private readonly tickRate: number;
  private readonly matchActionService: MatchActionService;

  constructor(tickRate = 20, random: () => number = Math.random) {
    if (!Number.isFinite(tickRate) || tickRate <= 0) {
      throw new Error("Tick rate must be greater than zero");
    }

    this.tickRate = tickRate;
    this.matchActionService = new MatchActionService(random);
  }

  private getDeltaTime(): number {
    return 1 / this.tickRate;
  }

  start(match: MatchState): MatchState {
    if (match.status !== "NOT_STARTED") {
      throw new Error("Match has already started");
    }

    return {
      ...match,
      status: "IN_PROGRESS",
    };
  }

  private updateTeam(
    team: Team,
    playerStates: MatchState["homeTeamState"]["playerStates"],
    deltaTime: number,
    nearbyPlayerStates: readonly MatchState["homeTeamState"]["playerStates"][string][],
  ) {
    const updatedStates = { ...playerStates };

    for (const player of team.players) {
      const state = updatedStates[player.id];

      if (!state) continue;

      let updatedState = PlayerMovementService.updateMovement(
        player,
        state,
        deltaTime,
        nearbyPlayerStates,
      );

      updatedState = PlayerStaminaService.updateStamina(
        updatedState,
        deltaTime,
        player.attributes.stamina,
      );

      updatedStates[player.id] = updatedState;
    }

    return updatedStates;
  }

  finishFirstHalf(match: MatchState): MatchState {
  if (match.status !== "IN_PROGRESS" || match.clock.half !== 1) {
    throw new Error("Cannot finish the first half");
  }

  return {
    ...match,
    status: "HALF_TIME",
  };
}

startSecondHalf(match: MatchState): MatchState {
  if (match.status !== "HALF_TIME") {
    throw new Error("Match is not at half-time");
  }
  const recover = (states: MatchState["homeTeamState"]["playerStates"]) =>
    Object.fromEntries(
      Object.entries(states).map(([id, s]) => [id, PlayerStaminaService.applyHalfTimeRecovery(s)]),
    );

  return {
    ...match,

    status: "IN_PROGRESS",

    clock: MatchClockService.startSecondHalf(match.clock),

    homeDirection: "RIGHT_TO_LEFT",
    awayDirection: "LEFT_TO_RIGHT",
    homeTeamState: { ...match.homeTeamState, playerStates: recover(match.homeTeamState.playerStates) },
    awayTeamState: { ...match.awayTeamState, playerStates: recover(match.awayTeamState.playerStates) },
  };
}

finishMatch(match: MatchState): MatchState {
  if (match.status !== "IN_PROGRESS") {
    throw new Error("Match is not in progress");
  }

  return {
    ...match,
    status: "FINISHED",
  };
}

  tick(match: MatchState): MatchState {
    if (match.status !== "IN_PROGRESS") {
      throw new Error(
        "Cannot advance a match that is not in progress",
      );
    }

    const deltaTime = this.getDeltaTime();
    const homePlayerStates = this.updateTeam(
      match.homeTeam,
      match.homeTeamState.playerStates,
      deltaTime,
      Object.values(match.homeTeamState.playerStates),
    );

    const awayPlayerStates = this.updateTeam(
      match.awayTeam,
      match.awayTeamState.playerStates,
      deltaTime,
      Object.values(match.awayTeamState.playerStates),
    );

    const clock = MatchClockService.update(
      match.clock,
      deltaTime,
    );

    const updatedMatch: MatchState = {
      ...match,

      tick: match.tick + 1,

      clock,
      ball: {
        ...match.ball,
        position: { ...match.ball.position },
        velocity: { ...match.ball.velocity },
      },

      homeTeamState: {
        ...match.homeTeamState,
        playerStates: homePlayerStates,
      },

      awayTeamState: {
        ...match.awayTeamState,
        playerStates: awayPlayerStates,
      },
    };

    MatchStatisticsService.recordPossession(
      updatedMatch,
      deltaTime,
    );

    return this.matchActionService.update(updatedMatch, deltaTime);  }
}