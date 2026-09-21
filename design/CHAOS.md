# Chaos

What the yard by the start is for, and what the four mechanics it exists to
prove would actually cost.

The direction is Shawn's (2026-09-21). Nothing here is built, nothing is
scheduled, and the costings below are an assistant's, written down so they are
not lost in a chat log. Facts are marked as measured and name the line that
holds them; everything else is inference and says so. Each call is Shawn's.

## The yard

The open ground around the start — the grass west and south of Wharf Garage,
along Harbor Way — goes to Sable's drift yard, grown into an offroad and stunt
venue: Takeover-style events in the manner of NFS Unbound, Underground-style
street events, and the whole area carrying a ProStreet race-day feel.

That settles a question `design/LOOK.md` used to ask the other way. Its start
item read the emptiness there as a hole in the city and asked for buildings on
those lots. The lots are spoken for; the emptiness is a venue waiting for its
event, and the lighting that goes in should read as event lighting — portable
floods, generators, a meet in a yard — rather than as dock dressing.

Ridge Circuit is the precedent for how a venue lives inside Port Alder without
becoming a second map: one facility, its own layouts, its own recordings
(`arena.ts`, `design/PORT_ALDER.md`).

## The shape of the venue

Measured 2026-09-21, before designing anything. The drift yard is a walled apron
of 320 by 300 m at x -620..-300, z 810..1110 (`DRIFT_YARD` in
`src/sim/drift-yard.ts`), reached by a driveway off the south-western leg of
Harbor Way. Its east wall stands 313 m from the garage exit, and the ground
between the two is empty: sampling `createAlderWorld().project` on a 20 m grid
from x -340 to 40 and z 760 to 1120 finds 11 hectares with no road in them at
all, bounded by Harbor Way to the east and the cross street at z 780 to the
south.

```
        west                                    east
z1100   YYY..........................  Harbor Way ##
z1000   YYY..........................             ##
z 900   YYY.......  11 ha free  ......    garage  ##   <- the start
z 800   YYY..........................             ##
z 780   ...........###############################
        existing apron       the land between
```

So the expansion is not a new site. It is the land bridge between Sable's yard
and the game's front door, and the moves below follow from that.

**Sable stays on the west apron** (Shawn, 2026-09-21). Her event is tuned, it is
recorded, and the apron is her turf (`alder-turf.ts`); the new ground carries
the chaos disciplines instead, with her drift at the far end of it as the deep
content rather than the whole of it.

1. **A site with a gate, not a yard.** *Built 2026-09-21* (`YARD_GATE` and
   `GATE_STRUCTURES` in `drift-yard.ts`). The apron was reached only by the long
   way round, off the far south-western leg of Harbor Way; the venue's front
   door now stands on Harbor Way at x -34, z 910, which is the heading the
   garage exit faces, 47 m away. Two posts with a board, a gatehouse whose
   window is lit because the meet is on, floods on the posts, and rails that
   stop after 12 m — a gate, not a fence. The opening is 13.3 m and a test
   walks it to prove nothing solid stands in the gateway. The start view has a
   subject now, and no building was authored to get one.
2. **Three grounds, by surface, west to east.** The tarmac apron stays as it is.
   The middle 11 hectares stay dirt on purpose: since physics revision v6, grass
   and bare ground cost a 2WD car grip and pace with AWD exempt, and this is the
   only place in the game where that penalty is the point rather than punishment
   for a mistake — and the only place the Bulwark's layout means something. The
   eastern strip on Harbor Way is the paddock: lighting, assembly, the gate.
3. **Two scorers, because contact means opposite things.** `stepDrift` clears
   the chain on contact (`drift-rules.ts:43`, "CONTACT / CHAIN LOST"), and a
   Takeover pays for hitting things. Do not reconcile them: run them as separate
   rules kinds, the way `drift-rules.ts` is already separate from `race.ts`.
   That conflict is the argument for the race-day wrapper rather than a problem
   with it — one venue, several disciplines with incompatible rules, one session
   score, and the wrapper is progression and UI rather than sim. Drift zones
   also pay only in sequence (`nextZone`), which is an authored line; area and
   prop scoring is a different shape again.
4. **The walls come down going east.** The apron is boxed by four 1.2 m walls
   that are real colliders, with soft bounds that tell the player to "RETURN TO
   THE YARD". Right for a scored box, wrong for open ground, and against the
   open-racing rule about unnecessary barriers. Let the event's bounds be the
   boundary and leave the fence to the old apron.
