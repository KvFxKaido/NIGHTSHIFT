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
  *And torque, since 2026-09-19.* That held while every car had the shared power.
  A tune with less power (the Bulwark r2, the Kestrel r2) is limited off the line
  by its engine, not its tyres, so grip alone gave it **nothing**: +0.00 m, and a
  bog cost it almost nothing either. The Bulwark had been that way since its
  tune, unnoticed until the Kestrel's broke the rival launch test. The launch now
  scales the engine's push as well, so it buys whichever limits the car. A
  traction-limited car at full throttle is unchanged to the centimetre (Cinder
  +5.33 / +8.90 m, FWD +4.21 / +6.96, bogs likewise); the Bulwark and Kestrel now
  gain +5.97 m at 3 s and a bog costs them 3.95. Two things did move: the shared
  AWD, half engine-limited before, now gains +7.59 m at 3 s instead of +3.36 (the
  untuned AWD rivals, until their own tunes); and a boost taken on part throttle,
  or pushing against a wall after a burnout, now gets its 35% where it got none.
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
  Since the Kestrel's tune and the launch scaling torque (2026-09-19): **46.6 m
  not launching, 49.7 m at Moth's rank, 52.6 m at Tally's**. A full launch is
  worth 6.0 m to a rival in her car, as a perfect one is to the player, and rank
  2.9 m of it: a #1 rival starts like a perfect player launch, Moth half as well.
  The small spread before was her shared-AWD car barely benefiting at all.
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
- **Letting go early is a plain start** (2026-09-18, Shawn, as MC3 does it: it
  blocks a false start and gives a normal gas start). The charge is gone the
  moment the handbrake comes up before the flag and the HUD says TOO EARLY; no
  boost and no bog. It used to bleed away at twice the charging rate, so letting
  go a tenth of a second early kept most of the boost. A rival never lets go
  before the flag, so its launch is unchanged, and no recording held the
  handbrake at a start.

## The burnout (2026-09-18)

Shawn asked for MC3's: stopped, hold the e-brake and the gas, swing the car round
on the stick, and let the handbrake go for a start better than just gassing it.
It is the launch's hold anywhere a countdown is not running (`stepBurnout` in
`src/sim/launch.ts`), so one mechanic covers both, and the HUD shows it the way
MC3 does, on the boost bar: the right-hand meter fills with the charge and drains
through the boost (`launchMeter` in `src/ui/hud-state.ts`).

- **When.** Below 1.5 m/s (`LAUNCH.burnoutSpeed`), outside a countdown, with no
  boost or penalty still running, and only for the player: an AI car holding both
  at rest does what it always did, and a race start's WHEELSPIN cannot be held
  into a burnout. At speed, e-brake and gas is still a handbrake turn. Free roam
  and a stopped car mid-race both qualify; a finished race and a drag do not.
- **The swing is an assist, and says so.** The tyre model at rest has nothing to
  swing the car with, so the burnout holds the front axle where it is (a force
  cancelling its velocity over 0.05 s, at most 1.2 g, so contact still shoves the
  car) and turns the body toward `burnoutYawRate` with a yaw torque sized for
  the inertia about that axle. Forces, never a velocity written, and the tyres
  are still sampled, so their telemetry and the scrub the audio hears are what
  the swing does to them. Measured from Wharf Garage: full stick turns the car
  188 degrees in two seconds at up to 99 degrees a second, the front axle
  wandering 0.15 m; stick right turns it right. The rate is a guess at MC3's and
  is the number to tune on the pad.
- **What it is worth.** Letting the handbrake go on the gas launches with the
  hold's charge as the boost's quality, timed perfectly since there is no flag:
  a full charge (1.1 s, the same `chargeTicks`) is the race launch exactly. From
  Wharf Garage, RWD: **+5.1 m at 3 s and +7.9 m at 5 s** over a plain start,
  beside the race launch's +5.3 m and +8.9 m; AWD +3.4 m and FWD +4.0 m at 3 s.
  (The AWD figure predates 2026-09-19, when the launch began scaling torque too;
  the shared AWD's race launch went from +3.4 to +7.6 m, and its burnout launch was
  not measured again.)
  A short hold is a small launch, never a bog; letting the gas go first is only
  stopping. Released while still swinging, the car carries the yaw into the
  launch and slides; centred first, the swing stops in about a fifth of a
  second and the launch runs dead straight.
- **No physics revision.** The handbrake cuts the throttle everywhere outside a
  burnout, so nothing changes for any input a recording holds unless it holds
  both at rest; two sessions hold both for 11 and 2 ticks, all mid-lap at speed.
  `pnpm laps --verify` gave the same result before and after: the two sessions
  that replayed still replay exactly, the other eleven are refused by rival
  revision as before. Rivals are untouched, so no `RIVAL_REVISION` either.

## Cars (2026-09-19)

Each car drives its own tune of the one model (Shawn, 2026-09-19). A tune is a
few multipliers on `HANDLING` (`CAR_TUNES` in `src/sim/car-handling.ts`), resolved
by `carHandling` in `sim.ts`. Everything the model needs in order to behave —
countersteer rates, slip regularisation, tyre relaxation, the RWD stability
tapers, geometry — is shared and is not a knob. A car may be harder to catch,
never uncatchable with full countersteer: the recovery gates below are the floor
for every car, not a Cinder feature. Being caught — settling under 3 degrees with
the yaw stopped, still moving — is never per car. **How far a car swings on the way
there is** (Shawn, 2026-09-19, for the NS-01): a car that wants more than the
shared model's ceilings lists them in `CAR_PEAKS` (`tests/helpers/handling.ts`),
where review sees them, and they are ceilings, so an unintended change still fails.

