import { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { MatchEngineService } from "../modules/football-simulation/services/match-engine.service.js";
import { PositionInfluenceService } from "../modules/football-simulation/services/position-influence.service.js";
import { MatchStatisticsService } from "../modules/football-simulation/services/match-statistics.service.js";
import {
  DUEL_KINDS,
  PASS_FAILURE_REASONS,
  PASS_KINDS,
  KEEPER_SHOT_OUTCOMES,
  PREDICTION_BUCKETS,
} from "../modules/football-simulation/types/statistics.types.js";
import type {
  CarrierDuelStats,
  DuelKind,
  DuelBreakdown,
  PassFailureReason,
  PassKind,
} from "../modules/football-simulation/types/statistics.types.js";
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
  tacklesWon: number;
  tacklesLoose: number;
  tacklesBeaten: number;
  interceptions: number;
  kinds: Record<PassKind, { attempted: number; completed: number }>;
  duels: Record<DuelKind, CarrierDuelStats>;
}

const emptyKinds = () => ({
  SHORT: { attempted: 0, completed: 0 },
  THROUGH: { attempted: 0, completed: 0 },
  LONG: { attempted: 0, completed: 0 },
  CROSS: { attempted: 0, completed: 0 },
});

const emptyDuels = (): Record<DuelKind, CarrierDuelStats> => ({
  TAKE_ON: { faced: 0, kept: 0, dispossessed: 0, loose: 0 },
  SHIELD: { faced: 0, kept: 0, dispossessed: 0, loose: 0 },
});

const empty = (): Totals => ({
  players: 0,
  passesAttempted: 0,
  passesCompleted: 0,
  shots: 0,
  goals: 0,
  tacklesAttempted: 0,
  tacklesWon: 0,
  tacklesLoose: 0,
  tacklesBeaten: 0,
  interceptions: 0,
  kinds: emptyKinds(),
  duels: emptyDuels(),
});

const pct = (part: number, whole: number): string =>
  whole === 0 ? "-" : `${Math.round((part / whole) * 100)}%`;

const sumDuels = (breakdown: DuelBreakdown): CarrierDuelStats => {
  const total = { faced: 0, kept: 0, dispossessed: 0, loose: 0 };
  for (const kind of DUEL_KINDS) {
    total.faced += breakdown[kind].faced;
    total.kept += breakdown[kind].kept;
    total.dispossessed += breakdown[kind].dispossessed;
    total.loose += breakdown[kind].loose;
  }
  return total;
};

const byRole = new Map<string, Totals>();
const matchRows: Record<string, number | string>[] = [];

// Whole-run totals (every outfield player, both teams).
const overall = empty();

// Team-level pass mix and failure causes (keeper passes included).
interface PassMixEntry {
  attempted: number;
  completed: number;
  failures: Record<PassFailureReason, number>;
}

const passMix = Object.fromEntries(
  PASS_KINDS.map((kind) => [
    kind,
    {
      attempted: 0,
      completed: 0,
      failures: Object.fromEntries(
        PASS_FAILURE_REASONS.map((reason) => [reason, 0]),
      ),
    },
  ]),
) as Record<PassKind, PassMixEntry>;

// What keepers did with shots that ended as a save or a goal.
const keeperTotals = Object.fromEntries(
  KEEPER_SHOT_OUTCOMES.map((outcome) => [outcome, 0]),
) as Record<(typeof KEEPER_SHOT_OUTCOMES)[number], number>;
let keeperRolls = 0;
let keeperRollChanceSum = 0;

function collectKeeper(match: Match): void {
  for (const team of [match.statistics.home, match.statistics.away]) {
    for (const outcome of KEEPER_SHOT_OUTCOMES) {
      keeperTotals[outcome] += team.keeperShots[outcome];
    }
    keeperRolls += team.saveRolls;
    keeperRollChanceSum += team.saveRollChanceSum;
  }
}

// Predicted vs actual completion, bucketed by predicted probability.
const calibration = Object.fromEntries(
  PREDICTION_BUCKETS.map((bucket) => [
    bucket,
    {
      attempted: 0,
      completed: 0,
      predictedSum: 0,
      failures: Object.fromEntries(
        PASS_FAILURE_REASONS.map((reason) => [reason, 0]),
      ),
    },
  ]),
) as Record<
  (typeof PREDICTION_BUCKETS)[number],
  {
    attempted: number;
    completed: number;
    predictedSum: number;
    failures: Record<PassFailureReason, number>;
  }
>;

