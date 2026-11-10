import type {
  DecisionContext,
  DecisionPlayer,
  DecisionResult,
} from "../types/decision.types.js";
import type { Vector2D } from "../types/pitch.types.js";
import type { FormationSlot } from "../types/formation.types.js";
import type {
  GoalkeeperContext,
  GoalkeeperSaveType,
} from "../types/goalkeeper.types.js";
import type {
  MatchState,
  PlayingDirection,
  SetPieceRestart,
} from "../types/match.types.js";
import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { Team } from "../types/team.types.js";
import type { TeamMatchState } from "../types/team-state.types.js";
import { debugLog } from "../utils/debug-log.js";
import { calculatePressure } from "../utils/pressure.utils.js";
import { DUEL_CONSTANTS } from "../constants/duel.constants.js";
import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { ActionEngineService } from "./action-engine.service.js";
import { BallInteractionService } from "./ball-interaction.service.js";
import { BallPhysicsService } from "./ball-physics.service.js";
import { BallTrajectoryService } from "./ball-trajectory.service.js";
import { DecisionEngineService } from "./decision-engine.service.js";
import { DecisionPositionService } from "./decision-position.service.js";
import { GoalkeeperActionService } from "./goalkeeper-action.service.js";
import { GoalkeeperDecisionService } from "./goalkeeper-decision.service.js";
import { GoalkeeperDistributionService } from "./goalkeeper-distribution.service.js";
import { GoalkeeperPositioningService } from "./goalkeeper-positioning.service.js";
import { GoalkeeperPredictionService } from "./goalkeeper-prediction.service.js";
import type { PredictedShot } from "./goalkeeper-prediction.service.js";
import { GoalkeeperSaveExecutionService } from "./goalkeeper-save-execution.service.js";
import { GoalkeeperSaveService } from "./goalkeeper-save.service.js";
import { InterceptionService } from "./interception.service.js";
import { PassingService } from "./passing.service.js";
import { PitchService } from "./pitch.service.js";
import { ReceivingService } from "./receiving.service.js";
import { ShootingService } from "./shooting.service.js";
import { MatchStatisticsService } from "./match-statistics.service.js";
import type { PassKind } from "../types/statistics.types.js";
import { FormationPositioningService } from "./formation-positioning.service.js";
import { TacticsService } from "./tactics.service.js";
import { TackleDuelService } from "./tackle-duel.service.js";
import type { DuelOutcome } from "./tackle-duel.service.js";


interface PendingPass {
  passerId: string;
  receiverId: string | null;
  teamId: string;
  tick: number;
  kind: PassKind;
  miscontrolledPlayerIds: Set<string>;
}

interface PendingShot {
  assistPlayerId: string | null;
  shooterId: string;
  teamId: string;
  tick: number;
}

interface LastCompletedPass {
  passerId: string;
  receiverId: string;
  teamId: string;
  tick: number;
}

interface PlannedAction {
  team: Team;
  teamState: TeamMatchState;
  player: Player;
  state: PlayerMatchState;
  context: DecisionContext;
  decision: DecisionResult;
}

const ON_BALL_ACTIONS: ReadonlyArray<DecisionResult["action"]> = [
  "PASS",
  "THROUGH_BALL",
  "LONG_BALL",
  "CROSS",
  "SHOOT",
  "DRIBBLE",
  "HOLD_BALL",
];

export class MatchActionService {
  private static readonly RELEASE_LOCKOUT_TICKS = 10;
  private static readonly TACKLE_COOLDOWN_TICKS = 60;
  private static readonly POSSESSION_SHIELD_TICKS = 20;
  private static readonly MIN_HOLD_TICKS = 60;
  private static readonly PRESSURE_HOLD_TICKS = 10;
  private static readonly MIN_HOLD_FLOOR_TICKS = 6;
  private static readonly SHOT_ERROR_BASE = 0.3;
  private static readonly SHOT_ERROR_PER_METRE = 0.015;
  private static readonly SHOT_ERROR_UNSKILLED = 0.2;
  private static readonly SHOT_ERROR_PRESSURE = 0.12;
  private static readonly SHOT_ERROR_LIMIT = 1.0;

  private static readonly PASS_GRACE_TICKS = 6;
  private static readonly PASS_GRACE_RADIUS = 3;

  private static readonly ASSIST_WINDOW_TICKS = 200;
  private static readonly SHOT_WINDOW_TICKS = 200;
  private static readonly ALLOW_NON_SHOT_GOALS = false;

  private readonly random: () => number;
  private readonly decisionEngine = new DecisionEngineService();
  private readonly actionEngine = new ActionEngineService();
  private readonly ballInteraction = new BallInteractionService();
  private readonly ballPhysics = new BallPhysicsService();
  private readonly trajectory = new BallTrajectoryService(this.ballPhysics);
  private readonly passing: PassingService;
  private readonly receiving: ReceivingService;
  private readonly shooting: ShootingService;
  private readonly interception: InterceptionService;
  private readonly goalkeeperPositioning = new GoalkeeperPositioningService();
  private readonly goalkeeperPrediction = new GoalkeeperPredictionService(
    this.trajectory,
  );
  private readonly goalkeeperDecision = new GoalkeeperDecisionService(
    this.goalkeeperPositioning,
    this.goalkeeperPrediction,
  );
  private readonly goalkeeperAction = new GoalkeeperActionService();
  private readonly goalkeeperDistribution = new GoalkeeperDistributionService();

  private readonly goalkeeperSave: GoalkeeperSaveService;
  private readonly tackleDuel: TackleDuelService;
  private readonly goalkeeperSaveExecution = new GoalkeeperSaveExecutionService(
    this.ballInteraction,
  );
  private readonly pendingPasses = new Map<string, PendingPass>();
  private readonly pendingShots = new Map<string, PendingShot>();
  private readonly releaseLockouts = new Map<string, number>();
  private readonly tackleCooldowns = new Map<string, number>();
  private readonly possessionShields = new Map<string, number>();
  private readonly possessionStarts = new Map<string, number>();
  private lastHolderId: string | null = null;
  private readonly positionService = new DecisionPositionService();
  private readonly lastCompletedPasses = new Map<string, LastCompletedPass>();

