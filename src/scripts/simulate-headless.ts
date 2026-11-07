import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";
import { PositionInfluenceService } from "../modules/football-simulation/services/position-influence.service.js";
import { MatchStatisticsService } from "../modules/football-simulation/services/match-statistics.service.js";
import { PASS_KINDS } from "../modules/football-simulation/types/statistics.types.js";
import type { PassKind } from "../modules/football-simulation/types/statistics.types.js";
import { BAYVIEW, MANFIELD } from "../db/teams/index.js";

const MATCHES = Number(process.argv[2] ?? 3);
const BASE_SEED = Number(process.argv[3] ?? 1);
const SWAP = process.argv[4] === "swap";

const TICK_RATE = 20;
const HALF_DURATION = 45 * 60;

type Match = ReturnType<typeof MatchInitializationService.initialize>;

// Small seeded random number generator so a run can be repeated exactly.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Totals {
  players: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  goals: number;
  tacklesAttempted: number;
  interceptions: number;
  kinds: Record<PassKind, { attempted: number; completed: number }>;
}

const emptyKinds = () => ({
  SHORT: { attempted: 0, completed: 0 },
  THROUGH: { attempted: 0, completed: 0 },
  LONG: { attempted: 0, completed: 0 },
  CROSS: { attempted: 0, completed: 0 },
});

const empty = (): Totals => ({
  players: 0,
  passesAttempted: 0,
  passesCompleted: 0,
  shots: 0,
  goals: 0,
  tacklesAttempted: 0,
  interceptions: 0,
  kinds: emptyKinds(),
});

const byRole = new Map<string, Totals>();
const matchRows: Record<string, number | string>[] = [];

function playMatch(index: number): Match {
  const engine = new MatchEngineService(
    TICK_RATE,
    mulberry32(BASE_SEED + index),
  );

  let match = MatchInitializationService.initialize(
    `headless-${index}`,
    SWAP ? MANFIELD : BAYVIEW,
    SWAP ? BAYVIEW : MANFIELD,
  );

  match = engine.start(match);

  while (match.clock.elapsedSeconds < HALF_DURATION) {
    match = engine.tick(match);
  }

  match = engine.finishFirstHalf(match);
  match = engine.startSecondHalf(match);

  while (match.clock.elapsedSeconds < HALF_DURATION * 2) {
    match = engine.tick(match);
  }

  return engine.finishMatch(match);
}

function collect(match: Match): void {
  for (const team of [match.homeTeam, match.awayTeam]) {
    for (const player of team.players) {
      if (player.position === "GK") continue;

      const stats = match.statistics.players[player.id];
      if (!stats) continue;

      const role = PositionInfluenceService.getRole(player.position);
      const totals = byRole.get(role) ?? empty();

      totals.players++;
      totals.passesAttempted += stats.passesAttempted;
      totals.passesCompleted += stats.passesCompleted;
      totals.shots += stats.shots;
      totals.goals += stats.goals;
      totals.tacklesAttempted += stats.tacklesAttempted;
      totals.interceptions += stats.interceptions;

      for (const kind of PASS_KINDS) {
        const typed = MatchStatisticsService.getPassTypeStats(stats, kind);
        totals.kinds[kind].attempted += typed.attempted;
        totals.kinds[kind].completed += typed.completed;
      }

      byRole.set(role, totals);
    }
  }
}

for (let index = 0; index < MATCHES; index++) {
  const started = performance.now();
  const match = playMatch(index);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  collect(match);

  const { home, away } = match.statistics;

  matchRows.push({
    match: index + 1,
    home: match.homeTeam.name,
    score: `${home.goals}-${away.goals}`,
    shots: `${home.shots}-${away.shots}`,
    onTarget: `${home.shotsOnTarget}-${away.shotsOnTarget}`,
    passes: `${home.passesAttempted}-${away.passesAttempted}`,
    accuracy:
      `${Math.round((home.passesCompleted / Math.max(1, home.passesAttempted)) * 100)}%-` +
      `${Math.round((away.passesCompleted / Math.max(1, away.passesAttempted)) * 100)}%`,
    tackles: `${home.tacklesAttempted}-${away.tacklesAttempted}`,
    saves: `${home.saves}-${away.saves}`,
    seconds,
  });

  console.log(`match ${index + 1}/${MATCHES} done in ${seconds}s`);
}

console.log("\nPER MATCH (home-away)");
console.table(matchRows);

console.log("\nPER PLAYER, AVERAGED OVER ALL MATCHES (by position)");
console.table(
  [...byRole.entries()].map(([role, t]) => ({
    role,
    players: t.players,
    "passes/player": Math.round(t.passesAttempted / t.players),
    "pass %": `${Math.round((t.passesCompleted / Math.max(1, t.passesAttempted)) * 100)}%`,
    "shots/player": (t.shots / t.players).toFixed(1),
    "goals/player": (t.goals / t.players).toFixed(2),
    "tackles/player": (t.tacklesAttempted / t.players).toFixed(1),
    "int/player": (t.interceptions / t.players).toFixed(1),
  })),
);

console.log("\nPASSES BY TYPE, PER PLAYER PER MATCH: attempts (completion %)");
console.table(
  [...byRole.entries()].map(([role, t]) => {
    const row: Record<string, string> = { role };

    for (const kind of PASS_KINDS) {
      const { attempted, completed } = t.kinds[kind];
      const percent = attempted === 0 ? 0 : Math.round((completed / attempted) * 100);

      row[kind] = `${(attempted / t.players).toFixed(1)} (${percent}%)`;
    }

    return row;
  }),
);