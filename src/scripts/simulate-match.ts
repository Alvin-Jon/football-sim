import assert from "node:assert/strict";
import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";
import { MatchTUI } from "../tui/match-tui.js";
import { BAYVIEW, MANFIELD } from "../db/teams/index.js";

type Match = ReturnType<typeof MatchInitializationService.initialize>;


const TICK_RATE = 20;
const HALF_DURATION = 45 * 60;

const FPS = 30;
const FRAME_MS = 1000 / FPS;

const SIM_BUDGET_MS = FRAME_MS * 0.8;

const engine = new MatchEngineService(TICK_RATE);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runHalf(
  match: Match,
  half: 1 | 2,
  tui: MatchTUI,
): Promise<Match> {
  const targetElapsedSeconds = half * HALF_DURATION;

  let carry = 0;
  let last = performance.now();

  while (match.clock.elapsedSeconds < targetElapsedSeconds) {
    const frameStart = performance.now();

    // Paused: do not advance the engine, just keep the UI alive.
    if (tui.isPaused()) {
      last = frameStart;
      tui.render();
      await sleep(50);
      continue;
    }

    // Clamp so a stall (terminal resize, debugger) does not cause a burst.
    const elapsedReal = Math.min((frameStart - last) / 1000, 0.25);
    last = frameStart;

    carry += elapsedReal * tui.getSpeed() * TICK_RATE;
    const wanted = Math.floor(carry);

    let done = 0;
    while (
      done < wanted &&
      match.clock.elapsedSeconds < targetElapsedSeconds
    ) {
      match = engine.tick(match);
      done++;

      // Stop simulating if this frame is taking too long.
      if ((done & 15) === 0 && performance.now() - frameStart > SIM_BUDGET_MS) {
        break;
      }
    }

    carry = done < wanted ? 0 : carry - done;

    // One cheap state update and one render per FRAME, not per tick.
    tui.update(match);
    tui.render();

    await sleep(Math.max(0, FRAME_MS - (performance.now() - frameStart)));
  }

  return match;
}

async function simulateMatch() {
  const tui = new MatchTUI();

  try {
    const homeTeam = BAYVIEW;
    const awayTeam = MANFIELD;

    let match = MatchInitializationService.initialize(
      "test-match-001",
      homeTeam,
      awayTeam,
    );

    assert.equal(homeTeam.players.length, 11);
    assert.equal(awayTeam.players.length, 11);

    assert.equal(Object.keys(match.homeTeamState.playerStates).length, 11);
    assert.equal(Object.keys(match.awayTeamState.playerStates).length, 11);

    match = engine.start(match);
    assert.equal(match.status, "IN_PROGRESS");

    tui.update(match);
    tui.render();

    // FIRST HALF
    match = await runHalf(match, 1, tui);

    assert.equal(match.clock.minute, 45);
    assert.equal(match.clock.half, 1);

    // HALF TIME
    match = engine.finishFirstHalf(match);
    assert.equal(match.status, "HALF_TIME");

    tui.update(match);
    tui.render();

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

    tui.update(match);
    tui.render();
  } catch (error) {
    tui.destroy();
    throw error;
  }
}

simulateMatch().catch((error: unknown) => {
  console.error("Match simulation failed:", error);
  process.exitCode = 1;
});