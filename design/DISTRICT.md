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

The district covers **933 x 867 m** with **9.26 km of unique streets across 53
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
what actually gets built on one. 18 of 19 faces carry 321 buildings; the one
left bare is a 57 m sliver on the far bank between Dock Road and Quay Frontage,
where two carriageway halves and two industrial pavements leave no depth for
even the shallowest building — a yard, not a void.

### The outer district had no buildings at all

For most of a day this stood at 65 buildings occupying x -262..271, z -218..219
of a 934 x 867 m district: the middle third was a city and the outer two thirds
were roads through empty ground, with 228,000 m² of enclosed block holding
nothing. Nobody noticed, because from inside the core it looked fine and the
edges looked like "not built yet". The layout critique found it on its first run
as *12 of 18 faces empty*, which is what a measuring stick is for.

The perimeter walk stepped in frontage-sized strides but restarted at every
polygon vertex. Face vertices follow street polylines at 4 m and a frontage is
21-34 m, so on the district's own streets the loop body never executed and not
one candidate was generated. Faces on the original ring only worked because its
points happen to sit far enough apart to clear a frontage. The walk now carries
its remainder across vertices, exactly as `pathSamples` does.

That exposed two holes in the clearance test, both found by the Hill Climb
inspection driver wedging for 131 of its 160 seconds against a new building:

- It tested corners only. On a curved street both corners clear while the
  straight edge between them cuts the chord — a 32 m frontage stood 10 m onto
  Crane Street with every corner in the clear.
- It measured against the street's **narrowest** width. That is right for laying
  out lanes and wrong here: the asphalt flares wider into every junction, a car
  can be on the flare, and a building cleared to the narrow width stood 1.6 m
  onto Quarter Street's apron.

Clearance now samples every edge every 3 m against the width the road actually
has where the sample lands. Done honestly, that rejected 436 candidates — but
268 of them by under a metre, which is the sagitta of a straight frontage on a
bend plus the odd flare. So placement *searches* the setback instead of guessing
it once: the pavement line first, then a metre back at a time up to 6 m. A
forecourt is a building; a void is not. The few that intrude by many metres are
footprints straddling another street, and fall to a shallower depth or are
dropped as before.

Two footprints are kept apart by a **separating-axis test on the rectangles**,
not by their circumscribed circles. Circles were the first answer, with 7 m of
slack, and slack on a circle is slack on the rectangle inside it: 15 pairs
interpenetrated, the worst by 4.21 m. The slack is not incidental either — a
circle cannot express "these terraces share a party wall but do not overlap",
which is the shape of every city block, so it *needs* the slack, so it lets
buildings through each other. The rectangle test needs none: the firewall gap
is 1.2 m and costs nothing, because 0.0 m and 1.2 m both place 65 buildings.
The eight that used to make 73 were the overlapping ones.

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

`s` is arc length along the **lane's own path**. It was the street's centreline
until it was reparameterised: round a bend an offset lane is longer or shorter
than the line it was measured from, so a vehicle advancing its odometer at its
own speed did not travel that far on the ground, and the error was opposite in
sign between the inner and outer lane of the same curve. See *Lanes are measured
along themselves* below for the measured spread.

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
serialise more than they need to. Measured over five simulated minutes:

| vehicles | overlaps | mean speed | longest stop |
| --- | --- | --- | --- |
| **24** (shipped) | **0** | **13.5 m/s** | **16 s** |
| 44 | 0 | 12.4 m/s | 22 s |
| 55 | 0 | 11.7 m/s | 40 s |
| 74 | 1 (1.49 m) | 10.1 m/s | 49 s |

Sparse traffic is the design (GDD §12), so the shipped 24 sits at less than half
the ceiling. Past about 55 both gates go at once: queues exceed the 45 s stall
budget, and a grant made 34 m short of the line stops being sound by the time
the crossing happens — the exit had room when it was decided and does not when
it is used. Raising that means reserving conflict points with arrival windows
instead of reserving movements. A positional check was tried as a shortcut and
is wrong for the same reason: it let 141 pairs into the same crossing in five
minutes.

#### The cliff that was not one

This was first measured as a hard capacity — clean at 24, deadlocked at 27 —
and written up as the cost of holding a whole crossing. It was not. Sweeping the
density instead of testing two points shows 27 and 31 deadlocking while 29, 37
and 44 ran clean, and a limit that comes and goes with the vehicle count is not
a limit.

