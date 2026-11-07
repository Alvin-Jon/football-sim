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
import type { MatchState, PlayingDirection } from "../types/match.types.js";
import type { Player } from "../types/player.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type { Team } from "../types/team.types.js";
import type { TeamMatchState } from "../types/team-state.types.js";
import { debugLog } from "../utils/debug-log.js";
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
import { FormationPositioningService } from "./formation-positioning.service.js";

interface PendingPass {
  passerId: string;
  receiverId: string | null;
  teamId: string;
  tick: number;
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

export class MatchActionService {
  private static readonly RELEASE_LOCKOUT_TICKS = 10;
  private static readonly TACKLE_COOLDOWN_TICKS = 60;
  private static readonly POSSESSION_SHIELD_TICKS = 20;
  private static readonly MIN_HOLD_TICKS = 20;
  private static readonly PRESSURE_HOLD_TICKS = 10;
  private static readonly PRESSURE_DISTANCE = 4;
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
  private readonly interception : InterceptionService;
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
    this.interception = new InterceptionService(
          this.ballInteraction,
          this.trajectory,
          random,
      );
  }

  update(match: MatchState, deltaTime: number): MatchState {
    this.updateControlledBall(match);

    const previousBallPosition = { ...match.ball.position };
    const previousBallHeight = match.ball.height;

    this.ballPhysics.update(match.ball, deltaTime);

    this.updateGoalkeeper(
      match,
      match.homeTeam,
      match.homeTeamState,
      match.awayTeam,
      match.awayTeamState,
      match.homeDirection,
    );

    this.updateGoalkeeper(
      match,
      match.awayTeam,
      match.awayTeamState,
      match.homeTeam,
      match.homeTeamState,
      match.awayDirection,
    );

    this.receiveFreeBall(match);

    this.updateOutfieldPlayers(
      match,
      match.homeTeam,
      match.homeTeamState,
      match.awayTeam,
      match.awayTeamState,
      match.homeDirection,
    );

    this.updateOutfieldPlayers(
      match,
      match.awayTeam,
      match.awayTeamState,
      match.homeTeam,
      match.homeTeamState,
      match.awayDirection,
    );

    this.resolvePitchBoundary(
      match,
      previousBallPosition,
      previousBallHeight,
    );

    this.updatePossessionFlags(match);
    this.trackPossessionChange(match);

    return match;
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

    const nearestOpponent = context.opponents.reduce(
      (nearest, opponent) =>
        Math.min(
          nearest,
          PitchService.getDistance(
            context.player.state.position,
            opponent.state.position,
          ),
        ),
      Infinity,
    );

    const holdTicks =
      nearestOpponent < MatchActionService.PRESSURE_DISTANCE
        ? MatchActionService.PRESSURE_HOLD_TICKS
        : MatchActionService.MIN_HOLD_TICKS;

    return match.tick - started < holdTicks;
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

  // Any time a new player gains the ball (reception, interception, keeper
  // claim, tackle), protect them briefly and end any shot still in flight.
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

    // Only the two closest players per team (plus the intended receiver of
    // a pass) may run towards a loose ball. Everyone can still control it
    // if it reaches them.
    const chasers = new Set<string>();
    for (const teamId of [match.homeTeam.id, match.awayTeam.id]) {
      candidates
        .filter(({ player }) => this.getPlayerTeamId(match, player.id) === teamId)
        .slice(0, 2)
        .forEach(({ player }) => chasers.add(player.id));
    }
    const pendingPass = this.pendingPasses.get(match.id);
    if (pendingPass?.receiverId) chasers.add(pendingPass.receiverId);

    for (const { player, state } of candidates) {
      if (match.ball.possessionPlayerId !== null) return;

      this.receiving.attemptReceive(
        player,
        state,
        this.getPlayerTeamId(match, player.id),
        match.ball,
        chasers.has(player.id),
      );

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
        this.lockOut(match, goalkeeper.id);
        MatchStatisticsService.recordPass(match, team.id, goalkeeper.id);
        this.pendingPasses.set(match.id, {
          passerId: goalkeeper.id,
          receiverId: null,
          teamId: team.id,
          tick: match.tick,
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
      this.lockOut(match, goalkeeper.id);
      MatchStatisticsService.recordPass(match, team.id, goalkeeper.id);
      this.pendingPasses.set(match.id, {
        passerId: goalkeeper.id,
        receiverId: target.targetPlayerId ?? null,
        teamId: team.id,
        tick: match.tick,
      });
    }
  }

  private updateOutfieldPlayers(
    match: MatchState,
    team: Team,
    teamState: TeamMatchState,
    opponents: Team,
    opponentState: TeamMatchState,
    direction: PlayingDirection,
  ): void {
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
      this.executeDecision(match, team, teamState, player, state, context, decision);
    }
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
    const formation = slot
      ? {
          ...FormationPositioningService.getShape(
            slot,
            phase,
            match.ball.position,
            direction,
            team.tactics.formationFluidity,
          ),
          ballRank,
        }
      : undefined;

    return {
      tick: match.tick,
      phase,
      attackingDirection: direction,
      ball: {
        position: match.ball.position,
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

  // Hard limit: a non-chasing player's movement target cannot leave their
  // roam radius around the formation shape position.
  private constrainToFormation(
    decision: DecisionResult,
    context: DecisionContext,
  ): DecisionResult {
    const formation = context.formation;
    const target = decision.targetPosition;

    if (!formation || !target) return decision;

    const isChaser = formation.ballRank < 2;

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

        // Interceptions are recorded in resolvePendingPass, and only when the
        // ball was an opponent's pass.
        return;
      }

      case "PASS":
      case "THROUGH_BALL":
      case "LONG_BALL":
        if (this.mustKeepBall(match, player.id, context)) {
          this.carryBall(player, state, context);
          return;
        }
        this.executePass(match, team, teamState, player, state, decision);
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
        //debugLog(`DEF ${player.id} action=${decision.action} rank=${context.formation?.ballRank}`);
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
        ...(decision.targetPlayerId && {
          targetPlayerId: decision.targetPlayerId,
        }),
      },
      receiver,
    );
    if (!result.successful) return;

    this.lockOut(match, player.id);
    state.currentAction = "PASSING";

    MatchStatisticsService.recordPass(match, team.id, player.id);
    this.pendingPasses.set(match.id, {
      passerId: player.id,
      receiverId: decision.targetPlayerId ?? null,
      teamId: team.id,
      tick: match.tick,
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
        ...(receiver && { targetPlayerId: receiver.player.id }),
      },
      receiver?.state,
    );
    if (result.successful) {
      this.lockOut(match, player.id);
      state.currentAction = "PASSING";
      MatchStatisticsService.recordPass(match, team.id, player.id);
      this.pendingPasses.set(match.id, {
        passerId: player.id,
        receiverId: receiver?.player.id ?? null,
        teamId: team.id,
        tick: match.tick,
      });
    }
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

      // Only credit an assist if the shooter actually received the last
      // completed pass, from a teammate, within the assist window.
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
    //debugLog(`TACKLE reached: ${player.id} ${decision.action} target=${decision.targetPlayerId}`);
    const carrierId = decision.targetPlayerId ?? context.ball.possessionPlayerId;
    const carrier = context.opponents.find(
      (opponent) => opponent.player.id === carrierId,
    );
    if (!carrier) return;
    const distance = PitchService.getDistance(state.position, carrier.state.position);
    if (distance > 3) {
      state.targetPosition = { ...carrier.state.position };
      state.isMoving = true;
      state.currentAction = "PRESSING";
      return;
    }
    this.cancelRunningAction(player.id, state); // only once we're really tackling

    // Tackler on cooldown, or carrier just won the ball: keep closing the
    // carrier down instead of tackling (or standing still).
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

    const hardTackle = decision.action === "HARD_TACKLE";
    const chance = Math.max(
      0.1,
      Math.min(
        0.9,
        0.3 +
          player.attributes.tackling * 0.025 +
          player.attributes.anticipation * 0.01 -
          carrier.player.attributes.ballControl * 0.01 +
          (hardTackle ? 0.08 : 0),
      ),
    );
    state.currentAction = "TACKLING";

    const successful = this.random() <= chance;

    if (successful) {
      this.ballInteraction.assignPossession(player.id, teamId, match.ball);
      this.ballInteraction.updateControlledBall(state, match.ball);
      this.grantPossessionShield(match, player.id);
    }

    MatchStatisticsService.recordTackle(
      match,
      teamId,
      player.id,
      successful,
    );
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
      // Reaching ANY teammate is a completed pass, not just the one the
      // passer was aiming at.
      MatchStatisticsService.completePass(
        match,
        pending.teamId,
        pending.passerId,
      );

      this.lastCompletedPasses.set(match.id, {
        passerId: pending.passerId,
        receiverId,
        teamId: pending.teamId,
        tick: match.tick,
      });
    } else {
      // Intercepted by an opponent.
      MatchStatisticsService.recordInterception(
        match,
        receiverTeamId,
        receiverId,
      );
      this.lastCompletedPasses.delete(match.id);
    }

    this.pendingPasses.delete(match.id);
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

  // The save roll is made ONCE per shot. Rolling every tick while the ball
  // approaches gave the keeper several attempts at the same shot, so the
  // result depended on how many ticks the ball took to arrive.
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

  // A save only counts when it stops a recent shot by the other team.
  // Catching a pass, a loose ball or a cross is not a save.
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

    // A ball held by a player cannot score. Without this, picking the ball
    // up next to the goal line moves it across the line and counts a goal
    // that no shot produced.
    if (match.ball.possessionPlayerId !== null) {
      match.ball.position = PitchService.clampPosition(currentPosition);
      return;
    }

    const crossedRight =
      previousPosition.x < PITCH_DIMENSIONS.length &&
      currentPosition.x >= PITCH_DIMENSIONS.length;

    const crossedLeft =
      previousPosition.x > 0 &&
      currentPosition.x <= 0;

    if (crossedRight || crossedLeft) {
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

          this.pendingShots.delete(match.id);
          this.pendingPasses.delete(match.id);
          this.lastCompletedPasses.delete(match.id);
          this.resetBall(match);
          return;
        }

        // Not from a shot: no goal. Falls through and is handled as a dead
        // ball below.
      }
    }

    const outsidePitch =
      currentPosition.x < 0 ||
      currentPosition.x > PITCH_DIMENSIONS.length ||
      currentPosition.y < 0 ||
      currentPosition.y > PITCH_DIMENSIONS.width;

    if (outsidePitch) {
      this.pendingPasses.delete(match.id);
      this.lastCompletedPasses.delete(match.id);

      match.ball.position = PitchService.clampPosition(currentPosition);
      match.ball.velocity = { x: 0, y: 0 };
      match.ball.verticalVelocity = 0;
      match.ball.height = 0;
      match.ball.possessionPlayerId = null;
      match.ball.possessionTeamId = null;
    }
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
  }

  private updatePossessionFlags(match: MatchState): void {
    match.homeTeamState.hasPossession =
      match.ball.possessionTeamId === match.homeTeam.id;
    match.awayTeamState.hasPossession =
      match.ball.possessionTeamId === match.awayTeam.id;
  }
}