import assert from "node:assert/strict";

import { FORMATION_433, FORMATION_343, FORMATION_4231_CM, FORMATION_4231_DM  } from "../modules/football-simulation/formations/index.js";

import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";

import type { Player } from "../modules/football-simulation/types/player.types.js";
import type { Team } from "../modules/football-simulation/types/team.types.js";
import type { PlayerAttributes } from "../modules/football-simulation/types/player.types.js";

import { MatchTUI } from "../tui/match-tui.js";

const TICK_RATE = 20;
const HALF_DURATION = 45 * 60;

const engine = new MatchEngineService(TICK_RATE);

function generateAttributes(): PlayerAttributes {
  return {
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
  };
}

function generateTeam(id: string, name: string): Team {
  const players: Player[] = FORMATION_343.slots.map(
    (slot, index) => ({
      id: `${id}-player-${index + 1}`,
      name: `${name} Player ${index + 1}`,
      position: slot.position,
      personality: "NORMAL",
      attributes: generateAttributes(),
      traits: [],
    }),
  );

  return {
    id,
    name,
    players,
    formation: FORMATION_343,
    tactics: {
      style: "POSSESSION",
      mentality: "BALANCED",
      formationFluidity: "FLUID",
    },
  };
}

async function runHalf(
  match: ReturnType<typeof MatchInitializationService.initialize>,
  half: 1 | 2,
  tui: MatchTUI,
) {
  const targetElapsedSeconds = half * HALF_DURATION;

  while (match.clock.elapsedSeconds < targetElapsedSeconds) {
    match = engine.tick(match);

    // Update the terminal interface.
    tui.update(match);

    // Yield periodically so Blessed can process keyboard events.
    if (match.tick % 5 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  tui.update(match);

  return match;
}

async function simulateMatch() {
  const tui = new MatchTUI();

  try {
    // Generate teams.
    const homeTeam = generateTeam("home", "Home FC");
    const awayTeam = generateTeam("away", "Away FC");

    // Initialize match.
    let match = MatchInitializationService.initialize(
      "test-match-001",
      homeTeam,
      awayTeam,
    );

    // Validate teams.
    assert.equal(homeTeam.players.length, 11);
    assert.equal(awayTeam.players.length, 11);

    assert.equal(
      Object.keys(match.homeTeamState.playerStates).length,
      11,
    );

    assert.equal(
      Object.keys(match.awayTeamState.playerStates).length,
      11,
    );

    // Start match.
    match = engine.start(match);

    assert.equal(match.status, "IN_PROGRESS");

    // FIRST HALF
    match = await runHalf(match, 1, tui);

    assert.equal(match.clock.minute, 45);
    assert.equal(match.clock.half, 1);

    // HALF TIME
    match = engine.finishFirstHalf(match);

    assert.equal(match.status, "HALF_TIME");

    tui.update(match);

    // SECOND HALF
    match = engine.startSecondHalf(match);

    assert.equal(match.status, "IN_PROGRESS");
    assert.equal(match.clock.half, 2);

    assert.equal(match.homeDirection, "RIGHT_TO_LEFT");
    assert.equal(match.awayDirection, "LEFT_TO_RIGHT");

    match = await runHalf(match, 2, tui);

    assert.equal(match.clock.minute, 90);
    assert.equal(match.clock.half, 2);

    // FULL TIME
    match = engine.finishMatch(match);

    assert.equal(match.status, "FINISHED");

    // Display final match state.
    tui.update(match);

  } catch (error) {
    tui.destroy();
    throw error;
  }
}

simulateMatch().catch((error: unknown) => {
  console.error("Match simulation failed:", error);
  process.exitCode = 1;
});