A vehicle claims from up to `CLAIM_RANGE` short of the entry line, and the claim
did not check it was at the head of its own approach. One standing behind
stopped cars took the reservation, could never advance to use it, and never
released it, because release requires arriving on the far side. Everything whose
movement conflicted then waited on a crossing nobody was making — terminal, and
spreading: 12 vehicles stopped at five minutes, 23 at ten.

Claiming only at the head of the queue removes it. The honest caveat is that
reparameterising lanes to their own arc length, in the same change, dissolved
the particular 27-vehicle configuration it was found on: lane lengths moved, and
that arrangement no longer forms. The defect did not go with it. It now needs
more traffic to express itself, and at 74 vehicles the difference is 226 s
stationary with a quarter of the network moving, against 47 s and four fifths.

The regression test asserts the cause, not the symptom: a claim is only ever
granted to a vehicle with nothing ahead of it on its lane. That is deliberate —
the symptom had already moved once, and a test pinned to it would have retired
along with it. A stress run at 74 vehicles covers the consequence separately,
over five simulated minutes rather than two, because gridlock at that density
takes longer than two to develop and a three-minute stall gate inside a
two-minute run could not have failed whatever the code did.

## Lanes are measured along themselves

`lanePose(lane, d)` takes `d` in metres along that lane's own path. It used to
take centreline arc length, which meant a vehicle advancing its odometer at its
own speed did not travel that far on the ground, with the error opposite in sign
between the inner and outer lane of one bend. On the Hotel Hairpin the two lanes
of a direction differ from the centreline by +4.62% and -4.62%: a 9.2 point
spread across one street.

The cost is that two lanes of a street at equal `distance` are no longer exactly
abreast through a bend. That is correct — they have not gone equally far — and
nothing may assume otherwise. Routes are still measured on the centreline,
because a route is a line on a map rather than something driven in a particular
lane.

Lane geometry is memoised per (street, lane, class). It is a pure function of
its inputs, so it is a cache and not state, and cannot make the simulation
non-deterministic.

## The ground is clamped below the road

`outerTerrain` conforms the ground to `projectOntoCourse` — the **original loop,
and only it**. Every street added since is graded by `easeGrade` to be driveable
on its own terms, and nothing tied the two together. Measured: **898 of 2297 road
samples, 39%, had ground drawn over them, up to 4.23 m**, worst on `civic-link`,
`market-east/west` and `ring-hotel` — interior streets near the old loop, where
conforming pulls hardest, and 200-580 m from any water. At night the ground is
`0x0d1117`, so the road ran into what looked like a river.

Two things it was not. It was not the water: one road sample of 2297 sits under
the river ribbon, by 1 cm, at a bridge abutment. And it was not mesh resolution
— 110 to 880 segments, 64x the triangles, moved 898 buried samples to 893 and
made the worst case *worse*. The mesh was drawing the field faithfully. The
field was wrong.

`groundHeight(x, z)` is `outerTerrain`'s shape clamped to `road - 0.35 m` inside
the carriageway plus a 16 m corridor, eased out across it so the ground rejoins
its own shape rather than stepping. Two escapes matter: where the ground is
already below the road there is nothing to do, which is every bridge; and where
it is more than 6 m below, the road is a structure and clamping would trench the
valley to meet a deck instead of leaving it standing.

It cannot fold into `outerTerrain`. Street construction calls that for node and
shape-point heights, so making it depend on the street network is a cycle. As a
pass on top there is none — the same layering the junction aprons use. The
terrain mesh, the verges, the river and the lineside all read it, so they sit on
one surface.

`groundHeightNear` is what a terrain vertex asks for: the lowest ground within
half a cell. `groundHeight` is exact where it is sampled and what you see
between two vertices is a straight line, so a road curving inside a 12.5 m cell
passes under it — vertices alone still left 32 buried samples at 0.61 m. Raising
the clearance does not substitute: those cells have no road at the vertex at
all, so no clearance engages there.

### What it costs

`addDistrict` goes from **1.2 s to 2.4 s**. All of it is `projectOntoDistrict`
at **53 µs a call** — `outerTerrain` is 3.8 µs, so the terrain shape was never
the expensive part. Only vertices a street can reach do the work, found from the
streets in O(road length) rather than by testing the grid, and the clamp skips
`projectOntoDistrict`'s pitch, which costs two extra apron scans to answer a
question about grade the ground does not ask.

A spatial index over street segments would take most of that 53 µs back, and
would also cut the traffic network build, which is dominated by the same query.
That is the open item, not more terrain work.

## Connectivity is scored before it is drawn

