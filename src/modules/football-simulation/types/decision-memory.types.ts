import type { DecisionResult } from "./decision.types.js";

export interface DecisionMemory {
  decision: DecisionResult;
  decidedAtTick: number;
  expiresAtTick: number;
}