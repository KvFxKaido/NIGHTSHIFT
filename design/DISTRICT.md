# Blackglass District — route blockout

**Archived layout study — retired from the playable demo on 2026-09-10.**
Port Alder is now the only demo map; see [PORT_ALDER.md](PORT_ALDER.md) and
[EDITOR.md](EDITOR.md). The measurements, route names, old URLs and workflow
instructions below describe historical Blackglass iterations, not current
Port Alder behavior. `district.html` now redirects to the Port Alder map board.
`pnpm district:critique` and the retained source/tests still analyze Blackglass.

Historical status: playable layout study, 2026-09-07.

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
run/replay; saved garage and audio preferences remain browser-local.
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

**Continuous handoff.** Lanes are independent offset polylines, so the start of
the next lane is not the end of the previous one. A vehicle crossing a junction
carries that offset and absorbs it over twice its length as it drives, rather
than being written onto the new lane in one tick. Traffic bodies are kinematic,
so a discontinuous pose sweeps the body through anything standing beside it:
before this, 85% of turns jumped a vehicle several metres and the worst ejected
a car at 42 m/s. Only the drawn and collided pose is blended — lane, distance,
speed and reservations are untouched, so the follower and junction logic sees
exactly what it always did.

**Height is a stored profile.** Each lane's surface height is sampled at build
and interpolated between, rather than projected per vehicle per tick: projecting
searches the street network and measured at most of a traffic tick when called
per vehicle, for a number that cannot change. The step was 4 m until
2026-09-12, which left traffic up to 7.9 cm off the real surface across the hill
districts; it is 0.5 m now, holding that to 1.1 cm against the 2 cm the terrain
tests allow. A vehicle crossing a junction is the exception — it is between two
lanes, where no single lane's profile describes the ground, so its height is
resampled exactly.

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

## Buildings stand on the ground they are on

Three of Shawn's screenshots from driving around, and a fourth thing they
showed that neither of us named at first.

Every building — mesh, collider, facades, signs, glass, roof — was measured from
`y = 0`, on a district that climbs 20 m. Measured: **227 of 321 buildings stood
with their base more than a metre underground**, median 3.2 m, 32 past half
their height, and the worst — a 12 m building at (-252, -468) — entirely under
the hill, collider included. Where a road ran on an embankment beside one, the
road passed through its upper floors, which from the car is "a building
clipping the road". The night dressing knew, in its own way: it skipped
shopfronts wherever the road stood more than 3 m over the base and called that
a viaduct — 27 of 165 street-facing blocks by its own comment. They were buried.

Every building now has a `base`: the lowest drawn ground under its footprint,
so no corner floats and the uphill side is buried by at most the ground's
spread. A plot whose ground drops more than 4 m across it is refused — 18
candidates did, all beside the old loop where its authored grade meets the
inland ramp, the worst spanning 10.9 m; push-back found other setbacks for all
but one, and they stay embankment. The boundary walls stand on the terrain for
the same reason; at the hill's far corner datum is 20 m down.

### The test that took four references to write

"A shop spill stays on the ground its own storefront stands on" used to assert
|y| < 3.5 — true only while every building stood at zero. Against the nearest
road it failed at 22.8 m: beside the Rivergate bridge the nearest road flips
from the quay to the deck. Against the drawn ground it failed at 11.0 m: the
ground genuinely steps 11 m beside the loop's embankment, and a flat 12 m spill
plane overhangs the edge. Against the nearest building it failed at 11.4 m:
where the ground steps, buildings stand on both levels within twenty metres and
the nearest one is the wrong one. The renderer now stamps every spill vertex
with the base of the building that casts it, and the test asserts the rule that
placed it: within the shopfront lift of its own base.

### The race readout showed in free roam

All three screenshots carry "GATE 1/3 / 3" at the top, in free roam. The
readout's `display: flex` beat the `[hidden]` attribute's `display: none`, so
it could never hide. `#race[hidden] { display: none; }`, and the markup test
now demands it.

### Measured, not yet changed

Of **10,808 rail pieces, 70% guard open ground** and 20% stand in front of a
building that is already solid; 9% guard the river, the rail cutting, the
boundary or a drop over 1.5 m. Rails are the pale parapets in every frame.

Inside **18 of 35 junction aprons** two road ribbons overlap at different
heights — 11 over 30 cm, worst 1.07 m at Lower Hill — because each arm is
graded toward the junction along its own authored profile and they agree only
at the centre. That is the hump across the road in the third screenshot, and it
is physical: the sim's height follows the *nearest* street, which flips at the
bisector between two arms, up to 20 m out. The six inspection drives cross it
at the centre where both agree; cutting the corner does not.

