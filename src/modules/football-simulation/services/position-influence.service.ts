import type {
  DecisionAction,
  DecisionCandidate,
  DecisionContext,
} from "../types/decision.types.js";

export type PlayerRole =
  | "CENTRE_BACK"
  | "FULL_BACK"
  | "DEFENSIVE_MID"
  | "CENTRAL_MID"
  | "ATTACKING_MID"
  | "WINGER"
  | "STRIKER";

export class PositionInfluenceService {
  private static readonly PROFILES: Record<
    PlayerRole,
    Partial<Record<DecisionAction, number>>
  > = {
    // Safe, simple distribution. Never shoot, dribble or run beyond the ball.
    CENTRE_BACK: {
      TRACK_BACK:5,
      PASS: 8,
      LONG_BALL: 8,
      THROUGH_BALL: -10,
      CROSS: -15,
      DRIBBLE: -12,
      SHOOT: -25,
      MAKE_RUN: -15,
      SUPPORT: 2,
    },

    // Link play and deliver crosses; seldom shoot.
    FULL_BACK: {
      PASS: 4,
      THROUGH_BALL: -4,
      CROSS: 8,
      DRIBBLE: -2,
      SHOOT: -8,
      MAKE_RUN: -2,
    },

    // Keep the ball moving, protect the defence.
    DEFENSIVE_MID: {
      PASS: 8,
      LONG_BALL: 4,
      CROSS: -10,
      DRIBBLE: -8,
      SHOOT: -3,
      MAKE_RUN: -6,
      HOLD_BALL: 16,
    },

    // Balanced; the team's main passers and playmakers.
    CENTRAL_MID: {
      PASS: 4,
      THROUGH_BALL: 6,
      CROSS: -4,
    },

    // Creators: through balls, some shooting and carrying.
    ATTACKING_MID: {
      PASS: -10,
      THROUGH_BALL: 10,
      LONG_BALL: -6,
      DRIBBLE: 6,
      SHOOT: 2,
      MAKE_RUN: 9,
      SUPPORT: 3,
    },

    // Take players on and deliver crosses; seldom recycle the ball.
    WINGER: {
      PASS: -13,
      THROUGH_BALL: -4,
      LONG_BALL: -10,
      CROSS: 12,
      DRIBBLE: 15,
      SHOOT: 2,
      MAKE_RUN: 12,
      SUPPORT: -4,
    },

    // Finish moves rather than build them: shoot, run in behind, and stay
    // forward instead of dropping to the ball.
    STRIKER: {
      PASS: -24,
      THROUGH_BALL: -10,
      LONG_BALL: -16,
      CROSS: -30,
      DRIBBLE: 6,
      SHOOT: 6,
      HOLD_BALL: 4,
      MAKE_RUN: 12,
      SUPPORT: -10,
    },
  };

  static getRole(position: string): PlayerRole {
    const name = position.toUpperCase();

    if (/CB|SW/.test(name)) return "CENTRE_BACK";
    if (/WB|FB|^LB$|^RB$/.test(name)) return "FULL_BACK";
    if (/DM/.test(name)) return "DEFENSIVE_MID";
    if (/AM/.test(name)) return "ATTACKING_MID";
    if (/ST|CF|FW/.test(name)) return "STRIKER";
    if (/W/.test(name) || /^(L|R)M$/.test(name)) return "WINGER";

    return "CENTRAL_MID";
  }

  evaluate(context: DecisionContext, candidate: DecisionCandidate): number {
    const role = PositionInfluenceService.getRole(
      context.player.player.position,
    );

    return PositionInfluenceService.PROFILES[role][candidate.action] ?? 0;
  }
}