  // One save roll per shot, remembered per goalkeeper.
  private readonly saveRolls = new Map<
    string,
    { key: string; successful: boolean }
  >();

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.passing = new PassingService(this.ballInteraction, random);
    this.receiving = new ReceivingService(this.ballInteraction, random);
    this.shooting = new ShootingService(this.ballInteraction, random);
    this.goalkeeperSave = new GoalkeeperSaveService(random);
    this.tackleDuel = new TackleDuelService(random);
    this.interception = new InterceptionService(
      this.ballInteraction,
      this.trajectory,
      random,
    );
  }

  update(match: MatchState, deltaTime: number): MatchState {
    if (match.restart) {
      this.positionPlayersForRestart(match, match.restart);
      if (this.isRestartSetupComplete(match, match.restart)) {
        this.takeRestart(match);
      }
      this.updatePossessionFlags(match);
      return match;
    }

    this.updateControlledBall(match);

    const previousBallPosition = { ...match.ball.position };
    const previousBallHeight = match.ball.height;

    this.ballPhysics.update(match.ball, deltaTime);

    // Goalkeepers run in a random order so neither side always goes first.
    const keepers: Array<() => void> = [
      () =>
        this.updateGoalkeeper(
          match,
          match.homeTeam,
          match.homeTeamState,
          match.awayTeam,
          match.awayTeamState,
          match.homeDirection,
        ),
      () =>
        this.updateGoalkeeper(
          match,
          match.awayTeam,
          match.awayTeamState,
          match.homeTeam,
          match.homeTeamState,
          match.awayDirection,
        ),
    ];
    this.shuffle(keepers);
    for (const run of keepers) run();

    this.receiveFreeBall(match);

    const planned: PlannedAction[] = [
      ...this.planOutfieldActions(
        match,
        match.homeTeam,
        match.homeTeamState,
        match.awayTeam,
        match.awayTeamState,
        match.homeDirection,
      ),
      ...this.planOutfieldActions(
        match,
        match.awayTeam,
        match.awayTeamState,
        match.homeTeam,
        match.homeTeamState,
        match.awayDirection,
      ),
    ];

    this.shuffle(planned);
    for (const action of planned) {
      this.executeDecision(
        match,
        action.team,
        action.teamState,
        action.player,
        action.state,
        action.context,
        action.decision,
      );
    }

    this.resolvePitchBoundary(
      match,
      previousBallPosition,
      previousBallHeight,
    );

    this.updatePossessionFlags(match);
    this.trackPossessionChange(match);

    return match;
  }

  // Fisher-Yates shuffle using the seeded random, so runs stay reproducible.
  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
  }

  private lockOut(match: MatchState, playerId: string): void {
    this.releaseLockouts.set(
      playerId,
      match.tick + MatchActionService.RELEASE_LOCKOUT_TICKS,
    );
  }

  private isLockedOut(match: MatchState, playerId: string): boolean {
    return (this.releaseLockouts.get(playerId) ?? 0) > match.tick;
  }

  private grantPossessionShield(match: MatchState, playerId: string): void {
    this.possessionStarts.set(playerId, match.tick);
    this.possessionShields.set(
      playerId,
      match.tick + MatchActionService.POSSESSION_SHIELD_TICKS,
    );
  }

  // True if the carrier has not held the ball long enough to release it yet.
  private mustKeepBall(
    match: MatchState,
    playerId: string,
    context: DecisionContext,
  ): boolean {
    const started = this.possessionStarts.get(playerId);
    if (started === undefined) return false;

    return match.tick - started < this.getHoldTicks(context);
  }

  private getHoldTicks(context: DecisionContext): number {
    const pressure = calculatePressure(
      context.player.state.position,
      context.opponents,
    );

    const relaxed = TacticsService.scaleHoldTicks(
      MatchActionService.MIN_HOLD_TICKS,
      context.tactics,
    );

    const blended =
      relaxed * (1 - pressure) +
      MatchActionService.PRESSURE_HOLD_TICKS * pressure;
    const calm =
      0.85 + (0.3 * context.player.player.attributes.composure) / 20;

    return Math.max(
      MatchActionService.MIN_HOLD_FLOOR_TICKS,
      Math.round(blended * calm),
    );
  }

  // Carry the ball forward a few metres while waiting to release it.
  private carryBall(
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
  ): void {
    this.cancelRunningAction(player.id, state);
    state.targetPosition = PitchService.clampPosition(
      this.positionService.getForwardPosition(
        state.position,
        3,
        context.attackingDirection,
      ),
    );
    state.isMoving = true;
    state.currentAction = "DRIBBLING";
  }

  // True while a pass by the OTHER team has only just left the passer, so
  // this team's players cannot yet collect it.
  private isPassProtected(match: MatchState, teamId: string): boolean {
    const pending = this.pendingPasses.get(match.id);

    if (!pending || pending.teamId === teamId) return false;

    if (match.tick - pending.tick >= MatchActionService.PASS_GRACE_TICKS) {
      return false;
    }

    const passer = this.findPlayer(match, pending.passerId);
    if (!passer) return false;

    return (
      PitchService.getDistance(passer.state.position, match.ball.position) <
      MatchActionService.PASS_GRACE_RADIUS
    );
  }

  private isShielded(match: MatchState, playerId: string): boolean {
    return (this.possessionShields.get(playerId) ?? 0) > match.tick;
  }


  private trackPossessionChange(match: MatchState): void {
    const holder = match.ball.possessionPlayerId;

    if (holder !== this.lastHolderId) {
      if (holder !== null) {
        const lastPass = this.lastCompletedPasses.get(match.id);
        const holderTeamId = this.getPlayerTeamId(match, holder);

        // Preserve the pass only if this is the receiver who completed it.
        const isExpectedReceiver =
          lastPass?.receiverId === holder &&
          lastPass.teamId === holderTeamId;

        if (!isExpectedReceiver) {
          this.lastCompletedPasses.delete(match.id);
        }

        // Someone controlling the ball means the shot is over (saved,
        // blocked or rebounded), so it can no longer score.
        this.pendingShots.delete(match.id);

        this.grantPossessionShield(match, holder);
      }

      this.lastHolderId = holder;
    }
  }

  private updateControlledBall(match: MatchState): void {
    const playerId = match.ball.possessionPlayerId;
    if (!playerId) return;

    const player = this.findPlayer(match, playerId);
    if (!player) {
      match.ball.possessionPlayerId = null;
      match.ball.possessionTeamId = null;
      return;
    }

    this.ballInteraction.updateControlledBall(player.state, match.ball);
    this.resolvePendingPass(match, playerId);
  }


  // this in testing didn't like the result so using shuffle for now 
  private reactionPriority(player: Player): number {
  const a = player.attributes;
  const base =
    a.anticipation * 0.35 +
    a.decisions * 0.25 +
    a.composure * 0.2 +
    a.concentration * 0.2; 
  return base + (this.random() - 0.5) * 12;
}

  private getPlayerTeamId(
    match: MatchState,
    playerId: string,
  ): string {
    if (match.homeTeam.players.some((player) => player.id === playerId)) {
      return match.homeTeam.id;
    }

    return match.awayTeam.id;
  }

  private receiveFreeBall(match: MatchState): void {
    if (match.ball.possessionPlayerId !== null) return;

    const candidates = [
      ...this.getDecisionPlayers(match.homeTeam, match.homeTeamState),
      ...this.getDecisionPlayers(match.awayTeam, match.awayTeamState),
    ].filter(
      ({ player }) =>
        !this.isLockedOut(match, player.id) &&
        !this.isPassProtected(match, this.getPlayerTeamId(match, player.id)),
    );

    // Evaluate the closest players first, regardless of team.
    candidates.sort(
      (a, b) =>
        PitchService.getDistance(a.state.position, match.ball.position) -
        PitchService.getDistance(b.state.position, match.ball.position),
    );

    const chasers = new Set<string>();
    for (const team of [match.homeTeam, match.awayTeam]) {
      const count = TacticsService.resolve(team.tactics).pressChasers;

      candidates
        .filter(({ player }) => this.getPlayerTeamId(match, player.id) === team.id)
        .slice(0, count)
        .forEach(({ player }) => chasers.add(player.id));
    }
    const pendingPass = this.pendingPasses.get(match.id);
    if (pendingPass?.receiverId) chasers.add(pendingPass.receiverId);

    for (const { player, state } of candidates) {
      if (match.ball.possessionPlayerId !== null) return;

      const receiveResult = this.receiving.attemptReceive(
        player,
        state,
        this.getPlayerTeamId(match, player.id),
        match.ball,
        chasers.has(player.id),
      );

      if (receiveResult.outcome === "MISCONTROLLED") {
        const pending = this.pendingPasses.get(match.id);
        if (pending && !pending.miscontrolledPlayerIds.has(player.id)) {
          pending.miscontrolledPlayerIds.add(player.id);
          debugLog(
            `[pass] receiver_miscontrol match=${match.id} tick=${match.tick} kind=${pending.kind} passer=${this.findPlayer(match, pending.passerId)?.player.name ?? pending.passerId} intendedReceiver=${pending.receiverId ? this.findPlayer(match, pending.receiverId)?.player.name ?? pending.receiverId : "unspecified"} player=${player.name} controlChance=${receiveResult.controlChance.toFixed(2)} distance=${receiveResult.distanceToBall.toFixed(2)}m ballSpeed=${Math.hypot(match.ball.velocity.x, match.ball.velocity.y).toFixed(2)}`,
          );
        }
      }

      if (match.ball.possessionPlayerId === player.id) {
        this.resolvePendingPass(match, player.id);
      }
    }
  }

  private updateGoalkeeper(
    match: MatchState,
    team: Team,
    teamState: TeamMatchState,
    opponents: Team,
    opponentState: TeamMatchState,
    direction: PlayingDirection,
  ): void {
    const goalkeeper = team.players.find((player) => player.position === "GK");
    if (!goalkeeper) return;

    const state = teamState.playerStates[goalkeeper.id];
    if (!state) return;

    const context = this.createGoalkeeperContext(
      match,
      goalkeeper,
      state,
      team,
      teamState,
      opponents,
      opponentState,
      direction,
    );
    const decision = this.goalkeeperDecision.decide(context);
    this.goalkeeperAction.execute(state, decision);

    if (decision.action === "DISTRIBUTE") {
      this.distributeGoalkeeperBall(
        match,
        goalkeeper,
        state,
        team,
        teamState,
        context,
      );
      return;
    }

    if (decision.action === "CLAIM_CROSS") {
      // A keeper who just released the ball must not re-claim it instantly.
      if (this.isLockedOut(match, goalkeeper.id)) return;

      if (this.goalkeeperAction.hasReachedTarget(state)) {
        const controlled = this.ballInteraction.tryControl(
          goalkeeper,
          state,
          team.id,
          match.ball,
        );
        if (!controlled && this.isWithinSaveContact(state, match)) {
          const saved = this.goalkeeperSaveExecution.execute(
            context,
            state,
            match.ball,
            "PUNCH",
          );

          if (saved) {
            this.recordGoalkeeperSave(match, team.id, goalkeeper.id);
          }
        }
      }
      return;
    }

    if (!decision.saveType) return;

    const predictedShot = this.goalkeeperPrediction.predictShot(
      context,
      match.ball,
    );

    if (predictedShot?.isOnTarget) {
      if (
        !this.rollShotSave(
          match,
          goalkeeper.id,
          context,
          predictedShot,
          decision.saveType,
        )
      ) {
        return;
      }
    } else if (decision.saveType !== "PUNCH") {
      return;
    }

    const saved = this.goalkeeperSaveExecution.execute(
      context,
      state,
      match.ball,
      decision.saveType,
    );

    if (saved) {
      this.recordGoalkeeperSave(match, team.id, goalkeeper.id);
    }
  }

  private createGoalkeeperContext(
    match: MatchState,
    goalkeeper: Player,
    goalkeeperState: PlayerMatchState,
    team: Team,
    teamState: TeamMatchState,
    opponents: Team,
    opponentState: TeamMatchState,
    direction: PlayingDirection,
  ): GoalkeeperContext {
    const ownGoalX = direction === "LEFT_TO_RIGHT"
      ? 0
      : PITCH_DIMENSIONS.length;

    return {
      tick: match.tick,
      goalkeeper: {
        playerId: goalkeeper.id,
        teamId: team.id,
        position: goalkeeperState.position,
        velocity: goalkeeperState.velocity,
        direction: goalkeeperState.direction,
        attributes: goalkeeper.attributes,
        stamina: goalkeeperState.stamina,
      },
      ball: match.ball,
      goalPosition: {
        x: ownGoalX,
        y: PITCH_DIMENSIONS.width / 2,
      },
      attackingDirection: direction,
      opponents: this.getDecisionPlayers(opponents, opponentState)
        .map(({ player, state }) => ({
          playerId: player.id,
          position: state.position,
        })),
      teammates: this.getDecisionPlayers(team, teamState)
        .filter(({ player }) => player.id !== goalkeeper.id)
        .map(({ player, state }) => ({
          playerId: player.id,
          position: state.position,
        })),
    };
  }

  private distributeGoalkeeperBall(
    match: MatchState,
    goalkeeper: Player,
    state: PlayerMatchState,
    team: Team,
    teamState: TeamMatchState,
    context: GoalkeeperContext,
  ): void {
    const teammates = this.getDecisionPlayers(team, teamState)
      .filter(({ player }) => player.id !== goalkeeper.id);
    const target = this.goalkeeperDistribution.selectDistributionTarget(
      state.position,
      teammates,
    );

    if (!target) {
      const direction = this.positionService.getAttackSign(
        context.attackingDirection,
      );
      const released = this.ballInteraction.releaseBall(
        goalkeeper.id,
        match.ball,
        {
          horizontalSpeed: 20,
          verticalSpeed: 12,
          // Spread the punt up to ~23 degrees either side.
          direction:
            (direction > 0 ? 0 : Math.PI) + (this.random() - 0.5) * 0.8,
        },
      );

      if (released) {
        match.ball.lastTouchTeamId = team.id;
        this.lockOut(match, goalkeeper.id);
        MatchStatisticsService.recordPass(match, team.id, goalkeeper.id, "LONG");
        this.pendingPasses.set(match.id, {
          passerId: goalkeeper.id,
          receiverId: null,
          teamId: team.id,
          tick: match.tick,
          kind: "LONG",
          miscontrolledPlayerIds: new Set(),
        });
      }
      return;
    }

    const receiver = target.targetPlayerId
      ? teamState.playerStates[target.targetPlayerId]
      : undefined;
    const result = this.passing.executePass(
      goalkeeper,
      state,
      team.id,
      match.ball,
      {
        type: target.type === "LONG" ? "LONG" : "SHORT",
        targetPosition: target.targetPosition,
        ...(target.targetPlayerId && {
          targetPlayerId: target.targetPlayerId,
        }),
      },
      receiver,
    );

    if (result.successful) {
      match.ball.lastTouchTeamId = team.id;
      this.lockOut(match, goalkeeper.id);
      const keeperKind: PassKind = target.type === "LONG" ? "LONG" : "SHORT";

      MatchStatisticsService.recordPass(match, team.id, goalkeeper.id, keeperKind);
      this.pendingPasses.set(match.id, {
        passerId: goalkeeper.id,
        receiverId: target.targetPlayerId ?? null,
        teamId: team.id,
        tick: match.tick,
        kind: keeperKind,
        miscontrolledPlayerIds: new Set(),
      });
    }
  }

  // Planning phase: decide for every outfield player of one team without
  // executing anything.
  private planOutfieldActions(
    match: MatchState,
    team: Team,
    teamState: TeamMatchState,
    opponents: Team,
    opponentState: TeamMatchState,
    direction: PlayingDirection,
  ): PlannedAction[] {
    const planned: PlannedAction[] = [];

    for (const player of team.players) {
      if (player.position === "GK") continue;
      const state = teamState.playerStates[player.id];
      if (!state) continue;

      this.actionEngine.update(state, match.tick);
      const context = this.createDecisionContext(
        match,
        player,
        state,
        team,
        teamState,
        opponents,
        opponentState,
        direction,
      );
      const decision = this.decisionEngine.decide(context);
      planned.push({ team, teamState, player, state, context, decision });
    }

    return planned;
  }

  private createDecisionContext(
    match: MatchState,
    player: Player,
    state: PlayerMatchState,
    team: Team,
    teamState: TeamMatchState,
    opponents: Team,
    opponentState: TeamMatchState,
    direction: PlayingDirection,
  ): DecisionContext {
    const goalX = direction === "LEFT_TO_RIGHT"
      ? PITCH_DIMENSIONS.length
      : 0;
    const decisionPlayers = this.getDecisionPlayers(team, teamState);

    const phase = match.ball.possessionTeamId === null
      ? "TRANSITION"
      : match.ball.possessionTeamId === team.id
        ? "ATTACKING"
        : "DEFENDING";

    // Rank among teammates by distance to the ball (0 = closest).
    const ballDistance = PitchService.getDistance(
      state.position,
      match.ball.position,
    );
    const ballRank = decisionPlayers.filter(
      (item) =>
        item.player.id !== player.id &&
        item.player.position !== "GK" &&
        PitchService.getDistance(item.state.position, match.ball.position) <
          ballDistance,
    ).length;

    const slot = this.getFormationSlot(team, player);
    const tactics = TacticsService.resolve(team.tactics);
    const formation = slot
      ? {
          ...FormationPositioningService.getShape(
            slot,
            phase,
            match.ball.position,
            direction,
            team.tactics.formationFluidity,
            tactics
          ),
          ballRank,
        }
      : undefined;

    return {
      tick: match.tick,
      phase,
      attackingDirection: direction,
      tactics,
      ball: {
        position: { ...match.ball.position },
        possessionTeamId: match.ball.possessionTeamId,
        possessionPlayerId: match.ball.possessionPlayerId,
      },
      player: { player, state },
      teammates: decisionPlayers.filter(
        (item) => item.player.id !== player.id,
      ),
      opponents: this.getDecisionPlayers(opponents, opponentState),
      goalPosition: {
        x: goalX,
        y: PITCH_DIMENSIONS.width / 2,
      },
      ...(formation && { formation }),
    };
  }

  // Finds the formation slot for a player. When several players share a
  // position name (e.g. two CBs) they are matched to slots in order.
  private getFormationSlot(
    team: Team,
    player: Player,
  ): FormationSlot | undefined {
    const slots = team.formation.slots.filter(
      (slot) => slot.position === player.position,
    );
    const samePosition = team.players.filter(
      (candidate) => candidate.position === player.position,
    );

    return slots[samePosition.indexOf(player)] ?? slots[0];
  }


  private constrainToFormation(
    decision: DecisionResult,
    context: DecisionContext,
  ): DecisionResult {
    const formation = context.formation;
    const target = decision.targetPosition;

    if (!formation || !target) return decision;

    const isChaser = TacticsService.isChaser(formation.ballRank, context.tactics);

    if (isChaser && context.phase === "TRANSITION") return decision;

    const roam = formation.roamRadius * (isChaser ? 1.6 : 1);
    const distance = PitchService.getDistance(target, formation.shapePosition);

    if (distance <= roam) return decision;

    const ratio = roam / distance;

    return {
      ...decision,
      targetPosition: {
        x:
          formation.shapePosition.x +
          (target.x - formation.shapePosition.x) * ratio,
        y:
          formation.shapePosition.y +
          (target.y - formation.shapePosition.y) * ratio,
      },
    };
  }

  private executeDecision(
    match: MatchState,
    team: Team,
    teamState: TeamMatchState,
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
    decision: DecisionResult,
  ): void {
    if (
      ON_BALL_ACTIONS.includes(decision.action) &&
      match.ball.possessionPlayerId !== player.id
    ) {
      return;
    }

    switch (decision.action) {
      case "PRESS":
        this.actionEngine.execute(state, decision, match.tick);
        return;

      case "MOVE":
      case "SUPPORT":
      case "MAKE_RUN":
      case "MARK":
      case "TRACK_BACK":
        this.actionEngine.execute(
          state,
          this.constrainToFormation(decision, context),
          match.tick,
        );
        return;

      case "INTERCEPT": {
        // A possessed ball cannot be intercepted; just keep moving to it.
        if (match.ball.possessionPlayerId !== null) {
          this.actionEngine.execute(state, decision, match.tick);
          return;
        }

        // Don't let the player who just released the ball "intercept" it.
        if (this.isLockedOut(match, player.id)) return;

        // A defender next to the passer cannot snatch a pass that has only
        // just been played.
        if (this.isPassProtected(match, team.id)) return;

        this.cancelRunningAction(player.id, state);

        this.interception.resolveInterception(
          [{ player, state }],
          team.id,
          match.ball,
        );

        return;
      }

      case "PASS":
      case "THROUGH_BALL":
      case "LONG_BALL":
        if (this.mustKeepBall(match, player.id, context)) {
          this.carryBall(player, state, context);
          return;
        }
        this.executePass(match, team, teamState, player, state, context, decision);
        return;

      case "CROSS":
        if (this.mustKeepBall(match, player.id, context)) {
          this.carryBall(player, state, context);
          return;
        }
        this.executeCross(match, team, player, state, context, decision);
        return;

      case "SHOOT":
        if (this.mustKeepBall(match, player.id, context)) {
          this.carryBall(player, state, context);
          return;
        }
        this.executeShot(match, team, player, state, context);
        return;

      case "DRIBBLE":
        this.cancelRunningAction(player.id, state);
        state.targetPosition = decision.targetPosition
          ? PitchService.clampPosition(decision.targetPosition)
          : PitchService.clampPosition({
              x: state.position.x + this.positionService.getAttackSign(
                context.attackingDirection,
              ) * 8,
              y: state.position.y,
            });
        state.isMoving = true;
        state.currentAction = "DRIBBLING";
        return;

      case "HOLD_BALL":
        this.cancelRunningAction(player.id, state);
        state.targetPosition = null;
        state.isMoving = false;
        state.currentAction = "IDLE";
        return;

      case "TACKLE":
      case "HARD_TACKLE":
        this.executeTackle(match, team.id, player, state, context, decision);
        return;
    }
  }

  private executePass(
    match: MatchState,
    team: Team,
    teamState: TeamMatchState,
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
    decision: DecisionResult,
  ): void {
    if (!decision.targetPosition) return;
    this.cancelRunningAction(player.id, state);

    const passType = decision.action === "THROUGH_BALL"
      ? "THROUGH"
      : decision.action === "LONG_BALL"
        ? "LONG"
        : "SHORT";
    const receiver = decision.targetPlayerId
      ? teamState.playerStates[decision.targetPlayerId]
      : undefined;
    const result = this.passing.executePass(
      player,
      state,
      team.id,
      match.ball,
      {
        type: passType,
        targetPosition: decision.targetPosition,
        pressure: calculatePressure(state.position, context.opponents),
        ...(decision.targetPlayerId && {
          targetPlayerId: decision.targetPlayerId,
        }),
      },
      receiver,
    );
    if (!result.successful) {
      debugLog(
        `[pass] release_failed match=${match.id} tick=${match.tick} passer=${player.name} kind=${passType} reason=${result.message ?? "unknown"}`,
      );
      return;
    }

    match.ball.lastTouchTeamId = team.id;
    this.lockOut(match, player.id);
    state.currentAction = "PASSING";

    MatchStatisticsService.recordPass(match, team.id, player.id, passType);
    this.pendingPasses.set(match.id, {
      passerId: player.id,
      receiverId: decision.targetPlayerId ?? null,
      teamId: team.id,
      tick: match.tick,
      kind: passType,
      miscontrolledPlayerIds: new Set(),
    });
  }

  private executeCross(
    match: MatchState,
    team: Team,
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
    decision: DecisionResult,
  ): void {
    this.cancelRunningAction(player.id, state);
    const receiver = context.teammates
      .map((teammate) => ({
        teammate,
        forwardDistance: this.positionService.getForwardDistance(
          state.position,
          teammate.state.position,
          context.attackingDirection,
        ),
      }))
      .filter(({ forwardDistance }) => forwardDistance > 0)
      .sort((a, b) => b.forwardDistance - a.forwardDistance)[0]?.teammate;

    const targetPosition = receiver?.state.position ??
      decision.targetPosition ??
      context.goalPosition;
    const result = this.passing.executePass(
      player,
      state,
      team.id,
      match.ball,
      {
        type: "LONG",
        targetPosition,
        pressure: calculatePressure(state.position, context.opponents),
        ...(receiver && { targetPlayerId: receiver.player.id }),
      },
      receiver?.state,
    );
    if (!result.successful) {
      debugLog(
        `[pass] release_failed match=${match.id} tick=${match.tick} passer=${player.name} kind=CROSS reason=${result.message ?? "unknown"}`,
      );
      return;
    }

    match.ball.lastTouchTeamId = team.id;
    this.lockOut(match, player.id);
    state.currentAction = "PASSING";
    MatchStatisticsService.recordPass(match, team.id, player.id, "CROSS");
    this.pendingPasses.set(match.id, {
      passerId: player.id,
      receiverId: receiver?.player.id ?? null,
      teamId: team.id,
      tick: match.tick,
      kind: "CROSS",
      miscontrolledPlayerIds: new Set(),
    });
  }

  private executeShot(
    match: MatchState,
    team: Team,
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
  ): void {
    this.cancelRunningAction(player.id, state);
    const result = this.shooting.executeShot(
      player,
      state,
      match.ball,
      {
        type: "POWER",
        targetPosition: context.goalPosition,
        goalPosition: context.goalPosition,
      },
      context.opponents.map((opponent) => opponent.state),
    );
    if (result.successful) {
      match.ball.lastTouchTeamId = team.id;
      this.lockOut(match, player.id);
      state.currentAction = "SHOOTING";

      // Make the shot imperfect BEFORE it is recorded, so "on target" below
      // reflects where the ball is really going.
      this.applyShotInaccuracy(player, state, context, match.ball);

      const defendingTeam =
        team.id === match.homeTeam.id ? match.awayTeam : match.homeTeam;
      const defendingTeamState =
        team.id === match.homeTeam.id
          ? match.awayTeamState
          : match.homeTeamState;
      const defendingDirection =
        team.id === match.homeTeam.id
          ? match.awayDirection
          : match.homeDirection;
      const goalkeeper = defendingTeam.players.find(
        (candidate) => candidate.position === "GK",
      );
      const goalkeeperState = goalkeeper
        ? defendingTeamState.playerStates[goalkeeper.id]
        : undefined;

      const predictedShot =
        goalkeeper && goalkeeperState
          ? this.goalkeeperPrediction.predictShot(
              this.createGoalkeeperContext(
                match,
                goalkeeper,
                goalkeeperState,
                defendingTeam,
                defendingTeamState,
                team,
                match.homeTeam.id === team.id
                  ? match.homeTeamState
                  : match.awayTeamState,
                defendingDirection,
              ),
              match.ball,
            )
          : undefined;

      MatchStatisticsService.recordShot(
        match,
        team.id,
        player.id,
        predictedShot?.isOnTarget ?? false,
      );

      const lastPass = this.lastCompletedPasses.get(match.id);

      const assistPlayerId =
        lastPass !== undefined &&
        lastPass.teamId === team.id &&
        lastPass.receiverId === player.id &&
        lastPass.passerId !== player.id &&
        match.tick - lastPass.tick <= MatchActionService.ASSIST_WINDOW_TICKS
          ? lastPass.passerId
          : null;

      this.pendingShots.set(match.id, {
        shooterId: player.id,
        teamId: team.id,
        assistPlayerId,
        tick: match.tick,
      });
    }
  }

  // Rotates the ball's direction by a random aiming error.
  private applyShotInaccuracy(
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
    ball: MatchState["ball"],
  ): void {
    const distance = PitchService.getDistance(
      state.position,
      context.goalPosition,
    );

    const skill = Math.max(
      0,
      Math.min(
        1,
        (player.attributes.shooting * 0.6 + player.attributes.composure * 0.4) /
          20,
      ),
    );

    // Defenders close to the shooter (the goalkeeper is ignored).
    let nearest = Infinity;
    for (const opponent of context.opponents) {
      if (
        PitchService.getDistance(opponent.state.position, context.goalPosition) <
        4
      ) {
        continue;
      }

      nearest = Math.min(
        nearest,
        PitchService.getDistance(state.position, opponent.state.position),
      );
    }

    const pressure = nearest < 1.5 ? 1 : nearest < 3 ? 0.5 : 0;

    const sigma =
      MatchActionService.SHOT_ERROR_BASE +
      MatchActionService.SHOT_ERROR_PER_METRE * distance +
      MatchActionService.SHOT_ERROR_UNSKILLED * (1 - skill) +
      MatchActionService.SHOT_ERROR_PRESSURE * pressure;

    // Standard normal random number (Box-Muller).
    const u1 = Math.max(1e-9, this.random());
    const u2 = this.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const limit = MatchActionService.SHOT_ERROR_LIMIT;
    const error = Math.max(-limit, Math.min(limit, gaussian * sigma));

    const cos = Math.cos(error);
    const sin = Math.sin(error);

    ball.velocity = {
      x: ball.velocity.x * cos - ball.velocity.y * sin,
      y: ball.velocity.x * sin + ball.velocity.y * cos,
    };
  }

  private executeTackle(
    match: MatchState,
    teamId: string,
    player: Player,
    state: PlayerMatchState,
    context: DecisionContext,
    decision: DecisionResult,
  ): void {
    const carrierId = decision.targetPlayerId ?? context.ball.possessionPlayerId;
    const carrier = context.opponents.find(
      (opponent) => opponent.player.id === carrierId,
    );
    if (!carrier) return;

    if (match.ball.possessionPlayerId !== carrier.player.id) return;

    const distance = PitchService.getDistance(state.position, carrier.state.position);
    if (distance > 3) {
      state.targetPosition = { ...carrier.state.position };
      state.isMoving = true;
      state.currentAction = "PRESSING";
      return;
    }
    this.cancelRunningAction(player.id, state); // only once we're really tackling

    const onCooldown = (this.tackleCooldowns.get(player.id) ?? 0) > match.tick;
    if (onCooldown || this.isShielded(match, carrier.player.id)) {
      state.targetPosition = { ...carrier.state.position };
      state.isMoving = true;
      state.currentAction = "PRESSING";
      return;
    }

    this.tackleCooldowns.set(
      player.id,
      match.tick + MatchActionService.TACKLE_COOLDOWN_TICKS,
    );

    state.currentAction = "TACKLING";

    const outcome = this.tackleDuel.resolve({
      tackler: player,
      tacklerState: state,
      carrier: carrier.player,
      carrierState: carrier.state,
      hardTackle: decision.action === "HARD_TACKLE",
    });

    this.applyDuelOutcome(match, teamId, player, state, carrier, outcome);

    debugLog(
      `[duel] match=${match.id} tick=${match.tick} tackler=${player.name} carrier=${carrier.player.name} mode=${outcome.mode} chance=${outcome.tackleChance.toFixed(2)} clean=${outcome.cleanShare.toFixed(2)} front=${outcome.frontness.toFixed(2)} result=${outcome.result}`,
    );

    MatchStatisticsService.recordTackle(
      match,
      teamId,
      player.id,
      outcome.result === "WON",
    );
    MatchStatisticsService.recordDuel(match, {
      tacklerTeamId: teamId,
      tacklerId: player.id,
      carrierTeamId: this.getPlayerTeamId(match, carrier.player.id),
      carrierId: carrier.player.id,
      kind: outcome.mode,
      result: outcome.result,
    });
  }

  private applyDuelOutcome(
    match: MatchState,
    teamId: string,
    player: Player,
    state: PlayerMatchState,
    carrier: DecisionPlayer,
    outcome: DuelOutcome,
  ): void {
    const D = DUEL_CONSTANTS;

    switch (outcome.result) {
      case "WON":
        this.ballInteraction.assignPossession(player.id, teamId, match.ball);
        this.ballInteraction.updateControlledBall(state, match.ball);
        this.grantPossessionShield(match, player.id);
        this.drainStamina(carrier.state, D.STAMINA_COST_DISPOSSESSED);
        return;

      case "LOOSE": {
        const away = Math.atan2(
          carrier.state.position.y - state.position.y,
          carrier.state.position.x - state.position.x,
        );
        const direction = away + (this.random() - 0.5) * D.LOOSE_BALL_SPREAD;
        const speed =
          D.LOOSE_BALL_MIN_SPEED +
          this.random() * (D.LOOSE_BALL_MAX_SPEED - D.LOOSE_BALL_MIN_SPEED);

        this.ballInteraction.deflectBall(match.ball, direction, speed);
        match.ball.lastTouchTeamId = teamId;
        this.lockOut(match, carrier.player.id);
        this.drainStamina(carrier.state, D.STAMINA_COST_DISPOSSESSED);
        return;
      }

      case "BEATEN":
        state.currentSpeed *= D.BEATEN_SPEED_RETENTION;
        state.velocity = {
          x: state.velocity.x * D.BEATEN_SPEED_RETENTION,
          y: state.velocity.y * D.BEATEN_SPEED_RETENTION,
        };
        this.tackleCooldowns.set(
          player.id,
          match.tick +
            MatchActionService.TACKLE_COOLDOWN_TICKS +
            D.BEATEN_EXTRA_COOLDOWN_TICKS,
        );
        this.possessionShields.set(
          carrier.player.id,
          Math.max(
            this.possessionShields.get(carrier.player.id) ?? 0,
            match.tick + D.BEATEN_ESCAPE_SHIELD_TICKS,
          ),
        );
        this.drainStamina(carrier.state, D.STAMINA_COST_DRIBBLER_WIN);
        this.drainStamina(state, D.STAMINA_COST_TACKLER);
        return;
    }
  }

  private drainStamina(state: PlayerMatchState, amount: number): void {
    state.stamina = Math.max(0, state.stamina - amount);
  }

  private cancelRunningAction(
    playerId: string,
    state: PlayerMatchState,
  ): void {
    const execution = this.actionEngine.getExecution(playerId);
    if (execution?.status === "RUNNING") {
      this.actionEngine.cancel(execution, state);
    }
  }

  private resolvePendingPass(
    match: MatchState,
    receiverId: string,
  ): void {
    const pending = this.pendingPasses.get(match.id);
    if (!pending) return;

    // The passer touching the ball again is not a result; keep waiting.
    if (receiverId === pending.passerId) return;

    const receiverTeamId = this.getPlayerTeamId(match, receiverId);

    if (receiverTeamId === pending.teamId) {
      MatchStatisticsService.completePass(
        match,
        pending.teamId,
        pending.passerId,
        pending.kind,
      );

      this.lastCompletedPasses.set(match.id, {
        passerId: pending.passerId,
        receiverId,
        teamId: pending.teamId,
        tick: match.tick,
      });
    } else {
      // Intercepted by an opponent.
      this.logPassFailure(
        match,
        pending,
        "INTERCEPTED",
        `interceptor=${this.findPlayer(match, receiverId)?.player.name ?? receiverId}`,
      );
      MatchStatisticsService.recordInterception(
        match,
        receiverTeamId,
        receiverId,
      );
      this.lastCompletedPasses.delete(match.id);
    }

    this.pendingPasses.delete(match.id);
  }

  private logPassFailure(
    match: MatchState,
    pending: PendingPass,
    reason: string,
    details: string,
  ): void {
    const passer = this.findPlayer(match, pending.passerId)?.player.name ??
      pending.passerId;
    const receiver = pending.receiverId
      ? this.findPlayer(match, pending.receiverId)?.player.name ??
        pending.receiverId
      : "unspecified";

    debugLog(
      `[pass] failed match=${match.id} tick=${match.tick} kind=${pending.kind} passer=${passer} intendedReceiver=${receiver} reason=${reason} ${details}`,
    );
  }

  private getDecisionPlayers(
    team: Team,
    teamState: TeamMatchState,
  ): DecisionPlayer[] {
    return team.players.flatMap((player) => {
      const state = teamState.playerStates[player.id];
      return state ? [{ player, state }] : [];
    });
  }

  private findPlayer(
    match: MatchState,
    playerId: string,
  ): DecisionPlayer | undefined {
    for (const [team, state] of [
      [match.homeTeam, match.homeTeamState],
      [match.awayTeam, match.awayTeamState],
    ] as const) {
      const player = team.players.find((candidate) => candidate.id === playerId);
      const playerState = state.playerStates[playerId];
      if (player && playerState) return { player, state: playerState };
    }
    return undefined;
  }

  private rollShotSave(
    match: MatchState,
    goalkeeperId: string,
    context: GoalkeeperContext,
    predictedShot: PredictedShot,
    saveType: GoalkeeperSaveType,
  ): boolean {
    const shot = this.pendingShots.get(match.id);
    const key = shot ? `${shot.shooterId}:${shot.tick}` : null;

    if (key !== null) {
      const previous = this.saveRolls.get(goalkeeperId);
      if (previous?.key === key) return previous.successful;
    }

    const result = this.goalkeeperSave.evaluateSave(
      context,
      predictedShot,
      saveType,
    );

    if (key !== null) {
      this.saveRolls.set(goalkeeperId, { key, successful: result.successful });
    }

    return result.successful;
  }


  private recordGoalkeeperSave(
    match: MatchState,
    teamId: string,
    goalkeeperId: string,
  ): void {
    const shot = this.pendingShots.get(match.id);

    if (
      shot !== undefined &&
      shot.teamId !== teamId &&
      match.tick - shot.tick <= MatchActionService.SHOT_WINDOW_TICKS
    ) {
      MatchStatisticsService.recordSave(match, teamId, goalkeeperId);
      this.pendingShots.delete(match.id);
    }
  }

  private isWithinSaveContact(
    state: PlayerMatchState,
    match: MatchState,
  ): boolean {
    return PitchService.getDistance(state.position, match.ball.position) <= 1.5;
  }

  private resolvePitchBoundary(
    match: MatchState,
    previousPosition: Vector2D,
    previousHeight: number,
  ): void {
    const currentPosition = match.ball.position;

    if (match.ball.possessionPlayerId !== null) {
      match.ball.position = PitchService.clampPosition(currentPosition);
      return;
    }

    const boundaryExit = this.getBoundaryExit(previousPosition, currentPosition);
    const crossedRight =
      previousPosition.x < PITCH_DIMENSIONS.length &&
      currentPosition.x >= PITCH_DIMENSIONS.length;

    const crossedLeft =
      previousPosition.x > 0 &&
      currentPosition.x <= 0;

    if (
      (crossedRight || crossedLeft) &&
      boundaryExit?.type !== "TOUCHLINE"
    ) {
      const goalX = crossedRight ? PITCH_DIMENSIONS.length : 0;

      const denominator = currentPosition.x - previousPosition.x;

      const t = denominator === 0
        ? 0
        : (goalX - previousPosition.x) / denominator;

      const crossingY =
        previousPosition.y +
        (currentPosition.y - previousPosition.y) * t;

      const crossingHeight =
        previousHeight +
        (match.ball.height - previousHeight) * t;

      const goalMinY =
        (PITCH_DIMENSIONS.width - PITCH_DIMENSIONS.goalWidth) / 2;

      const goalMaxY =
        (PITCH_DIMENSIONS.width + PITCH_DIMENSIONS.goalWidth) / 2;

      const insideGoalMouth =
        crossingY >= goalMinY &&
        crossingY <= goalMaxY;

      const insideGoalHeight =
        crossingHeight >= 0 &&
        crossingHeight <= PITCH_DIMENSIONS.goalHeight;

      if (insideGoalMouth && insideGoalHeight) {
        const scoringDirection: PlayingDirection = crossedRight
          ? "LEFT_TO_RIGHT"
          : "RIGHT_TO_LEFT";

        const scoringTeamState =
          match.homeDirection === scoringDirection
            ? match.homeTeamState
            : match.awayTeamState;

        const scoringTeamId =
          scoringTeamState === match.homeTeamState
            ? match.homeTeam.id
            : match.awayTeam.id;

        // Only a recent shot by the scoring team earns a scorer and assist.
        const pendingShot = this.pendingShots.get(match.id);
        const liveShot =
          pendingShot !== undefined &&
          pendingShot.teamId === scoringTeamId &&
          match.tick - pendingShot.tick <= MatchActionService.SHOT_WINDOW_TICKS
            ? pendingShot
            : undefined;

        if (liveShot || MatchActionService.ALLOW_NON_SHOT_GOALS) {
          scoringTeamState.score++;

          MatchStatisticsService.recordGoal(
            match,
            scoringTeamId,
            liveShot?.shooterId,
          );

          if (liveShot?.assistPlayerId) {
            MatchStatisticsService.recordAssist(match, liveShot.assistPlayerId);
          }

          match.events.push({
            type: "GOAL",
            tick: match.tick,
            minute: match.clock.minute,
            second: match.clock.second,
            teamId: scoringTeamId,
            scorerId: liveShot?.shooterId ?? null,
            assistPlayerId: liveShot?.assistPlayerId ?? null,
          });

          this.pendingShots.delete(match.id);
          this.pendingPasses.delete(match.id);
          this.lastCompletedPasses.delete(match.id);
          this.resetBall(match);
          const concedingTeam =
            scoringTeamId === match.homeTeam.id
              ? match.awayTeam
              : match.homeTeam;
          match.restart = {
            type: "KICK_OFF",
            teamId: concedingTeam.id,
            position: {
              x: PITCH_DIMENSIONS.length / 2,
              y: PITCH_DIMENSIONS.width / 2,
            },
          };
          return;
        }
      }
    }

    if (boundaryExit) {
      if (boundaryExit.type === "TOUCHLINE") {
        const inwardDirection = boundaryExit.position.y === 0 ? 1 : -1;
        match.ball.position = {
          ...boundaryExit.position,
          y: boundaryExit.position.y + inwardDirection * 0.5,
        };
        match.ball.velocity.x *= 0.25;
        match.ball.velocity.y = 0;
        match.ball.height = 0;
        match.ball.verticalVelocity = 0;
        return;
      }

      const pending = this.pendingPasses.get(match.id);
      if (pending) {
        this.logPassFailure(
          match,
          pending,
          "BALL_OUT_OF_PLAY",
          `position=(${currentPosition.x.toFixed(2)},${currentPosition.y.toFixed(2)})`,
        );
      }

      this.pendingPasses.delete(match.id);
      this.lastCompletedPasses.delete(match.id);
      const pendingShot = this.pendingShots.get(match.id);
      this.pendingShots.delete(match.id);

      const lastTouchTeamId =
        match.ball.lastTouchTeamId ??
        pending?.teamId ??
        pendingShot?.teamId;
      const restart = this.getRestart(match, boundaryExit, lastTouchTeamId);

      match.ball.position = PitchService.clampPosition(boundaryExit.position);
      match.ball.velocity = { x: 0, y: 0 };
      match.ball.verticalVelocity = 0;
      match.ball.height = 0;
      match.ball.possessionPlayerId = null;
      match.ball.possessionTeamId = null;
      match.restart = restart;

      if (restart) {
        debugLog(
          `[restart] type=${restart.type} team=${restart.teamId} position=(${restart.position.x.toFixed(2)},${restart.position.y.toFixed(2)})`,
        );
      }
    }
  }

  private getBoundaryExit(
    previous: Vector2D,
    current: Vector2D,
  ): { type: "GOAL_LINE" | "TOUCHLINE"; position: Vector2D } | null {
    const exits: Array<{
      type: "GOAL_LINE" | "TOUCHLINE";
      time: number;
      position: Vector2D;
    }> = [];
    const delta = { x: current.x - previous.x, y: current.y - previous.y };

    if (current.x < 0 && delta.x < 0) {
      const time = -previous.x / delta.x;
      exits.push({
        type: "GOAL_LINE",
        time,
        position: { x: 0, y: previous.y + delta.y * time },
      });
    } else if (current.x > PITCH_DIMENSIONS.length && delta.x > 0) {
      const time = (PITCH_DIMENSIONS.length - previous.x) / delta.x;
      exits.push({
        type: "GOAL_LINE",
        time,
        position: {
          x: PITCH_DIMENSIONS.length,
          y: previous.y + delta.y * time,
        },
      });
    }

    if (current.y < 0 && delta.y < 0) {
      const time = -previous.y / delta.y;
      exits.push({
        type: "TOUCHLINE",
        time,
        position: { x: previous.x + delta.x * time, y: 0 },
      });
    } else if (current.y > PITCH_DIMENSIONS.width && delta.y > 0) {
      const time = (PITCH_DIMENSIONS.width - previous.y) / delta.y;
      exits.push({
        type: "TOUCHLINE",
        time,
        position: {
          x: previous.x + delta.x * time,
          y: PITCH_DIMENSIONS.width,
        },
      });
    }

    return exits.sort((a, b) => a.time - b.time)[0] ?? null;
  }

  private getRestart(
    match: MatchState,
    exit: { type: "GOAL_LINE" | "TOUCHLINE"; position: Vector2D },
    lastTouchTeamId: string | null | undefined,
  ): SetPieceRestart | null {
    if (!lastTouchTeamId) return null;

    const lastTouchTeam = [match.homeTeam, match.awayTeam].find(
      (team) => team.id === lastTouchTeamId,
    );
    if (!lastTouchTeam) return null;

    const otherTeam =
      lastTouchTeam.id === match.homeTeam.id ? match.awayTeam : match.homeTeam;

    if (exit.type === "TOUCHLINE") {
      return {
        type: "THROW_IN",
        teamId: otherTeam.id,
        position: exit.position,
      };
    }

    const goalDirection: PlayingDirection =
      exit.position.x === PITCH_DIMENSIONS.length
        ? "LEFT_TO_RIGHT"
        : "RIGHT_TO_LEFT";
    const attackingTeam =
      match.homeDirection === goalDirection ? match.homeTeam : match.awayTeam;
    const defendingTeam =
      attackingTeam.id === match.homeTeam.id ? match.awayTeam : match.homeTeam;

    if (lastTouchTeam.id !== defendingTeam.id) return null; 

    return {
      type: "CORNER",
      teamId: attackingTeam.id,
      position: {
        x: exit.position.x,
        y:
          exit.position.y <= PITCH_DIMENSIONS.width / 2
            ? 0
            : PITCH_DIMENSIONS.width,
      },
    };
  }

  private takeRestart(match: MatchState): void {
    const restart = match.restart;
    if (!restart) return;

    const isHome = restart.teamId === match.homeTeam.id;
    const team = isHome
      ? match.homeTeam
      : restart.teamId === match.awayTeam.id
        ? match.awayTeam
        : undefined;
    const teamState = isHome
      ? match.homeTeamState
      : restart.teamId === match.awayTeam.id
        ? match.awayTeamState
        : undefined;
    if (!team || !teamState) {
      throw new Error(`Unknown restart team ${restart.teamId}`);
    }

    const taker = team.players.find(
      (player) =>
        player.id ===
        (restart.type === "THROW_IN"
          ? restart.takerId
          : team.tactics.setPieceTakerId),
    );
    if (!taker) {
      throw new Error(
        `${team.name} has no valid taker for ${restart.type.toLowerCase()}`,
      );
    }

    const takerState = teamState.playerStates[taker.id];
    if (!takerState) {
      throw new Error(`No match state found for set-piece taker ${taker.name}`);
    }

    const direction = isHome ? match.homeDirection : match.awayDirection;
    const teammates = this.getDecisionPlayers(team, teamState).filter(
      ({ player }) => player.id !== taker.id,
    );
    const receiver = restart.type === "THROW_IN"
      ? teammates.sort(
          (a, b) =>
            PitchService.getDistance(a.state.position, restart.position) -
            PitchService.getDistance(b.state.position, restart.position),
        )[0]
      : restart.type === "KICK_OFF"
        ? teammates.find(
            ({ player }) => player.id === restart.receiverIds?.[0],
          )
      : teammates.sort(
          (a, b) =>
            this.positionService.getForwardDistance(
              takerState.position,
              b.state.position,
              direction,
            ) -
            this.positionService.getForwardDistance(
              takerState.position,
              a.state.position,
              direction,
            ),
        )[0];

    if (!receiver) {
      throw new Error(`${team.name} has no receiver for ${restart.type.toLowerCase()}`);
    }

    takerState.position = { ...restart.position };
    takerState.targetPosition = null;
    takerState.isMoving = false;
    takerState.currentAction = "IDLE";
    this.ballInteraction.assignPossession(taker.id, team.id, match.ball);
    match.ball.position = { ...restart.position };

    const passType = restart.type === "CORNER" ? "LONG" : "SHORT";
    const passKind: PassKind = restart.type === "CORNER" ? "CROSS" : "SHORT";
    const result = this.passing.executePass(
      taker,
      takerState,
      team.id,
      match.ball,
      {
        type: passType,
        targetPosition: receiver.state.position,
        targetPlayerId: receiver.player.id,
      },
      receiver.state,
    );

    if (!result.successful) {
      throw new Error(
        `Failed to take ${restart.type.toLowerCase()} for ${team.name}: ${result.message ?? "unknown error"}`,
      );
    }

    match.ball.lastTouchTeamId = team.id;
    this.lockOut(match, taker.id);
    takerState.currentAction = "PASSING";
    MatchStatisticsService.recordPass(match, team.id, taker.id, passKind);
    this.pendingPasses.set(match.id, {
      passerId: taker.id,
      receiverId: receiver.player.id,
      teamId: team.id,
      tick: match.tick,
      kind: passKind,
      miscontrolledPlayerIds: new Set(),
    });

    match.restart = null;
  }

  private positionPlayersForRestart(
    match: MatchState,
    restart: SetPieceRestart,
  ): void {
    const attackingTeam =
      restart.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
    const defendingTeam =
      attackingTeam.id === match.homeTeam.id ? match.awayTeam : match.homeTeam;
    const attackingState =
      attackingTeam.id === match.homeTeam.id
        ? match.homeTeamState
        : match.awayTeamState;
    const defendingState =
      defendingTeam.id === match.homeTeam.id
        ? match.homeTeamState
        : match.awayTeamState;
    const attackingDirection =
      attackingTeam.id === match.homeTeam.id
        ? match.homeDirection
        : match.awayDirection;
    const defendingDirection =
      defendingTeam.id === match.homeTeam.id
        ? match.homeDirection
        : match.awayDirection;

    if (restart.type === "KICK_OFF") {
      if (!restart.receiverIds?.length) {
        const receiver = attackingTeam.players
          .filter(
            (player) =>
              player.position !== "GK" &&
              player.id !== attackingTeam.tactics.setPieceTakerId,
          )
          .map((player) => ({
            player,
            state: attackingState.playerStates[player.id],
          }))
          .filter(
            (entry): entry is { player: Player; state: PlayerMatchState } =>
              entry.state !== undefined,
          )
          .sort(
            (a, b) =>
              PitchService.getDistance(a.state.position, restart.position) -
              PitchService.getDistance(b.state.position, restart.position),
          )[0]?.player;
        if (receiver) restart.receiverIds = [receiver.id];
      }
      this.positionTeamForKickOff(
        attackingTeam,
        attackingState,
        attackingDirection,
        restart.position,
        true,
        restart.receiverIds?.[0],
      );
      this.positionTeamForKickOff(
        defendingTeam,
        defendingState,
        defendingDirection,
        restart.position,
        false,
        undefined,
      );
      return;
    }

    if (restart.type === "THROW_IN" && !restart.takerId) {
      const taker = this.selectThrowInTaker(attackingTeam);
      if (!taker) {
        throw new Error(
          `${attackingTeam.name} has no valid taker for throw_in`,
        );
      }
      restart.takerId = taker.id;
    }

    if (restart.type === "CORNER") {
      this.positionCornerAttackers(
        attackingTeam,
        attackingState,
        attackingDirection,
        restart,
      );
      this.positionCornerDefenders(
        defendingTeam,
        defendingState,
        defendingDirection,
        restart,
      );
      return;
    }

    this.positionPlayersForThrowIn(
      attackingTeam,
      attackingState,
      defendingTeam,
      defendingState,
      attackingDirection,
      defendingDirection,
      restart,
    );
  }

  private positionTeamForKickOff(
    team: Team,
    teamState: MatchState["homeTeamState"],
    direction: PlayingDirection,
    center: Vector2D,
    isKickingOff: boolean,
    receiverId: string | undefined,
  ): void {
    const takerId = team.tactics.setPieceTakerId;

    for (const player of team.players) {
      const state = teamState.playerStates[player.id];
      if (!state) continue;

      let target = this.getOwnHalfPosition(
        state.position,
        direction,
        isKickingOff ? 1 : 9.5,
      );
      if (isKickingOff && player.id === takerId) {
        target = center;
      } else if (isKickingOff && player.id === receiverId) {
        target = {
          x: center.x + (direction === "LEFT_TO_RIGHT" ? -4 : 4),
          y: center.y,
        };
      }

      this.setRestartTarget(state, target);
    }
  }

  private positionCornerAttackers(
    team: Team,
    teamState: MatchState["homeTeamState"],
    direction: PlayingDirection,
    restart: SetPieceRestart,
  ): void {
    const takerId = team.tactics.setPieceTakerId;
    const outfieldPlayers = team.players.filter(
      (player) => player.position !== "GK" && player.id !== takerId,
    );
    const priority = (position: Player["position"]): number => {
      if (position === "ST") return 0;
      if (
        position === "AM" ||
        position === "LAM" ||
        position === "RAM" ||
        position === "LW" ||
        position === "RW"
      ) return 1;
      if (position === "CM") return 2;
      if (position === "DM") return 3;
      return 4;
    };
    const attackers = [...outfieldPlayers]
      .sort((a, b) => priority(a.position) - priority(b.position))
      .slice(0, team.tactics.cornerAttackersInBox ?? 6);
    const attackerIds = new Set(attackers.map((player) => player.id));
    const sign = direction === "LEFT_TO_RIGHT" ? 1 : -1;
    const goalX = restart.position.x;
    const boxYCenter = PITCH_DIMENSIONS.width / 2;
    const laneOffsets = [-8, 0, 8, -16, 16, -12, 12, -4, 4];

    attackers.forEach((player, index) => {
      const state = teamState.playerStates[player.id];
      if (!state) return;
      const laneOffset = laneOffsets[index % laneOffsets.length] ?? 0;
      this.setRestartTarget(state, {
        x: goalX - sign * (6 + Math.floor(index / 3) * 5),
        y: Math.max(4, Math.min(
          PITCH_DIMENSIONS.width - 4,
          boxYCenter + laneOffset,
        )),
      });
    });

    for (const player of team.players) {
      const state = teamState.playerStates[player.id];
      if (!state) continue;
      if (player.id === takerId) {
        this.setRestartTarget(state, restart.position);
      } else if (player.position === "GK") {
        this.setRestartTarget(state, this.getOwnGoalPosition(direction));
      } else if (!attackerIds.has(player.id)) {
        const keepBackX = goalX - sign * 24;
        this.setRestartTarget(state, {
          x: keepBackX,
          y: Math.max(5, Math.min(
            PITCH_DIMENSIONS.width - 5,
            state.position.y,
          )),
        });
      }
    }
  }

  private positionCornerDefenders(
    team: Team,
    teamState: MatchState["homeTeamState"],
    direction: PlayingDirection,
    restart: SetPieceRestart,
  ): void {
    const sign = direction === "LEFT_TO_RIGHT" ? 1 : -1;
    const goalX =
      direction === "LEFT_TO_RIGHT" ? 0 : PITCH_DIMENSIONS.length;
    const defenders = team.players
      .filter((player) => player.position !== "GK")
      .sort((a, b) => {
        const aPriority =
          a.position === "CB" ? 0 : a.position === "LB" || a.position === "RB" ? 1 : 2;
        const bPriority =
          b.position === "CB" ? 0 : b.position === "LB" || b.position === "RB" ? 1 : 2;
        return aPriority - bPriority;
      });

    defenders.forEach((player, index) => {
      const state = teamState.playerStates[player.id];
      if (!state) return;
      const nearBox = index < 6;
      this.setRestartTarget(state, {
        x: goalX + sign * (nearBox ? 8 + Math.floor(index / 3) * 5 : 20),
        y: Math.max(
          4,
          Math.min(PITCH_DIMENSIONS.width - 4, 8 + (index % 6) * 13),
        ),
      });
    });

    const goalkeeper = team.players.find(
      (player) => player.position === "GK",
    );
    const goalkeeperState = goalkeeper
      ? teamState.playerStates[goalkeeper.id]
      : undefined;
    if (goalkeeperState) {
      this.setRestartTarget(
        goalkeeperState,
        this.getOwnGoalPosition(direction),
      );
    }
  }

  private positionPlayersForThrowIn(
    attackingTeam: Team,
    attackingState: MatchState["homeTeamState"],
    defendingTeam: Team,
    defendingState: MatchState["homeTeamState"],
    attackingDirection: PlayingDirection,
    defendingDirection: PlayingDirection,
    restart: SetPieceRestart,
  ): void {
    const takerId = restart.takerId ?? attackingTeam.tactics.setPieceTakerId;
    if (!restart.receiverIds?.length) {
      const nearestTeammates = attackingTeam.players
        .filter((player) => player.id !== takerId && player.position !== "GK")
        .map((player) => ({
          player,
          state: attackingState.playerStates[player.id],
        }))
        .filter(
          (entry): entry is { player: Player; state: PlayerMatchState } =>
            entry.state !== undefined,
        )
        .sort(
          (a, b) =>
            PitchService.getDistance(a.state.position, restart.position) -
            PitchService.getDistance(b.state.position, restart.position),
        );
      restart.receiverIds = nearestTeammates
        .slice(0, 2)
        .map(({ player }) => player.id);
    }
    const receiverIds = new Set(restart.receiverIds);

    attackingTeam.players.forEach((player, index) => {
      const state = attackingState.playerStates[player.id];
      if (!state) return;
      if (player.id === takerId) {
        this.setRestartTarget(state, restart.position);
      } else if (receiverIds.has(player.id)) {
        this.setRestartTarget(state, {
          x: restart.position.x,
          y: Math.max(2, Math.min(
            PITCH_DIMENSIONS.width - 2,
            restart.position.y + (index % 2 === 0 ? 5 : -5),
          )),
        });
      } else if (player.position === "GK") {
        this.setRestartTarget(
          state,
          this.getOwnGoalPosition(attackingDirection),
        );
      } else {
        this.setRestartTarget(state, state.position);
      }
    });

    const opponent = defendingTeam.players
      .filter((player) => player.position !== "GK")
      .map((player) => ({
        player,
        state: defendingState.playerStates[player.id],
      }))
      .filter(
        (entry): entry is { player: Player; state: PlayerMatchState } =>
          entry.state !== undefined,
      )
      .sort(
        (a, b) =>
          PitchService.getDistance(a.state.position, restart.position) -
          PitchService.getDistance(b.state.position, restart.position),
      );
    opponent.forEach(({ state }, index) => {
      if (index === 0) {
        const side = restart.position.y <= PITCH_DIMENSIONS.width / 2 ? 1 : -1;
        this.setRestartTarget(state, {
          x: restart.position.x,
          y: restart.position.y + side * 3,
        });
      } else {
        this.setRestartTarget(state, state.position);
      }
    });
    const defendingGoalkeeper = defendingTeam.players.find(
      (player) => player.position === "GK",
    );
    const defendingGoalkeeperState = defendingGoalkeeper
      ? defendingState.playerStates[defendingGoalkeeper.id]
      : undefined;
    if (defendingGoalkeeperState) {
      this.setRestartTarget(
        defendingGoalkeeperState,
        this.getOwnGoalPosition(defendingDirection),
      );
    }
  }

  private getOwnHalfPosition(
    position: Vector2D,
    direction: PlayingDirection,
    margin: number,
  ): Vector2D {
    const center = PITCH_DIMENSIONS.length / 2;
    return {
      x: direction === "LEFT_TO_RIGHT"
        ? Math.min(position.x, center - margin)
        : Math.max(position.x, center + margin),
      y: Math.max(0, Math.min(PITCH_DIMENSIONS.width, position.y)),
    };
  }

  private getOwnGoalPosition(direction: PlayingDirection): Vector2D {
    return {
      x: direction === "LEFT_TO_RIGHT" ? 5 : PITCH_DIMENSIONS.length - 5,
      y: PITCH_DIMENSIONS.width / 2,
    };
  }

  private setRestartTarget(
    state: PlayerMatchState,
    target: Vector2D,
  ): void {
    state.targetPosition = PitchService.clampPosition(target);
    state.currentAction = "MOVING";
  }

  private isRestartSetupComplete(
    match: MatchState,
    restart: SetPieceRestart,
  ): boolean {
    const teamStates = [
      match.homeTeamState.playerStates,
      match.awayTeamState.playerStates,
    ];
    const tolerance = 1.5;
    return teamStates.every((states) =>
      Object.values(states).every(
        (state) =>
          PitchService.getDistance(
            state.position,
            state.targetPosition ?? state.position,
          ) <= tolerance &&
          Math.hypot(state.velocity.x, state.velocity.y) <= 0.4,
      ),
    );
  }

  private selectThrowInTaker(team: Team): Player | undefined {
    const fullbacks = team.players.filter(
      (player) => player.position === "LB" || player.position === "RB",
    );
    const fallback = team.players.find(
      (player) => player.id === team.tactics.setPieceTakerId,
    );
    if (fullbacks.length === 0) return fallback;

    return fullbacks[Math.floor(this.random() * fullbacks.length)];
  }

  private resetBall(match: MatchState): void {
    match.ball.position = {
      x: PITCH_DIMENSIONS.length / 2,
      y: PITCH_DIMENSIONS.width / 2,
    };
    match.ball.velocity = { x: 0, y: 0 };
    match.ball.height = 0;
    match.ball.verticalVelocity = 0;
    match.ball.spin = 0;
    match.ball.possessionPlayerId = null;
    match.ball.possessionTeamId = null;
    match.ball.lastTouchTeamId = null;
    match.restart = null;
  }

  private updatePossessionFlags(match: MatchState): void {
    match.homeTeamState.hasPossession =
      match.ball.possessionTeamId === match.homeTeam.id;
    match.awayTeamState.hasPossession =
      match.ball.possessionTeamId === match.awayTeam.id;
  }
}