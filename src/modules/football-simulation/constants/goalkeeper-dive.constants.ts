export const DIVE_CONSTANTS = {
  // Furthest a keeper can still lunge for a point on a shot's path (metres).
  // Beyond this he can only run, which is too slow to matter.
  MAX_DIVE_DISTANCE: 5.5,

  // Lunge speed (m/s) = BASE + reflexes * PER_REFLEX, clamped, then scaled
  // by stamina. Normal running is acceleration-limited, which is why a
  // sent-diving keeper never got anywhere in the time a shot takes.
  BASE_DIVE_SPEED: 7,
  DIVE_SPEED_PER_REFLEX: 0.25,
  MIN_DIVE_SPEED: 7,
  MAX_DIVE_SPEED: 12,

  // Seconds before a keeper reacts to a shot.
  REACTION_TIME: 0.15,
} as const;

// Where a keeper stands when he comes out at an attacker: on the line
// between the attacker and the middle of the goal (so he covers the shot),
// a fraction of the way out, never further than MAX_OUT.
export const RUSH_POSITIONING = {
  FRACTION: 0.4,
  MIN_OUT: 2,
  MAX_OUT: 8,
} as const;

export function getDiveSpeed(reflexes: number, stamina: number): number {
  const speed = Math.max(
    DIVE_CONSTANTS.MIN_DIVE_SPEED,
    Math.min(
      DIVE_CONSTANTS.MAX_DIVE_SPEED,
      DIVE_CONSTANTS.BASE_DIVE_SPEED +
        reflexes * DIVE_CONSTANTS.DIVE_SPEED_PER_REFLEX,
    ),
  );

  return speed * Math.max(0.75, Math.min(1, stamina / 100));
}