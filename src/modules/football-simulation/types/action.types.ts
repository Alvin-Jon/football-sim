import type { DecisionAction, DecisionResult } from "./decision.types.js";

export type ActionExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ActionExecution {
  id: string;
  playerId: string;
  action: DecisionAction;
  decision: DecisionResult;
  status: ActionExecutionStatus;
  startedAtTick: number;
  updatedAtTick: number;
}

export interface ActionExecutionResult {
  execution: ActionExecution;
  message?: string;
}