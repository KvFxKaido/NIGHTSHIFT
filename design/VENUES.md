# Venues

Enclosed places to race that are not streets. Shawn's direction, 2026-09-25: the Wharf arena becomes the rivals'
place to be beaten in, and a closed-off area for generated off-road races, "its own enclosed area that you can only
get in by triggering the rival or pulling into a loading marker". Ridge Circuit leaves the open map the same way and
becomes the track venue, with Rivet moved there: "the same principles over there but it's track racing instead".

A venue is a world of its own (a `RoadWorld` beside Port Alder's), entered and left through a page load, as every race
already is. That makes it a second sim world, not a second map or city: GDD §21's boundary is about cities. Its
ground and asphalt are authored; what is generated is the race over them (gates, a route, a layout chosen from
authored pieces), the line the street generator already walks, since §21 keeps procedurally generated roads out.

## The career across the venues

Shawn chose both: pink slips in a venue, and the races that do not suit streets by kind (drift, drag, circuits,
off-road). Rivet's drag strip moves to the track venue. The table is the first cut, to be marked up: which name's pink
slip is which race is a proposal, not a decision.

| # | Name | Stages 1-2 | Pink slip |
|---|---|---|---|
| 10 | Moth | street sprint, then the rematch circuit at the track | off-road, stadium |
| 9 | Stray | unordered, streets | off-road, stadium |
| 8 | Rivet | drag, the track's dragway | drag, the track |
| 7 | Bollard | sprint, streets | stadium circuit |
| 6 | Deuce | sprint, streets | stadium circuit |
| 5 | Sable | drift, stadium | drift, stadium |
| 4 | Plumb | circuit, the track | circuit, the track |
| 3 | Crest | sprint, streets | track circuit |
| 2 | Wake | sprint, streets | track circuit |
| 1 | Tally | unordered, streets | off-road, stadium |

The reasoning behind the proposals: off-road has no owner yet, and unordered races are already about choosing a route
between gates, which is what open ground is for; a pink slip goes where its car belongs (Bollard's Breakwater, the
brick that wins every shove, in the tight stadium; Crest's and Wake's fast cars on the track).

## The stadium (Wharf Arena, working name)

**What it is for** (Shawn, 2026-09-25): the dirt and drift venue. Sable's drift, off-road races and dirt circuits
run here; circuit and track racing belongs to the track venue. Full and Short (below) are paved **for now**, because
there is no dirt surface or handling model yet: the only ground the sim has is physics v6's off-pavement cost to a
2WD car (AWD exempt), which is a penalty, not a surface. When dirt exists they become dirt circuits, and generated
circuits here are dirt layouts: lines on a graded dirt ribbon drawn per race, a gate at every turn since nothing but
the gates stops a cut across open dirt, and tyre walls later as generated props. Known before that day:

- The rival's corner planning does not read the ground (`rival.ts`): an AWD rival loses nothing on dirt, but a 2WD
  one would plan its corners on grip it does not have. Measure an AWD and a 2WD rival on a dirt layout first.
- The AWD names are this stadium's natural cast: Moth's Kestrel, Bollard's Breakwater, Plumb's Meridian, Wake's
  Reign. The career table above puts 2WD cars on dirt (Stray's Latch FWD and Tally's Vesper RWD off-road, Deuce's
  Wager RWD in a stadium circuit) and wants a pass with that in mind.
- Generated circuits with asphalt, as loops over an authored paved network, belong to the track venue, where Ridge's
  three layouts already share corners.

`src/sim/stadium.ts`, `src/render/stadium.ts`, `tests/stadium.test.ts`. The arena at the coordinates it has on the
map, so Sable's yard, line and zones are the same numbers in both.

- **Continuous shell.** The venue uses the original perimeter before the city entrance cuts, baked as
  `closed-shell.glb` and `closed-collision.json` by `scripts/build-yard-arena.mjs --closed`. The stepped north
  wall and curved east end continue through the former openings; no blocking slabs or cut-face caps remain.
  Rendering and collision contain exactly the same 3,675 triangles (three meshes, one material, 260 KB).
  A test floods the floor within the shell at car height and drives actual cars into both restored walls,
  including 60 m/s impacts. All arrivals, markers, Sable's grid, zones and line remain reachable.
  The floor and minimap follow the continuous perimeter rather than bridging two cut wall lines.
- **The floor** is dirt, but for Sable's apron (`DRIFT_YARD.bounds`), which is asphalt. Dirt is `ground` to the sim,
  so a 2WD car pays for it and AWD does not (physics v6; design/CHAOS.md, "Three grounds").
- **Nothing of the city.** No streets, no traffic, and a test holds the module's import closure off Port Alder's data.
  The page does still load the city today, because `main.ts` imports it statically; a venue page that skips the 24 MB
  is a later change to `main.ts`, which this makes possible rather than does.
- **Named by what a car drives on and into**: `STADIUM_VERSION` is `stadium-v<revision>-<hash>`, the hash over the
  shell, the pad, the circuits' asphalt and the yard's solids, written with `toFixed` so a browser and Node agree.
  Pinned by test; a change bumps `STADIUM.revision` and repins. The restored shell was `stadium-v2-7662b672`; with
  the circuits paved `stadium-v3-84732353`; with the props gone `stadium-v4-8da8b985`. The city still uses its
  original cut shell and unchanged identity.
- **Nothing stands on the floor** (Shawn, 2026-09-25: "remove all props and anything else that was in the stadium for
  more real estate. We can add stuff like that to the procedural generation later"). The venue has no warehouse,
  container or floodlight masts (`STADIUM_SOLIDS` is empty); the city's arena keeps them until the city side closes.
  Sable's arrows and numbered zones are paint, drawn for her event alone, so free drive and the circuits race on a
  clear floor. The masts were the only light, over her apron alone: the bowl is lit instead by eight floods on the
  shell's top ring (`addStadiumLights`), which take no floor and reach every run.
- **The gates, both ways** (`STADIUM_GATES`). Each has a marker on each side: stop within 7 m of it, under 2 m/s, and
  the garage shutter's prompt offers the other side. City side: the east gate on Harbor Way and the north driveway.
  Venue side: inside each restored wall. Crossing loads the other world with `?gate=<id>`; you arrive at that gate's other
  side, clear of its marker and facing away. `?venue=stadium` is the venue's free drive. Inside, each way out is
  drawn as a roller door on the barrier where the city gate was (`addStadiumDoors`): a 12 by 4.2 m ribbed shutter
  following the wall's curve, a steel frame, amber beacons, a lit sign standing on the barrier's top ("EAST GATE ·
  HARBOR WAY", "NORTH GATE") and a warm light on it at night, so the way out reads from across the bowl. Drawing only:
  the shell is the collision, and a test holds every door vertex within 0.35 m of the wall's face, on the floor's side.
- **Sable's drift runs here.** `?race=sable-yard-drift[-2|-3]` builds the venue. The drift test's robot driver scores
  the same to the millimetre in the city's arena and in the venue, in all three drivetrains (FWD 4,157 points and 10
  clips, RWD 3,969 and 7, AWD 5,193 and 11, 2026-09-25), and still does with the props gone, which it never
  touched. After her event, free roam is the venue's free drive; the garage is the city's.
  **Her targets are suspect for a driver** (3,000 / 3,600 / 4,200): they were set with the warehouse and container
  standing, to clip and to crash into, and the venue has neither. The robot run cannot see that. Her zones keep their
  names ("Warehouse entry", "Container clip") for things that are not there. Re-set them from a driven run, or bring
  props back to her apron through generation.

### Built and not yet (2026-09-25)

Stage A, built: the venue world, its drawing, its gates on both sides, Sable's drift in it, free drive with Sable
parked. The city's world is unchanged: its identity did not move, so no recording or stored course is refused.
Then the circuits, built the same day: Full and Short, raced and recorded (below).

Not yet, in the order proposed:

1. **Stage B, the city side**, as one change to Port Alder's identity together with Ridge's move (below): close the
   arena's cuts on the map, move Sable's parked car out to the east gate, and let her flash load the venue. Today the
   city's arena is still open, Sable is still parked inside it, and her flash already loads the venue because every
   race is a page load. Closing the map is what refuses recordings and pending career courses, so it happens once.
2. **A dirt surface and handling model**, then the circuits turned to dirt and **generated dirt circuits** (above,
   "What it is for"), and the pink slips that race them.
3. **Off-road**: the generator for unordered gates over the floor, and the gates placed so no cut pays an AWD car.
4. **Props, generated**: what stands on the floor, drift obstacles and stunt pieces, drawn per event instead of
   standing for every one. Sable's targets are suspect until her apron has something on it again, or are re-set.
5. The venue page without the city's data.

### Continuous-shell validation (2026-09-25)

- Full `pnpm test`: **796 passed, zero failed** (343 seconds). `git diff --check` passes.
- 26 focused stadium, city-shell, drift and yard-grid checks pass. The venue tests compare every GLB triangle
  with the physics bake, check retained props for clipping and confirm the closed floor outline.
- Sable's complete drift state and final x/z match the city exactly in FWD, RWD and AWD after restoring the shell:
  4,157 / 3,969 / 5,193 points, 10 / 7 / 11 clips. Targets and line remain unchanged.
- `pnpm build` passes (the existing large-chunk warning remains); glTF validation reports zero errors or warnings.
- `node scripts/check-stadium-shell.mjs` captures matching aerial and night views, exercises both marker round
  trips through the real prompt, checks each arrival and the open-city/closed-venue asset selection, and verifies
  that a failed closed GLB request draws the closed collision fallback. Zero page errors.
- Captures and logs: `artifacts/stadium-shell/`. The browser harness uses port 5177 by default, overridden by
  `STADIUM_URL`. Use `?venue=stadium&scene=track` for live driving (the harness itself freezes captures).
- Port Alder's collision, shell asset and world identity files are unchanged. Its later closure remains Stage B.

### The circuits (built 2026-09-25)

`src/sim/stadium-circuits.ts`, `stadium-events.ts`, `render/stadium.ts` (`addStadiumCircuits`),
`tests/stadium-circuits.test.ts`. Built on Ridge Circuit's construction, which moved out of `arena.ts` into
`circuit-plan.ts` unchanged: Ridge's three laps serialize bit for bit as they did, and its drawing, moved into
`render/track-strips.ts`, is the same mesh for mesh and vertex for vertex.

12 m wide with 1.5 m shoulders, corners of 18 to 25 m, clockwise, both layouts laid in the venue whichever is raced:
their asphalt is paved to the sim (`onStadiumCircuit`) and dirt starts past the shoulder. A test holds every sample 5 m
or more past the shoulder from the wall and 3 m from every solid.

- **Full**, 1,913.7 m, 12 turns, start at (-830, 1003) under race control, running east: (-722, 1003) r20, (-645, 893)
  r25, (-455, 890) r22, (-455, 985) r18, (-215, 985) r22, (-215, 1062) r22, (-440, 1062) r18, (-440, 1115) r18,
  (-665, 1115) r20, (-665, 1055) r18, (-1020, 1055) r22, (-1020, 1003) r22.
- **Short**, 1,258.2 m, 8 turns, start at (-560, 891.7): (-645, 893) r22 (Full takes it at r25), then Full's seven
  corners from (-455, 890) to (-665, 1115) at the same radii, closing north up x -665.

A gate at every turn, at the middle of its arc, 10 m across, as on Uptown Circuit: the runs lie 60 to 95 m apart over
dirt an AWD car does not pay for and Sable's asphalt nobody pays for. `?race=stadium-full|stadium-short[-solo]`,
three laps, in the race list as Wharf Arena / Full and Short. The rival is Moth's Kestrel on a racing line, as on
Ridge. Measured 2026-09-25, alone: Full 69.3 s a flying lap (62 mph average, 113 mph top), Short 47.9 s, no resets
or recoveries, not a tick on the dirt, never more than 6.0 m off the centreline. Laps are recorded; a recording names
`stadium-circuits-v1` and the venue's world, and `pnpm laps --verify` rebuilds the venue for it (`recordedWorld`).
Sable's drift is still identical to the city's with the circuits paved (it runs on her apron).

## The track (Ridge Circuit)

Its three layouts stay exactly as `arena.ts` builds them (Full 2,546 m, East 1,924 m, Ridge 1,612 m, the lengths the
tests pin), so the car cards, the golden master and the rival's lines keep what they were measured on. It becomes a
venue with an edge 50 to 70 m past its asphalt and a gate where Pine East arrives.

- **The dragway**: Rivet's strip as `drag-event.ts` defines it (two lanes 3 m off centre, 2 m tolerance, 402.336 m),
  centred on x 3350 parallel to the main straight and running the same way (north), start at z -770, 48 m from the
  nearest circuit edge. 40 m of staging behind it and 300 m of shutdown past the finish: the shutdown is an estimate
  (about 130 mph at the line braking at 0.9 g is 190 m), not the Hammer's measured trap speed.
- **Heights**: `arena.ts` is plan geometry and takes its heights from Port Alder's terrain. The venue must carry the
  same heights under the layouts or the lines and cards move while the plan does not. Recorded Ridge laps will likely
  be refused once it is its own world, whichever way that goes.
