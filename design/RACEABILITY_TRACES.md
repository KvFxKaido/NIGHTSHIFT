# What caused the two reference-race hotspots

Follow-up: [stopping experiment and read-only cooldown audit](RACEABILITY_EXPERIMENT.md).
The candidate removes the gen-22 impact in the scoped comparisons; it remains
opt-in. The audit found no cooldown-only missed opportunity at gen-56's two
central bends. Shipped behaviour remains unchanged.

2026-11-09. Cinder RWD, seed 314159, existing gate setup with player parked.
Roads, AI, traffic rules and handling remain unchanged. Four tick-level replays
(each course with and without traffic) reproduce the saved finish times exactly.
Evidence is in `measurements/raceability-trace-findings.json`; full tick data is
local under `artifacts/raceability-traces/`. Recollect with:

```powershell
node --experimental-strip-types --no-warnings scripts/raceability-trace.ts
```

## gen-22: a reserved traffic turn hits the stopped rival

This is not primarily the rival charging into traffic at speed. The physics
trace shows sedan **#11 hitting an effectively stationary rival**, then the rival
trying to drive around the resulting wreck.

| Time | Observed sequence |
|---|---|
| 60.28 s | Sedan #11 claims movement 14, lane 5 → 17. The rival is about 142 m away, doing 59.8 mph at route 2135 m. |
| 60.82 s onward | A nearly stationary taxi, #46, repeatedly refuses the preferred corner line. The rival takes the lane path instead. |
| 63.25 s | The rival is braking for sedan #11 as crossing traffic. Its requested speed continues falling to zero. |
| 65.00–65.17 s | The rival is effectively stopped near (-582.78, -710.72), at route 2222 m. Sedan #11 continues its reserved turn at 7.14 m/s (16.0 mph). |
| **65.183 s** | First nonzero Rapier contact impulse against sedan #11, about 3329 N·s. The impact gives the stopped rival about 6.3 mph of motion; the sedan becomes a wreck and drops its reservation. |
| 65.7 s onward | The rival asks for throttle and lateral avoidance around the wreck; subsequent physical contact occurs while it tries to escape. |
| 66.20 s | The old box-overlap diagnostic first reports contact. **This is late; it is not the start of the physical collision.** |
| **66.867 s** | The out-of-sight fallback resets the rival. Just before reset it is moving at about 11.3 mph. |

**Why the sedan keeps coming:** `traffic.ts` checks crossing racers when granting
the movement. That forecast extrapolates their current heading and speed, not
their future route through the bend. At the claim snapshot, that extrapolation
lands about **49.2 m away** from the eventual collision location at impact time.
This is evidence of the prediction mismatch, not a claim that the 49.2 m figure
is itself the reservation predicate. After granting the turn, the ordinary
`racerGap` check follows racers going the same way; it deliberately does not stop
for opposing/crossing racers, to avoid mutual deadlocks. At 65 s the rival's
centre is 2.73 m off the sedan's sampled lane (outside its 2.6 m follower band),
and the heading alignment is -0.82 (below the required +0.5).

The rival's crossing-traffic response successfully stops it, but leaves its body
in the turning sedan's swept path. Those two decisions—continue the reserved turn
and stop the rival where it is—are incompatible here. A stopped taxi also keeps
the preferred racing line unavailable. The taxi attribution comes from running
the existing line reader on copied drivers with one vehicle at a time at each
post-tick refusal snapshot; the live simulation state is checked unchanged.

**Why it resets despite moving again:** progress is a high-water mark, advanced
only after another **4 m**, rather than a check that speed is zero. The mark was
2221.113 m. At reset the rival has reached 2224.581 m: only **3.468 m** beyond it.
Its counter reaches 150 ticks (2.5 s), and the parked player is more than 120 m
away, so the out-of-sight reset fires. It was about **0.532 m short** of refreshing
the progress mark. The fallback is operating as coded; it is not a second crash.

Diagnosis: a traffic/rival interaction at a reserved turn, followed by a coarse
progress-triggered recovery. This trace does not justify widening the road. It
also does not certify the alternative line as safe: taxi #46 is blocking it.

## gen-56: traffic denies fast lines, then late-entry protection keeps them closed

There is no physical contact or reset in this run. The extra time is chiefly
ordinary corner planning on the slower lane path after traffic refuses a line.

| Route range | Extra observed time against clear |
|---|---:|
| 0–1000 m | 0.00 s |
| 1000–2200 m | 2.50 s |
| **2200–2800 m** | **5.40 s** |
| 2800 m–finish | 0.55 s |
| Total | **8.45 s** |

These are occupied-route-bin time differences, not independent counterfactual
effects; the speed carried from an earlier bend affects the next section.

The two largest bends explain the central hotspot:

- **Bend window 2340–2498 m:** oncoming box truck **#174** refuses the line at
  58.62 and 60.12 s. The last refusal lasts until 61.60 s. By the first tick
  after expiry the rival is already at **2348.47 m**. Joining would require a
  **3.48 m** shift where the late-join rule allows less than **0.75 m**, so the
  line remains closed. This guard exists to prevent a sudden mid-bend swerve.
- **Bend window 2574–2716 m:** nearly stationary van **#182** refuses the line
  at 66.42 and 67.92 s. The hold expires at 69.40 s, with the rival already at
  **2612.45 m**. The corresponding join shift is **7.82 m**, again far above
  0.75 m. It recovers the line only later near its return to the lane.

At 2400 m the traffic run's corner plan is **58.7 mph**, versus **128.8 mph**
clear; actual speeds are 62.8 versus 119.3 mph. At 2650 m the plan is **53.2
versus 107.2 mph**, actual 52.3 versus 104.9 mph. These are changes in the
corner plan itself, not prolonged emergency traffic caps. Earlier line refusals
also involve box truck #39 and SUV #250, among others, accounting for delay
before the central hotspot. No committed passing occurs in the 2200–2800 m band.

**Why the census says only 0.37 s:** it measures qualifying non-corner holds below
the *current* plan. When a line is denied, `rival.ts` plans against lane curvature
instead, with a lower allowable speed. Following that slower plan is classified
as `corner`, so the census correctly excludes it by its existing definition.
The report was missing a category of time loss, not finding eight seconds of
unexplained brake input.

Diagnosis: traffic-dependent line availability, its 1.5 s refusal hold, and the
intentional late-join guard produce most of the observed delay. The trace does
not establish that the forecast margins should be loosened: both guards protect
against real collisions or abrupt steering, and changing either needs its own
scope decision and same-state comparison.

## Verification and limits

- Both traffic and clear finish times reproduce: gen-22 76.0667 / 68.1167 s;
  gen-56 93.3667 / 84.9167 s. All line-reader probes leave serialized live state
  unchanged. No simulation tables are overridden.
- Physical contacts use Rapier manifold impulses, independently of the original
  approximate box test. The first impact proves that the old onset marker was late.
- Single-vehicle line-reader probes use post-tick snapshots. They identify a
  vehicle that rejects the line in that state; they do not claim to reconstruct
  every pre-input forecast sample exactly.
- The reset is specifically the out-of-sight fallback in the parked-player
  diagnostic. A human close to the incident would change its eligibility and
  could also change the traffic interaction. This is not a player race replay.
- Only diagnostic code and documentation were added. Typecheck and replay
  agreement validate the instrumentation; the prior full test/build results
  remain the reference for the unchanged game code.