5. **Break the yard's own floodlights first.** `YARD_STRUCTURES` are in
   `ALDER_SOLIDS`, so the apron's four 14 m floodlight masts already have
   colliders: they are the only solid light poles in the game while all 1,335
   street lamps are drawn only. Breakable-pole research therefore has a first
   subject that touches no street at all. Learn the break model on four posts in
   a yard, then decide whether the city wants it.

## The grid

*Built 2026-09-21* (`src/sim/yard-grid.ts`). The venue needed a coordinate
system before anything else could address a place in it. Port Alder's races are
drawn from the street graph — legs between junctions, gates on lanes, distance
along a lane's own path — and the venue has none of that, so the generator
cannot name a spot on 11 hectares of open ground. The grid is the substitute.

Twenty-metre cells, anchored to the world rather than to the site, so editing
the site's bounds does not move every cell under whatever has been placed in
them. Twenty because that is a race gate's radius (`GENERATOR.gateRadius`) and
close to a drift zone's 17: the size at which "a place in the yard" means
something to a car. The site runs x -620..-20 and z 800..1120 in whole cells
with exclusive maxima, which stops at Harbor Way's kerb rather than swallowing
the street. Measured: 480 cells, 401 of them usable — 16 hectares — of which
198 are apron and 203 are dirt, with 79 blocked by the walls, warehouse,
containers and the east gate.

A cell's facts are derived, never authored. Its surface is read from
`alderGround`, so move 2's three grounds describe themselves instead of being
listed a second time and drifting. Nothing here is seeded; when props, ramps and
debris are laid out per cell, that is where the integer hash applies and the
renderer's `hash01` does not.

What it unlocks: a course becomes a list of cell ids, which is compact and
hashable the way a stored race needs; Takeover scoring gets its data structure,
because "which cells did you work, and how well" is what area scoring means;
layout becomes per-cell and reproducible; and the AI gets something to plan on
where there are no lanes, with per-cell cost — dirt against tarmac — which is
the only way "was the cut worth taking?" is computable off the street.

The prompt was TRON's grid floor (Shawn, 2026-09-21), but the grid is structure,
not a drawn surface. Cyan belongs to the race, so a glowing lattice is the one
thing it must not become; if it surfaces visually it does so as what a freight
apron actually carries, painted container bays with row and bay numbers. The
arena above it gets drawn the way the firs were: a reference model kept in the
ignored `inspiration/` tree, and our own geometry written by script.

## What the yard is for

It is research as much as content. Four things get tried in a contained yard
before they are let loose on the main map:

1. Ramps.
2. Collision physics for light poles.
3. Timed persistent debris, in the manner of FlatOut and Wreckfest.
4. Shortcut behaviour for the AI.

A yard with no traffic in it is the cheap place to be wrong about all four.

## What each one costs

### Ramps are a vehicle-model change, not a prop (measured 2026-09-21)

The car cannot leave the ground, and this is not a tuning value:

- The physics world is created with zero gravity — `new RAPIER.World({ x: 0, y:
  0, z: 0 })` (`sim.ts:630`).
- The car body's vertical translation is disabled outright:
  `setEnabledTranslations(true, false, true, true)` (`sim.ts:611`).
- Its rotations are locked to yaw: `setEnabledRotations(false, true, false,
  true)` (`sim.ts:612`), so it cannot pitch or roll either.
- Height comes from the surface, not from physics: wherever the body is put, it
  is put at the road or ground height plus `START_Y` (`sim.ts:975`, `1310`,
  `1338`).

This is the four-tyre planar model working exactly as CLAUDE.md describes it.
The consequence is that a ramp today is a shape the car drives up the face of
and then continues along at surface height; there is no airborne state to land
from, no pitch to land wrong on, and no rotation to reward.

So a jump means unlocking vertical translation and pitch/roll, giving the world
a gravity that currently does nothing, and deciding what the tyre model does
with no load on it — which is Phase 1 handling work under GDD §22, not scenery.
It is the largest of the four by a distance, and the one most worth proving in a
yard where a bad landing costs nothing.

The collider vocabulary is closer to ready than the vehicle is: walls already
carry a pitch (`roadRotation(wall.rotation, wall.pitch)`, `sim.ts:636`) while
solids pass zero for it (`sim.ts:658`), so a pitched box exists. Anything built
that way inherits the rotation-sign trap in CLAUDE.md.

### The light poles are drive-through today (measured 2026-09-21)

`ALDER_LAMP_POSES` and `ALDER_SEAWALL_LAMP_POSES` are consumed in one place —
`src/render/alder.ts:301` — and in tests. Nothing in `sim.ts` builds a collider
for them; the physics world holds the car body (`613`), walls (`633`), building
solids (`655`) and vehicle specs (`675`). The bins are the same. So every one of
the 1,335 lamps (`design/LOOK.md`) is currently a ghost you drive through.