function collectPassMix(match: Match): void {
  for (const team of [match.statistics.home, match.statistics.away]) {
    for (const bucket of PREDICTION_BUCKETS) {
      calibration[bucket].attempted += team.passCalibration[bucket].attempted;
      calibration[bucket].completed += team.passCalibration[bucket].completed;
      calibration[bucket].predictedSum +=
        team.passCalibration[bucket].predictedSum;

      for (const reason of PASS_FAILURE_REASONS) {
        calibration[bucket].failures[reason] +=
          team.passCalibration[bucket].failures[reason];
      }
    }

    for (const kind of PASS_KINDS) {
      const entry = passMix[kind];
      entry.attempted += team.passBreakdown[kind].attempted;
      entry.completed += team.passBreakdown[kind].completed;

      for (const reason of PASS_FAILURE_REASONS) {
        entry.failures[reason] += team.passFailures[kind][reason];
      }
    }
  }
}

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

function add(totals: Totals, stats: Match["statistics"]["players"][string]): void {
  totals.players++;
  totals.passesAttempted += stats.passesAttempted;
  totals.passesCompleted += stats.passesCompleted;
  totals.shots += stats.shots;
  totals.goals += stats.goals;
  totals.tacklesAttempted += stats.tacklesAttempted;
  totals.tacklesWon += stats.tacklesWon;
  totals.tacklesLoose += stats.tacklesLoose;
  totals.tacklesBeaten += stats.tacklesBeaten;
  totals.interceptions += stats.interceptions;

  for (const kind of PASS_KINDS) {
    const typed = MatchStatisticsService.getPassTypeStats(stats, kind);
    totals.kinds[kind].attempted += typed.attempted;
    totals.kinds[kind].completed += typed.completed;
  }

  for (const kind of DUEL_KINDS) {
    const duel = stats.duelBreakdown[kind];
    totals.duels[kind].faced += duel.faced;
    totals.duels[kind].kept += duel.kept;
    totals.duels[kind].dispossessed += duel.dispossessed;
    totals.duels[kind].loose += duel.loose;
  }
}

function collect(match: Match): void {
  for (const team of [match.homeTeam, match.awayTeam]) {
    for (const player of team.players) {
      if (player.position === "GK") continue;

      const stats = match.statistics.players[player.id];
      if (!stats) continue;

      const role = PositionInfluenceService.getRole(player.position);
      const totals = byRole.get(role) ?? empty();

      add(totals, stats);
      add(overall, stats);

      byRole.set(role, totals);
    }
  }
}

for (let index = 0; index < MATCHES; index++) {
  const started = performance.now();
  const match = playMatch(index);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  collect(match);
  collectPassMix(match);
  collectKeeper(match);

  const { home, away } = match.statistics;
  const homeDuels = sumDuels(home.duelBreakdown);
  const awayDuels = sumDuels(away.duelBreakdown);

  matchRows.push({
    match: index + 1,
    home: match.homeTeam.name,
    score: `${home.goals}-${away.goals}`,
    shots: `${home.shots}-${away.shots}`,
    onTarget: `${home.shotsOnTarget}-${away.shotsOnTarget}`,
    passes: `${home.passesAttempted}-${away.passesAttempted}`,
    accuracy: `${pct(home.passesCompleted, home.passesAttempted)}-${pct(away.passesCompleted, away.passesAttempted)}`,
    // Interceptions are credited to the DEFENDING team.
    interceptions: `${home.interceptions}-${away.interceptions}`,
    // Tackles made by each team.
    tackles: `${home.tacklesAttempted}-${away.tacklesAttempted}`,
    // Duels each team's carriers faced, and how many they kept.
    dribblesKept: `${homeDuels.kept}/${homeDuels.faced}-${awayDuels.kept}/${awayDuels.faced}`,
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
    "pass %": pct(t.passesCompleted, t.passesAttempted),
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
      row[kind] = `${(attempted / t.players).toFixed(1)} (${pct(completed, attempted)})`;
    }

    return row;
  }),
);

console.log("\nINTERCEPTIONS vs PASSING");
{
  const attempted = overall.passesAttempted;
  console.table([
    {
      "passes attempted": attempted,
      "completed %": pct(overall.passesCompleted, attempted),
      interceptions: overall.interceptions,
      "interceptions per 100 passes": attempted
        ? ((overall.interceptions / attempted) * 100).toFixed(1)
        : "-",
    },
  ]);
}

console.log(
  "\nTACKLES BY DEFENDER ROLE: per player per match, outcome split\n" +
    "(won = clean win, loose = ball knocked free, beaten = dribbler got past)",
);
console.table(
  [
    ...[...byRole.entries()].map(([role, t]) => [role, t] as const),
    ["ALL", overall] as const,
  ].map(([role, t]) => ({
    role,
    "tackles/player": (t.tacklesAttempted / Math.max(1, t.players)).toFixed(1),
    "won %": pct(t.tacklesWon, t.tacklesAttempted),
    "loose %": pct(t.tacklesLoose, t.tacklesAttempted),
    "beaten %": pct(t.tacklesBeaten, t.tacklesAttempted),
  })),
);

