import assert from "node:assert/strict";
import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";
import { MatchTUI } from "../tui/match-tui.js";
import { BAYVIEW, MANFIELD } from "../db/teams/index.js";
const TICK_RATE = 20;
const HALF_DURATION = 45 * 60;

const engine = new MatchEngineService(TICK_RATE);



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
    const homeTeam = BAYVIEW;
    const awayTeam = MANFIELD;

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
function generateTeam(arg0: string, arg1: string) {
  throw new Error("Function not implemented.");
}