Rail gaps: eight one-sided gaps of 4-5 m, all on the ring, 36 m in total; what
reads as random elsewhere is junction clipping opening every side street across
a 28 m apron. Under the rail rule most of it goes; what remains gets a
continuity test.

## Three rules, as tests

Shawn asked whether the map could carry rules: buildings can't clip barriers or
roads, and ground can't clip above road textures. That is how this codebase
already works — an invariant is a test that fails when the map breaks it, and
is mutation-checked so it cannot be vacuous — so the answer was to measure the
map against each rule first and then write the ones that held and the ones
that didn't.

**Buildings cannot clip roads** already held: every footprint edge is sampled
against the asphalt that is actually there, flares included. **Ground cannot
clip above road textures** already held for the terrain and now covers the
verges, the river and the rail ribbons too, sampled across the carriageway with
a 10 cm tolerance: the rail ribbon stands 5 cm proud of the road at the West
Level Crossing on purpose, and a verge's inner edge *is* the kerb.

**Buildings cannot clip barriers** did not hold. Placement cleared the streets
and nothing else, so **46 buildings had a corner in the river corridor, 7 in
the lineside, and 27 rail pieces stood inside 19 of them** with the fence
running through the building. Placement now refuses a footprint that enters
either corridor or encloses any rail piece; 320 buildings became 274 on the
same 18 faces at the same 88% extent — the 46 were standing in the water. The
corridor half of that is load-bearing and mutation-checked; the wall half is
not, on today's map, because with the corridors enforced no street rail lands
in a footprint. It stays as the remedy the test would demand if one did.

### The barrier nobody told placement about

A fourth screenshot: a lit building standing inside the Blackglass tunnel. Not
the height bug of the day before — that was buildings against the road
*surface* — but buildings against an **authored structure**. Placement clears
the road ribbon and its pavement, and to it the tunnel section of the loop is
a road; it has no idea there is a bore around it. Measured: **14 buildings
stood 12-15 m off the tunnel's centreline**, five on the tunnel floor beside
the road and nine rising 24-40 m up through its walls and roof from the low
ground beside it. None at the bridge.

The rule is a corridor of road half-width plus 6 m along the tunnel and bridge
spans, refused at placement and asserted after. The first version of the
corridor was a guess from the generator's profile, and it barely bit: the
push-back search set the buildings down at 15.2-16.2 m, the first spot that
cleared. So the bore was measured against the asset itself — horizontal rays
cast outward from the centreline hit the walls at **10.7-11.8 m, median
10.9**, exactly the profile's half-width plus 1.9 — and the buildings the
corridor now leaves stand three to five metres *outside* the tunnel's walls.
274 buildings became 272. One thing the test had to learn: on this loop the
tunnel runs straight onto the bridge, so the structural points are one
contiguous span, not two.

### The frontage test was measuring the wrong kerb

Adding the corridor rules tripped an older test: "only 162 of 272 buildings
stand on a frontage". It measured each building's gap to the street's
*narrowest* width — the width lanes are laid to, deliberately — which on every
junction flare puts the kerb metres inboard of the real one. Against the kerb
that is actually there, **242 of 272 stand within 5 m, median gap 3.5 m**,
which is a pavement. The same mistake `blockClearsStreets` made two days ago,
in the test that checks frontage. Fixed in the test; the map was right.

### The building you see was not the building that was there

"Still the same on my end" — after the height fix, the corridor rules and the
tunnel corridor, with the served code confirmed current. So the rendered scene
was scanned directly: `addDistrict` into a bare scene, every mesh's vertices
projected onto the tunnel, anything between its floor and roof inside its
walls listed by mesh name. The road, the paint — and four facade vertices, two
roof vertices, one sign glow, and eight sodium lamp posts.

The facade belonged to a building whose *footprint* stood 15.8 m from the
tunnel, correctly outside the corridor. Its drawn corner was at 5.2 m. The
footprint is rotated −78°; the drawn box was axis-aligned. **`night.ts` placed
every facade, sign, shopfront, spill and roof at `site.x ± width/2`,
`site.z ± depth/2`, and never applied the building's rotation** — while the
footprint, the collider (since yesterday), the blockout massing and every
clearance test all rotate. Measured: **218 of 272 buildings were drawn more
than a metre out of their own footprint.** That is the clipping in every
night-mode screenshot, and it had been there since the night dressing was
written. Three real fixes landed before it was found — buildings on the
ground, buildings out of corridors, buildings out of the tunnel — because each
measured the footprint and the footprint was right. The lesson written into
CLAUDE.md: when a screenshot disagrees with a passing footprint test, scan the
rendered vertices before trusting either.

