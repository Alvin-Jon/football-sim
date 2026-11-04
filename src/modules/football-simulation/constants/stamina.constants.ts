export const STAMINA_CONSTANTS = {
  MAX_STAMINA: 100,

  // Speed bands in metres per second.
  SPRINT_SPEED: 7.5,
  HIGH_SPEED: 5.5,
  JOG_SPEED: 2.5,
  WALK_SPEED: 0.5,

  // Drain per second at each band.
  SPRINT_DRAIN: 0.05,
  HIGH_SPEED_DRAIN: 0.02,
  JOG_DRAIN: 0.006,

  // Recovery per second (positive = stamina regained).
  WALK_RECOVERY: 0.004,
  IDLE_RECOVERY: 0.025,

  // The player's stamina attribute (1-20) scales drain and recovery.
  // Attribute 1 drains 30% faster and recovers 20% slower; attribute 20
  // drains 30% slower and recovers 20% faster.
  MAX_DRAIN_MULTIPLIER: 1.3,
  MIN_DRAIN_MULTIPLIER: 0.7,
  MIN_RECOVERY_MULTIPLIER: 0.8,
  MAX_RECOVERY_MULTIPLIER: 1.2,

  // Stamina points regained at half-time.
  HALF_TIME_RECOVERY: 25,
} as const;