- **Knobs.** Strength: `power` (drive below about 67 mph), `topEnd` (drive near
  the governor), `topSpeed`, `drag` (air resistance; 2026-09-19, "The ceiling"
  below), `traction` (the driven tyres' push alone; "Traction and the gearbox").
  Temperament: `grip`, `balance` (rear against front
  cornering stiffness; above 1 the car settles, below it rotates), `brakes`,
  `steering` (how fast the wheels follow the stick in; unwinding and catches stay
  shared), `handbrake`. Strength may climb gently up the Blacklist; temperament
  varies freely; the Vesper is the one planned outlier (`design/BLACKLIST.md`,
  "The 140 mph cap"). Upgrades, when they come, move strength and never
  temperament (GDD §3.4, §8.5).
- **Mass is contact.** Every force a car makes is an acceleration times its mass,
  and Rapier scales yaw inertia with it, so weight alone changes nothing about how
  a car drives. Measured: twenty seconds of mixed input with slides and the
  handbrake at 1,800 kg end within 3 mm and 0.002 degrees of 1,180 kg on every
  layout, and the card below is identical. In contact it is everything: coasting
  into a parked 1,180 kg car at 12 m/s, a 900 / 1,180 / 2,000 kg car shoves it to
  **4.87 / 5.63 / 7.09 m/s** and keeps **2.34 / 3.26 / 5.01 m/s** itself. The drag
  gearbox turns torque into acceleration against the shared mass for the same
  reason. Both are in `tests/car-handling.test.ts`.
- **The profile belongs to the car.** A rival definition names its car
  (`RivalDefinition.car`); `handlingFor` gives it that car's numbers and throws on
  a drivetrain that contradicts it. The rival plans corners, braking and throttle
  with its own car's numbers, the ones its tyres will have. When the player wins
  the car, it drives exactly as it did beating them.
- **The Cinder is the anchor.** Every recorded lap was driven in it, and
  `RIVAL_CORNERING` and the route-choice `PACE` were fitted to those laps. Tune
  other cars against it, never it.
- **Revisions.** A car's numbers change only with its `CarTune.revision`, pinned by
  fingerprint in `tests/car-handling.test.ts`, which prints the repin; a car a
  rival drives is also a `RIVAL_REVISION` bump. Lap sessions record `carRevision`,
  and replay rebuilds the car from `car` and `drivetrain` and refuses another
  revision. Sessions from before carry none and read as 1, which every car was.
  `PHYSICS_VERSION` stays the model's.
- **Changing car is a fresh run**, as changing drivetrain always was: the garage
  resets whenever the chosen car's handling is not the one being driven.
- **HUD and sound.** The tach and the engine note run to the car's own governor.
  Wind, the body's drawn lean and the camera stay on the shared 140 mph, so a
  faster car looks and sounds faster instead of rescaled.

**The plumbing changed nothing, checked three ways** before any car had a knob. A
golden master of 14 long runs — the player on each layout and after a reset,
Sound to Sky's rival, Ridge Circuit's racing line, Rivet's gearbox, Sable parked
in the yard, free roam with Moth, seven cruisers, parked rivals, traffic and a
burnout, and three flashed cruisers' races — hashed Rapier's world snapshot and
the sim state: 14 of 14 identical to the build before. `pnpm laps --verify` was
identical (2 of 13 replay exactly, the other 11 refused for the same reasons), and
the suite passed. The golden master was then made to fail on purpose: 1% less
grip on the Kestrel and 120 kg on the Latch changed exactly the runs those cars
drive in (Moth's three, Stray's two) and none of the others. It lives in the repo
as `pnpm golden` (`scripts/golden.ts`): `--save` on the tree before a change, then
`pnpm golden` after it names every run that moved and the cars in it.

### The ceiling (measured 2026-09-19, corrected the same day)

The governor limits the engine's push, never the car's speed: downhill a car runs
past it. It is also where the engine curve reaches its top-end value
(`engineAccelerationFor` blends toward `highSpeedAcceleration` until `topSpeed`),
so raising the governor alone stretches the curve and leaves less drive at every
speed above about 67 mph. On an unlimited flat world, full throttle, mph after
one minute (the card's figure), which is also where the car stays after three:

| Governor | stock | `topEnd` 1.2 | `topEnd` 1.4, `drag` 0.9 | `topEnd` 1.4, `drag` 0.85 | `topEnd` 2, `drag` 0.8 |
|---|---|---|---|---|---|
| 147 mph | 147 | 147 | 147 | 147 | 147 |
| 154 mph | 152 | 154 | 154 | 154 | 154 |
| 161 mph | 151 | 161 T | 161 | 161 | 161 |
| 168 mph | 150 | 161 T | 168 | 168 | 168 |
| 182 mph | 149 | 161 T | 170 T | 174 T | 180 T |

T: the tyres are at their limit, so traction, not power, is what stops the car.
That table is RWD, and AWD reads the same to the mph. FWD's unloaded front tyres
give out first: its wall is 146 mph at stock drag whatever the power, 154 at
`drag` 0.9, 158 at 0.85 and 163 at 0.8.

- **Stock power runs out at about 152 mph.** A governor up to about 150 is
  reached with no other knob; the 140 cap was trimming about 12 mph. Past that a
  higher governor on stock power makes a car slower (151, 150, 149) by stretching
  the curve.
- **The tyres are the wall at 161** (146 FWD). Drag rises with the square of speed,
  and there it equals the most drive the tyres can put down: `topEnd` 1.2 reaches
  it, and more power buys nothing.
- **`drag` moves the wall:** about 170 mph at 0.9, 174 at 0.85, 180 at 0.8. Above 1
  it lowers the ceiling with no governor at all: a brick at 1.2 tops out at 139 mph,
  at 1.4 at 127. It is air, so it also sets the coast (100 mph, five seconds off
  the gas: 52 mph at ×1, 56 at ×0.8, 48 at ×1.2) and helps a little in a stop from
  speed. The rival's braking plan reads its own car's drag.
- **Recipes.** To 150 mph: the governor. To 161: the governor and `topEnd` about
  1.2. Past 161: `drag` as well. The Vesper at 165 is `topSpeed` 1.18, `topEnd` 1.4
  and `drag` 0.85 (165.2 mph within a minute, as a `--try`; not a tune yet).
- **The correction.** This section first said stock drag held every layout at
  143 mph and put a stock ×0.9 drag at 151 and a ×1.2 brick at 130. Those runs
  took the governor out of the way with `topSpeed` 3, which stretched the curve
  as above, so they measured a weakened engine, not the stock one. The tyre wall
  and the `topEnd` 2 figures stand, because a car at its tyre limit does not care
  about the curve; the rest were measured again with the governors a tune would use.

Adding the knob moved nothing: no car sets it, the golden master's 14 runs stayed
bit-identical, and every car's card was unchanged. The revision pins now
fingerprint each car's tune rather than its resolved numbers, so a new knob leaves
them alone; all thirteen were repinned once for that change, at their revisions.

### Traction and the gearbox (2026-09-19)

Two gaps the Hammer found, since it is meant to be quick in a line and poor in a
bend, and its race is the drag strip.

- **A 2WD car is traction-bound to about 100 mph.** `power` and `topEnd` left a
  RWD car's 0–60 and 60–100 identical to the hundredth, and `grip` moves traction
  and cornering together, so "poor in corners" also made it slow in a line (60–100
  in 3.33 s at `grip` 0.93, the Cinder 2.97). The model already had a way to widen
  only the driven tyres' longitudinal grip, `driveGripScale`, which the 2WD assist
  and the launch ride; `traction` multiplies it. Fat rear tyres: the car puts its
  power down without cornering any better.
- **The gearbox ignored `power`.** On the drag strip the manual gearbox computes
  its own push from a shared torque curve, so every car pulled alike there except
  for traction: the Bulwark and Kestrel, with 30% less power, ran the quarter in
  11.80 s, a second clear of the Cinder's 12.95, on AWD traction alone. `power`
  now scales the gearbox as it scales the engine curve: they run 13.28; the Cinder
  (12.95) and the Latch (13.17), whose power is stock, are unchanged to the
  hundredth. Quarter miles are the player driven as `tests/drag.test.ts` drives it
  (staged at 0.52 throttle, upshifts at 7,550 rpm) against Rivet's AI.

Neither moves an untuned car: `traction` is absent everywhere, the gearbox is
multiplied by exactly 1, and `pnpm golden` stayed 14 of 14 bit-identical.

### The card

`pnpm cars` measures each car on an unlimited flat world (`src/sim/car-card.ts`;
`--try='{"power":0.7}'` measures a candidate beside the car without editing it):
0–60 and 60–100 mph at full throttle, speed after a minute, the stop from
100 km/h, peak lateral in the ground table's corner (6 s at full steer and 35%
throttle from 22 m/s), turn-in (seconds to 90% of peak yaw rate in the first
second of full steer from 22 m/s, coasting, so power oversteer cannot read as a
slow wheel), and peak body slip through a half-second handbrake pull at 30 m/s
with 70% steer, then half a second of half countersteer. It agrees with the
ground table above: peak lateral 14.12 / 14.18 / 13.30, 140 mph, 27.8 m. Its 0–60
reads one tick slower because it stops the clock at 60 mph (26.82 m/s) and the
table at 26.8. Measured, never authored: the garage reads `src/customization/car-stats.json`, regenerated by `pnpm cars:stats`, with fixed linear bars in `src/ui/car-stats.ts` (0–60: 8–2 s, top speed: 100–180 mph, lateral grip: 8–18 m/s²).

Before any tune, every car on its drivetrain's shared numbers:

| Layout | Cars | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| AWD | Bulwark, Kestrel, Breakwater, Meridian, Reign | 2.07 | 2.33 | 140.0 | 27.8 | 13.30 | 0.37 | 7.6° |
| RWD | Cinder, NS-01, Vesper, Wager, Hammer | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| FWD | Latch, Skim | 4.37 | 3.70 | 140.0 | 27.8 | 14.12 | 0.37 | 7.6° |

The drivetrain alone had made every AWD car the quickest, so the ladder ran
backwards by it: Moth's Kestrel (#10) out-accelerated every rear-drive car, and
Crest's Skim (#3) was the slowest car on the list. The Bulwark, which the player
buys, was the Cinder with a better launch, immunity on grass and 6% less
cornering: a better car, not a different one.

**AI laps.** The card cannot say whether a car is different or just better, so
the second instrument is the rival's own planner (`rivalInput`) driving the
player's car round Ridge Circuit's three layouts and Uptown Circuit (clear, no
traffic), three laps each, from the rival's grid slot: the same driver in each
car, lap times out (`pnpm cars <car>... --laps`, about 45 s a car). It is not a
pad lap: no launch, no handbrake, cornering at about 0.8 of the grip limit
(`RIVAL_CORNERING`), and it cannot use rear-drive rotation the way a person can.
Shawn's recorded Cinder laps on Uptown clear run 84–87 s against the AI's
97.7 s, so read these as one car against another, never as lap times. Best
flying lap, before any tune:

| Car | Ridge Full | Ridge East | Ridge Ridge | Uptown clear |
|---|---|---|---|---|
| Cinder (RWD) | 74.83 | 57.73 | 48.60 | 97.65 |
| Bulwark, Kestrel (AWD) | 71.75 | 54.87 | 46.13 | 89.90 |
| Latch (FWD) | 76.15 | 58.85 | 49.53 | 99.52 |

With the same driver every AWD car lapped **4–8% faster** than the Cinder
everywhere, and most on streets, which are a string of launches out of junctions.

**Street sprints in traffic** (`--streets`, Codex, 2026-09-19): the same planner
now drives each of six fixed generated sprints twice: traffic off for pace, then
city traffic on for incidents. The existing `gen-1`, `gen-7`, `gen-15`,
`gen-moth-12`, `gen-crest-23`, `gen-wake-42` draws cover eastern cross streets
and ridge, downtown, waterfront and Queen Anne, 2.5-4.8 km, chosen by geography
and length, never by which car wins. All are checked with `alderCourseDraws`.
The six are retained: clear pace orders the Kestrel's power correctly on every
sprint, without adding more routes. Clear seconds, with totals over only the sprints
every measured car finished; minus against the Cinder means quicker:

| Car | gen-1 | gen-7 | gen-15 | gen-moth-12 | gen-crest-23 | gen-wake-42 | Total s | vs Cinder |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 | 95.32 | 95.80 | 118.38 | 131.57 | 73.43 | 88.88 | 603.38 | 0.00% |
| Bulwark r2 | 95.40 | 96.05 | 119.47 | 129.50 | 72.42 | 90.48 | 603.32 | -0.01% |
| Kestrel r2 | 93.50 | 94.17 | 116.60 | 128.03 | 71.65 | 87.73 | 591.68 | -1.94% |
| Latch r2 | 96.15 | 96.13 | 118.90 | 131.65 | 73.80 | 89.40 | 606.03 | +0.44% |

Traffic incidents, each sprint showing **traffic minus clear seconds / reversing
recoveries**. Cost sums only paired finishes for that car; a DNF at 300 s after
the flag has no time cost, not an invented 300-second finish. All six paired here:

| Car | gen-1 | gen-7 | gen-15 | gen-moth-12 | gen-crest-23 | gen-wake-42 | DNFs | Recoveries | Cost s |
|---|---|---|---|---|---|---|---|---|---|
| Cinder r1 | 2.43 / 0 | 0.55 / 0 | 9.37 / 0 | 0.28 / 0 | 0.10 / 0 | 8.87 / 0 | 0 | 0 | 21.60 |
| Bulwark r2 | 1.88 / 0 | 19.90 / 1 | 0.92 / 0 | 2.85 / 0 | 0.68 / 0 | 1.18 / 0 | 0 | 1 | 27.42 |
| Kestrel r2 | 18.72 / 0 | 19.08 / 1 | 0.33 / 0 | 7.95 / 0 | 0.40 / 0 | 0.17 / 0 | 0 | 1 | 46.65 |
| Latch r2 | 1.00 / 0 | 0.63 / 0 | 0.42 / 0 | 0.55 / 0 | 0.12 / 0 | 0.88 / 0 | 0 | 0 | 3.60 |

The power check is **600.35 / 591.68 / 584.27 s** for Kestrel power
**0.65 / 0.70 / 0.75**: more power is quicker, including on each individual
clear sprint. This is useful for comparing tunes through street junctions with
the same driver, alongside the circuit laps; it is not a pad time or a promise
that any power change is monotonic for every car and route. Traffic costs explain
incidents, never pace or a percentage advantage; they can be negative when
traffic changes the driven line. Totals sum unrounded times. The player rig has
no rival teleport recovery (reset counters stay zero); reversing recoveries are
counted. No rival, no launch. `--json` includes both runs and their cost per
sprint, and `--streets` combines with `--laps` and `--try`. Two four-car runs
produced byte-identical text in 284.80 and 307.72 s (71.2 and 76.9 s per car
on average).

### The drift measure (2026-09-19)

`pnpm cars <car>... --drift` drives the actual 90-second Sable event in her
yard, traffic off and Sable parked, with the game's contact and chain scoring.
The script-only driver follows `YARD_LINE`, requests up to 26 degrees of slip
into a corner, flicks the handbrake when speed and angle permit, then catches
slip error with proportional countersteer and modulates throttle. On exit,
after 18 ticks above 0.18 radians of slip and with the next waypoint within
0.25 radians of straight ahead, it asks for the opposite side for 55 ticks,
with up to 45 ticks of handbrake (still released at the slip ceiling). A
120-tick cooldown lets it return to the line. This gives a willing car time
to swap before the game's 60 idle ticks bank its chain; it never reads or
changes the score to arrange a link. The same controller and constants drive
every car; no launch, teleport or per-car help. It combines with `--laps`,
`--streets`, `--try` and `--json`; text calls transitions `links`, JSON retains
`drift.transitions`.

| Car | Score / 3000 | Mean / best drift angle | Drifting share | Links / clips |
|---|---|---|---|---|
| Cinder r1 | 4929 | 17.12 / 28.67 degrees | 19.48% | 6 / 9 |
| NS-01 r2 | 6340 | 18.78 / 34.21 degrees | 23.07% | 9 / 9 |
| Wager r2 | 3768 | 16.07 / 27.41 degrees | 17.54% | 5 / 8 |
| Bulwark r2 | 301 | 12.99 / 15.69 degrees | 7.06% | 0 / 0 |
| Breakwater r2 | 368 | 12.91 / 15.13 degrees | 8.56% | 0 / 0 |

All twelve garage cars completed 5400 event ticks without spins, contacts or
leaving the bounds. Other cars' links / clips: Kestrel 4 / 10, Vesper 6 / 9,
Latch 0 / 0, Meridian 4 / 10, Skim 4 / 10, Reign 4 / 10, Hammer 10 / 9.
All five rear-drive cars link; Bulwark, Breakwater and Latch still earn no
clips. Angles use only scoring drift ticks; share excludes the countdown.
Spins and contacts count episodes, not consecutive ticks of one incident.

The NS-01 check scores **6287 loose** (`balance: 0.85, handbrake: 1.2`)
against **3730 planted** (`balance: 1.2, handbrake: 0.6`), **68.6% higher**,
with **9 versus 3 links**, nine clips each and no incidents. The balance
sweep (only `balance` overridden) is:

| Override | 0.8 | 0.9 | none (stock 0.85) | 1.1 | 1.2 |
|---|---|---|---|---|---|
| Score | 6405 | 6255 | 6340 | 5708 | 5615 |
| Links | 9 | 9 | 9 | 9 | 9 |
| Clips | 9 | 9 | 9 | 8 | 8 |

This is strictly decreasing in **actual balance order**: 0.8, stock 0.85,
0.9, 1.1, 1.2. It is not decreasing in the requested column order because
stock is already looser than 0.9; `--try` replaces a knob, not multiplies it.
Every candidate completed without incidents. Two executions of
`pnpm cars cinder ns01 wager bulwark breakwater --drift --json` produced
byte-identical output (SHA-256
`dc34bbc1fb42cd9f7d2ec6c03a13bf650ab755796be2101b10e1c10fb048f2fa`).

Timed around `measureDrift`, including world setup but excluding imports and
card measurements, with the full suite running concurrently. `pnpm test` passed
all 587 tests in 309.93 s; `pnpm build` passed with the existing large-chunk
warning:

| Car | Seconds | Car | Seconds |
|---|---|---|---|
| Cinder (first, cold) | 12.13 | Bulwark | 3.51 |
| NS-01 | 3.19 | Kestrel | 3.18 |
| Vesper | 3.48 | Latch | 3.42 |
| Breakwater | 3.12 | Wager | 3.05 |
| Meridian | 3.10 | Skim | 3.16 |
| Reign | 3.39 | Hammer | 3.30 |

The five-car ordering puts the NS-01 first and the planted AWD pair last.
The instrument now measures swaps as well as corner angle, but its fixed
flick duration and exit threshold reward compatibility with this driver.
Hammer scores **7231 with 10 links**, ahead of the NS-01 across the full garage;
this is not a universal ordering of drift potential. Zone order amplifies a
missed clip, and steering, grip and the driven line also affect scores. The
balance sweep holds here, not necessarily for every tune or route; pad driving
remains the check on expert potential.

### The Bulwark, revision 2 (2026-09-19)

The brief, Claude's proposal that Shawn took on 2026-09-19: keep the launch and
the immunity on grass, pay for them in top end, braking and a lazy rack; heavy
and planted.

```
bulwark: { drivetrain: "awd", revision: 2, mass: 1_700, power: 0.7, topEnd: 0.75, topSpeed: 0.9,
  grip: 0.95, balance: 1.1, brakes: 0.75, steering: 0.7 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Bulwark r1 | 1180 | 2.07 | 2.33 | 140.0 | 27.8 | 13.30 | 0.37 | 7.6° |
| **Bulwark r2** | 1700 | 2.87 | 4.03 | 126.0 | 31.2 | 12.16 | 0.42 | 5.8° |

AI laps, best flying: **76.70 / 59.02 / 49.47 / 96.15 s** against the Cinder's
74.83 / 57.73 / 48.60 / 97.65. So it is **1.5% quicker on Uptown's streets and
1.8–2.5% slower on all three circuit layouts**, and it still pays nothing on
grass, which the AI never uses: a city truck, not an upgrade.

- **The brief alone was not enough, so power went too.** Top end, top speed,
  brakes, steering, balance and grip together still left it faster than the
  Cinder on all four (Uptown 92.08 s, Full 74.55 s): a 0–60 twice as quick pays
  for everything on streets. `power` 0.8 still led by 4% on Uptown; 0.7 is the
  first value that reads as a trade; 0.6 lost everywhere. It keeps the best
  launch in the garage, a full second ahead of the Cinder, rather than a
  supercar's. Without the `grip` knob it was only 0.3–0.9% slower on the
  circuits, so the grip stays.
- **Where each knob shows.** Brakes at 0.85 barely registered (27.8 to 29.2 m):
  the Cinder's stop is grip-limited, and shared rolling resistance adds
  1.3 m/s², so a truck that stops visibly longer needs 0.75. With `topEnd` at
  0.6 the car never reached its 126 mph governor (it ran out at 120), making
  `topSpeed` a dead knob; 0.75 lets the governor bind. `balance` 1.1 is the
  planted part: less peak lateral, and the handbrake rotates it less.
- **Contact.** Coasting at 12 m/s into a parked car: a Bulwark shoves a Cinder to
  **6.65 m/s** and keeps **4.49**; a Cinder shoves a Cinder to 5.63 and keeps
  3.26; a Cinder into a parked Bulwark moves it **4.62** and keeps **2.12**. Two
  equal weights give the same result at any mass (5.63 either way).
- **Still catchable.** The recovery gates run over every distinct tune now
  (`everyTune` in `tests/helpers/handling.ts`), not only the three layouts. The
  Bulwark recovers from every pull; it rotates less: the short pull peaks at
  5.7 degrees against the shared model's 7.4, and the gate's floor that the
  handbrake still does something useful is 5, so it clears by 0.7. A more planted
  Bulwark would meet that floor first.
- **Nothing else moved.** The golden master's 14 runs, none of which drives a
  Bulwark, stayed bit-identical, and no rival drives one, so no `RIVAL_REVISION`.
  No recording was made in a Bulwark.
- **Not yet driven on a pad** (2026-09-19). Everything above is measured, and
  none of it is feel. The first things to judge: whether 0.7 steering reads as
  heavy or as broken in a quick left-right, whether 31 m stops feel like a truck
  or like a fault, and whether 5.8 degrees of handbrake is still fun.

### The Kestrel, revision 2 (2026-09-19)

Moth's rally hatch, and the opener's car: every player races it first. On the
shared AWD numbers it lapped 4–8% faster than the Cinder with the same driver, so
the first rival on the list was in one of its fastest cars.

```
kestrel: { drivetrain: "awd", revision: 2, mass: 1_150, power: 0.7, topSpeed: 0.93, steering: 1.1 }
```

Geared short (130 mph), light, a quick rack. Shawn chose `power` 0.7 from three
measured candidates: 0.75 left it 1.3–1.8% quicker on the circuits and 3.8% on
streets; 0.65 was level on the circuits and 1.1% quicker on streets but launched
softer than the Bulwark truck (3.12 s to 60 against 2.87), which a rally hatch
should not; 0.7 matches the truck's launch.

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Kestrel r1 | 1180 | 2.07 | 2.33 | 140.0 | 27.8 | 13.30 | 0.37 | 7.6° |
| **Kestrel r2** | 1150 | 2.87 | 3.43 | 130.2 | 27.8 | 13.49 | 0.37 | 7.8° |

AI laps, best flying: **74.50 / 57.37 / 48.23 / 95.18 s** against the Cinder's
74.83 / 57.73 / 48.60 / 97.65, so 0.4–0.8% quicker on Ridge Circuit's layouts and
2.5% on Uptown's streets, which are Moth's ground (r1: 71.75 / 54.87 / 46.13 /
89.90). Against a person the driver matters more than the car: in the same
Cinder the AI laps Uptown about 13% slower than Shawn's recorded laps, so for him
the opener is easy in either car, and the car decides it for a player who drives
more like the AI.

- **It broke the launch, which is how the launch got fixed.** The rival launch test
  said launching was now worth 0.0 m to Moth; see "The launch", above.
- **`RIVAL_REVISION` is `full-line-v13`.** Moth drives the Kestrel in Sound to
  Sky, on Ridge Circuit and Uptown, in her generated races and on her cruise, so
  all of them move. The golden master moved exactly there, plus three Blackglass
  runs whose burnouts boost on part throttle against a wall (the launch change);
  Stray's, Deuce's and Crest's races stayed bit-identical. `pnpm laps --verify`
  is unchanged: the two sessions that replay are solo, in the Cinder.
- **The recording fixtures drive the car they record.** `lap-recorder.test.ts` and
  `street-circuit.test.ts` drove the shared AWD, steered by the Kestrel's line, and
  labelled the session `kestrel` with no revision. Once the Kestrel had its own
  numbers, replay refused them, which is the guard working. They now drive
  `carHandling(line.car)` and record `carRevision`, as `main.ts` does.
- **Not yet driven against on a pad.** Whether Moth feels like a fair first race
  is the question the numbers cannot answer.

### The Latch, revision 2 (2026-09-19)

Stray's sport liftback, the kid's first tuner: target just under the Cinder at
138 mph and about even in pace (`design/BLACKLIST.md`, "Top speeds and pace, per
car"). The first car tuned *up*: on the shared FWD numbers it lapped about 1.9%
slower than the Cinder on all four circuits.

```
latch: { drivetrain: "fwd", revision: 2, mass: 1_160, topSpeed: 0.986, grip: 1.05, balance: 0.9, steering: 1.1,
  handbrake: 0.8 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Latch r1 | 1180 | 4.37 | 3.70 | 140.0 | 27.8 | 14.12 | 0.37 | 7.6° |
| **Latch r2** | 1160 | 4.15 | 3.42 | 138.1 | 27.0 | 15.10 | 0.38 | 7.2° |

AI laps, best flying: **74.22 / 57.43 / 48.32 / 97.45 s** against the Cinder's
74.83 / 57.73 / 48.60 / 97.65, 0.2–0.8% quicker (r1: 76.15 / 58.85 / 49.53 /
99.52).

- **FWD is traction-bound, so power does nothing.** `power` 1.1 and `topEnd` 1.15
  each left the laps identical to the hundredth; grip and balance are its levers.
  Sticky tyres (`grip` 1.05) and a chassis that turns on a lift (`balance` 0.9).
- **Balance stopped at 0.9 for the highway.** At 0.85 the pace was the same, but a
  0.6 steer held at 135 mph and then lifted peaked at 6.55 degrees of slip (the
  Cinder 2.46). At 0.9 it peaks at 4.06, and both pass the highway gate's own
  conditions (0.3 steer, gas down: 1.07 degrees, all 16 cases settle). That gate
  is RWD-only in the suite; this was checked by hand.
- **The recovery gates caught it, which is what they are for.** With the handbrake
  stock, the looser balance made the Latch **uncatchable**: a half-second pull at
  45 m/s with full countersteer peaked at 20.95 degrees (floor 12; the shared FWD
  7.86) and did not recover, and the city pull peaked at 22.42 (floor 22). Taking
  the knobs away one at a time put it on `balance` with the handbrake: without
  the balance it passed. `handbrake` 0.8 gives back what the balance takes from
  the rear, and it passes with room: short pull 7.0 degrees (the floor that it
  still rotates is 5), city 17.9, the longer city pull 25.7 (32), highway 7.9 (12),
  all recovered. Lift-off rotation and the laps do not use the handbrake and did
  not move. So a looser balance comes with a gentler handbrake.
- **`RIVAL_REVISION` is `full-line-v14`.** `pnpm golden`: exactly Stray's two runs
  moved (free roam, where she cruises, and `gen-stray-5`); twelve bit-identical.

### The Hammer, revision 2 (2026-09-19)

Rivet's muscle notchback: quick in a line, poor in a bend, heavy, 150 mph. It
needed `traction` and power in the gearbox ("Traction and the gearbox", above),
because on the old knobs a rear-drive car cannot be quick in a line and slow in a
bend at once.

```
hammer: { drivetrain: "rwd", revision: 2, mass: 1_500, power: 1.05, topEnd: 1.2, topSpeed: 1.0714,
  traction: 1.06, grip: 0.95, brakes: 0.85, steering: 0.9 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Hammer r1 | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| **Hammer r2** | 1500 | 3.83 | 2.92 | 150.0 | 30.1 | 13.48 | 0.38 | 7.0° |

- **The drag strip set it.** Rivet races only there, so her place on the list is her
  quarter mile, not her laps. By #8 the best drag car a player can own is the
  Cinder (12.95 s driven cleanly, the tuned AWD cars 13.28), so Rivet must not run
  much under that or her race cannot be won. `traction` 1.1 put her at 12.85; 1.06
  puts her at **12.97**: a clean run in the Cinder wins by a hundredth, anything
  less loses. Before the tune she ran 13.10, 0.15 s behind a clean Cinder.
- **So her laps are not the ladder's −1%.** AI laps **75.57 / 58.02 / 49.02 / 97.58
  s**, 0.5–1.0% slower than the Cinder on the circuits and level on Uptown. That
  is the Hammer as a player car: a straight-line car that gives time back in
  bends, which is the character asked for. `grip` 0.93 lost 0.8–1.5% on the
  circuits; 0.95 is where the bends cost about what the line gives.
- **The gates set the balance.** It first had `balance` 1.05, as a margin; the RWD
  throttle-catch gate could not set up its slide (less than 5 degrees from its
  shortest handbrake hold), so the car was too planted to test, and a muscle car
  that will not step out is off-character anyway. At `balance` 1 every RWD gate
  passes, 33 of 33 in the handling suites, and the quarter mile is unchanged.
- **`RIVAL_REVISION` is `full-line-v15`.** `pnpm golden`: exactly the drag strip and
  free roam, where Rivet is parked, moved; twelve bit-identical.

### The Breakwater, revision 2 (2026-09-19)

Bollard's enclosed off-roader: the heaviest car, the slowest, and the one that
wins a shove. The first tune judged on street sprints (`--streets`), because
Bollard races sprints through traffic, not circuits.

```
breakwater: { drivetrain: "awd", revision: 2, mass: 1_900, power: 0.85, drag: 1.4,
  grip: 0.95, brakes: 0.8, steering: 0.85 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Breakwater r1 | 1180 | 2.07 | 2.33 | 140.0 | 27.8 | 13.30 | 0.37 | 7.6° |
| **Breakwater r2** | 1900 | 2.43 | 3.77 | 125.0 | 29.7 | 12.71 | 0.42 | 6.9° |

Street pace (clear): **599.67 s, 0.62% quicker than the Cinder**; circuits 1.0–2.1%
slower and Uptown 2.3% quicker. On the shared AWD numbers it was **7.7% quicker**
over the sprints and 4–8% on the circuits, the largest lead of any untuned car.

- **No governor: the air stops it.** `drag` 1.4 leaves it running out at 125 mph,
  the slowest top speed on the list, and takes its 60–100 to 3.77 s from the
  Cinder's 2.97. It also coasts down fastest of anything.
- **Its only pace is the launch, and that is forced.** With its top end gone, the
  AWD launch is all it has: `power` 0.85 gives 0–60 in 2.43 s, the quickest on
  the list, for the heaviest car. Less power reads better on paper and loses the
  ladder: at 0.8 with `grip` 0.97 the sprints came out 0.33% *slower* than the
  starter car, and at 0.8 with `grip` 0.95, 0.64% slower. So it leaves the line
  like a freight train and the air takes it back.
- **It wins the shoving.** Coasting into a parked car at 12 m/s: it shoves a
  Cinder to **6.95 m/s** and keeps **4.85**, where a Cinder shoves a Cinder to 5.63
  and keeps 3.26. A Cinder into it moves it **4.32** and keeps **1.67**; it beats
  the Bulwark truck both ways (5.94 / 3.71 against 5.32 / 2.88). That is Bollard's
  lesson, racing through contact (`design/BLACKLIST.md`), in the one place mass acts.
- **`RIVAL_REVISION` is `full-line-v16`.** `pnpm golden`: only free roam, where she
  cruises, moved; thirteen bit-identical. No golden race fields her.

### The Wager, revision 2 (2026-09-19)

Deuce's rotary: it needs revs. Skinnier tyres off the line, the strongest top end
on the list, and the best tyres anyone has in a bend.

```
wager: { drivetrain: "rwd", revision: 2, mass: 1_250, power: 0.92, topEnd: 1.25, topSpeed: 1.0571,
  traction: 0.96, grip: 1.07, balance: 0.95, steering: 1.1, handbrake: 0.95 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Wager r1 | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| **Wager r2** | 1250 | 3.75 | 2.82 | 148.0 | 26.6 | 15.16 | 0.37 | 8.4° |

AI laps **72.68 / 56.10 / 47.28 / 95.62 s**, 2.1–2.9% quicker than the Cinder;
street pace (clear) **588.42 s, 2.48% quicker**. Deuce races sprints, so the
streets are the measure: 1.82% at `traction` 0.95 and `grip` 1.06 left him level
with Moth (−1.94%) at four places higher, and 3.34% at `grip` 1.08 took the pace
the names above him need.

- **`traction` is the rotary.** A RWD car is traction-bound to 100 mph, so a weak
  bottom end cannot come from `power`: 0.96 of the driven tyres' push is what
  makes it want revs, while `topEnd` 1.25 and 148 mph give it the top of the list.
- **The gates set the handbrake, from both sides.** `balance` 0.95 is a looser
  tail, so the Latch's rule says a gentler handbrake; at 0.85 the RWD
  throttle-catch gate could no longer set up its slide (5.0 degrees against a
  floor of 5), and at 1 the city pull reached 21.8 against a limit of 22. At 0.95
  every gate passes with room: city 20.5, highway 9.1, and it still slides 5.8 to
  seed the catch. Its own handbrake slip is 8.4 degrees, the most on the list.
- **`RIVAL_REVISION` is `full-line-v17`.** `pnpm golden`: exactly Deuce's two runs
  moved (free roam, where he cruises, and `gen-deuce-3`); twelve bit-identical.

### The NS-01, revision 2 (2026-09-19)

Sable's drift coupe, and the first car tuned against the drift measure
(`--drift`). She races her own yard, so her place on the list is her score there,
as Rivet's is her quarter mile.

```
ns01 (and "blender", the same car she parks in the yard):
{ drivetrain: "rwd", revision: 2, mass: 1_250, topSpeed: 1.0143, topEnd: 1.05,
  traction: 1.03, balance: 0.85, handbrake: 1.25, steering: 1.1 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| NS-01 r1 | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| **NS-01 r2** | 1250 | 3.73 | 2.83 | 142.0 | 27.8 | 14.19 | 0.40 | **13.7°** |

In Sable's yard, on the linking driver that replaced the one it was tuned with:
**6,340 against the Cinder's 4,929**, with **9 linked transitions to the Cinder's
6**, holding 18.8 degrees against 17.1, peaking at 34.2, and drifting 23.1% of the
run against 19.5%. (On the driver that chose the tune it scored 4,199 against
3,817, holding 21.5 against 17.4, and nothing linked at all.) Pace is 0.8% quicker than the Cinder on the circuits and 0.94% on
the streets, under the ladder's −2%: her race is the yard, and this is the NS-01
as a car the player wins.

- **The gates said no first, and that was the design question.** Every candidate
  swung past ceilings measured on the shared model: the mildest reached 25.1
  degrees in the 0.75 s pull (limit 22), this one 32.7, and 48.1 in the 1 s pull
  (limit 32). But all of them were **caught from every pull**: 0.0 degrees of slip,
  no yaw, still moving. So the ceiling, not the car, was what had to give: peaks
  are per car now (above), being caught is not. Without that there is no drift car.
- **Its angle is balance and the handbrake, not traction.** `traction` 0.95 was
  meant to let the tail go; it scored *lower* (4,163) than dropping it (4,183),
  because the angle comes from `balance` 0.85 and `handbrake` 1.25. It also failed
  the RWD throttle-catch gate's exit: the worst case regained 2.62 m/s where the
  gate wants 3, since less powered grip is exactly what pulls a car out of a slide.
  At 1.03 the exit regains 3.41 m/s and the score is highest (4,199 on that driver).
- **`RIVAL_REVISION` is `full-line-v18`.** `pnpm golden`: exactly the two runs
  where her car appears moved (her yard, and free roam where she parks); twelve
  bit-identical.
- **What the measure cannot see.** The driver links now, so a car that flicks
  willingly shows, but it still cannot rank cars against each other: Rivet's
  Hammer scores **7,231** here, above the drift car, because it suits the driver's
  fixed timing. Read it as one car's tunes against each other, which is what it
  was used for.

### The Meridian, revision 2 (2026-09-19)

Plumb's fast wagon: long, heavy and quick everywhere. Her stages are generated
circuits, which are street circuits, so Uptown is her measure rather than Ridge.

```
meridian: { drivetrain: "awd", revision: 2, mass: 1_550, power: 0.75, topEnd: 1.1,
  topSpeed: 1.0429, brakes: 0.95, steering: 0.95 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Meridian r1 | 1180 | 2.07 | 2.33 | 140.0 | 27.8 | 13.30 | 0.37 | 7.6° |
| **Meridian r2** | 1550 | 2.67 | 2.93 | 146.0 | 28.2 | 13.45 | 0.38 | 7.5° |

AI laps **73.67 / 56.60 / 47.68 / 93.77 s**: 1.6–2.0% quicker than the Cinder on
Ridge Circuit and **4.0% on Uptown**, with street sprints 4.06% quicker. Untuned
she was 4.1–5.1% and 7.9%.

- **Her ground decided the power.** `power` 0.85 read well on Ridge (3.0–3.7%
  quicker, about the ladder's −3%) and 6.1% on Uptown, which would have put a #4
  where #1 belongs: all-wheel drive pays most on streets, and hers are streets.
  At 0.75 she is 4.0% on Uptown, clear of every name below her, with room above.
- **Weight and a long wheelbase, not grip.** 1,550 kg, slightly softer brakes and
  a slower rack; her cornering (13.45) is the shared AWD's, and the tune adds
  nothing there. The top end (146 mph, `topEnd` 1.1) is the wagon's own.
- **`RIVAL_REVISION` is `full-line-v19`.**

### The Skim, revision 2 (2026-09-19)

Crest's hardtop roadster: the lightest car, on the best tyres, and the first
front-drive car with the traction to use them. Her stages are sprints, so the
streets are the measure.

```
skim: { drivetrain: "fwd", revision: 2, mass: 1_050, topSpeed: 0.986, grip: 1.1,
  traction: 1.2, balance: 0.95, steering: 1.15, handbrake: 0.85 }
```

| | kg | 0–60 s | 60–100 s | Top mph | 100–0 m | Lateral m/s² | Turn-in s | HB slip |
|---|---|---|---|---|---|---|---|---|
| Cinder r1 (anchor) | 1180 | 3.87 | 2.97 | 140.0 | 27.8 | 14.18 | 0.37 | 7.6° |
| Skim r1 | 1180 | 4.37 | 3.70 | 140.0 | 27.8 | 14.12 | 0.37 | 7.6° |
| **Skim r2** | 1050 | 3.27 | 2.57 | 138.1 | **26.2** | **15.75** | 0.37 | 7.6° |

Street pace **4.95% quicker than the Cinder**, AI laps 5.0–5.5% quicker
(untuned: 2.58% and 1.8–1.9% *slower*). The best cornering and the shortest stop
on the list, and it turns in as fast as anything.

- **`traction` is what front drive was missing.** Front tyres lose load under
  power, so a FWD car gives away every junction exit: the Latch, tuned on grip
  and balance alone, still ended 0.44% slower than the Cinder on the streets.
  `traction` 1.2 widens only the driven tyres' push: 0–60 falls from the shared
  4.37 s to 3.27, and her street pace goes from 2.58% slower to 4.95% quicker.
- **The handbrake rule again.** `balance` 0.95 with the stock handbrake failed
  three gates (city 22.3, long 42.9, highway 18.4 degrees, uncaught); at 0.85 it
  passes all of them (7.4 / 18.7 / 26.8 / 8.4) with the same pace.
- **`RIVAL_REVISION` is `full-line-v20`.** `pnpm golden`: exactly Crest's two runs
  moved (free roam, where she cruises, and `gen-crest-8-unordered`).

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
returns the car to its own drivetrain. The override keeps the car: the Bulwark on
RWD is the Bulwark's own numbers with a rear-drive split ("Cars", above).

Between the layouts, engine, ordinary steering, mass, brake and handbrake
parameters are shared; a car's tune sits on top of whichever layout it drives.
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

What the player sees is drawn between the last two ticks (2026-09-18,
`src/render/interpolate.ts`), up to one tick (17 ms) behind the simulation.
Drawn at the last tick, the car moved on some frames and not others above
60 Hz while the camera glided: at 120 fps its screen position jerked 3.5 px a
frame at 25 m/s, and 0.02 px blended. The handling is unchanged; if a pad ever
feels a tick late, compare with `?smooth=0`.

The body leans with the ground (2026-09-18). On a landform, pitch and roll are
the ground's own slope along the car's nose and across it (`syncState`,
`RoadWorld.grade`), smoothed at `pitchResponse`; before, pitch came from the
slope along the road and nothing read the slope across, so on Queen Anne Climb,
8 degrees across the carriageway, the car sat level. Both are drawn only: the
grade force still reads the road (`gradeAccelerationFor`), no force reads either,
and the lap recordings that replayed before replay after (2 of 13, the same
two). Across a hillside nothing pulls the car downhill; that would be handling.
Authored track has no slope across it and keeps its pitch. Traffic leans the same
way in the renderer, which keeps its state and `TRAFFIC_REVISION` unchanged.

Automated gates establish behavior, not enjoyment. Controller feel still needs
a human lap, especially brake/steer overlap, release after a handbrake turn,
and steering away while accelerating from a scraped barrier.
