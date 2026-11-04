# Football Sim

This repository contains a TypeScript football-match simulation prototype and a
Fastify server scaffold. The match tick now coordinates player decisions,
movement, ball interactions, and goalkeeper behavior. This document describes
the current code rather than an intended or future feature set.

## What is here

### Match and player model

The simulation domain is under `src/modules/football-simulation/`. It defines
teams, players and their attributes, formations, match/player state, pitch
coordinates, the ball, match phases, and decision/action result types.

`MatchInitializationService` validates that each team has 11 players and 11
formation slots, unique player and slot IDs, exactly one goalkeeper slot, and
integer pace values from 1 to 20. It assigns players to slots by position,
creates their initial states, sets the ball at the pitch centre, and sets the
first-half directions. Only the `4-3-3` formation is supplied by
`src/modules/football-simulation/formations/4-3-3.formation.ts`.

The match clock and `MatchEngineService` support explicit match-state
transitions: start, finish the first half, start the second half, finish, and
advance a tick. A tick updates movement and stamina, advances the clock and
ball, and delegates football decisions and action resolution to
`MatchActionService`. Player movement uses pace, acceleration, stamina state,
and target positions; pitch helpers provide dimensions, distance, direction
transforms, and position clamping.

### Football behavior systems

The following systems are implemented as services and exported from
`src/modules/football-simulation/index.ts`:

- **Decision-making:** generates on-ball and off-ball options; scores actions
  using player attributes, personality, traits, situation, passing lanes,
  movement space, and defensive context; and caches decisions until expiry or
  invalidation.
- **Action execution:** starts and tracks movement-oriented actions, including
  support, runs, pressing, marking, tracking back, and moving to intercept.
  The match action coordinator also dispatches passes, crosses, shots, dribbling,
  tackles, and holding the ball to their corresponding behaviors.
- **Ball handling and flight:** assigns/releases possession, follows a
  controlling player, deflects the ball, simulates horizontal and vertical
  motion, and predicts a trajectory without mutating the match ball.
- **Passing, receiving, and shooting:** calculate execution accuracy and ball
  velocity, model receiving/control outcomes, and return result objects.
- **Interceptions:** predicts ball flight and selects a reachable interception
  point based on player movement estimates and attributes.
- **Goalkeeping:** calculates positioning, predicts shots on goal, chooses
  goalkeeper decisions, evaluates save chances, executes catches/parries/
  punches, selects a distribution target, and maintains goalkeeper statistics.
- **Positioning and player traits:** provides formation-position preferences
  and attribute/action influences for the supported player traits.

The football model uses a 105-by-68 pitch, 20 ticks per second by default, and
constants for movement, ball physics, passing, receiving, shooting,
interceptions, and goalkeeper behavior.

### Server scaffold

`src/server.ts` starts Fastify on port `5050` by default, and `src/app.ts`
autoloads external plugins, application plugins, and routes. The server
configures logging, request timeouts, error handling, and a rate-limited 404
handler. The external plugin directory contains configuration for CORS,
Helmet, rate limiting, sensible utilities, environment loading, and Swagger
UI at `/docs`.

## Known gaps in the current implementation

These are gaps in the code as it stands, not assumptions about intended
product requirements:

1. **Match progression is caller-controlled.** The engine does not automatically
   stop at 45 or 90 minutes, transition to half-time, or finish a match. The
   caller must make those transitions. There is no stoppage time, extra time,
   penalty shootout, or event log in the match state.
2. **Some football rules are not modeled.** There are no fouls/cards,
   offside, throw-ins, corners, free kicks, substitutions, or goalkeeper
   statistics integration. A ball leaving the pitch outside the goal is stopped
   at the boundary rather than restarting play with a set piece.
3. **Action outcomes are simplified.** Tackle success is probabilistic but does
   not produce fouls or cards. Crosses use the long-pass model, and a shot uses
   a fixed power-shot type and goal-center target. Save attempts are resolved
   by the goalkeeper services but are not recorded in match statistics.
4. **The server has no application API yet.** The current repository contains
   no route files or application-plugin files. The Fastify scaffold and Swagger
   UI are present, but there are no implemented HTTP endpoints for managing
   teams, matches, or simulation state.
5. **Persistence, authentication, and live transport are inactive.** The
   database, authentication, and Socket.IO plugin source currently consists
   of commented-out code. The match state is in-memory and there is no
   persistence or live match broadcasting.
6. **Some model/configuration fields are not consumed by the running loop.**
   Team tactics and formation positioning preferences are represented in
   services/types, but do not yet influence match decisions. Some declared
   traits also have no action-influence mapping.
7. **Validation and test coverage are limited.** Initialization validates
   roster shape and pace, but does not validate all player attributes or team
   data. `package.json` has build and simulation scripts but no test or lint
   script, and no automated test suite is present in the repository.

## Running the current code

Install dependencies with `npm install`, then use:

```sh
npm run dev       # Start the Fastify server in watch mode
npm run build     # Type-check and compile TypeScript into dist/
npm start         # Start the compiled server
npm run simulate  # Run the scripted two-half match simulation
```

The simulation script in `src/scripts/simulate-match.ts` creates two generated
4-3-3 teams, starts a match, advances it through two 45-minute halves, and
checks the match lifecycle. The match engine now also runs its football action
loop during those ticks.

## Main code map

- `src/modules/football-simulation/services/` — match, movement, decision,
  ball, passing, shooting, interception, and goalkeeper services.
- `src/modules/football-simulation/types/` and `constants/` — simulation
  data contracts and tuning values.
- `src/modules/football-simulation/formations/` — the supplied 4-3-3.
- `src/scripts/simulate-match.ts` — scripted two-half match simulation.
- `src/server.ts`, `src/app.ts`, and `src/plugins/external/` — Fastify
  bootstrap and server plugins.
