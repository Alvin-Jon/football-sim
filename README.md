# Football Sim

This repository contains a TypeScript football-match simulation prototype and a
Fastify server scaffold. The simulation has several implemented systems, but
they are not yet connected into a complete match loop. This document describes
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
advance a tick. A tick updates player movement and stamina and advances the
clock. Player movement uses pace, acceleration, stamina state, and target
positions; pitch helpers provide dimensions, distance, direction transforms,
and position clamping.

### Football behavior systems

The following systems are implemented as services and exported from
`src/modules/football-simulation/index.ts`:

- **Decision-making:** generates on-ball and off-ball options; scores actions
  using player attributes, personality, traits, situation, passing lanes,
  movement space, and defensive context; and caches decisions until expiry or
  invalidation.
- **Action execution:** starts and tracks movement-oriented actions, including
  support, runs, pressing, marking, tracking back, and moving to intercept.
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

1. **The main tick is not a football simulation loop.** `MatchEngineService.tick`
   only updates player movement, stamina, the clock, and the tick counter. It
   does not invoke decision-making or action execution, update ball physics or
   possession, or process passes, shots, interceptions, goalkeeper actions,
   goals, or score changes.
2. **The behavior services are mostly standalone.** They can be used directly,
   but the match engine does not coordinate them. In particular, decisions are
   not turned into match events or ball actions by the tick loop.
3. **Several actions have no executor.** `ActionEngineService` handles
   movement-oriented actions. Other decisions—including pass, through ball,
   long ball, shoot, cross, dribble, hold ball, tackle, and hard tackle—return
   a failed execution with an “is not implemented yet” message. The separate
   passing and shooting services do not currently fill this integration gap.
4. **Goalkeeper behavior is not end-to-end.** Positioning and decision
   selection exist, but the match loop does not call them. The goalkeeper
   action service leaves catch, parry, punch, and distribution to other
   handlers, and save evaluation/execution is not wired to shot resolution or
   scorekeeping.
5. **Match progression is caller-controlled.** The engine does not automatically
   stop at 45 or 90 minutes, transition to half-time, or finish a match. The
   caller must make those transitions. There is no stoppage time, extra time,
   penalty shootout, or event log in the match state.
6. **The server has no application API yet.** The current repository contains
   no route files or application-plugin files. The Fastify scaffold and Swagger
   UI are present, but there are no implemented HTTP endpoints for managing
   teams, matches, or simulation state.
7. **Persistence, authentication, and live transport are inactive.** The
   database, authentication, and Socket.IO plugin source currently consists
   of commented-out code. The match state is in-memory and there is no
   persistence or live match broadcasting.
8. **Some model/configuration fields are not consumed by the running loop.**
   Team tactics, goalkeeper statistics, and positioning preferences are
   represented in services/types, but are not incorporated into the match
   tick. Some declared traits also have no action influence mapping.
9. **Validation and test coverage are limited.** Initialization validates
   roster shape and pace, but does not validate all player attributes or team
   data. `package.json` has build and simulation scripts but no test or lint
   script, and no automated test suite is present in the repository.

## Running the current code

Install dependencies with `npm install`, then use:

```sh
npm run dev       # Start the Fastify server in watch mode
npm run build     # Type-check and compile TypeScript into dist/
npm start         # Start the compiled server
npm run simulate  # Run the scripted two-half match-clock simulation
```

The simulation script in `src/scripts/simulate-match.ts` creates two generated
4-3-3 teams, starts a match, advances it through two 45-minute halves, and
checks the match lifecycle. It currently exercises clock and player updates;
it does not simulate football actions or score goals.

## Main code map

- `src/modules/football-simulation/services/` — match, movement, decision,
  ball, passing, shooting, interception, and goalkeeper services.
- `src/modules/football-simulation/types/` and `constants/` — simulation
  data contracts and tuning values.
- `src/modules/football-simulation/formations/` — the supplied 4-3-3.
- `src/scripts/simulate-match.ts` — standalone match lifecycle simulation.
- `src/server.ts`, `src/app.ts`, and `src/plugins/external/` — Fastify
  bootstrap and server plugins.

