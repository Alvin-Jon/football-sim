import type { PassType } from "../types/passing.types.js";

/**
 * Remembers the completion probability the evaluator last predicted for a
 * (passer, receiver, pass type) option, so the match can compare it with
 * what actually happened once that pass is played.
 */
const latest = new Map<string, number>();

const key = (passerId: string, receiverId: string, type: PassType): string =>
  `${passerId}|${receiverId}|${type}`;

export const PassPredictionStore = {
  record(
    passerId: string,
    receiverId: string,
    type: PassType,
    probability: number,
  ): void {
    latest.set(key(passerId, receiverId, type), probability);
  },

  /** Returns and clears the latest prediction for this option. */
  take(
    passerId: string,
    receiverId: string,
    type: PassType,
  ): number | undefined {
    const k = key(passerId, receiverId, type);
    const value = latest.get(k);
    latest.delete(k);
    return value;
  },

  clear(): void {
    latest.clear();
  },
};