import type { MatchClock } from "../types/match.types.js";

export class MatchClockService {
  static update(
    clock: MatchClock,
    deltaTime: number,
  ): MatchClock {
    const elapsedSeconds = clock.elapsedSeconds + deltaTime;

    const totalSeconds = Math.floor(elapsedSeconds);

    return {
      ...clock,

      elapsedSeconds,

      minute: Math.floor(totalSeconds / 60),

      second: totalSeconds % 60,
    };
  }

  static startSecondHalf(clock: MatchClock): MatchClock {
    return {
      ...clock,
      half: 2,
      elapsedSeconds: 45 * 60,
      minute: 45,
      second: 0,
    };
  }
}