"Collision physics for light poles" is therefore two changes stacked, and the
first has the teeth:

1. **Give them a collider at all.** That puts a hard object at every kerb on a
   map where the rival deliberately rests half-way into the inner lane going its
   way (`RIVAL_LANE`) and traffic runs lanes that have never had to miss
   anything. Inference, not measured: the rival's line and the traffic lanes are
   the things most likely to break, not the player.
2. **Then make it break.** A breakable needs a state per lamp that the sim owns,
   and that state is part of the run (below).

The one municipal lamp rule in `design/LOOK.md` pays off here: they are all the
same fixture, so one broken model and one break behaviour covers the map.

### Debris is sim state, not an effect

Law 2 says (start state + input log) reproduces the run. Persistent debris is
therefore bodies in the Rapier world, stepped at fixed DT inside the sim tick —
not particles the renderer owns, and not `Math.random`. `src/render/smoke.ts` is
dressing and may stay dressing; a wheel-sized lump of lamp post that a car can
hit is not.

So the cost is body count, not appearance, and *persistence* is the expensive
half: debris that stays is debris that keeps being stepped, keeps being in
broadphase, and keeps having to be in the recording. The timed despawn that
FlatOut and Wreckfest use for feel is, here, also what keeps the tick
affordable. Inference: a per-piece lifetime, sim-owned and deterministic, is the
first thing to build rather than the polish added later.

It also lands in every recording's identity. See the boundaries below.

### Wreckfest chaos forks on traffic

Traffic is kinematic by law — "a solid hazard nothing can push, never a second
handling model" (CLAUDE.md, `traffic.ts`). A kinematic body cannot be crumpled,
shoved or spun, so the chaos has two possible shapes:

- **Props, player and rival only.** Traffic stays what it is: something you
  avoid, which is the current design and costs nothing new.
- **Traffic goes dynamic**, at least near the player. That is a
  `TRAFFIC_REVISION` bump, it invalidates sessions recorded in traffic, and it
  is a second handling model arriving through the back door unless it is
  explicitly one model with two drivers.

The yard has no traffic in it, so building the venue does not decide this. Worth
keeping it that way until the first shape has been played.

### An AI shortcut has to pay what the player pays

The existing rules make this honest by force, which is what makes it the most
interesting of the four:

- No rubber-banding, no catch-up, no grip change for AI, learned or not
  (CLAUDE.md).
- Since physics revision v6, grass and bare ground past the pavement cost a 2WD
  car grip and pace, AWD exempt, wherever the world reports ground
  (`RoadWorld.ground`, `alderGround`).

So a rival that takes a dirt cut loses traction for it exactly as the player
would, and whether the cut was worth taking becomes a real question instead of a
scripted advantage. That is a race worth watching rather than a difficulty
lever.

Where it would live: `pnpm alder:critique --try=x1,z1,x2,z2[,w]` already prices
a proposed alley against route choice, and pricing a cut is the same shape of
question. What does not exist is any representation of a rival leaving its
route: routes are centreline, resampled about every 29 m, and CLAUDE.md's corner
trap ("measure anything about a corner against the straight run to the next
corner") is written for a car that stays on them.

## Three boundaries this touches

- **GDD §21 puts vehicle damage simulation outside the current slice.** Breaking
  lamp posts and leaving debris is not the same as modelling damage to the car,
  but it is adjacent enough that taking it up is a scope decision, not a
  refactor. Say so out loud rather than quietly picking, per CLAUDE.md.
- **Colliders change what the world contains.** Adding them is a world-identity
  change (`ALDER_VERSION`, and `PHYSICS_VERSION` if the vehicle model moves for
  ramps), which refuses existing lap recordings and invalidates pending career
  courses. Every Blacklist car is tuned as of 2026-09-19, so the re-record is
  affordable — but it wants to happen once, with the colliders, rather than be
  dribbled across a dozen commits that each refuse the recordings again.
- **The world id is hand-maintained, and paving is not in it** (measured
  2026-09-21). `ALDER_DATA.version` (`alder.ts:39`) is a chain of per-system
  tokens someone types — `-evergreens-v1-broadcast-v2-drift-yard-v2-arena-v1-`
  and so on — with computed fingerprints only for frontages, parking, grounds
  and the authored layout. So a system with a token is versioned exactly as
  often as its author remembers, and `PAVED_AREAS` (`alder.ts:258`), which
  decides what ground drives as asphalt, has no token at all. Re-surfacing the
  yard therefore changes grip under existing recordings without refusing them:
  a silent divergence rather than a refusal. No recording crosses that ground
  today, which is the only reason it is safe; anything that re-surfaces it
  should bump the yard's token by hand in the same commit.
