# Blackglass District — route blockout

Status: playable layout study, 2026-09-07. Not a scored race mode or engine migration.

## Decision

Build one compact, fixed district and drive it freely while it is sculpted.
The existing Blackglass perimeter is the anchor; a river, a freight line and a
hill inland decide where everything else goes. This does not introduce runtime-generated roads, a large
open world, traffic, or progression.

**Free roam is the default.** There is no track selection: Drive goes straight
from the title into the district with the whole network open, no line to follow
and no finish. The route guides below still exist as data and as the driving
gate in tests, and `?route=<id>` overlays one for a specific study, but picking
one is no longer how you start. `?world=blackglass` returns to the original
closed course with its own geometry, physics and lighting.

The district is closed by a boundary wall 46 m beyond the outermost street.
Junction clipping deliberately opens boundary pieces where streets cross, which
was harmless while every junction was interior to a ring; once the network
reached the district's edge those openings faced empty ground and free roam
drove straight out through a corner. The boundary belongs to no street, so clipping never
touches it.

The first top-down board is `/district.html`. It reads the same street and route
data as the driving blockout; it is not a separately drawn illustrative map.
Use **District blockout / Map** in Track Select or Pause. The existing course
remains the default at `/`, with its original road, physics and lighting.

## Layout

The district covers **933 x 867 m** with **9.09 km of unique streets across 52
edges and 35 junctions**, including the existing 1.73 km plan-view perimeter.
Road density is 11.2 km/km², which is honest urban density rather than a large
open world; GDD §21 still rules that out.

The layout is a consequence of its geography rather than a diagram laid over it.
The first expansion was two perfect orbital belts at round numbers, dead flat,
every street the same width — a wireframe with asphalt on it. Nothing bent
because of anything.

- **The river.** The Blackglass runs south down the eastern edge, then bends
  west across the bottom of the district, passing directly beneath the original
  Rivergate bridge — which is what that bridge has always been for. Both banks
  are walled and only three crossings exist. The land east *and* south of the
  water is one landmass wrapping the bend, so the Wharf Bridge and the Millgate
  Crossing between them reach all of it, and a lap can go out over one and back
  over the other.
- **The freight line** curves across the north, severing those approaches except
  at two staggered level crossings.
- **The ground** climbs inland to the north-west and falls to the water: 20 m of
  rise, so the old quarter sits on a hill and the wharf sits on the flat. Only
  the outer network reads this; near the loop the terrain defers to the loop's
  own authored height, because otherwise the loop sits in a cutting and every
  street leaving it has to climb 6 m in the first 40.
- **Zones follow from that.** Shipping frontage and docks on the flat by the
  water, rail yards under the line, the old quarter climbing north-west on
  narrow local streets.

### Road classes

One width everywhere gave no cue about where you were or how fast the road
wanted you to go, and left no room for shortcuts. Class now drives carriageway
width and lane count together, and `src/sim/lanes.ts` owns both.

| Class | Carriageway | Streets | Lanes each way | Lane width |
| --- | ---: | ---: | ---: | ---: |
| Arterial | 24 m | 22 | 2 | 4.93 m |
| Collector | 17 m | 18 | 2 | 4.43 m |
| Local | 12 m | 7 | 1 | 4.85 m |
| Alley | 8 m | 3 | 1 | 2.85 m |

Three alleys, deliberately: enough that knowing them matters, not enough to turn
the graph into spaghetti. Each cuts a corner a main road takes. An alley lane is
narrower than a car needs to pass comfortably, which is the point of one.

Lanes are laid out to a street's **narrowest** point, not to the width at each
sample. A carriageway flares into its junctions — right for the asphalt, and how
a real junction looks — but lanes that breathe with it wander laterally, and on
a street tapering 22 m at the ends to 8 m in the middle a lane came out 27%
shorter than its own centreline. Paint follows the lanes for the same reason, so
the lines run straight through a junction flare instead of splaying with it.

### Blocks

Massing is derived from the **planar faces of the street graph** — the blocks the
streets enclose — rather than a uniform grid filtered down to whatever gaps the
roads leave. Urban form is a tessellation of blocks and streets are the negative
space between them, and doing it the other way round is what made the first pass
read as a checkerboard.

