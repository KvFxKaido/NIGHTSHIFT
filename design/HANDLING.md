# Four-wheel handling prototype

**Current world: Seattle.** The map/garage migration did not change
`HANDLING` or `four-wheel-v3`. Blackglass course mentions and reference-lap
measurements below describe retained regression fixtures, not the demo's
playable map. See [SEATTLE.md](SEATTLE.md) for current world behavior.

Physics revision: `four-wheel-v3` (replaces `four-wheel-v2`). Rapier: **0.19.3**, pinned in the manifest and
lockfile. Manual countersteering is quicker and less restricted; automatic
countersteering remains off. Inputs, drivetrain comparisons, tyre/engine/brake
tuning, track, car customization and camera remain the same.

## What drives the car

At each fixed 1/60-second tick, read the rigid body's actual point velocity at
each of four tire positions, including velocity from chassis yaw. Transform it
into that tire's wheel frame, measure slip angle, and calculate an opposing
lateral force. Calculate its own engine/brake budget in that same frame. Apply
all four forces at their actual longitudinal and lateral chassis offsets;
Rapier integrates translation, yaw and barrier contacts.
Only vertical position follows the existing authored road constraint. The step
does not set linear or angular velocity or reposition the chassis horizontally.

This replaces the old prescribed yaw, lateral-slip target and corner-entry
rotation assist. Contact response survives into the following tick's tire
calculation; steering away supplies forces instead of requesting a new slide.
Fresh tire forces replace the previous tick's forces, since Rapier retains
user forces until cleared. See the [Rapier force guide](https://rapier.rs/docs/user_guides/javascript/rigid_body_forces_and_impulses/).

## Deliberate sim-cade assists

- **Combined grip:** lateral force gets priority, then acceleration/braking uses
  the remainder of each tire's circular force budget. This is ABS/traction-style
  allocation, not simulated wheel lockup. More turning costs braking distance.
- **Steering:** speed-sensitive center steering angle keeps full stick useful
  at speed; Ackermann geometry gives the inside front tire more steering than
  the outside tire around a common turn center. It never writes chassis yaw.
  The renderer draws each actual tire angle and its independent rolling distance.
  Ordinary turn-in retains its 5.5 input-units/s response. Unwinding/releasing
  uses 14 units/s. Explicit countersteering uses 24 units/s: from full opposite
  lock it crosses centre in **50 ms**, versus **183 ms** in v2, and reaches the
  requested full input in **83 ms**, versus **367 ms**. These are fixed-tick
  simulation timings, not end-to-end controller/display latency.
  Extra range requires forward travel above 3 m/s and a stick request in the
  direction of both body and front-axle sideways travel. It blends in over
  2–10 degrees of body slip, with the available lock capped by front-axle travel
  angle plus the normal steering allowance, and always by the existing 0.34 rad
  physical limit. This avoids unlocking full lock for a tiny highway slide.
  Half stick requests half the available angle. Steering into a slide is not
  suppressed; no angle is added independently of the stick. Centred input
  always targets centred wheels, even if the chassis continues sliding.
- **Load transfer:** mild, bounded front/rear and left/right load splits respond
  to last tick's longitudinal/lateral tire acceleration, not collision impulses.
  Four tire loads sum to the same total vehicle weight. A 0.92 load exponent
  gives a loaded tire more absolute grip but less grip per unit load, so weight
  transfer cannot manufacture extra total grip. This is not suspension.
- **Low speed:** regularized slip angles and effective-mass force caps prevent
  one-tick stop/reversal jitter without snapping velocity to zero.
- **Drive:** FWD (100% front) is the default and current feel reference. AWD
  (45% front / 55% rear) and RWD (0% front) retain their existing tunes; the
  default change does not rebalance power or tyres. Layout changes only propulsion
  distribution. The configured governor remains approximately 140 mph, but the
  driven tyres' available traction also limits acceleration and attainable speed.
  The historical 140 mph measurement is for AWD, not a guarantee for FWD/RWD.
  The governor limits propulsion, not impact/downhill velocity. Each axle shares
  equal drive torque between its tires, traction-limited by the weaker side
  (open-differential/traction-control approximation). Without that coupling,
  outside-wheel grip would inadvertently produce power-on torque vectoring and
  extra rotation. Braking is still limited independently at each wheel.
- **Brakes:** analog progressive response; full service brake defeats throttle.
  The existing shared brake/reverse input selects reverse only near rest, never
  simply because a fast spin briefly points the car backward.
- **Handbrake:** drive cut, rear braking and reduced rear cornering stiffness/
  grip. Extra rotation costs speed. There is no automatic recovery steering:
  the previous assist could steer left while the driver held full right.
  The player has to release the handbrake, countersteer and unwind. The new
  manual range helps catch an earlier slide, but weak/late countersteer or long
  highway holds can still overwhelm it. No yaw/velocity correction was added.

Tune in `HANDLING` in `src/sim/sim.ts`, not in the renderer. Start with brake
response/bias, front/rear cornering stiffness, steering assistance and handbrake
rear stiffness. Re-run the behavioral tests after changes. The prototype tune
is a starting point for controller feel, not a claim of realistic tire data.
`__ns.state().vehicle.wheels` exposes each tire's load, forces, slip, steering
angle, speed and grip utilization. Angles are radians; loads/forces are newtons
and speed is m/s. The existing telemetry toggle also shows front/rear and
left/right load shares, plus confirmation that auto-countersteer is off.

## Comparing layouts

Start with the default FWD, or your saved layout. Then press Esc / Options,
select AWD or RWD under **Handling comparison**, and Resume.
Changing layout resets position, speed and physics history. Selecting the already-active layout does not restart.
Ordinary Reset/Restart retains the selected layout. The live HUD names it.
Your explicit layout selection saves locally and is restored next launch. This
is still a prototype comparison, not a garage purchase or upgrade. URL overrides
are temporary previews and do not overwrite your saved preference.

All other parameters are identical: engine, steering, tyres, mass, brakes and
handbrake. With no propulsion (including while handbraking), the three layouts
produce identical vehicle states. Lateral-priority grip allocation still limits
power-induced oversteer; RWD is not yet a full throttle-drift model.
Debug entry points: `__ns.drivetrain('rwd')`, `__ns.state().drivetrain`, or
`?scene=track&drivetrain=rwd&drive=W120&freeze=1`. Unknown layouts are rejected.

## Executed acceptance gates

`pnpm test` includes:

- Actual travel path tightens during normal braking; full pedal keeps steering
  and rear stability. Throttle/brake strength remains progressive.
- A 9 m/s lateral shove persists on the first tick and settles under bounded
  tire forces. Full gas/full steering does not manufacture a runaway slide.
- Per-tire force stays inside the grip budget; passive tires dissipate kinetic
  energy even with initial lateral velocity/yaw and near-zero forward speed.
- Handbrake has distinct rotation and speed cost. A half-second pull at 30 m/s
  with 70% steering, followed by half-second half-lock countersteer and unwind,
  peaks at **7.44 degrees** and recovers while still moving at **19.71 m/s**.
  Both turn directions and all three layouts pass this short-pull case.
  Steering ownership and per-tyre force budgets are checked through 0.25–1.5 s
  holds at 15, 30, 45 and 60 m/s, including release and gas reapplication.
  Neutral stick centres the wheels even if the chassis is still sliding.
- At 30 m/s, a **0.75 s full-lock pull + 0.5 s full countersteer + unwind** peaks
  at **19.37 degrees**, falls to **1.61 degrees** one second after release and
  retains **17.47 m/s** after two seconds. Identical v2 inputs peaked at
  **51.27 degrees**, with **41.51 degrees** remaining at one second and only
  **4.54 m/s** at two seconds. A **1 s pull with full countersteer** now peaks
  at **29.78 degrees** and settles while retaining **11.25 m/s** after two
  seconds (v2: **57.67 degrees / 1.45 m/s**). Both directions and every layout
  pass; tests still forbid automatic wheel steering once the stick is released.
- A half-second 70%-steer pull at **45 m/s**, followed by half a second of full
  countersteer and unwind, stays below 12 degrees peak slip and recovers above
  25 m/s. This does not certify long high-speed holds or every correction timing.
- **Known limitation, not a passing recovery claim:** the one-second full-lock
  pull at 30 m/s with only **half** countersteer still reaches **59.38 degrees**
  peak slip and slows to **1.21 m/s** after two seconds of recovery. Prolonged
  highway holds can still spin or overshoot during recovery. The original
  automatic-catch guarantee stays retired; diagnostics continue to report the
  weak-correction case rather than passing it under the full-countersteer test.
- Real side-wall and angled front-quarter contact/escape on both sides at rest, 12 and 30 m/s;
  head-on impact followed by reverse escape. No test-only recovery forces.
- A paced full Blackglass lap with the FWD default: **70.50 s**, **24 m** elevation
  change, **zero barrier contacts**. The historical AWD result was 66.67 s. The
  throttle-pinned driver still fails; the reference driver's tune is unchanged.
- Flat 100 km/h near-stop: **27.78 m / 2.02 s**, before automatic reverse.
- Historical AWD level-ground full throttle reaches **140 mph** in approximately
  **8.93 s**; this fixture now names AWD explicitly so a default change cannot
  silently change which car is being measured.
- A **1,200-tick** run replays identically after reset for every layout,
  including every state field and the final Rapier world snapshot. Original
  runs contain **153 AWD / 678 FWD / 486 RWD contact ticks**.
- Drive-routing tests verify the actual axle forces, layout isolation and
  reset identity; off-throttle/brake/handbrake states match across layouts.
- Four distinct Rapier force application points generate the measured chassis
  torque. Pure yaw produces different left/right rolling speeds and braking
  forces. Mirrored maneuvers swap tire loads/slip without a left/right bias.
- Wheel load conservation, load sensitivity and paired drive balance are tested;
  renderer mapping tests check named pivots, independent rolling/steering,
  simulation immutability and the existing wheel/body clearance envelope.

During the earlier bicycle migration, tests for the artificial peak-steering notch and corner-entry rotation load
were replaced with actual path, force, energy and axle-load tests. The reference
driver's steering gain changed for the new input-to-wheel-angle mapping; its
pace target, road margin and 90-second lap requirement were not relaxed.

## Boundaries

This is a planar four-wheel model: four independent virtual tire force patches,
not a full suspension simulation. There is no individual wheel inertia, spin/
lockup, suspension raycast, wheel lift, per-wheel terrain contact detection or
kerb response. Each patch is assumed supported by the existing authored road
height/pitch constraint. The independent rolling animation is free rolling, not
a claim of wheel-spin dynamics. Visual stance does not change handling or
collision geometry. `frontAxle`/`rearAxle` telemetry is a derived summary of the
four tires; only per-wheel forces drive the chassis. Load/slip/force telemetry
describes the last force evaluation; wheel speeds use the resolved post-step body.

The player-facing replay and recorded-input ghost have been removed.
Deterministic scripted-input replay remains a developer regression test.
Ordinary reset preserves the chosen layout.
Reset recreates the same world and
collider insertion order, including contact solver history. The tests establish
same-version, same-runtime repeatability, **not universal cross-browser parity**;
JavaScript trigonometry in setup/forces is also part of that boundary. Future
persisted ghosts need physics version, build/tuning identity and an explicit
compatibility check. See [Rapier determinism requirements](https://rapier.rs/docs/user_guides/javascript/determinism/).

Automated gates establish behavior, not enjoyment. Controller feel still needs
a human lap, especially brake/steer overlap, release after a handbrake turn,
and steering away while accelerating from a scraped barrier.
