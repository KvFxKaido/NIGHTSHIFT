# Four-wheel handling prototype

**Current world: Port Alder.** The map/garage migration did not change
the handling tune. Blackglass course mentions and reference-lap
measurements below describe retained regression fixtures, not the demo's
playable map. See [PORT_ALDER.md](PORT_ALDER.md) for current world behavior.

Physics revision: `four-wheel-v6` (replaces `four-wheel-v5`). Rapier: **0.19.3**,
pinned in the manifest and lockfile. v6 adds a cost for leaving the paved road
(below): on grass and bare ground a 2WD car loses some grip and pace; AWD pays
nothing. On the road, and on any world without ground, every v5 number stands.

v5: RWD's throttle-induced rotation now tapers
at highway speeds, and FWD/RWD receive a high-speed longitudinal traction assist
to approach the same 140 mph governor as AWD. AWD motion is unchanged. Manual
countersteering retains v3's response rates and steering limits. RWD anticipates
recovery to limit opposite overshoot and softens resisting front scrub near full
manual counter-lock; automatic steering remains off.

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

## The launch (2026-09-16)

Shawn asked for MC3's start boost. Hold the handbrake **and** the gas through a
race countdown to charge it (`LAUNCH` in `src/sim/launch.ts`), let the handbrake
go as the flag drops, and the first 1.6 s carry extra traction. Drag races are
untouched: they launch through the gearbox's rev window (`transmission.ts`),
whose words — CLEAN, BOGGED, WHEELSPIN — this borrows so the two read alike.

- **It buys traction, not torque.** The first version multiplied engine drive and
  did *nothing*: off the line the tyres are already at their limit, so the extra
  force was clamped away (measured, to the metre). It now rides `driveGripScale`,
  the same powered-axis scale the 2WD assist uses, so the longitudinal envelope
  grows and steering authority does not.
- **What it is worth.** Tuned to about two car lengths: a perfect launch gains
  **+5.3 m at 3 s and +8.9 m at 5 s** over a standing start (Sound to Sky's grid,
  RWD, `boost: .35`). Releasing 0.15 s late still pays in full; by 0.5 s there is
  nothing left. It never raises the governed top speed — it is a launch.
- **Botching it costs.** Under half charge bogs; still on the handbrake 0.75 s
  after the flag spins the tyres. Either way drive falls to 0.85 for 75 ticks,
  lighter than the strip's 0.65 because sitting on the handbrake has already cost
  23 m by five seconds on its own. A bog lands about a car length behind a plain
  start; a spin, seven. Never touching the handbrake is a plain start and costs
  nothing, so the mechanic is opt-in and the penalty is only for trying badly.
