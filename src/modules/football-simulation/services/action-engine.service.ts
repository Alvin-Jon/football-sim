import type { DecisionResult } from "../types/decision.types.js";
import type { PlayerMatchState } from "../types/player-state.types.js";
import type {
  ActionExecution,
  ActionExecutionResult,
} from "../types/action.types.js";

import { PitchService } from "./pitch.service.js";

export class ActionEngineService {
  private executions = new Map<string, ActionExecution>();

  execute(
    state: PlayerMatchState,
    decision: DecisionResult,
    tick: number,
  ): ActionExecutionResult {
    const executionId = `${decision.playerId}:${decision.evaluatedAtTick}`;

    const existing = this.executions.get(decision.playerId);

    // The same decision has already been executed.
    if (existing?.id === executionId) {
      return { execution: existing };
    }

    // A different decision replaces the previous action.
    if (existing && existing.status === "RUNNING") {
      this.cancel(existing, state);
    }

    const execution: ActionExecution = {
      id: executionId,
      playerId: decision.playerId,
      action: decision.action,
      decision,
      status: "PENDING",
      startedAtTick: tick,
      updatedAtTick: tick,
    };

    this.executions.set(decision.playerId, execution);

    return this.startExecution(execution, state, tick);
  }

  private startExecution(
    execution: ActionExecution,
    state: PlayerMatchState,
    tick: number,
  ): ActionExecutionResult {
    const action = execution.action;

    switch (action) {
      case "MOVE":
      case "SUPPORT":
      case "MAKE_RUN":
      case "PRESS":
      case "MARK":
      case "TRACK_BACK":
      case "INTERCEPT":
        return this.startMovement(execution, state, tick);

      default:
        execution.status = "FAILED";
        execution.updatedAtTick = tick;

        return {
          execution,
          message: `Execution for ${action} is not implemented yet.`,
        };
    }
  }

  private startMovement(
    execution: ActionExecution,
    state: PlayerMatchState,
    tick: number,
  ): ActionExecutionResult {
    const target = execution.decision.targetPosition;

    if (!target) {
      execution.status = "FAILED";
      execution.updatedAtTick = tick;

      return {
        execution,
        message: "Movement action requires a target position.",
      };
    }

    state.targetPosition = target;
    state.isMoving = true;

    switch (execution.action) {
      case "PRESS":
        state.currentAction = "PRESSING";
        break;

      case "MARK":
        state.currentAction = "MARKING";
        break;

      case "MAKE_RUN":
        state.currentAction = "RUNNING";
        break;

      default:
        state.currentAction = "MOVING";
        break;
    }

    execution.status = "RUNNING";
    execution.updatedAtTick = tick;

    return { execution };
  }

  update(
    state: PlayerMatchState,
    tick: number,
  ): ActionExecutionResult | null {
    const execution = this.executions.get(
      this.getPlayerIdFromState(state),
    );

    if (!execution || execution.status !== "RUNNING") {
      return null;
    }

    execution.updatedAtTick = tick;

    if (!state.targetPosition) {
      return null;
    }

    const distance = PitchService.getDistance(
      state.position,
      state.targetPosition,
    );

    if (distance > 0.5) {
      return { execution };
    }

    execution.status = "COMPLETED";

    state.targetPosition = null;
    state.isMoving = false;
    state.currentAction = "IDLE";

    return { execution };
  }

  cancel(
    execution: ActionExecution,
    state?: PlayerMatchState,
  ): void {
    execution.status = "CANCELLED";

    if (state) {
      state.targetPosition = null;
      state.isMoving = false;
      state.currentAction = "IDLE";
    }
  }

  getExecution(playerId: string): ActionExecution | undefined {
    return this.executions.get(playerId);
  }

  clear(): void {
    this.executions.clear();
  }

  private getPlayerIdFromState(state: PlayerMatchState): string {
    return state.playerId;
  }
}