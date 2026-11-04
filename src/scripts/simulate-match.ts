import assert from "node:assert/strict";
import { MatchStatisticsService } from "../modules/football-simulation/services/match-statistics.service.js";
import { FORMATION_433 } from "../modules/football-simulation/formations/4-3-3.formation.js";

import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";

import type { Player } from "../modules/football-simulation/types/player.types.js";
import type { Team } from "../modules/football-simulation/types/team.types.js";
import type { PlayerAttributes } from "../modules/football-simulation/types/player.types.js";

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

function generateTeam(
  id: string,
  name: string,
): Team {
  const players: Player[] = FORMATION_433.slots.map(
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
    formation: FORMATION_433,
    tactics: {
      style: "POSSESSION",
      mentality: "BALANCED",
      formationFluidity: "FLUID",
    },
  };
}

function runHalf(
  match: ReturnType<typeof MatchInitializationService.initialize>,
  half: 1 | 2,
) {
  const targetElapsedSeconds = half * HALF_DURATION;

  let lastHolder: string | null = null;

while (match.clock.elapsedSeconds < targetElapsedSeconds) {
  match = engine.tick(match);

  const holder = match.ball.possessionPlayerId;
  if (holder !== lastHolder) {
    console.log(
      `t=${match.tick} ${match.clock.minute}' holder ${lastHolder} -> ${holder} ` +
      `ball (${match.ball.position.x.toFixed(1)}, ${match.ball.position.y.toFixed(1)})`,
    );
    lastHolder = holder;
  }

  if (match.tick % (TICK_RATE * 60) === 0) {
    const states = [
      ...Object.values(match.homeTeamState.playerStates),
      ...Object.values(match.awayTeamState.playerStates),
    ];
    const avgStamina =
      states.reduce((sum, s) => sum + s.stamina, 0) / states.length;
    console.log(
      `min ${match.clock.minute} | avgStamina ${avgStamina.toFixed(1)} ` +
      `| moving ${states.filter((s) => s.isMoving).length} ` +
      `| ball speed ${Math.hypot(match.ball.velocity.x, match.ball.velocity.y).toFixed(2)}`,
    );
  }
}

  return match;
}

function logMatchState(
  match: ReturnType<typeof MatchInitializationService.initialize>,
) {
  const { home, away } = match.statistics;

  const possession =
    MatchStatisticsService.getPossessionPercentage(match);

  const passingAccuracy =
    MatchStatisticsService.getPassingAccuracy(match);

  console.log("\n========== MATCH STATISTICS ==========\n");

  console.table([
    {
      Statistic: "Goals",
      Home: home.goals,
      Away: away.goals,
    },
    {
      Statistic: "Possession",
      Home: `${possession.home}%`,
      Away: `${possession.away}%`,
    },
    {
      Statistic: "Passes Attempted",
      Home: home.passesAttempted,
      Away: away.passesAttempted,
    },
    {
      Statistic: "Passes Completed",
      Home: home.passesCompleted,
      Away: away.passesCompleted,
    },
    {
      Statistic: "Passing Accuracy",
      Home: `${passingAccuracy.home}%`,
      Away: `${passingAccuracy.away}%`,
    },
    {
      Statistic: "Shots",
      Home: home.shots,
      Away: away.shots,
    },
    {
      Statistic: "Shots on Target",
      Home: home.shotsOnTarget,
      Away: away.shotsOnTarget,
    },
    {
      Statistic: "Tackles Attempted",
      Home: home.tacklesAttempted,
      Away: away.tacklesAttempted,
    },
    {
      Statistic: "Tackles Won",
      Home: home.tacklesWon,
      Away: away.tacklesWon,
    },
    {
      Statistic: "Interceptions",
      Home: home.interceptions,
      Away: away.interceptions,
    },
    {
      Statistic: "Goalkeeper Saves",
      Home: home.saves,
      Away: away.saves,
    },
  ]);

  console.log("\n======================================\n");
}

async function simulateMatch() {
  console.log("Creating teams...");

  const homeTeam = generateTeam("home", "Home FC");
  const awayTeam = generateTeam("away", "Away FC");

  console.log("Initializing match...");

  let match = MatchInitializationService.initialize(
    "test-match-001",
    homeTeam,
    awayTeam,
  );

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

  console.log("Both teams initialized successfully.");

  console.log("Starting match...");

  match = engine.start(match);

  assert.equal(match.status, "IN_PROGRESS");

  console.log("First half started.");

  match = runHalf(match, 1);

  assert.equal(match.clock.minute, 45);
  assert.equal(match.clock.half, 1);

  logMatchState(match);

  console.log("Finishing first half...");

  match = engine.finishFirstHalf(match);

  assert.equal(match.status, "HALF_TIME");

  console.log("Half-time reached.");

  console.log("Starting second half...");

  match = engine.startSecondHalf(match);

  assert.equal(match.status, "IN_PROGRESS");
  assert.equal(match.clock.half, 2);

  assert.equal(match.homeDirection, "RIGHT_TO_LEFT");
  assert.equal(match.awayDirection, "LEFT_TO_RIGHT");

  console.log("Second half started.");

  match = runHalf(match, 2);

  assert.equal(match.clock.minute, 90);
  assert.equal(match.clock.half, 2);

  logMatchState(match);

  console.log("Finishing match...");

  match = engine.finishMatch(match);

  assert.equal(match.status, "FINISHED");

  console.log("\nMATCH SIMULATION COMPLETED SUCCESSFULLY");

  logMatchState(match);
}

simulateMatch().catch((error: unknown) => {
  console.error("Match simulation failed:", error);
  process.exitCode = 1;
});