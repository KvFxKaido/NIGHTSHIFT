# CLAUDE.md

Context for AI assistants working on NIGHTSHIFT.

## What this is

A compact arcade street racer — night, one district, one car the player
grows attached to, rivals as driving personalities. The design document
at `design/GDD.md` is the source of truth; when this file and the GDD
disagree, the GDD wins, and when code and the GDD disagree, say so out
loud instead of quietly picking one.

Working title: Project Nightshift. Status: Early Prototype — Phase 1.

## The two laws (non-negotiable)

1. **The renderer draws; the sim decides** (GDD §17.2). `src/sim/`
   imports nothing from three.js — no exceptions, no "just this once."
   Vehicle state, race rules, rival behavior, progression, traffic,
   input mapping: all sim. The render layer translates state into
   meshes, lights, particles, and camera; it never decides anything.
2. **The sim is deterministic.** Fixed tick (`TICK_HZ` in
   `src/sim/sim.ts`), no clock, no `Math.random`, no platform queries
   inside the sim. Every tick's input is logged; (start state + input
   log) must always reproduce the run. This is the ghost/replay
   foundation and it cannot be retrofitted, so any change that would
   break it is a design discussion, not a refactor. When Rapier carries
   physics, it steps inside the sim tick at fixed DT — never in the
   render loop — and its determinism constraints (same build, fixed
   timestep) are part of law 2. Rapier is pinned exactly; physics revisions
   carry `PHYSICS_VERSION`. Reset reconstructs the world/contact caches.
   Same-runtime collision replay is tested tick-for-tick and by world snapshot;
   this does not certify cross-browser floating-point parity. Future saved
   ghosts must carry physics/build identity and reject incompatible versions.

## House rules (inherited from the SENTINEL workshop)

- **Execute the claim.** Before asserting something is verified, run the
  exact thing that would fail if the assertion were false. Inspecting
  code, narrating arithmetic, or grepping for the convenient form of a
  pattern is a claim wearing verification's clothes.
- **The out-of-scope list is binding** (GDD §21). Police, pedestrians,
  multiplayer, weather, more cities, big car rosters — reconsidered only
  after the core loop has proven itself. Scope expansion is the named
  risk; do not be the vector.
- **Handling is the first quality gate** (GDD §22). Poor handling cannot
  be rescued by more content. Phase 1 work outranks everything until the
  car feels good.
- Phase 1's handling values are intentionally centralized in `HANDLING` in
  `src/sim/sim.ts`. Tune from evidence gathered on the handling course; do not
  scatter feel constants through simulation or rendering code.

## Current state

Phase 1 environment prototype: one low-poly car on the 1.70 km Blackglass
Circuit, including a long tunnel, steel-frame bridge, primitive city massing,
four-wheel tire forces with independent combined grip limits, front/rear and
left/right load transfer, and Rapier-integrated yaw/contact
response, keyboard and standard gamepad input, speed-sensitive
chase camera with right-stick orbit, reset/replay, toggleable telemetry, and a
light DOM menu shell for title, track selection, garage, and pause. The garage
uses a dedicated presentation scene and the same car mesh as the track; paint,
wheel finish, and visual ride height carry across views for the current session.
They do not alter simulation handling or represent purchased performance parts.
Menu state gates fixed simulation ticks rather than living inside the renderer.
The sampled course has
automated centerline, road-clearance, corner-envelope, and reference-driver
checks. It also owns a 24 m elevation profile used by vehicle height,
pitch, barriers, presentation, and deterministic grade acceleration. Vertical
contact remains an arcade road constraint rather than a raycast suspension
model. Four virtual tyre patches do not yet simulate wheel lift, inertia or
individual lockup. The course brief is `design/BLACKGLASS.md`.
The handling model, deliberate assists, limitations, and measured acceptance
gates are described in `design/HANDLING.md`.
Automatic countersteering is off (`four-wheel-v3`). Manual catches get faster
response and extra range only when the player requests countersteer; neutral
input never steers itself. Ordinary turn-in keeps its speed envelope, while
unwinding is quicker. Pause contains AWD/FWD/RWD comparison
buttons. Changing layout resets the run and clears replay history; ordinary
reset/replay retain the run's drivetrain. Full countersteer can catch longer
30 m/s slides; weak/late corrections and prolonged highway-speed slides remain
limitations. Tests distinguish manual recovery from automatic intervention.

The proposed core gameplay/economy hook is Live Cred: style earned in a race
can be burned on Surge or carried across the finish line as performance-parts
currency. It is specified in `design/LIVE_CRED.md` and summarized in GDD
sections 3.6, 5.1, and 8.4. **It is not implemented in the current prototype.**
Keep Chain Cred, Live Cred, Banked Cred, and lifetime reputation distinct when
working on it; race-time Surge must never consume the permanent wallet.
Every mesh in the car and the course carries a kebab-case `name`, and
`src/debug/debug.ts` installs `window.__ns` for inspection that both people and
agents can drive: `__ns.pick(x, y, screenshotWidth)` names the mesh under a
pixel, `__ns.find`, `__ns.state`, `__ns.drive("W600,WD90")`, `__ns.freeze()`,
`__ns.shot()`. Scene state is reachable by URL — `?scene=garage&paint=blackglass
&stance=slammed`, `?scene=track&drive=W600&freeze=1` — which is the supported
way to reach a specific state; do not script menu clicks. The API clicks the
real menu buttons, so a scripted jump cannot diverge from a human's.
For drivetrain comparisons use `?scene=pause&drivetrain=rwd`, or
`__ns.drivetrain('awd' | 'fwd' | 'rwd')`; these use the same restart boundary.

`pnpm dev` to run, `pnpm test` for deterministic simulation checks, and
`pnpm build` to typecheck + build. CI runs the build on every push.

## Relationship to SENTINEL

Same engineering doctrine, different universe — deliberately. Do not
import SENTINEL lore, factions, or aesthetics here; the decision and its
reasoning live in the SENTINEL session history (2026-07-30). If a
crossover ever happens, it is Shawn's call at naming time, not an
assistant's flourish.
