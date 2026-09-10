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
- **Respect the current slice boundaries** (GDD §21). Seattle may grow
  naturally from driving feedback. Police and other selective LA ideas are
  deferred possibilities, not permanently prohibited or already authorized
  implementation tasks. Do not restore a second playable map or expand the
  current feature set without a user scope decision.
- **Handling is the first quality gate** (GDD §22). Poor handling cannot
  be rescued by more content. Phase 1 work outranks everything until the
  car feels good.
- Phase 1's handling values are intentionally centralized in `HANDLING` in
  `src/sim/sim.ts`. Tune from evidence gathered on the handling course; do not
  scatter feel constants through simulation or rendering code.

## Product direction (2026-09-10)

- MC3 spiritual successor, with selective LA ideas possible later.
- Open racing: no unnecessary barriers, no wrong-way penalties, just slower
  alternatives between ordered checkpoints. Real obstacles retain collision.
- Seattle is the sole demo map; grow it organically. MC3 San Diego is a scale
  reference, not a demand for another city or a fixed area.
- Graphics resemble upscaled/emulated MC3 rather than photorealism.
- Preserve the current handling in Three.js/Rapier. Build the PC prototype
  first; RedMagic 10 Pro is the eventual device, with port/testing later.
  Capacitor is an option, not a confirmed packaging decision.
- Customization target: body parts, paint and a few simple performance
  upgrades. Detailed mechanical tuning and DUB-depth customization are not
  requirements. Only paint, wheel finish and visual ride height exist today.
- The GDD contains future career/Live Cred/Surge proposals. Keep planned
  systems distinct from implemented behavior.

## Current state

Seattle is now the only playable demo map and the default at `/`. The user
explicitly retired the Blackglass map on September 10, 2026. Old world links
migrate to Seattle; `district.html` redirects to the Seattle map board.
Read `design/SEATTLE.md` for source geometry, regeneration and scope.

`pnpm seattle:critique` is the measuring stick for route choice, and the
material a race generator would draw from. The rule the map is held to is
"every shortcut has a cost": between two gates the faster way should be the
riskier way, or it is just a shorter road. The script scores risk per street
from the map data (width, bends, grade, blind corners) and reward per leg as
the TIME the best genuinely different alternative costs, routed on the line
graph so turns cost and straight-through is free — on a grid two ways round a
block are the same length, and only time tells them apart. First reading of
the slice: 1056 directed legs between choice points, 77% with an alternative
within 40% of the fastest time, median detour 11%; but only 66 are PRICED
(fastest is riskier) against 254 FREE (fastest is also safest) and 250 twins.
The grid's arterials win nearly everywhere; the real shortcuts are Western
Ave, 6th Ave S and the 2nd Ave / James St corridor, and there are no blind
corners in the slice at all (16 bends over 25 degrees, nearest building 24 m).
Width belongs in risk, not pace — with width cutting pace, every narrow
street was dominated by construction and the report said so about the model,
not the map. The pace model and the risk weights are declared proposals; it
asserts nothing; `--json` is for agents. Run it before and after authoring.
That arithmetic lives in `src/sim/route-choice.ts` (risk per street, the line
graph, `measureLeg`, `legTable`) and the critique only formats it, because
**races are generated from it**: `src/sim/race-generator.ts` draws three to
five junction gates per seed, each leg weighted by its class (priced 4, even
1.5, free 0.5, twin 0.3, none 0.4, +1.5 in the 10–25% sweet spot), never
reusing a street, 12–40 s a leg and 45–160 s a race, and routes the rival's
line through the gates from the streets' own points exactly as the authored
Sound to Sky line was built. `?race=gen-<seed>` is the race; the flash in
free roam loads `gen-${seedFromTick(tick)}`, so a replay of the cruise draws
the same race and every real flash draws a new one. Measured on the first
slice: the weighting doubles the share of priced-or-even legs (54% against
27% uniform), 60 of 60 seeds draw, and the rival finishes every generated
race tried with no recoveries and no resets. Sound to Sky stays as the
authored race and the rival tests' fixture. The seed uses `mix`, never
`Math.random`; the leg table is measured once per graph, so a draw costs
microseconds after the first. `design/PROCEDURAL_RACES.md` holds Shawn's
procedural direction — every flash a new race, playlists keep one, flashed
rivals learn your line per street — and the order of the work that follows;
read it before touching races or rivals.

