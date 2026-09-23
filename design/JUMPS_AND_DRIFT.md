# Jumps, drift and the body

Proposals, undecided. Written 2026-09-23 from a brainstorm about suspension physics, after Shawn said he was
"thinking about jumps and drifting". He liked the first two of the three tiers below; nothing here is built. The GDD
already wants jumps ("a loading dock becomes a jump", §2; "the industrial zone favors shortcuts, jumps", §6.1;
"Airborne" among the driving states, §8.3) and names wheel lift and suspension as possible next refinements (§8.2).

## What the car does now

Facts, from `sim.ts` and `design/HANDLING.md`:

- A planar four-tyre model riding the authored road height. No suspension, no wheel lift, no air: the chassis cannot
  leave the ground.
- Weight transfer is modelled and deliberately mild: `centerOfMassHeight` 0.12 m, so 1 g of cornering moves about 6.5%
  of the load to the outside tyres and 1 g of braking about 4% forward (a real car's centre of mass is nearer 0.5 m, so
  about 27% sideways). It follows a first-order lag (`loadResponse` 4, a 0.25 s time constant, no overshoot), bounded to
  a 30/70 split. Tyre grip grows with load to the power 0.92, so moving load never adds grip, only costs it.
- The body's pitch and roll follow the ground and are drawn only (`VehicleState.pitch`, `.roll`).
- Kerbs: since 2026-09-23 (`design/ROAD_EDGES.md`) climbing the raised sidewalk costs about 0.45 m/s, the same for
  every car. There are no curb walls.

## Three tiers

1. **The body, drawn** (liked). Dive under braking, squat on launch, lean through corners and slides, by the renderer
   alone: law 1, nothing the car drives on changes, no revision moves. Drive it from the car's own accelerations
   (`longitudinalAcceleration`, `lateralAcceleration`, yaw) with a visual gain of its own, not from the load split:
   at 0.12 m the sim's transfer is too small to see. MC3's cars looked heavy and lively on what drove like rails, and a
   car that visibly takes a set before an apex reads as more physical at the same numbers. Checkable on the pad in
   minutes; `?look=` style preview first.
2. **Crests and dips** (liked). The load on the tyres follows the road's vertical curve: over a crest `g - v² κ`, lighter
   and less grip, in a dip heavier. One term from the road's heights, no new moving part. Where the load reaches zero the
   car leaves the ground: that is a jump (below). Moves every run over a hill, so `PHYSICS_VERSION`.
3. **Springs and dampers.** Per-wheel suspension, anti-roll bars, a car that pendulums through an S-bend and rotates on
   a lift. It replaces the model Phase 1 settled, moves every tuned number (the tyres head `design/COUPLINGS.md`), and
   the rival's steering feedforward (`steadyWheelAngleFor`) assumes a steady car, where its tracking at speed is already
   the limit (`RIVAL_CORNERING`'s note, 2026-09-23). Not proposed.

## Jumps

**The map has almost none.** A census of all 319 streets (2026-09-23): the speed at which each street's sharpest crest,
read over 12 m either side, would leave the ground (`v² κ = g`):

| Street | Take-off | Where |
|---|---|---|
| Highland Drive | 114 mph | (-711, -1930), 148 m along |
| 23rd Avenue | 158 mph | (740, -2670) |
| S Jackson St | 161 mph | (333, -68) |
| everything else | over 190 mph | |

None under 100 mph; only the Vesper's governor (165) reaches the second. So tier 2 gives lightness over the hills and
one natural jump. Jumps worth building are authored, as MC3's were: a ramp, a loading dock, a crest shaped for it. The
GDD puts them in the industrial zone (SoDo), and the new areas north and east are where the map grows. That is content,
and a scope call.

What the car needs for one:

- An airborne state: vertical velocity under gravity, no tyre forces while off the ground (no steering, drive or
  braking), yaw carried through.
- A landing: the road met again, visible compression (tier 1), and a brief dip in grip if it lands hard or crossed up.
- The rival reading crests: its speed plan has no idea they exist, and would launch into a corner at the bottom. The
  planner already reads the route ahead; a crest is a speed limit like a corner's.
- Traffic is kinematic on its lanes and unaffected; a racer landing on one is a collision like any other.
- Deterministic as everything else (fixed tick, no clock). A `PHYSICS_VERSION` bump; the golden master moves wherever a
  run crosses a crest.

## Drift

- **Tier 1 is most of it.** A slide looks like a slide because the body leans on its outside tyres. Driven from lateral
  acceleration and yaw with its own gain, the lean shows in the drift yard and on every street at no handling cost.
- **The flick.** Drifts are started today with the handbrake or the throttle (RWD). Starting one with a weight flick needs
  real transfer, and 0.12 m has almost none. A per-car centre-of-mass height in `CAR_TUNES` would make it a car's
  character, not the model's: a taller NS-01 is a flickier NS-01, the Cinder stays the anchor at 0.12, and its card's
  slide columns (`slideSeconds`, `slideAngle`) measure what it changed. A pad question first, a tune second. GDD §7.5
  already allows drift its own assists.
- **The shoulders.** Since 2026-09-23 every carriageway has 5.6 m of asphalt shoulder each side: room to hold a slide on
  a street without meeting a kerb.

## Order, if built

1. Tier 1, the drawn body. No sim change; judge it at the pad.
2. Tier 2 without air: lightness over crests, and see whether the hills earn more.
3. Authored jumps and the airborne state, with the rival reading crests, if and where the map wants them.
4. A per-car centre of mass, if drift needs the flick after tier 1.