- **Rivals launch too**, by Blacklist rank (`BLACKLIST_LAUNCH`, 0.5 at #10 rising
  to 1.0 at #1). Rank is how well they hook up, not how late they react: a rival
  charges for its share of the countdown and lets the handbrake go **at** the flag.
  An authored rival uses `RIVAL_LAUNCH_SKILL` (0.6). Measured on `gen-moth-12` at
  three seconds: 58.3 m not launching, 61.3 m at Moth's rank, 62.0 m at Tally's.
  So launching is worth about 3 m to a rival and rank is worth 0.7 m of that: it
  closes the free gap the player would otherwise take at every start, and it is
  not a difficulty lever. Their pace is (`RIVAL_CORNERING`, `design/PORT_ALDER.md`).
  - Rank first graded *reaction* instead, holding the handbrake up to half a
    second past the flag. That gave a wide spread (41.9 m at skill 0 to 62.0 m at
    1) and two bad things with it: a rival visibly parked at the lights, and a
    start-timing shift that walked `tests/race-start.test.ts` into a crash it used
    to miss: at 122 mph on Queen Anne Climb the rival hit a car and slid 32 m off
    the road. That crash is a rival weakness of its own, not a launch bug: the stray
    was 16.4 m at skill 0, 6.9 m at 0.2 and 32.0 m at 0.6, so which timing hits is
    chance. Charging never disturbs it, and the invariant holds at 7.6 m.
    *Corrected 2026-09-16:* this note first called it a rear-end and blamed the
    braking plan for traffic. It was an oncoming sedan — the trace closed at about
    69 m/s while the rival did 54, which only a car coming the other way can — met
    while the rival ran wide on a fast bend, and the sedan was hidden until 54 m by
    the rival comparing raw heights on the climb (`design/PORT_ALDER.md`, "Traffic
    on a grade").
- **No physics revision.** Throttle is ignored during a countdown, so a player
  holding only the gas — which is every lap recorded before today, checked —
  charges nothing and drives exactly as they did. Rival behaviour did change, so
  `RIVAL_REVISION` went to `full-line-v11`: the one raced session that still
  replayed is now refused by name instead of quietly diverging, and the solo
  recordings still replay exactly.

## Deliberate sim-cade assists

- **Combined grip:** lateral force gets priority on FWD/AWD. RWD reserves part
  of the rear budget for propulsion, allowing throttle rotation in slower bends.
  That reservation falls smoothly from 85% to 45% between 22 and 40 m/s
  (49–89 mph), preserving more rear lateral authority at highway speed. The
  previous fixed 85% reservation could turn a brief 95 mph correction into a
  spin after the stick was released. As body slip develops from 2 to 8 degrees,
  the reservation also eases toward 25%, preserving rear cornering support while
  throttle uses the remaining drive capacity. This is intentionally forgiving:
  adding gas during a controlled slide should help the exit, not keep amplifying
  rotation. It changes tyre forces, never chassis yaw.
  The 2WD propulsion assist extends the longitudinal axis of the force envelope;
  steering still consumes acceleration capacity. Braking retains the original
  circular budget and lateral priority. This is arcade traction allocation,
  not simulated wheel lockup.
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
  angle plus the normal steering allowance, capped at 0.34 rad in all layouts.
  RWD's extra range tapers using
  a 0.25-second yaw-only estimate of remaining body slip, so a successful catch
  does not retain large opposite lock until the slide has already crossed zero.
  This avoids unlocking full lock for a tiny highway slide.
  If explicit RWD countersteer reaches the last 20% of available lock and a front
  tyre still scrubs toward the slide, its opposing lateral force softens toward
  10% of the ordinary request. This lets the rear tyres straighten the chassis
  when the bounded front angle cannot point far enough into travel. The assist
  fades in with lock, stops when front slip reverses or the input centres, and
  never increases the tyre force envelope or directly changes yaw/velocity.
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
- **Drive:** FWD (100% front) is the simulation default and what the regression
  fixtures measure; in the game the body decides, and no car currently selects
  it — the Cinder is RWD and the Bulwark AWD. AWD uses 45% front / 55% rear;
  RWD uses 100% rear. Under forward throttle without service braking, powered
  FWD/RWD tyres gradually gain longitudinal capacity from 25 to 55 m/s
  (56–123 mph), up to 1.8 times their ordinary longitudinal limit. Lateral grip,
  low-speed launch, brakes, reverse and coasting retain their shared parameters.
  This deliberately arcade assist prevents two driven tyres becoming a permanent
  lower speed cap: measured level-ground limits change from about 111 mph FWD
  and 117 mph RWD to about 140 mph for both. AWD remains at 140 mph and retains
  its launch advantage. Engine output, drag and the governor are unchanged.
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

- **Ground (v6, 2026-09-13):** past the carriageway and its 2.8 m pavement, on
  grass and bare ground, each tyre on it has **85%** of its grip
  (`groundGripScale`), and the car is governed at **85%** of top speed
  (`groundTopSpeedScale`, about 119 mph) with **0.6 m/s²** of extra rolling drag
  (`groundRollingResistance`). The governor and drag scale with the share of
  tyres on ground, sampled at each tyre patch, so two wheels over the verge is
  half the pace cost and a lopsided grip. The drag is not compensated by the
  governor, so it costs acceleration too, and it fades out below 2 m/s so a car
  at rest cannot chatter. **AWD pays none of it**; it still reports
  `groundContact`. Car parts that change this come later. The point is GDD
  §6.3's "no wrong ways, just slower ways": a cut across an empty lot now costs
  something, where before it cost nothing and neither the race generator nor
  the rival could see it. The world decides where ground is
  (`RoadWorld.ground`); Port Alder's (`alderGround`) is past every street's
  paving, not just the nearest centreline's, and treats the drift yard, its
  driveway and the garage forecourt as paved. Blackglass and the legacy district
  have no ground and are unchanged.
  Measured on an unlimited flat world, full throttle from rest:

  | | Top speed, road → ground | 0–60 mph, road → ground | Peak lateral, half-lock corner |
  |---|---|---|---|
  | FWD | 140.0 → 119.0 mph | 4.35 → 5.88 s | 14.12 → 12.25 m/s² |
  | RWD | 140.0 → 119.0 mph | 3.85 → 5.20 s | 14.18 → 12.06 m/s² |
  | AWD | 140.0 → 140.0 mph | 2.05 → 2.05 s | 13.30 → 13.30 m/s² |

  The corner is 6 s at full steer and 35% throttle from 22 m/s. These are
  starting values for a pad, not a finished tune: the 0–60 cost is mostly
  traction, since a 2WD launch is grip-limited and ground takes 15% of it. A
  first pass at 80% grip and 2 m/s² drag more than doubled 2WD 0–60 times
  (FWD 9.65 s), which was not the small cost asked for.

Tune in `HANDLING` in `src/sim/sim.ts`, not in the renderer. Start with brake
response/bias, front/rear cornering stiffness, steering assistance and handbrake
rear stiffness. Re-run the behavioral tests after changes. The prototype tune
is a starting point for controller feel, not a claim of realistic tire data.
`__ns.state().vehicle.wheels` exposes each tire's load, forces, slip, steering
angle, speed and grip utilization. Angles are radians; loads/forces are newtons
and speed is m/s. The existing telemetry toggle also shows front/rear and
left/right load shares, plus confirmation that auto-countersteer is off.

## Comparing layouts

There is no Handling comparison toggle in Pause any more. Since 2026-09-12 the
drivetrain is a property of the car, so driving AWD means choosing the Bulwark
and driving RWD means choosing the Cinder.

To compare layouts on one body, use `?drivetrain=awd` or `__ns.drivetrain('awd')`.
Both take the same fresh-run boundary the garage does: changing layout resets
position, speed and physics history, while ordinary Reset/Restart retains it, and
selecting the already-active layout does not restart. The live HUD names it.
Neither control persists — a developer override is not a preference, so a reload
returns the car to its own drivetrain.

Engine, ordinary steering, mass, brake and handbrake parameters remain shared.
RWD's manual recovery assistance also applies after lifting; ordinary coasting and
braking retain the common tyre model. RWD's powered rear allocation and FWD/RWD's
high-speed drive capacity are the other explicit arcade differences. This is not
a wheel-spin model.
Wheel telemetry reports lateral `gripLimit` and `longitudinalGripLimit`; debug
`gripUsed` measures utilization of their ellipse, rather than treating assisted
longitudinal force as excess lateral grip.

The v4 regression covers mirrored brief and sustained steering at 85, 95, 110
and 135 mph, settling after release with full throttle held, plus all three
layouts reaching the shared governor on a 60-second flat run. Both the spin and
lower-speed-cap assertions failed before their respective fixes. An additional
2,400-tick mixed-input comparison against the pre-fix AWD produced identical
vehicle motion and an identical final Rapier world snapshot.

The v5 lift-off regression seeds established 15–22 degree slides at 20 and
30 m/s independently of the power-on tune, applies half a second of full manual
countersteer, then centres the stick. It settles within two seconds while
retaining at least 70% of entry speed and stays below 5 degrees of opposite slip.
Disabling recovery assistance fails this test. A separate 24-case matrix uses
actual handbrake entries at 20/30 m/s, left/right slides and immediate/gradual
throttle application during countersteer. These exits regain at least 3 m/s
within two seconds without a spin and settle below 3 degrees of body slip.
Disabling slip-dependent rear grip protection fails that regression. This does
not guarantee recovery from a completed spin. Steering limits and both shipped
car bodies are unchanged.
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
- Ground (`tests/ground.test.ts`): FWD and RWD reach the ground governor over
  60 s and take at least 15% longer to 60 mph; a tyre on ground carries
  `groundGripScale` of its grip; two tyres over an edge read half contact; AWD
  drives identically on ground and road through 1,200 ticks of mixed input with
  the handbrake; a world reporting no ground matches a world with none; the cost
  replays tick for tick. On Port Alder, centrelines and pavement are never
  ground, open verges past the pavement are, Sable's yard line and the garage
  entrance are paved, and the rival and Moth's cruise routes never touch
  ground. Every-street selection is pinned by 8 junction points where a wide
  street's asphalt is nearer a narrow street's centreline; with nearest-
  centreline selection that assertion fails (checked 2026-09-13).
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