Buildings are placed **around each face's perimeter, fronting the street**, set
back from the carriageway by a pavement and rotated square to the road rather
than to the world axes. A city block is built out to its frontage with the gap,
if any, in the middle; sampling a grid inside the face and keeping whatever
cleared the road produced exactly the opposite. Clearance is tested on the
footprint's four corners: the circumscribed circle it replaces demanded a 35 m
setback on an arterial, which is why massing used to float mid-face.

Depth is tried deepest-first and falls back, because a narrow face cannot host a
deep building once the setback clears the carriageway and a shallow terrace is
what actually gets built on one. 18 faces carry 73 buildings across 40 distinct
orientations, standing 2.6 m from the kerb.

## Streets only meet at junctions

Two carriageways sharing ground is what a junction *is*. Away from one it is a
defect, and it surfaced three times before it was measured rather than noticed:

- A radial left the ring on almost the ring's own bearing. The two traded places
  as nearest street and the vertical constraint snapped the car 17 m. Fixed by
  deleting the junction; a road out of a hairpin was bad design anyway.
- Cutlers Alley left Northgate at 26°, so 16 m of combined half-width took 36 m
  to open up and the alley shared the North Arterial's kerbs for 45 m with a
  1.9 m step between them. It now peels off at 44°.
- The Wharf Bridge crossed Quay Frontage at grade — 19 m of shared asphalt, no
  node within 100 m. Nothing caught it because it graded flat and drove fine,
  but no junction meant nothing downstream could know two carriageways met. It
  is now **Bridgefoot**, and the far bank gained a choice point off the bridge.

Each was found from a symptom (buried paint, a car thrown off the road) long
after the fact. Traffic will reserve space on these carriageways *by junction*,
so the cause is now a gate: outside a junction's own 28 m apron, two streets may
share asphalt only if they meet at a junction, only within 70 m of it, and never
at heights that disagree by a metre. Only a junction one of the two streets
actually ends at counts — any node nearby would otherwise launder a crossing it
has nothing to do with, which is exactly how the bridge kept its secret.

| Route guide | Distance | Question |
| --- | ---: | --- |
| Blackglass Perimeter | 1.73 km | Does the familiar lap still read with open junctions? |
| River Loop | 2.69 km | Do both crossings and the whole far bank read as one place? |
| Market Loop | 0.83 km | Is a short, junction-led circuit fun without the long tunnel run? |
| Wharf Run | 0.77 km | Does the shipping frontage and the bridge hold up as a sprint? |
| Freight Run | 0.55 km | Does approaching Market Square from the civic side feel distinct? |
| Hill Climb | 0.47 km | Is 20 m of climb on narrow streets worth driving? |

Distance is measured from the authored route centerline, not the player's line.
Every guide is a walk over shared streets, not separately authored map.

## What is playable

- Free roam over one shared road network; real boundary openings at junctions,
  and a closed district edge, plus walled river banks and lineside.
- Same four-wheel model, FWD default, manual countersteering, controller input,
  garage preferences, chase camera, reset and session replay.
- Free roam draws no arrows and no gates. With `?route=`, coloured arrows
  indicate the guide, with a cyan start gate and a gold finish gate for a
  sprint; the map uses matching route colours and direction arrows.
- **Massing blocks are solid.** They collide at their full drawn height, kept
  apart from `walls` in the road world because a wall is 1.3 m of guard rail
  and is rendered as one. Driving through buildings was invisible on a fixed
  route and was the first thing free roam did.
- Simple massing blocks kept outside every road's clearance envelope.
- Brighter work lighting to inspect the layout. This is not a new art direction.

Junctions deliberately remain open. Crossing the sprint finish does **not**
complete an event. There is no countdown, timing, checkpoint enforcement,
wrong-way detection, race-specific closure or payout in this study. Driving
off the indicated route is allowed. R / Triangle resets to that route's start.
Changing routes by URL reloads the page and discards the current session
run/replay; saved garage/drivetrain/audio preferences remain browser-local.
The district map is reachable from the title screen and from Pause.

## Data boundaries