Free roam starts at Wharf Garage in SoDo. Stop at its mapped entrance to
enter; the garage camera is fixed and right stick rotates the platform/car.
Races keep their separate street start and cannot enter the garage. The
handling model and tuning are unchanged.

The visual building workshop at `editor.html` now edits Seattle. Read
`design/EDITOR.md` before changing save behavior. Validated saves go to
`src/sim/seattle-layout.json`; rendering and Rapier share the resolved solids.
Roads, Wharf Garage and its forecourt are protected. Three.js scene export
and import remain supported.

Shared projection, footprints and lane-network construction live in
`street-path.ts`, `building-footprint.ts`, and `street-traffic.ts`. Do not
import the legacy district to reuse a helper: the production build rejects
old district/course renderers and district simulation data. Blackglass
source remains only as developer regression fixtures. Its GLB is archived
at `assets/tracks/blackglass-rivergate.glb`, outside public/demo assets.

## Historical Blackglass prototype notes (developer fixtures, not the demo)

Phase 1 environment prototype: one low-poly car on the 1.70 km Blackglass
Circuit, including a long tunnel, steel-frame bridge, primitive city massing,
four-wheel tire forces with independent combined grip limits, front/rear and
left/right load transfer, and Rapier-integrated yaw/contact
response, keyboard and standard gamepad input, speed-sensitive
chase camera with right-stick orbit, reset, toggleable telemetry, and a
light DOM menu shell for title, track selection, garage, and pause. Wharf Garage
occupies an existing warehouse plot beside Wharf Road, with a G marker on the
district map and minimap. Free roam starts at its entrance. Stop there outside
a race and press E/Enter or Cross/A to enter; leaving resumes the same run.
The garage uses a dedicated presentation scene and the same car mesh as the
track. Right-stick horizontal input turns the car and platform under a fixed
camera; R3/C resets the platform. Paint,
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
apart from `walls` because a wall is 1.3 m of guard rail and renders as one.
Two footprints are kept apart by a separating-axis test on the rectangles
(`blockPenetration`), never by circumscribed circles: a circle cannot express a
shared party wall, so it needs slack, and slack let 15 pairs interpenetrate by
up to 4.21 m. A solid's `rotation` is in `blockCorners`' convention — a 2D
rotation in the (x, z) plane — which placement, every footprint test and the
drawn mesh (`rotation.y = -rotation`) share; the Rapier collider must NEGATE it
(`roadRotation(-rotation, 0)`), because a rotation about +Y has the opposite
handedness. With the sign dropped every building's collider was the mirror
image of its footprint for two days — near-square core blocks hid it; a 32 x 11
warehouse put an invisible wall across Crane Alley and the first race found it.
`tests/district.test.ts` now asks Rapier itself whether each long building's
collider contains its own corner and not its mirror's; note Rapier's spatial
queries answer nothing until the world has stepped once, and its translations
are f32, so match them at 1e-3, not 1e-6. Walls keep their own sign.
Every building has a `base`: the LOWEST drawn ground under its footprint, so no
corner floats and the uphill side is buried by at most the ground's spread,
and placement refuses a plot whose ground drops more than 4 m across it (18
did, all beside the old loop's grades; they stay embankment). Mesh, collider
and every element of the night dressing measure from `base`, never from
datum — at datum, on a district that climbs 20 m, 227 of 321 buildings stood
more than a metre underground and a road on an embankment ran through a
building's floors, which from the car reads as a building clipping the road.
The boundary walls stand on `outerTerrain` for the same reason. A shop spill is
stamped with its own building's base as a vertex attribute so the test that
says "on its own pavement" has a reference that neither flips to the Rivergate
deck (nearest road) nor steps 11 m beside the loop (drawn ground) nor pairs it
with a building on the other level (nearest building). The race readout needs
`#race[hidden] { display: none; }`: its own `display: flex` beat the attribute
and it showed GATE 1/3 in free roam on every screen.
Three rules Shawn asked for are tests in `tests/district.test.ts`, each
mutation-checked: **buildings cannot clip roads** (every footprint edge sampled
against the asphalt that is actually there — already held), **buildings cannot
clip barriers** (no rail piece inside a footprint, no footprint in the river
or rail corridor — the map broke this: 46 buildings in the water, 7 on the
line, 27 rails through 19 of them; placement now clears the corridors and the
walls, 320 buildings became 274, and the wall half of that helper is not
load-bearing on today's map — the test is what enforces it), and **ground
cannot clip above road textures** (terrain, verges, river and rail ribbons
against the carriageway, 10 cm tolerance because the rail ribbon stands 5 cm
proud at a level crossing on purpose — already held). Barriers include the
authored structures: placement refuses a footprint inside a corridor of road
half-width plus 6 m along the tunnel and bridge spans (`blockClearsStructures`),
because to it the tunnel section was just a road and 14 buildings stood inside
the bore 12-15 m off its centreline, five on the floor and nine rising up
through its walls. The bore was measured against the asset, not the profile
that authored it: horizontal rays from the centreline hit the walls at
10.7-11.8 m. On this loop the tunnel runs straight onto the bridge, so the
structural span is one contiguous run, not two. 274 buildings became 272. The
frontage test measures against the kerb that is actually there, never the
narrowest width lanes are laid to — on a flare that put the kerb metres
inboard and read 162 of 272 buildings as off their frontage when 242 stand
within 5 m of the real one. **The night dressing is
built in each building's own frame and then turned by `-site.rotation`** — the
blockout's sign, which matches `blockCorners`. It used to be placed
axis-aligned at `site.x +/- width/2` with the rotation never applied, while the
footprint, the collider, the blockout massing and every clearance test rotate:
218 of 272 buildings were drawn more than a metre out of their own footprint,
with corners in roads, through rails and five metres into the tunnel bore. It
was the actual cause of "buildings clipping" in every night-mode screenshot,
and three other real fixes landed before it was found, because each of them
measured the FOOTPRINT and the footprint was right. `tests/night.test.ts`
now asserts every drawn facade vertex lies inside a real footprint, and that
no lamp post stands in the tunnel (`nearStructure` keeps street furniture out
of the structural corridors; the tunnel lights itself). When a screenshot
disagrees with a passing footprint test, scan the rendered scene's vertices —
`addDistrict` into a bare scene and project them — before trusting either.
The fourth rule the screenshots want is
road-over-road inside junction aprons, which is the apron work below.
**The rail rule.** A rail stands only where it guards something: the boundary,
the river and rail fences, the tunnel and bridge (their barriers are the
deck's edge and the bore's wall), or a street edge with a drop of 1.5 m in
the raw terrain to either side — or water, which the terrain does not show
because the river is drawn 1.6 m under it. 10,808 pieces became 1,756 (1,363
street rails, 192 boundary, 131 river fence, 70 rail fence); buildings are
the walls now and the gaps between them are the shortcuts. `DISTRICT_WALLS`
is the concatenation of four exported sources so a test can ask each its own
question; classifying by geometry mistook a fence piece inside a river bend
for a street rail. The fences follow a MITRED offset of their corridor, like a
lane — per-segment offsets opened an 89 m hole outside the river's bend and
piled up inside it — and a fence piece is removed only where a road CROSSES it
(near and transverse) or where it stands ON a carriageway: the west bank's line
runs down Wharf Road and the east bank's down Ferry Reach, and there the
road's own rail is the barrier. "Near a road" alone opened 77 m of bank beside
Ferry Reach. With the rails gone the car can leave the road, so `RoadWorld`
carries an optional `surface` the sim rides through `drivenSurface` at all
three of its height reads: the road across the carriageway, the drawn ground
beyond it, chamfered over 1.5 m at the kerb because the ground sits 0.35 m
under the road and that step in one tick is a jolt. Blackglass has no
`surface` and is unchanged. `tests/offroad.test.ts` drives off a kerb chosen
by measurement and asserts the car rides the ground without a step.
The district takes the tunnel and the bridge from the authored course, not its
horizon: the Rivergate backdrop was composed "beyond the bridge" of the closed
circuit, and in the district those coordinates are inside the street grid —
its 104 m tower stood across Millgate Crossing with no collider, and no
footprint rule saw it because it is not a `DistrictBlock`. `addDistrict`
detaches `rivergate-backdrop`; Blackglass keeps it. The general lesson: a
thing drawn in the district that the district did not generate is outside
every rule the district enforces, and `__ns.pick` on the offending pixel is
how it was identified — geometry alone spent an hour on the wrong candidates.
Junctions now have one asphalt mesh each: ribbons stop at measured overlap
cuts and share their seam vertices with 35 radial aprons. The driven height
blends street coverage (8 m feather inside, 4 m spill outside the kerb), and
all overlapping grading discs contribute instead of selecting the first.
`src/sim/street-surface.ts` blends nearby segment heights continuously within
each street; selecting the nearest segment at the graded ring-hotel inside
kerb used to jump 0.409 m in 2 cm. The regression scan now measures 0.0041 m.
Fine ribbon sampling interpolates original mitres; recomputing a mitre on
shorter segments folded the inside kerb backwards. The road meshes ask only
for height, avoiding unnecessary pitch projections. `tests/aprons.test.ts`
checks 37,569 drawn-surface probes (one surface, no overlapping interiors,
maximum mesh deviation below 5 cm) and 14,037 hairpin probes. The district
world identity is v3 because its vertical physics changed; Blackglass stays
unchanged. This costs more at load: approximately 1.8 s blockout / 3.2 s night,
versus 0.8 / 1.2 s before aprons on the same machine. See design/DISTRICT.md. `blockClearsStreets` samples every footprint edge against the
width the road ACTUALLY has there, never corners only and never the narrowest
width: corners let a straight frontage cut the chord of a bend by 10 m, and the
narrow width let a building stand on a junction flare a car can drive on.
Placement searches its setback up to 6 m back from the pavement rather than
rejecting, and walks a face's whole perimeter carrying the stride across
vertices — restarting per 4 m vertex generated no candidates at all on ten of
eighteen faces and left the outer two thirds of the district unbuilt.
`pnpm district:critique` is the measuring stick that found that; run it before
and after any layout change, and score a candidate link with
`--try=from,to,metres` before drawing it — Northgate Street was chosen that way,
and no single link moves route choice more than a few points, so do not expect
one to. The south bank's 1065 m run with no decision is the brief's river
barrier, not a bug, until Shawn says otherwise. `groundHeight` is the drawn ground — `outerTerrain`'s shape
clamped below the roads — and the terrain mesh, verges, river and lineside all
read it so they sit on one surface. `outerTerrain` conforms only to the ORIGINAL
loop, which left ground drawn over 39% of road samples; it cannot be fixed
inside `outerTerrain` because street construction calls that for node heights
and the dependency would be circular. A terrain vertex asks `groundHeightNear`
for the lowest ground in its cell, because what is drawn between two vertices is
a straight line a curving road passes under. Before the apron surface work, projection cost fell to 14.5 us
from 50: `projectOntoPath` indexes each polyline in runs of eight segments with a
box each and skips runs that cannot be nearer (bit-identical to the plain
scan, and tested against it), but that was only a quarter of the cost — the
rest was the fallback `candidates.length ? candidates : DISTRICT_STREETS`,
which projected every terrain vertex beyond the roads onto all fifty streets.
`nearestStreetProjection` widens the box margin instead until the nearest
found is provably nearer than anything the boxes excluded. That also corrected
an old wrong answer: with a non-empty candidate set the old code never widened,
so a point inside one long street's box was answered with that street even when
a nearer street's box had missed it; the test compares against brute force
over every street. That brought district construction to 0.9 s before the apron work
(2.2 s before indexing); current construction timings are given above. `RoadWorld` supplies the sim's start,
boundaries and projection; reset must retain that world.
Baseline Blackglass references and handling stay unchanged. District junction
grading is shared by physics and road meshes; do not "fix" it only visually.
`src/sim/lanes.ts` owns the lane model: two lanes each way whose width breathes
with the carriageway (16-22 m here), signed so every lane sits on the right of
its own direction of travel, plus arc-length sampling and `lanePose` — what a
traffic follower or a rival needs to sit in a lane. A lane is its own mitered
polyline; do not go back to offsetting a centreline sample sideways, which jumps
up to 2.79 m at an authored vertex. `lanePose`'s distance is arc length along the
lane's OWN path, in the lane's direction. It was the street's centreline until it
was reparameterised, which made a vehicle's odometer disagree with the ground by
+/-4.62% on the hairpin, opposite in sign between a street's inner and outer
lane; two lanes at equal distance are therefore no longer abreast through a bend
and nothing may assume they are, while routes stay centreline distances. Lane
geometry is memoised, and is a pure function of its inputs rather than state.
It is world geometry, so it
lives in the sim; the renderer paints those lanes rather than deriving its own,
and `laneMarkings` is the single authority on where a divider or an edge line
goes. `districtLanePose` binds it to the district's graded surface. Lanes are
district-only so far; `RoadWorld` does not carry them and Blackglass has none.
`src/sim/traffic.ts` drives those lanes: about two dozen vehicles over the
district (GDD §12 asks for sparse, not dense), deterministic via an integer hash
— never the renderer's `Math.sin`-based `hash01`, whose last bits are not
specified across engines. Conflicts are reserved, not avoided: every crossing is
computed offline from lane geometry, which is only possible because the district
guarantees carriageways overlap only at junctions. The invariant is that nothing
is inside a junction without holding it, enforced by a hard stop on the entry
line. Traffic is kinematic — an immovable hazard, never a second handling model.
A vehicle may claim a movement only at the head of its own approach; claiming
from behind a queue reserves a junction it can never reach and never releases,
which deadlocks every conflicting movement. That was first mis-read as a
capacity cliff at 24-27 vehicles; it is not one, and the test asserts the grant
rather than the deadlock because the symptom has already moved once. Real
capacity is ~55: past that, queues exceed the stall budget and a grant made 34 m
short of the line is stale by the time it is used. Shipped density is 24.
Raising the ceiling means per-conflict-point arrival windows instead of
whole-movement occupancy. `createSim(..., { traffic: false })` turns it
off, which the district reference drivers use because they are geometry checks.
`src/render/traffic.ts` draws it as instanced bodies and lamps, eight draw calls.
**Open-checkpoint racing exists** (GDD §7.3, the Midnight Club format, and the
primary event). `src/sim/race.ts` is the rules — ordered gates, a tick-based
countdown that the sim enforces by zeroing driving input, splits, finish — as a
pure step over the vehicle state, so a replay reproduces the splits;
`src/sim/events.ts` holds the district's races as checkpoint sequences plus a
reference route that is the grid and an authored rival's line, never a
constraint on the player. `SimOptions.race` / `SimState.race` mirror traffic:
stepped after `syncState` at the end of `step()`. `?race=<id>` is a page-level
choice like `?route=` (the main-menu Race button reloads into it); the HUD
shows gate, countdown/clock/finish and position at top centre and draws the
next gate on the minimap (a ring, or a chevron on the rim); `src/render/race.ts`
stands a column of light on the next gate from `state.race.next`. In-game
replay, input recording and the recorded-input rival have been removed.
Restart starts a fresh run. Seattle now has an authored-route AI opponent;
see the racing-rival notes below. Flexible city navigation remains future work.
Checkpoints are placed where route choice exists, measured per leg with the
critique's arithmetic; `tests/race.test.ts` gates every race on most legs
having a real alternative, and drives the reference line through every gate
with the real sim. The first event is Crane to Crest: Wharf Gate to Hillcrest,
0.88 km, and both real-choice legs are the two alleys.
The district is dressed for night by default (GDD §15.1): lane paint dropped
onto the graded surface, sodium lamps with additive light pools, lit facades and
shopfront glass, neon signage, wet asphalt and a camera-following sky dome. All
of it is generated from the street/block/junction data, is deterministic
(`hash01`, never `Math.random`), and merges into a handful of meshes rather than
adding lights. `?lighting=blockout` restores the flat work view with no dressing
at all, because neon hides the surface errors that view exists to find. There is
no bloom pass and no reflections. Baseline Blackglass presentation is
untouched. `src/ui/hud.ts` draws the speed dial and the heading-up minimap from
`src/ui/hud-state.ts`; the map reads street data, never the renderer, and the
cluster binds to ids that `tests/hud.test.ts` checks against `index.html`.
Changing map/race pages reloads the run and retains saved preferences.
Never use the original `courseGap` for district guides; `districtRouteGap`
wraps circuits and keeps sprint gaps linear. Debug links carry world/route
identity, which future saved ghosts must validate as well as physics/build.
Automatic countersteering is off (`four-wheel-v3`). Manual catches get faster
response and extra range only when the player requests countersteer; neutral
input never steers itself. Ordinary turn-in keeps its speed envelope, while
unwinding is quicker. Pause contains AWD/FWD/RWD comparison
buttons. Changing layout resets the run; ordinary reset retains the run's drivetrain. Full countersteer can catch longer
30 m/s slides; weak/late corrections and prolonged highway-speed slides remain
limitations. Tests distinguish manual recovery from automatic intervention.
Garage offers NS-01 and Bulwark as selectable bodies with shared handling and
appearance settings. Load the selected body at boot; selecting the other loads
it on demand, preserves simulation/camera state, and saves the selection.
Settings schema 3 adds car selection and migrates schema 1/2 preferences.
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


### Controls menu and input remapping

Main and Pause open the Controls screen. Returning from Controls restores its
originating menu and never resumes a paused run. The driving HUD has no permanent
control guide. `src/input/bindings.ts` defines validated keyboard and controller
button mappings; `src/ui/controls.ts` renders the guide, captures through the input
controller, and saves schema 1 in `nightshift.controls`. Keep navigation and stick
axes fixed so players cannot lose access to menus. Capturing consumes input,
waits for controller-button release, rejects duplicates/reserved controls, and
cancels on Escape, Menu/Options, blur or screen exit. Preserve the driving release
gate and analog trigger values. The garage prompt and recenter hint read bindings.
Tests cover mappings, capture and pause return; `scripts/check-controls-browser.js`
checks live keyboard/simulated-pad delivery, storage, navigation and viewport fit.


### First racing rival

`SimOptions.rival` opts a race into the AI driver. Free roam uses
`SimOptions.encounter` instead: a handbraked dynamic vehicle with no race state,
spawned from `SEATTLE_ENCOUNTER`. Fixtures omit both by default. `canChallenge`
owns proximity/speed/elevation eligibility. The input adapter supplies a remappable
flash command; main presents the double flash and loads the existing race grid.
Never add race clock/checkpoint progress to the waiting encounter. Keep the garage
body pairing and return-to-free-roam path working in both modes.
`Sim.state.rival` owns vehicle, race, input and driver state;
`Sim.rivalBody` is another dynamic body in the same world. Apply both vehicles'
forces before the single world step; sync both and evaluate their gates afterward.
Do not give the rival a separate physics world or call `world.step()` per vehicle.
Reset reconstructs both bodies, traffic and the driver. The player handling
constants stay unchanged; AI speed plans use the shared cornering envelope.
`seattle-rival.ts` owns Sound to Sky's preferred line and checkpoint distances;
`rival.ts` supplies actual inputs and reversing recovery. After 12 seconds without
4 metres of net forward progress, `sim.ts` may reset it at rest near its own route
position. Preserve its clock/checkpoints, stay behind the next gate, check physical
and approaching-vehicle clearance, and retry once per second if blocked. No
catch-up relocation or rubber-banding. The opponent always takes the other garage body, including after
an in-page garage selection. `view.rivalCar` is presentation only; `__ns.state()`
includes rival diagnostics. `tests/rival.test.ts` and the browser harness cover
completion, contact, reset and integration. General routing and personalities
remain future work. See design/SEATTLE.md for the first driver's limitations.
