export const GOALKEEPER_CONSTANTS = {
  GOAL_LINE_OFFSET: 0.8,

  MAX_POSITIONING_DISTANCE: 6,

  // and close to goal, and never far from the goal line.
  MAX_RUSH_DISTANCE: 10, // keeper to ball carrier
  RUSH_ZONE_DISTANCE: 16, // ball carrier to goal
  MAX_RUSH_FROM_GOAL: 12, // furthest the keeper may leave his goal

  SHOT_PREDICTION_TIME: 3,

  MAX_SAVE_HEIGHT: 2.4,

  SAVE_REACH_RADIUS: 2.5,

  // Fast shots can be caught, not only parried.
  CATCH_MAX_BALL_SPEED: 22,

  CLAIM_CROSS_RADIUS: 18,

  MIN_SAVE_CHANCE: 0.1,

  MAX_SAVE_CHANCE: 0.97,

  DISTRIBUTION_DISTANCE: 35,

  MIN_DISTRIBUTION_DISTANCE: 8,
  PARRY_SPEED_MULTIPLIER: 0.65,
  PARRY_MAX_SPEED: 12,
  PUNCH_SPEED: 14,
  PARRY_VERTICAL_SPEED: 3,
  PUNCH_VERTICAL_SPEED: 7,

  // Matches the reach radius, so a keeper who can reach a shot can touch it.
  SAVE_CONTACT_RADIUS: 2.5,

  // Save chance penalties.
  SAVE_DISTANCE_PENALTY: 0.06, // per metre the keeper must cover
  SAVE_SPEED_PENALTY: 0.012, // per m/s above the threshold below
  SAVE_SPEED_THRESHOLD: 15,
  SAVE_CORNER_PENALTY: 0.15, // full penalty for a shot at the post
} as const;