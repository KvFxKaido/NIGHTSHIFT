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

## Two boundaries this touches

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
