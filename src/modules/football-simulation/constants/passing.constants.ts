export const PASSING_CONSTANTS = {
  // Fallback / cap speeds.
  SHORT_PASS_SPEED: 12,
  THROUGH_BALL_SPEED: 16,
  LONG_PASS_SPEED: 22,

  SHORT_PASS_VERTICAL_SPEED: 0,
  THROUGH_BALL_VERTICAL_SPEED: 1.5,
  LONG_PASS_VERTICAL_SPEED: 7,

  // Ground passes are launched so they ARRIVE at this speed
  // (v0 = sqrt(arrival² + 2 × friction × distance)), clamped to min/max.
  SHORT_PASS_ARRIVAL_SPEED: 6,
  SHORT_PASS_MIN_SPEED: 5,
  SHORT_PASS_MAX_SPEED: 14,

  THROUGH_BALL_ARRIVAL_SPEED: 8,
  THROUGH_BALL_MIN_SPEED: 7,
  THROUGH_BALL_MAX_SPEED: 18,

  // Lofted passes: horizontal speed = distance / flight time, clamped.
  LONG_PASS_MIN_SPEED: 12,
  LONG_PASS_MAX_SPEED: 28,

  BASE_ACCURACY: 0.85,

  MAX_ERROR_DISTANCE: 4,

  ATTRIBUTE_ACCURACY_WEIGHT: 0.0075,

  MAX_LEAD_DISTANCE: 8,
} as const;