- `src/sim/track.ts`: unchanged original course geometry.
- `src/sim/district.ts`: fixed street graph, shared endpoints, directed route
  legs, projections, junction grading, clipped boundaries and coarse block data.
- `src/sim/road-world.ts`: injectable start, boundaries and projection. The
  default adapter references the original course; `resetSim` preserves its world.
- `src/render/district.ts`: road ribbons, instances of the exact physics
  boundary pieces, route arrows and block masses. Ground grading is sampled
  from the simulation's height function, including across road width.
- `src/ui/district-map.ts`: geographic SVG and route selection, reading the
  same street data. Uses the existing input controller for keyboard/gamepad.

Map/route identity is exposed through `__ns.state().roadWorld`, and `__ns.link()`
preserves it. District versions and route IDs must be part of any future saved
ghost identity alongside physics/build identity. There is no saved ghost format
here. The current session rival uses the same injected world and reset boundary.

The fixed layout is the authority, not Blender. When the driving is approved,
export a district reference guide for Blender, author surroundings around it,
then keep event definitions separate from that environment. Do not regenerate
or restamp the current tunnel/bridge asset to accommodate unrelated new streets.

## Validation

`pnpm test` includes graph continuity, exact baseline references, connector
grade/width and massing clearance, carriageway overlap, mesh winding, shared barrier transforms,
collision replay, and a conservative inspection driver for every route.
That driver uses the real four-wheel sim and colliders: no teleporting, no
disabled collisions. All six guides complete with zero contact ticks. These
are inspection laps, not competitive pace estimates or proof of human fun.

During those drives, rendered-road raycasts must hit beneath the car and remain
within 15 cm of simulated height; per-tick height changes stay below 20 cm.
These are blockout tolerances, not final road-surface certification.

`scripts/check-district-browser.js` covers the board, keyboard and synthetic
standard gamepad navigation, all four boot paths, actual input ticks, pause,
garage, reset, copied links, unknown-route failure and original-course boot.
It captures desktop/mobile screenshots. Staged junction poses are visual QA,
not driven-lap evidence. Physical controller feel and mobile GPU performance
still need human/device playtesting.

## Lanes

`src/sim/lanes.ts` is the district's lane model, and it is deliberately in the
simulation rather than the renderer: lanes are world geometry, like walls and
surface height, and three different consumers will want the same answer — the
paint today, traffic (GDD §12) next, rivals (§11) after that.

Two lanes each direction on every street. The count is fixed and the lane width
breathes with the carriageway instead of the other way round: at a real 3.6 m
lane, a 16 m street gets one lane and an 18 m street gets two, which puts a lane
drop in the middle of the ring that no driver could read a reason for. Here every
street is an arterial and lanes run 3.4 m to 4.9 m.

Offsets are signed positive to the right of a street's authored point order, and
a lane's direction carries that sign — so a lane is always on the right of its
own travel, whichever way the street was authored. `lanePose(points, lane, s)`
measures `s` in the lane's own direction, so a follower only ever adds to its
odometer. Height comes from the district's graded surface, not from datum.

`s` is arc length along the street's **centreline**, not along the offset lane.
Round a bend an offset lane is longer or shorter than the line it is measured
from — up to 2.7% on the district's longest curve, `ring-portal`. That is a
constant scale on speed through a curve rather than an accumulating error, and
it keeps the lanes of one street abreast at equal `s`; it is written down here
because it is a real difference and traffic will inherit it.

A lane is built as its own mitered polyline, not by offsetting a centreline
sample sideways. Offsetting a sample uses whichever segment normal it happens to
land on, which makes the lane jump at every authored vertex — measured at 2.79 m
on the ring hotel bend, most of a lane width. A 5 m pose sweep steps straight
over a discontinuity like that, so it has its own test either side of every
corner.

`laneMarkings(width)` is the only authority on where paint goes. The renderer
maps kind to colour, width and dash pattern and nothing else; it does not decide
where a divider sits. Before this existed the renderer painted lanes at
`width * 0.25`, which was a second opinion waiting to disagree with traffic.

Not yet: lanes are district-only. `RoadWorld` does not expose them and the
Blackglass circuit has none, so anything built on lanes works in the district
only until that is addressed.

## Traffic