"Enough that learning the city matters without turning the street graph into
spaghetti" is measurable: close the single most important street on a journey's
best route and see what the detour costs. If it always costs a lot there is one
way to go and nothing to learn; if it never costs anything the map is soup.

`pnpm district:critique` reports it. At 52 streets, **31%** of journeys between
choice points had a genuine alternative (losing any one street costs under 25%)
and the median detour was **45%**. The chokepoints were not where the map
looked thin. The Wharf Bridge carried the most and hurt the most when closed,
but that is the brief working — a river with few crossings. The accidental ones
were a cluster: `north-2`, `ring-boulevard` and `market-east` each carried
54-78 journeys with no alternative, because Northgate had **no street heading
south** and everything from the north-west entered the core through Marquee
North and nowhere else.

Candidate links are scored with `--try` before anyone authors a curve:

| link | alt | median detour | longest run |
| --- | --- | --- | --- |
| baseline | 31% | 45% | 1065 m |
| Northgate → Boulevard Junction | 36% | 37% | 1065 m |
| Northgate → Civic Junction | 36% | 40% | 1065 m |
| South Bank → South Wharf, riverside | 32% | 45% | **644 m** |
| Lower West → Quarter South | 33% | 41% | 1065 m |
| West Crossing → Hillcrest | 34% | 41% | 1065 m |

**Northgate Street** is the first, and drawn it did slightly better than scored:
**37%** and **37%**, under the 40% detour target, plus a nineteenth face for
massing to fill. It is a ~300 m sweeper rather than another straight, dropping
6 m over 190 m entirely inland, and Boulevard Junction's fourth arm arrives at
roughly 60 degrees to the ring — no shallow fork.

Two honest notes. No single link gets near 50%: the network is tree-like enough
that each one buys two to five points, so the target takes several, and it may
be the wrong target for a district whose brief includes a river barrier and a
hill. And the 1065 m run with no decision is the entire south bank, Container
Quay to Millgate — that is the cost of "reachable only over the water". A
riverside lane is the only candidate that touches it and it barely moves
choice. Whether that corridor is scenery or a defect is a design call, not a
measurement, and it is open.

## The first race, and what it found in its first 125 metres

Open checkpoint is the primary event (GDD §7.3) and the district now has one:
**Crane to Crest**, Wharf Gate to Hillcrest through Northgate and Quarter
North, 0.88 km and 20 m of climb. It was placed by scoring candidate sequences
leg by leg with the critique's arithmetic. "Northgate Run", which spans the
whole city, had every leg one-way — a sprint in disguise. Crane to Crest's two
real-choice legs are exactly the two alleys: Crane Alley against the arterial
(2% detour if the alley closes — near-equal, the alley barely wins) and
Cutlers Alley against the long way round (11%, the sweet spot). The last leg is
one way and is the finish run. `tests/race.test.ts` gates every race on most
of its legs having a real alternative, so a race cannot be authored where the
city offers no choice.

The reference route is the grid and the line an inspection driver or an
authored rival follows. Driving it with the real sim was the first time
anything had driven an 8 m alley — every earlier route ran 12-24 m roads — and
the driver stopped dead at 125 m, at the alley's bend, at an offset of 0.09 m
from the centreline, with the nearest rail 4.7 m off and the nearest building
corner 10 m off. Nothing geometric was there. Asked directly, Rapier reported
the car touching a 32 x 11 m warehouse whose collider yaw matched its footprint
in *number* and not in *handedness*: a rotation about +Y turns (x, z) the
opposite way to the 2D rotation the footprint, the drawn mesh and every
placement test use. Every building's physics box had been the mirror image of
its footprint since rotation reached the sim. The core's near-square blocks
are nearly their own mirrors and hid it for two days; a long warehouse on a
curved alley swung its mirror across the road.

The collider now negates the yaw, and a test asks Rapier itself — not the
arithmetic — whether each long building's collider contains its own corner and
not its mirror's. Two things that test had to learn: Rapier's spatial queries
answer nothing until the world has stepped once, so asked cold every probe
including the box's centre read false; and Rapier stores translations as f32,
so a 1e-6 match against an f64 misses a building at |x| > 100 on rounding
alone.

The race loop is sim-owned and deterministic: gates are a radius at a junction
and count only in order; the countdown is enforced by the sim zeroing driving
input, so a replay holds the same three seconds; splits are ticks. The HUD
shows gate, clock and position; the next gate is a ring on the minimap or a
chevron on its rim, and a column of light in the world. The rival needs
nothing new — reset archives your last run and races it back through the same
gates. An authored rival log bundled with the race is the follow-up, and it
must carry physics identity.
