export type ReceivingOutcome =
  | "NOT_READY"
  | "MOVING_TO_BALL"
  | "CONTROLLED"
  | "MISCONTROLLED";

export interface ReceivingResult {
  playerId: string;
  outcome: ReceivingOutcome;
  controlChance: number;
  distanceToBall: number;
}