`src/sim/traffic.ts` drives the lane model. Sparse by design (GDD §12): about
two dozen vehicles over 9 km, in four kinds, all slower than the player.

**Reservation, not avoidance.** Every place two vehicles can collide is a
junction — that is what the carriageway-overlap gate above buys — so the whole
conflict set is computed offline from lane geometry and a vehicle asks
permission to cross rather than watching for trouble. Two movements conflict
when the box a worst-case vehicle sweeps along one could touch the box swept
along the other. Asked as a distance between centrelines the question has no
answer: opposing lanes in an alley run 3.75 m apart and must not conflict, while
two paths crossing at an angle collide from 4.5 m apart, because a 7.2 m lorry
sweeps far wider than the line it drives.

The invariant everything rests on is that **no vehicle is ever inside a junction
without holding it**, and it is enforced rather than hoped for: a vehicle with no
claim stops on the entry line. Claims are taken when granted, not at the line,
because granting at the line needs an escape for vehicles already too close to
stop — and that escape has to ignore whatever is in the junction, which is how
you drive into it.

Where the lane between two junctions is shorter than the junction regions either
side, both are reserved together. Otherwise a vehicle strands between them
holding one, the vehicle ahead of it waits on exactly that one, and neither can
move; that deadlock was measured before the chain existed.

### What it does not do, and the numbers

Occupancy is per movement, not per time window. A vehicle holds its whole
crossing rather than the moment it passes each conflict point, so junctions
serialise more than they need to. That sets a hard capacity: **clean at 24
vehicles, deadlocked at 27.** Measured over five simulated minutes:

| vehicles | overlaps | mean speed | longest stop |
| --- | --- | --- | --- |
| 20 | 1 (0.05 m graze) | 11.6 m/s | 7 s |
| **24** | **0** | **13.5 m/s** | **16 s** |
| 27 | 0 | 7.9 m/s | 197 s — deadlocked |
| 85 | 0 | 3.0 m/s | 268 s — gridlocked |

Raising that ceiling means reserving conflict points with arrival windows
instead of reserving movements. A positional check was tried as a shortcut and
is wrong: a grant is decided while the vehicle is still 34 m short of the line
and the crossing happens seconds later, which let 141 pairs into the same
crossing in five minutes.

Conflict paths are sampled every 3 m, so a grazing crossing can be missed by a
few centimetres of bodywork — one such graze at a different density, 0.05 m.
Traffic is kinematic: it is an immovable hazard, not a second handling model,
which keeps the player's contact response the only dynamics in the tick. The
district reference drivers run with traffic off, because they are geometry
checks driving a fixed line and a van in the way is not what they measure.

## Presentation

The district is now dressed for night by default (GDD §15.1): sodium lamps and
their light pools, lane paint, lit facades, shopfront glass, neon signage and a
sky dome carrying the city's horizon glow. `?lighting=blockout` restores the flat
work view — grey massing, matte asphalt, no dressing at all — because neon hides
exactly the surface errors that view exists to find.

This runs ahead of step 5 below, which says to dress only the road sections that
survive a timed event. That ordering was written to stop hand-authored art being
thrown away when a junction moves. It does not apply here: every piece of the
dressing is generated from `DISTRICT_STREETS`, `DISTRICT_BLOCKS` and
`DISTRICT_JUNCTIONS` at load, so moving a street re-dresses it for free and
nothing is lost. Hand-authored art still waits for step 5.

What the dressing is not: no post-processing bloom, no reflections, no wet-road
normal map, and no interior detail. Traffic is a sim feature and lives in its own
section above. The glow is additive quads and emissive surfaces, and
the lamps are geometry rather than lights, so the light count is unchanged.
Desktop screenshots do not certify mobile GPU performance; the dressing costs
roughly ten draw calls and around 60k triangles over the blockout.

## What to decide before more art

1. Drive Market Loop first. Is the civic turn readable early enough?
2. Try Freight Run: does the opposite approach justify a separate event?
3. Try Avenue Loop: does the west half add a useful rhythm or just distance?
4. Move/widen a junction if it needs it; don't compensate with handling changes.
5. Once the lines are approved, implement one timed event with checkpoint
   validation and event-specific closures. Then dress only the road sections
   that survive that test.
