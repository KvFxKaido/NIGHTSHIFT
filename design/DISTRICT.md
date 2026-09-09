# Blackglass District — route blockout

Status: playable layout study, 2026-09-07. Not a scored race mode or engine migration.

## Decision

Build one compact, fixed district and drive it freely while it is sculpted.
The existing Blackglass perimeter is the anchor; two orbital belts and seven
radials grew from it. This does not introduce runtime-generated roads, a large
open world, traffic, or progression.

**Free roam is the default.** There is no track selection: Drive goes straight
from the title into the district with the whole network open, no line to follow
and no finish. The route guides below still exist as data and as the driving
gate in tests, and `?route=<id>` overlays one for a specific study, but picking
one is no longer how you start. `?world=blackglass` returns to the original
closed course with its own geometry, physics and lighting.

The district is closed by a boundary wall 46 m beyond the outermost street.
Junction clipping deliberately opens boundary pieces where streets cross, which
was harmless while every junction was interior to a ring; with the belts now
forming the edge, those openings faced empty ground and free roam drove straight
out through a corner. The boundary belongs to no street, so clipping never
touches it.

The first top-down board is `/district.html`. It reads the same street and route
data as the driving blockout; it is not a separately drawn illustrative map.
Use **District blockout / Map** in Track Select or Pause. The existing course
remains the default at `/`, with its original road, physics and lighting.

## Layout

The district covers **935 x 935 m (0.874 km²)** with **11.31 km of unique
streets across 51 edges and 33 junctions**, including the existing 1.73 km
plan-view perimeter. (The original course brief rounds it to 1.70 km.)

Junctions, not kilometres, were the reason to expand. The first blockout carried
52% of a 100 m grid's road length across only 17% of its junctions, and four
degree-3 nodes had already reached the ceiling of distinct cycles they could
produce — the four routes below the perimeter were essentially all of them. The
expansion is now at 60% of that grid's road length and 33% of its junctions.
Of the 33 nodes, 27 offer a genuine choice; six are pass-through belt corners.

Road density is 12.9 km/km², which is honest urban density (Manhattan is near
20) rather than a large open world. GDD §21 still rules that out.

- **Two orbital belts:** an outer ring at roughly ±470 m and an inner one at
  ±345 m, each twelve edges long. The outer belt is the district's high-speed
  lap; the inner one is the connector everything else hangs off.
- **Seven radials:** each leaves the original loop where it is near grade and
  steps out through the inner belt to the outer one. The bridge crown at 24 m
  and the tunnel run at 9-15 m are deliberately not connected — a surface
  street cannot meet them at grade, so the belts reach that side the long way
  round. That is a city constraint, not a gap.
- **Two belt-to-belt spurs** with no loop connection, which add cycles rather
  than nodes; that is what turns concentric rings into a network.

- **Market Avenue:** approximately 436 m across the interior, joining Neon
  Boulevard to Freight Gate. It has a gentle bend through Market Square and a
  long westbound approach. This is the new medium-speed cross-district street.
- **Civic Link:** approximately 119 m, joining the elevated Civic junction to
  Market Square. Its downhill/uphill direction changes the approach to the
  same intersection. This is the short technical connection.
- **Existing perimeter:** tunnel, bridge, waterfront, Freight S, Civic rise,
  Hotel Hairpin and boulevard retain their plan-view geometry. Only the
  blockout grades the four new junction aprons to a shared height; baseline
  Blackglass and the Blender tunnel/bridge are untouched.

Market Avenue is split into east/west street edges at its civic junction.
Those are one connection, not two additional independently authored roads.

| Route guide | Distance | Sequence | Question |
| --- | ---: | --- | --- |
| Blackglass Perimeter | 1.73 km | The original loop, now cut at eight junctions | Does the familiar lap still read with open junctions? |
| Market Loop | 0.83 km | Market East → Civic Link uphill → Hotel/Boulevard | Is a short, junction-led circuit fun without the long tunnel run? |
| Freight Run | 0.55 km | Freight S → Civic Link downhill → Market East | Does approaching Market Square from the civic side feel distinct? |
| Avenue Loop | 1.17 km | Market East → Market West → Freight S → Hotel/Boulevard | Does the full cross-district avenue earn its road length? |
| Outer Orbital | 3.74 km | The complete outer belt | Do long straights and four hard gate corners hold up over two minutes? |
| South Orbital | 0.94 km | South radial → inner belt → east radial → boulevard reversed | Does a lap that mixes belt and loop read as one place? |
| West Gate Run | 1.06 km | Hotel hairpin → both belts → north up the western edge | Does a sprint that leaves the loop entirely still feel like the district? |

Distance is measured from the authored route centerline, not the player's line.
Every guide is a walk over shared streets, not separately authored map.

## What is playable

- Free roam over one shared road network; real boundary openings at junctions,
  and a closed district edge beyond the outer belt.
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
grade/width and massing clearance, mesh winding, shared barrier transforms,
collision replay, and a conservative inspection driver for every route.
That driver uses the real four-wheel sim and colliders: no teleporting, no
disabled collisions. All four guides complete with zero contact ticks. These
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
measures `s` along the lane's own direction, so a follower only ever adds to its
odometer. Height comes from the district's graded surface, not from datum.

`laneMarkings(width)` is the only authority on where paint goes. The renderer
maps kind to colour, width and dash pattern and nothing else; it does not decide
where a divider sits. Before this existed the renderer painted lanes at
`width * 0.25`, which was a second opinion waiting to disagree with traffic.

Not yet: lanes are district-only. `RoadWorld` does not expose them and the
Blackglass circuit has none, so anything built on lanes works in the district
only until that is addressed. Nothing drives them — there is no traffic.

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

What the dressing is not: there is no traffic (GDD §12 — a sim feature, not a
renderer one), no post-processing bloom, no reflections, no wet-road normal map,
and no interior detail. The glow is additive quads and emissive surfaces, and
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
