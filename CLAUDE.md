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
wheel finish, and visual ride height carry across views and save locally alongside
the selected drivetrain. FWD is the default; drivetrain tuning itself is unchanged.
They do not alter simulation handling or represent purchased performance parts.
Menu state gates fixed simulation ticks rather than living inside the renderer.
The default car is the original NS-01 Blender asset (`assets/cars/ns-coupe-01.blend`
-> `public/assets/cars/ns-coupe-01.glb` -> `src/render/blender-car.ts`). The old
procedural `src/render/car.ts` body is retained behind `?car=classic`; its geometry
tests do not validate the new model. Read `assets/cars/README.md` before editing
or exporting the Blender car. `pnpm car:export` exports saved hand edits without
regenerating the source; `scripts/build-coupe.py` deliberately overwrites it.
New body clearance uses triangle-vs-convex-wheel tests because its wheel arches
make it concave. Neither asset changes the simulation collider or handling.
The tunnel/bridge now load `public/assets/tracks/blackglass-rivergate.glb` via
`src/render/blender-course.ts`. Read `assets/tracks/blackglass/README.md` before
editing the source. `pnpm track:export` preserves saved hand edits; the original
`build-blackglass.py` generator overwrites the .blend. `track:guide` exports
reference road/barrier data but does not update the authored model. A quantized
route fingerprint plus three anchors reject stale/misaligned exports. Do not
silence that check by changing the stamp without reconciling geometry. The
renderer keeps road/barrier meshes and all physics procedural; only tunnel,
bridge and distant backdrop are authored. `?environment=classic` explicitly
selects the old presentation. Export batches a temporary copy by spatial
section/material; source pieces remain editable. There are four pooled runtime
lights, no imported Blender lights/textures, and no silent asset fallback.
`tests/blender-course.test.ts` checks actual GLB validity, inward winding,
road-envelope clearance, alignment and unchanged road presentation. The browser
harness is `scripts/check-track-browser.js`; staged poses are visual checks,
not evidence of a completed driven lap. The reference-lap test remains the
driving gate. Desktop/mobile screenshots do not certify mobile GPU performance.
The sampled course has
automated centerline, road-clearance, corner-envelope, and reference-driver
checks. It also owns a 24 m elevation profile used by vehicle height,
pitch, barriers, presentation, and deterministic grade acceleration. Vertical
contact remains an arcade road constraint rather than a raycast suspension
model. Four virtual tyre patches do not yet simulate wheel lift, inertia or
individual lockup. The course brief is `design/BLACKGLASS.md`.
The handling model, deliberate assists, limitations, and measured acceptance
gates are described in `design/HANDLING.md`.
The district layout study is documented in `design/DISTRICT.md`. It is now the
default world and is entered as **free roam**: no track selection, no route, no
finish. `/district.html` previews six route guides over shared fixed streets;
`?route=<id>` overlays one, and `?world=blackglass` returns to the original
closed course. These are not scored races: junctions stay open, arrows guide a
route when one is selected, and there are no lap/checkpoint/payout rules yet.
The network is closed by a boundary that belongs to no street, because junction
clipping opens boundary pieces wherever streets cross and the network now
reaches the district's edge; the river banks and lineside are walled the same
way, opened only where a street genuinely spans them. Road class lives in
`src/sim/lanes.ts` with the carriageway width and lane count it implies —
they are one fact, not two — and lanes are laid out to a street's narrowest
point so they do not wander with the junction flare. Massing blocks are solid via `RoadWorld.solids`, kept
apart from `walls` because a wall is 1.3 m of guard rail and renders as one. `RoadWorld` supplies the sim's start,
boundaries and projection; reset and session rivals must retain that world.
Baseline Blackglass references and handling stay unchanged. District junction
grading is shared by physics and road meshes; do not "fix" it only visually.
`src/sim/lanes.ts` owns the lane model: two lanes each way whose width breathes
with the carriageway (16-22 m here), signed so every lane sits on the right of
its own direction of travel, plus arc-length sampling and `lanePose` — what a
traffic follower or a rival needs to sit in a lane. A lane is its own mitered
polyline; do not go back to offsetting a centreline sample sideways, which jumps
up to 2.79 m at an authored vertex. `lanePose`'s distance is centreline arc
length in the lane's direction, not the offset lane's own length, which differs
by up to 2.7% round a bend. It is world geometry, so it
lives in the sim; the renderer paints those lanes rather than deriving its own,
and `laneMarkings` is the single authority on where a divider or an edge line
goes. `districtLanePose` binds it to the district's graded surface. Lanes are
district-only so far; `RoadWorld` does not carry them and Blackglass has none.
Nothing drives the lanes yet — traffic (GDD §12) is unimplemented.
The district is dressed for night by default (GDD §15.1): lane paint dropped
onto the graded surface, sodium lamps with additive light pools, lit facades and
shopfront glass, neon signage, wet asphalt and a camera-following sky dome. All
of it is generated from the street/block/junction data, is deterministic
(`hash01`, never `Math.random`), and merges into a handful of meshes rather than
adding lights. `?lighting=blockout` restores the flat work view with no dressing
at all, because neon hides the surface errors that view exists to find. There is
no traffic, no bloom pass and no reflections. Baseline Blackglass presentation is
untouched. `src/ui/hud.ts` draws the speed dial and the heading-up minimap from
`src/ui/hud-state.ts`; the map reads street data, never the renderer, and the
cluster binds to ids that `tests/hud.test.ts` checks against `index.html`.
Changing route reloads and loses session replay, not saved preferences.
Never use the original `courseGap` for district guides; `districtRouteGap`
wraps circuits and keeps sprint gaps linear. Debug links carry world/route
identity, which future saved ghosts must validate as well as physics/build.
Automatic countersteering is off (`four-wheel-v3`). Manual catches get faster
response and extra range only when the player requests countersteer; neutral
input never steers itself. Ordinary turn-in keeps its speed envelope, while
unwinding is quicker. Pause contains AWD/FWD/RWD comparison
buttons. Changing layout resets the run and clears replay history; ordinary
reset/replay retain the run's drivetrain. Full countersteer can catch longer
30 m/s slides; weak/late corrections and prolonged highway-speed slides remain
limitations. Tests distinguish manual recovery from automatic intervention.
`src/settings/settings.ts` owns versioned browser-local preferences, outside the
simulation. Restore preferences before creating the sim/view; synchronize menu
selections from that state. URL overrides are temporary: `settings.preview()`
suppresses writes while `applyDeepLink()` drives the real menu callbacks. Deliberate
menu edits save only their own fields and clear matching URL parameters. Do not
persist physics snapshots, replay data, camera poses or debug flags in this store.
Save failures are visible in Pause/Garage and do not block playing. Historical
AWD performance/contact fixtures name that layout explicitly; default-FWD and
all-layout behavioral coverage remain separate.

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