Every piece is now built in the building's own frame and turned by
`-site.rotation`, the blockout's sign; the shopfront's lift is read where its
pavement actually is once turned. The test asserts every drawn facade vertex
lies inside a real footprint, and fails with the rotation dropped. The lamp
pass skips the structural corridors — the tunnel lights itself — and a test
holds the bore free of posts.

The fourth rule the screenshots are really asking for is *road cannot clip
above road*: the ridge inside 18 junction aprons where two ribbons overlap at
different heights. That is not ground, and it is the apron work.

## The rail rule

Of 10,808 rail pieces, 70% guarded open ground and 20% stood in front of a
building that is already solid. The district drove like a slot-car track, and
Midnight Club's whole thesis — the gap between two buildings is a route — was
impossible while every kerb was fenced.

A rail now stands only where it guards something: the boundary, the river and
rail fences, the tunnel and bridge (their barriers are the deck's edge and the
bore's wall), or a street edge beside a drop of 1.5 m in the raw terrain to
either side — either side, because a piece does not know which way is out and
an embankment falls away on both — or beside water, which the terrain does
not show because the river is drawn 1.6 m under it. **10,808 pieces became
1,756**: 1,363 street rails, 192 boundary, 131 river fence, 70 rail fence.

Two things the fences had to learn on the way. They follow a **mitred offset**
of their corridor now, as a lane does: laid per segment at a fixed offset, the
two segments either side of a bend diverge, and the test found an 89 m hole on
the outside of the river's bend at (240, 196) and a pile-up inside it. And a
fence piece is removed only where a road **crosses** it — near *and*
transverse — or where it stands **on** a carriageway. "Near a road" alone was
the old rule, and it could not tell a crossing from Ferry Reach running
alongside the bank for eighty metres: 77 m of open bank. The transverse rule
alone then left the west bank's fence standing in the middle of Wharf Road,
whose carriageway the 44 m line runs straight down, and stopped two
inspection drives. Where the corridor line lies on a road, the road's own rail
is the barrier — which is why water had to count as a drop.

### The ground under the car

With the rails gone the car can leave the road, and a car that still rode the
nearest street's height would float on it — on the hill, metres above the
ground it can see. `RoadWorld` carries an optional `surface`: the road across
the carriageway, the drawn ground beyond it, eased over 1.5 m at the kerb
because the ground is clamped 0.35 m under the road and that step in one tick
is a jolt. The sim rides it at all three of its height reads. Blackglass has
no `surface` and is unchanged. The test drives off a kerb chosen by
measurement — open ground, no drop, no building, ground that differs from the
road — and asserts the car rides the ground within 0.6 m without a step over
0.25 m; without the surface it fails, floating.

### What the tests taught, again

The continuity test took four versions. It classified fences by distance and
mistook a corner piece for a street rail. It measured gaps by projecting onto
the river and, on the inside of a bend where the mitred fence is shorter than
the river, read two touching pieces as a 44 m hole. It excused a gap by one
midpoint while the fence bent 4-7 m away from the chord. And its crossing
check was called with two arguments and took four — tests are not
type-checked, the dot product was NaN, and every gap failed including the
bridges. Each version was wrong in a way the map was not.

### The tower that was not a building

Heading north over Millgate Crossing, a 104 m tower stood across the far end
of the road, the carriageway running into its lobby. It was not in
`DISTRICT_BLOCKS`. It was the Rivergate backdrop — the three towers composed
for the closed circuit's horizon "beyond the bridge" — and the district had
been taking the whole authored asset for the sake of its tunnel and bridge.
The backdrop's coordinates fall inside the district's street grid; it has no
collider, so the car drove through it; and it is not a block, so none of the
footprint rules ever saw it. `addDistrict` now detaches it, and the test
asks the shipped GLB's own vertices whether the skyline stands over a
district carriageway (it does: 12 of the stone's 72) before asserting the
district draws none of it and the circuit still does.

Finding it was the lesson. Four railed roads with towers "ahead" were
measured, screenshotted from the car and rejected; `__ns.pick` on the pixel
named the mesh in one call. A thing drawn that the district did not generate
is outside every rule the district enforces — look at what is drawn, not at
what the generator thinks it drew.

### Where the 50 microseconds went

The apron work adds a mesh per junction, tens of thousands more surface
queries at load, so the projection cost had to come down first — and the
summary's diagnosis was wrong. A run index over each polyline (eight segments
and a box per run, skipped when the box is already farther than the best
segment found; bit-identical to the plain scan and tested against it) took
`projectOntoPath` from 7 us to 4 and the district projection only from 50 to
40. The measurement then said: 1.0 candidate streets per call. For a point
outside every street's padded box — most of the terrain — the fallback was
"project onto all fifty streets", and that was the cost. The search now
widens its box margin (0, 32, 64, ... m) until the nearest candidate found is
closer than any street the boxes excluded, which a street outside every box
at margin m is by more than m plus the narrowest street's padding. One round
on a road, three or four in open ground: 14.5 us, district build 2.2 s to
0.9 s.

It also fixed an answer that was quietly wrong. With a non-empty candidate
set the old code never widened, so a point inside a long street's box, far
from that street, was answered with it even when a nearer street's box had
missed the point. The ground clamp and the off-road surface read that
answer. A seeded brute-force comparison over every street is the test, and
with the widening removed it fails on the first open-ground point.

### One surface per junction and through graded bends

The 35 junctions now have one radial apron mesh each. An arm stops beyond
its measured overlap with the other incident streets, with a 1.5 m margin;
its cut cross-section is also the apron boundary, so the seam is shared.
The sim weights streets by carriageway coverage: an 8 m feather inside the
kerb and a 4 m spill outside. The spill matters at kerb intersections, where
normalizing disjoint, near-zero supports previously created a 1.17 m step.
Overlapping 28 m grading discs now contribute together. Selecting the first
disc caused a separate 12 cm discontinuity at a sampled dock-cross boundary.

The ring-hotel inside kerb had another defect: nearest-centreline projection
flips between segments whose arc lengths have different heights. A 2 cm
scan measures a 0.409 m step with the old height calculation. Each street
now blends nearby segment heights with a 4 m Gaussian, smoothly cut off
beyond the kerb. This preserves continuous height even when the nearest
segment changes. Junction grading still supplies node heights; path
projections retain their routing geometry. The sampled maximum becomes
0.0041 m over 2 cm. This smooths the district's authored vertical profile;
it does not change the original Blackglass world or its handling settings.
District world identity advances to v3 for replay compatibility.

The renderer samples the same height function, with 17 columns across a
ribbon and at most 2 m between longitudinal and apron radial samples.
Subdivision interpolates the original mitred cross-sections: recomputing
the mitres on shorter segments folds the inside of a tight bend backwards.
Height-only mesh queries avoid calculating pitch; driving queries measure
grade on the actual blended surface.

Validation: `tests/aprons.test.ts` probes 37,569 carriageway positions for
one drawn surface, no overlapping triangle interiors, and correspondence
to the driven height. The measured p99 deviation is 0.0078 m and the maximum
0.0384 m, under a 0.05 m ceiling. Another 14,037 probes scan the hairpin at
2 cm spacing. Reverting segment-height blending, first-disc selection, or
ribbon cuts makes its respective regression fail. The existing winding,
road/ground clearance, collision-enabled reference drivers and replay tests
remain acceptance gates. `scripts/check-aprons-browser.js` captures Lower
Hill and the hairpin in blockout and night modes; these are staged visual
checks, not evidence of a manually driven lap.

There is a measured startup tradeoff. Three same-process builds before this
patch took 0.75-0.81 s for blockout and 1.23-1.35 s for night; the apron build
took 1.98-2.02 s and 2.40-2.85 s respectively. Before the final lamp-pool refinement, whole-scene triangle counts
rose from about 122k/183k to 343k/403k. These are CPU construction timings,
not browser load times or GPU frame-rate certification.

The carriageway probes include every cut seam and offsets 5 cm to either
side. A centreline sample beyond a cut can still have a mitred kerb behind
it; trimming now skips these sections locally so no first ribbon cell folds
back into the apron. Browser inspection also caught decorative lamp-pool facets dipping through
the new surface like potholes. The pools now sample height at 1.5 m spacing
and sit 10 cm above the analytic surface (the asphalt sits 4 cm above it).
This removes the large cutouts in the inspected hairpin and Lower Hill views;
small light-patch artifacts remain around Lower Hill and are cosmetic.

Final isolated construction measurements, including finer lamp pools and the
seam fix: blockout 1.81-1.86 s, night 3.15-3.21 s (two builds each).
Whole-scene triangle counts are 342,457 and 556,929 respectively. The final
full suite passes 230/230 tests, and the production build passes. The browser
harness reports no page exceptions in its four staged views; the existing
favicon 404 and Rapier initialization warning are unrelated.

## Wharf Garage

Free roam now starts beside the central shutter of an authored warehouse on
Wharf Road. The exterior replaces that plot's generated massing in both
blockout and night views and retains its exact solid collision footprint.
The district map and minimap mark the entrance with G. Existing race and
route grids retain their starts; the free-roam world version is v4.

Within four metres of the entrance, below 1 m/s, on the entrance's level,
and outside a race or replay, E/Enter or Cross/A opens the garage. The
customization view pauses the run; Drive out or Back returns to the same
vehicle state and tick. The title-screen garage remains available as a
preview, with Drive out starting a run. The interior is still a separate
presentation scene, entered through the prompt rather than an open shutter.

Right-stick horizontal input rotates the car and platform together. The
camera stays fixed, so inspecting the rear cannot orbit through the room's
walls; vertical stick input leaves the camera alone. R3/C resets rotation.
Driving camera orbit remains unchanged. Tests exercise the actual garage
render path, physical clearance when driving away, and entry restrictions.
`scripts/check-garage-browser.js` covers keyboard/pad entry, fixed-camera
rotation, reset, preserved simulation state on exit, and map placement.

## The city was drawn in full from everywhere

Port Alder's static scenery is merged into a handful of city-wide meshes: one
ground mesh, one pavement mesh, one lane-paint mesh, the night dressing, the
street lamps. A city-wide mesh has a city-wide bounding sphere, so frustum
culling never rejects it. Driving from the freight blocks to mid-city on
2026-09-11 moved the draw calls from 102 to 452 while the triangle count stayed
between 832k and 874k — a 3% spread across the whole district. The trees were
the only scenery that culled, because `render/evergreens.ts` had always batched
its instances per 256 m cell.

`render/city-chunks.ts` divides those merged meshes on a grid, bucketing each
triangle by its centroid so none is ever split, and carrying every vertex
attribute, the material identity, the shadow flags and the render order across
unchanged. Each piece gets its own bounds, which is the whole point. Chunk
children keep the evergreens' `name:cell` convention, so `__ns.pick` still names
what it hits.

### Choosing the cell, measured at mid-city

| cell | scene meshes | draw calls | triangles | CPU render |
| --- | --- | --- | --- | --- |
| 128 m | 8179 | 438 | 73k | 9.05 ms |
| 256 m | 3325 | 213 | 87k | 2.89 ms |
| **512 m** | **1650** | **195** | **145k** | **2.20 ms** |
| effectively unchunked | 952 | 120 | 701k | 1.14 ms |

Read this honestly: it is a trade, not a free win. The timing is the cost of
`renderer.render()`, which is CPU submission and frustum testing; GPU work is
asynchronous and is not in that column. So the unchunked row looks cheapest
while shipping 701k triangles a frame, and every chunked row pays CPU to stop
doing that. 128 m is plainly bad — eight thousand objects to frustum-test for
barely fewer triangles than 256 m. 512 m keeps about 80% of the geometry out of
the frame for roughly one extra millisecond of CPU here.

On this desktop that is close to a wash. The bet is the phone (GDD §21, the
RedMagic 10 Pro), where 700k triangles a frame is the expensive half and a
millisecond of CPU is the cheap one — and it is a bet, because a desktop
measurement cannot certify a mobile GPU. Revisit the cell size on the device.

The sweep also found three unnamed meshes: the lamp posts, heads and pools in
`render/alder.ts`, 106k triangles of city-wide geometry. They are named now,
matching the district's `-lamp-posts` / `-lamp-heads` / `-lamp-pools`
vocabulary. Every mesh carries a kebab-case name because `__ns.pick` and the
chunker both read them; the district has a test that enforces it and Port Alder
does not, which is how three meshes slipped through.

## Props anchor to a parcel or to a kerb

Port Alder had two placement rules and no way to reuse either. `alder-evergreens.ts`
scatters trees through authored regions — the anchor for anything standing in
open ground: deterministic hash, value-noise clumping, clearance against every
road and building, and carved passages so a grove cannot quietly close a
shortcut. The street lamps were the other rule, written inline in the renderer:
walk each centreline at a fixed spacing, step out past the kerb, skip the ends
where the junctions are.

`sim/kerb-props.ts` is that second rule with its constants lifted into a spec,
so another prop costs data rather than code:

| | spacing | offset past the kerb | ends cleared | side | density | off solids | off roads |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lamps | 55 m | 1.7 m | 20 / 15 m | left | all | none | 0.5 m |
| Bins | 34 m | 1.35 m | 26 / 20 m | right | 55% | 1.1 m | 0.5 m |

That places 1257 lamps — the inline loop's 1265 in the same places, less the
eight it stood in a roadway (below) — and 1150 bins out of 2116 candidates. Streets only meet at junctions, so
a street's ends *are* its crossings, which is why clearing a fixed distance from
each end is the right primitive rather than something cleverer.

Clearance comes in two kinds because a prop can be wrong in two ways. Solid
clearance keeps it out of walls. Road clearance keeps it out of every roadway,
its own street's included: a prop can sit correctly on its own kerb and still
stand in a carriageway, inside a bend where one leg's kerb is the other leg's
road, or in a wider street near a junction. Measured before the check existed,
that was 12 bins and 8 lamps — 0.7% and 0.6%, the worst of them 9 m into the
road. Five of the seven lamps in a carriageway were in their own street's bend.
The check was left off for the lamps at first so the extraction moved nothing;
on 2026-09-18 a lamp drawn in the middle of Alaskan Way, 8.9 m into it on the
inside of its bend, turned it on for them too. `tests/kerb-props.test.ts`
asserts that no bin and no lamp is in a carriageway, and that the lamps' rule
without the check still puts seven there, so the check is what clears them.

Two more decisions worth keeping. Thinning is keyed to the pose's world position
rather than to a loop index, so authoring a new street cannot shuffle the props
on an existing one; `tests/kerb-props.test.ts` proves it by reversing the street
order and demanding the same set back. And clearance is opt-in, and the
same test pins the lamps to the arithmetic the renderer used to run, to the bit,
less the eight the road check removes.

Nothing here collides. These are dressing, and a prop that should stop a car has
to be put in the sim's solids deliberately, the way an evergreen trunk is. That
is a driving decision, not a dressing one — it changes racing lines — so it
wants measuring on its own. And a new merged prop mesh must join
`CHUNKED_SCENERY`, or it is drawn in full from everywhere: `alder-kerb-bins`
chunks with the rest of the scenery and costs its 13,800 triangles only where
it is visible.

## A livery needs a panel, and a panel is a box

The livery editor shipped NS-01-only, and the reason was more interesting than a
hardcoded model name. `liverySurface` collects painted triangles whose normal
agrees with a direction, so "up-facing" is the hood, the roof and the boot lid
at once -- on the NS-01 that surface spans the whole 4.5 m of the car, and the
hood and roof queries return byte-identical geometry. What actually localises a
decal is the zone box, because `DecalGeometry` clips the surface to it. The box
is the panel definition, and there were five of them, measured by hand against
one car.

`deriveZones` computes them per body instead. Position and extent come from
proportions of the body's own bounding box; the height of the two horizontal
panels is *measured* from the up-facing geometry inside that z-band, because a
bounding box cannot tell you where a hood is and a derived hood at roof height
floats above the car. Bodies are not tessellated evenly -- the Hammer has three
triangles across its bonnet -- so a thin band widens once and then falls back to
a proportion rather than trusting two samples.

The hand-measured table is kept in `tests/livery.test.ts` as the oracle, because
deriving the boxes is only worth doing if it reproduces the car someone actually
measured:

| panel | worst centre error | worst size error |
| --- | --- | --- |
| hood | 0.07 m | 0.03 m |
| roof | 0.12 m | 0.01 m |
| left / right | 0.01 m | 0.02 m |
| rear | 0.01 m | 0.01 m |

All of that is inside the thickness of the decal box, so the NS-01 looks as it
did. The other four bodies land where they should: the Bulwark's hood derives to
y 1.16 where the NS-01's sits at 0.96, and the Kestrel's roof to 1.62. Flanks
mirror to 1.19e-7 on the Bulwark, which is float round-trip noise out of the
GLB, not a lopsided car -- the test allows 1e-6 rather than demanding zero.

Designs are stored per body (`nightshift.liveries.v1.<model>`), so a Cinder
livery does not load onto a Bulwark, and switching cars in the garage reloads
that car's design instead of repainting it with the last one.