console.log(
  "\nDRIBBLE DUELS, SEEN FROM THE CARRIER: faced per player per match,\n" +
    "kept = beat the tackler, lost = clean dispossession, loose = ball knocked free",
);
console.table(
  [
    ...[...byRole.entries()].map(([role, t]) => [role, t] as const),
    ["ALL", overall] as const,
  ].flatMap(([role, t]) =>
    DUEL_KINDS.map((kind) => {
      const d = t.duels[kind];
      return {
        role,
        mode: kind,
        "faced/player": (d.faced / Math.max(1, t.players)).toFixed(2),
        "kept %": pct(d.kept, d.faced),
        "lost %": pct(d.dispossessed, d.faced),
        "loose %": pct(d.loose, d.faced),
      };
    }),
  ),
);

console.log(
  "\nPASS MIX AND WHY PASSES FAIL (all passes incl. keepers)\n" +
    "share = of all attempts; failure columns = % of that type's attempts;\n" +
    "unresolved = replaced by another pass before anyone controlled it",
);
{
  const totalAttempts = PASS_KINDS.reduce(
    (sum, kind) => sum + passMix[kind].attempted,
    0,
  );

  console.table(
    PASS_KINDS.map((kind) => {
      const entry = passMix[kind];
      const failed = PASS_FAILURE_REASONS.reduce(
        (sum, reason) => sum + entry.failures[reason],
        0,
      );

      return {
        kind,
        attempts: entry.attempted,
        share: pct(entry.attempted, totalAttempts),
        "completed %": pct(entry.completed, entry.attempted),
        "in lane %": pct(entry.failures.IN_LANE, entry.attempted),
        "at receiver %": pct(entry.failures.WON_AT_RECEIVER, entry.attempted),
        "miscontrol %": pct(entry.failures.RECEIVER_MISCONTROL, entry.attempted),
        "untargeted %": pct(entry.failures.UNTARGETED, entry.attempted),
        "recollected %": pct(entry.failures.RECOLLECTED, entry.attempted),
        "out of play %": pct(entry.failures.OUT_OF_PLAY, entry.attempted),
        "unresolved %": pct(
          Math.max(0, entry.attempted - entry.completed - failed),
          entry.attempted,
        ),
      };
    }),
  );
}

console.log(
  "\nCALIBRATION: evaluator's predicted completion vs what happened\n" +
    "(open-play short/through/long passes only; gap = actual - predicted,\n" +
    "negative = the evaluator is too optimistic; failure columns are % of the\n" +
    "bucket's attempts, so completed + failures add up to about 100%)",
);
console.table(
  PREDICTION_BUCKETS.map((bucket) => {
    const c = calibration[bucket];
    const predicted = c.attempted === 0 ? null : c.predictedSum / c.attempted;
    const actual = c.attempted === 0 ? null : c.completed / c.attempted;

    return {
      "predicted bucket": bucket,
      attempts: c.attempted,
      "avg predicted": predicted === null ? "-" : `${Math.round(predicted * 100)}%`,
      actual: actual === null ? "-" : `${Math.round(actual * 100)}%`,
      gap:
        predicted === null || actual === null
          ? "-"
          : `${Math.round((actual - predicted) * 100)} pts`,
      "in lane": pct(c.failures.IN_LANE, c.attempted),
      "at receiver": pct(c.failures.WON_AT_RECEIVER, c.attempted),
      miscontrol: pct(c.failures.RECEIVER_MISCONTROL, c.attempted),
      recollected: pct(c.failures.RECOLLECTED, c.attempted),
      "out of play": pct(c.failures.OUT_OF_PLAY, c.attempted),
    };
  }),
);

{
  const total = KEEPER_SHOT_OUTCOMES.reduce(
    (sum, outcome) => sum + keeperTotals[outcome],
    0,
  );

  console.log(
    "\nKEEPERS: what happened to shots that ended as a save or a goal\n" +
      "(NO_ATTEMPT = never moved for it, NO_REACH = sent diving but too far,\n" +
      "ROLL_FAILED = in reach but the save roll failed, NO_CONTACT = roll\n" +
      "succeeded but he never reached the ball, UNPREDICTED = not seen as on target)",
  );
  console.table(
    KEEPER_SHOT_OUTCOMES.map((outcome) => ({
      outcome,
      count: keeperTotals[outcome],
      share: pct(keeperTotals[outcome], total),
    })),
  );
  console.log(
    `save rolls: ${keeperRolls}, average save chance on those rolls: ` +
      `${keeperRolls === 0 ? "-" : Math.round((keeperRollChanceSum / keeperRolls) * 100) + "%"}`,
  );
}