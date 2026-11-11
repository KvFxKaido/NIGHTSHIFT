# Footprint stopping experiment and cooldown audit

2026-11-09. Outcome: **do not promote v2. Its full 498-pair gate confirms the
focused fixes but exposes a new collision on gen-77 / seed 271828. Both versions
remain opt-in experiments. The cooldown should stay unchanged.** No shipped
AI, road, traffic, handling or reset code was changed. Results and hashes:
`measurements/raceability-stopping-experiment.json`.

The gen-77 failure is traced in [RACEABILITY_PASS_TRACE.md](RACEABILITY_PASS_TRACE.md):
the pass rechecks certify an ideal trajectory after actual tracking error exceeds
the footprint allowance. An actual-state validation experiment is recommended;
no pass or steering fix has been applied or validated.

## Original footprint-aware stopping (v1)

The candidate runs only in a separately launched Node process. A loader inserts
one additional speed cap into the existing crossing/oncoming hazard branch;
it never writes `src/sim/`. The normal game and normal diagnostic commands do
not load it.

For a vehicle already holding a junction reservation, it reads the existing
traffic forecast over four seconds, at 0.1 s samples. It checks oriented vehicle
boxes against the rival's intended lane path at one-metre stations. It reuses
the existing proportional approach coefficient, but measures clearance to the
swept footprint with a two-metre stand-off, instead of the other vehicle's centre.
Existing passes and active corner-line blends are excluded. Traffic reservations,
steering, line decisions and resets are unmodified.

The rival box uses the existing diagnostic half-dimensions 2.10 × 0.95 m,
slightly conservative against the physical 2.08 × 0.92 m collider. The four-second
horizon, spatial sampling and two-metre margin are **prototype assumptions**, not
adopted tuning. Occupancy is conservative across the forecast interval rather
than an exact time-of-arrival collision prediction.

### Same-state fork at gen-22 / seed 314159

Both runs have identical tick-state hashes before tick 3600 (60 seconds), and
identical Rapier snapshots at that fork. Only the experimental cap changes
afterward.

| Observation | Current | Footprint experiment |
|---|---:|---:|
| Finish | 76.0667 s | 74.0500 s |
| Ticks with nonzero physical contact impulse | 36 | 0 |
| Out-of-sight resets | 1 | 0 |
| Ordinary resets / reversing recoveries | 0 / 0 | 0 / 0 |

The new cap first wins at 62.617 s, about route 2200 m, against sedan #11. It
slows the approach earlier. Near release at 65.883 s, the rival is around route
2220.06 m, about two route metres short of the original stopped position. The
sedan passes without impact; the rival resumes before its unchanged progress
fallback expires. The improvement is from avoiding the collision, not adjusting
or bypassing recovery.

### Enabled from race start

The candidate was then tested from tick zero, with fresh current-code controls.
Six seeds on gen-22: 0, 1000, 271828, 1, 42, 314159. Three seeds each on gen-30
and gen-56: 0, 42, 314159. All 12 pairs use Cinder RWD and the parked player.

| Course / seed | Change in finish time | Physical-contact/reset result |
|---|---:|---|
| gen-22 / 314159 | **−2.0167 s** | 36 impact ticks → 0; one reset → 0 |
| gen-22 / 42 | +0.1833 s | Clear in both |
| gen-22 / 1 | +0.1000 s | Clear in both |
| gen-30 / 0 | +0.0500 s | Clear in both |
| gen-56 / 0 | −0.0167 s | Clear in both |
| Remaining seven pairs | 0.0000 s | Clear in both |

Every candidate run finished with zero physical-impact ticks, resets, reversing
recoveries and ground-contact ticks. This is useful evidence for the local
correction, not a whole-city acceptance gate.

**Initial retention decision:** keep the reproducible experiment and evidence,
with production behaviour unchanged pending the full gate below. No cooldown
change is included in this candidate.

## Full 498-pair gate: v1 promotion rejected

Completed 2026-11-10 UTC (November 9 local). Fresh current and candidate runs:
street-uptown plus gen-1 through gen-82, each on traffic seeds 0, 1000, 271828,
1, 42 and 314159. **996 completed runs, 498 matched pairs.** Unlike the scoped
Cinder runs above, this uses the standard gate's drawn rival cars (Kestrel for
these unnamed courses), parked player and normal three-lap Uptown race. The
candidate starts at tick zero. Roads, resets, cooldowns, traffic and handling
implementations are unchanged. All captured source hashes matched at completion.

Machine-readable results, source identity and replay checks:
[`measurements/raceability-full-gate.json`](measurements/raceability-full-gate.json).
Full raw rows, census data and detailed replay traces are under
`artifacts/raceability-full-gate/`. The committed production gate baseline was
not overwritten; both fresh standard-format summaries are in that artifact folder.

| Metric, all 498 races | Current | Experiment |
|---|---:|---:|
| DNF | 0 | 0 |
| Total finish time | 46,081.22 s | 46,098.24 s |
| Races with physical contact | 99 | 99 |
| Ticks with nonzero physical contact impulse | 3,320 | 2,936 |
| Approximate contact ticks (original gate) | 1,762 | 1,352 |
| Resets, ordinary plus unseen | 17 | 18 |
| Reversing recoveries | 1 | 2 |
| Ground-contact ticks | 265 | 265 |

The cap wins on 128 runs. At the gate's 0.01 s output precision, 438 finish times
are unchanged, 17 improve and 43 worsen; total time rises 17.02 s. The original
approximate-contact incident count improves 50 to 47, while deduplicated physical
onsets increase 86 to 87. These are different detectors, not interchangeable
counts. Physical onset deduplication uses seed, tick, rounded route metre and
other collider; episodes split after a gap greater than 30 ticks.

### Three blocking cases, independently replayed

| Race / seed | Finish change | New failure |
|---|---:|---|
| gen-70 / 314159 | +6.81 s | Clean to 81 impact ticks and one unseen reset |
| gen-53 / 314159 | +4.55 s | 1 to 28 impact ticks; unseen resets 1 to 2; reversing recoveries 0 to 1 |
| street-uptown / 1 | +8.62 s | Two additional vehicle encounters; impact ticks 106 to 132 |

**gen-70:** the candidate stops at route 3544.26 m by 100.2 s while reading
van #38's reserved turn. The van hits the stopped car at 100.883 s, impulse
6748.73. The unchanged unseen reset fires at 101.467 s; a later impact with
sedan #0 occurs at 105.717 s / route 3573.09 m. Current code finishes without
either contact or reset. Fact: the new stopping policy leaves this car in a
place that the moving van subsequently occupies. A conservative sampled lane
forecast has not guaranteed a safe resting footprint for the actual car.

**gen-53:** both runs have the identical impact with sedan #31 at tick 5885
and identical first unseen reset at 103.017 s. After that reset the candidate
caps for taxi #141, reaching almost zero speed at route 3383.28 m by 105.5 s.
The taxi hits at 106.833 s; reversing recovery and a second unseen reset at
107.5 s follow. Current code clears this encounter after its first reset.
This is a direct stopped-car regression after recovery, not merely a changed
later traffic draw. Altering reset timing would conceal rather than fix it.

**Uptown:** changed earlier interactions put the candidate about six seconds
later near route 5760 m. It hits box truck #75 at 186.383 s and #77 at 186.6 s,
where the control has no contact. Both trucks have no held junction reservation
at this encounter, so the experimental cap is inactive. Existing oncoming,
no-side and bumper rules govern the approach. This is a downstream failure
exposed by changed arrival timing; the trace does not establish a new bug in
those unchanged rules. It still counts against promotion.

### Flags that need a different interpretation

gen-66 / seed 271828 and Uptown / seed 314159 trigger higher-speed-contact
flags, but these speeds are recorded **after** physics, not pre-impact closing
speeds. Both concern existing encounters at the same locations. On gen-66,
the detailed replay of vehicle #196 shows total impulse 9748.06 to 990.74,
18 contact ticks to 17, and no reset. On Uptown / 314159, the one-tick contact
with #203 has impulse 8534.47 to 1832.65. These flags do not establish harder
impacts; they are retained in the report rather than silently discarded.

gen-40 / seed 0 is a clean +2.57 s caution cost. The cap wins for 20 ticks
against truck #208 near route 2443 m. The slower arrival then engages the existing
pass-plan/pass-hold behavior, accumulating the delay through roughly 2700 m.
There is no contact or recovery in either run. That is a performance tradeoff,
distinct from the stopped-car failures above.

gen-22's Kestrel / 314159 is clean in both variants (+0.16 s); the earlier
Cinder contact/reset fix remains car-specific evidence. gen-56's six standard
gate finish times are unchanged. No evidence here calls for changing its cooldown.

**Decision:** retain the opt-in experiment and these regression fixtures;
do not promote it or change any live AI revision/tuning. The next stopping
experiment must establish a safe resting footprint and handle already-conflicted
positions, especially after recovery, before it can earn another full gate.
That is a proposed investigation, not an implemented fix. Live forecast cost
also remains unprofiled; these concurrent batch timings are not a play-performance
benchmark.

Validation: all 498 pairs completed; source hashes remained identical; ten
independent detailed replays (both variants of the five inspected cases) match
their gate finish times, contact ticks, reset and recovery counters. Typecheck
passed. An augmented baseline gen-30 / seed 0 matches every pre-existing field
of its uninstrumented output. `git diff -- src` remains empty.

Reproduce the complete comparison from the repository root:

```powershell
node scripts/raceability-full-gate.mjs
node scripts/analyze-raceability-gate.mjs
# Detailed cases: scripts/raceability-gate-case.ts --race=<id> --seed=<seed>
# Use --label=current, or --label=swept with the experiment loader and tick-zero env.
# After reproducing the five documented pairs:
node scripts/save-raceability-gate.mjs
```

## Refined stopping experiment (v2)

The loader now selects v2 by default when `NS_STOP_EXPERIMENT=1`. Explicit
`NS_STOP_REVISION=v1` selects the frozen original helper
(`scripts/raceability-footprint-stop-v1.ts`); its bytes match the original gate's
helper hash. The normal game loads neither. The full-gate runner defaults to v1
for historical reproduction; explicitly selecting v2 writes a separate artifact
folder, so it cannot overwrite the original 498-pair evidence.

V2 retains the original crossing/oncoming insertion point, reservation requirement,
pass and active-line exclusions, four-second traffic forecast, one-metre route
sampling, two-metre stand-off and proportional approach coefficient. It adds:

- The current car's position error relative to its intended lane, and its heading
  error relative to the lane tangent, carried into every sampled stopping pose.
  The sample at distance zero is therefore the actual car footprint, rather than
  an ideal lane-centred car that the slowing vehicle may never reach.
- A stop-admission check: the first conflicting pose must leave more than the
  stand-off plus `speed * 0.1 + speed² / (2 * serviceBrakeDeceleration)`. The brake
  capability comes from the existing car tune; handling itself is unmodified.
  A currently occupied sweep or insufficient stopping room returns no experimental
  cap. It neither commands an escape acceleration nor bypasses existing braking.
- An additional braking-distance ceiling on the cap, alongside the existing
  proportional approach. The original driver still owns steering and recovery.

This is a deterministic geometric admission estimate, **not** a full physics
rollout or a guarantee against all future traffic. Holding tracking error constant,
using route metres, assuming service-brake capability while cornering, and the
unchanged four-second forecast remain limitations to test before promotion.

The first attempt used the pass planner's 8 m/s² assumption. It removed the added
regressions but lost the original same-state gen-22 fix. Broadening the hazard scan
then made a full gen-22 run clean through earlier timing changes, while the 60 s
fork still failed. Using the car's service-brake capability restored that fork;
keeping the wider scan nevertheless introduced another gen-70 contact. Neither
intermediate was retained. V2 keeps the original hazard branch and passes the
local fork as well as the full-run target cases.

### Target cases, seed 314159

| Case | Current AI | V1 | V2 |
|---|---:|---:|---:|
| gen-22 / Cinder finish | 76.0667 s | 74.0500 s | 74.1000 s |
| gen-22 impact ticks / unseen resets | 36 / 1 | 0 / 0 | 0 / 0 |
| gen-53 / Kestrel finish | 114.2500 s | 118.8000 s | 114.2500 s |
| gen-53 impact ticks / unseen resets | 1 / 1 | 28 / 2 | 1 / 1 |
| gen-70 / Kestrel finish | 127.7667 s | 134.5833 s | 127.7833 s |
| gen-70 impact ticks / unseen resets | 0 / 0 | 81 / 1 | 0 / 0 |

Gen-53's entire retained detailed trace is identical to current AI, including its
existing sedan collision and first reset. The added taxi collision, second reset
and reversing recovery are gone. Gen-70 is clean, one tick slower than current.
For Cinder gen-22, both the full run and the 60 s fork finish at 74.10 s with no
contact/reset. The fork's prefix-state hash and Rapier snapshot match current AI,
so this preserves the local correction rather than merely retiming the race.

### Completed focused acceptance

[`measurements/raceability-stopping-v2.json`](measurements/raceability-stopping-v2.json)
contains the source hashes, 28 matched comparisons and executed checks:

- Standard Kestrel gen-22, gen-53 and gen-70 on all six gate seeds (18 runs).
- Cinder gen-22 on those six seeds (six runs), all with zero impact ticks,
  resets, reversing recoveries and ground-contact ticks.
- The four v1 follow-ups: Uptown / 1 and / 314159, gen-40 / 0, gen-66 / 271828.

No new physical-contact case or episode, additional contact ticks, reset,
reversing recovery, ground-contact ticks or DNF appears in these comparisons.
Maximum slowdown against current AI is 0.70 s (Uptown / 314159). Gen-66 / 271828
is 0.30 s slower but reduces impact ticks 60 to 26. Uptown / 1 returns to its
current 280.03 s and 106 impact ticks, removing v1's two additional truck contacts
and 8.62 s delay. Gen-40 / 0 returns to its current 79.45 s with no contact.
The five non-target Cinder seeds are unchanged or at most 0.1833 s slower.

Typecheck and script syntax checks passed. The acceptance script verifies source
hashes, exact gen-53 and frozen-v1 gen-70 retained traces, all six Cinder outcomes,
and the matching prefix-state hash and Rapier snapshot of the successful fork.
Production `src/` has no diff. **Initial decision: retain v2 as an experiment;
do not promote it on these focused checks alone.** The full-gate result follows.

The focused runner is `scripts/raceability-stop-regressions.mjs`; acceptance and
evidence saving are `scripts/check-raceability-stop-v2.mjs`. Candidate output is
separate under `artifacts/raceability-stop-v2-local/`. Saved current controls are
accepted only after checking the production source and batch setup hashes. The
old v1 gen-70 trace was also reproduced exactly through the new revision switch.

To reproduce v2's Cinder checks in PowerShell:

```powershell
$env:NS_STOP_EXPERIMENT = '1'
$env:NS_STOP_REVISION = 'v2'
$env:NS_STOP_FORK_TICK = '0'
$env:NS_STOP_LABEL = 'v2-local-six'
$env:NS_STOP_RACES = 'gen-22'
$env:NS_STOP_SEEDS = '0,1000,271828,1,42,314159'
node --import ./scripts/raceability-experiment-loader.mjs --experimental-strip-types --no-warnings scripts/raceability-experiment.ts
# Same-state check: label v2-local-fork, seed 314159, fork tick 3600.
# Detailed Kestrel traces: label v2-local, fork tick 0, gen-53/gen-70, seed 314159.
node scripts/raceability-stop-regressions.mjs
node scripts/check-raceability-stop-v2.mjs
```

For a future full v2 gate, set `NS_STOP_REVISION=v2` and run
`scripts/raceability-full-gate.mjs`, then `scripts/analyze-raceability-gate.mjs`.
That gate is now complete, as recorded below. No production driver revision,
road, reset, cooldown or tuning-ledger number is changed by this refinement.

## Full v2 gate: promotion rejected

Completed 2026-11-10 UTC, using the same 83 courses, six traffic seeds, drawn
rival cars and parked player as the v1 gate. **498 fresh current-AI runs plus
498 fresh v2 runs**, candidate enabled from tick zero. All source hashes stayed
unchanged during the run. Every current-AI row reproduces the prior control
exactly, including census and physical-contact evidence. All 22 standard-car
cases from the focused v2 comparison reproduce their prior measured fields.

Results, source identity and six verified replay outcomes:
[`measurements/raceability-full-gate-v2.json`](measurements/raceability-full-gate-v2.json).
Raw rows, census, audit and standard-format gate summaries are retained under
`artifacts/raceability-full-gate-v2/`. The committed production baseline is intact.

| Metric, all 498 races | Current AI | V2 |
|---|---:|---:|
| DNF | 0 | 0 |
| Total finish time | 46,081.22 s | 46,099.37 s |
| Races with physical contact | 99 | 98 |
| Ticks with physical contact impulse | 3,320 | 2,903 |
| Deduplicated physical onsets | 86 | 84 |
| Approximate contact ticks | 1,762 | 1,299 |
| Approximate distinct incidents | 50 | 50 |
| Resets, ordinary plus unseen | 17 | 17 |
| Reversing recoveries | 1 | 1 |
| Ground-contact ticks | 265 | 265 |

At the gate's 0.01 s precision, 467 finish times are unchanged, 15 improve and
16 worsen. The cap wins in 67 runs. Total time rises 18.15 s. Contact reduction
does not establish acceptance: one new substantial collision remains.

### Blocking case: gen-77 / seed 271828

Current finishes in **81.75 s**, with 40 contact ticks against vehicle #36 early
in the race. V2 finishes in **90.85 s**, with only 24 total contact ticks but a
new collision with **box truck #171 at 50.1667 s / route 1798.11 m**. The first
impulse is **30,069.43**, followed by six further contact ticks. Neither run
resets or reverses. Both variants reproduce independently, including after the
trace capture was corrected to deep-copy nested pass/wheel/wreck state.

The only winning experimental caps are the earlier encounter near route 407 m.
After a smaller collision with #36 and yielding to crossing vehicle #184, v2
arrives roughly four seconds later at the truck. Current AI passes while the
truck is still waiting at its junction; v2 meets it after it starts moving.

The corrected trace shows a committed pass targeting #171, started at tick 2892.
The planner continues to approve 58.218 m/s while the existing emergency
`pass-hold` cap starts braking for the truck. By 50 s the rival is still travelling
46.13 m/s; impact follows at 50.1667 s. V2's footprint cap is inactive during
committed passes. **Fact:** this is a new downstream pass collision in the v2 run.
**Inference:** changed arrival timing exposes a weakness in the unchanged pass
planner/clearance checks. This trace does not isolate the exact defect in that
planner, and no pass behavior was changed to hide the regression.

The original gate's approximate `passContact` remains zero in both variants,
despite this physical collision during a pass. The Rapier measurements and
per-encounter audit are necessary; neither the old counter nor improved total
contact ticks can clear this case.

### Delays and the other flag

- **gen-6 / 271828: +3.02 s.** The earlier #36 encounter improves from 40 to
  17 contact ticks and total impulse 28,443.42 to 19,257.14. Arrival then changes
  at crossing vehicle #184, which the existing crossing rule yields to without
  contact. No reset or reversing recovery. This is a traffic-timing cost.
- **gen-42 / 271828: +9.03 s.** It shares that early improvement, then loses
  more time around route 3490–3550 m to the existing no-side/oncoming rules for
  vehicles #207, #224 and #249. There is no winning experimental cap there, no
  new physical encounter and no reset/reversal. The delay is substantial but
  does not demonstrate a new stopped-car collision.
- **Uptown / 314159: +0.70 s.** The higher post-physics speed flag concerns the
  same one-tick encounter with #203, with impulse reduced from 8534.47 to 1832.65.
  It matches the focused v2 result. Post-impact speed is not closing speed and
  this is not evidence of a harder impact.

The additional audit matches encounters by vehicle and route location within
20 m and flags onset impulses exceeding 1.5 times the matched prior peak plus
500. These are review triggers, not physical severity guarantees. It finds only
the new #171 encounter and no larger matched onsets; standard gate checks also
cover DNF, recovery, ground contact, contact duration and major delay.

### Retention decision and validation

**Do not promote v2.** Keep it opt-in with gen-77 / 271828 as a regression case.
The next targeted investigation is the committed pass of the moving box truck;
no road, reset or cooldown adjustment is justified by this result.

The v1 stopped-car regressions remain removed: gen-53 / 314159 matches current,
gen-70 / 314159 stays clean, and Uptown / 1 matches current. The retained v2
helper and loader hashes also match the successful Cinder gen-22 full run and
identical-state fork (74.10 s, zero contact/reset). That Cinder evidence remains
separate from this standard Kestrel gate.

Validation: 996 completed runs; unchanged source hashes; all 498 fresh controls
reproduced; all 22 focused standard cases reproduced; six detailed replay outcomes
matched; typecheck and diff whitespace checks passed. The new deep-copy capture
was checked with a second gen-77 replay pair, with identical scalar outcomes.
Production `src/` has no diff, and the driver revision and tuning ledger are
unchanged. Save/audit tools: `scripts/audit-raceability-v2-gate.mjs` and
`scripts/save-raceability-v2-gate.mjs`.

## gen-56 read-only cooldown audit

The audit runs at the exact pre-reader state and the reader's normal six-tick
cadence. It calls the normal live reader once. On a copied driver it removes only
the cooldown expiry, then calls the **full existing reader**, with the same car,
traffic, tick and world. It records whether that reader would approve the line
while the rival is still before entry. It never clears the live cooldown or
changes the live decision. Serialized live state is checked around every probe.

The entire audited gen-56 / seed 314159 run has the **same full-run state hash**
as a control without the loader, not merely the same finish time.

| Bend / window | Pre-entry cooldown probes | Fresh reader approvals |
|---|---:|---:|
| Main hotspot, 2340–2498 m | 26 | **0** |
| Main hotspot, 2574–2716 m | 17 | **0** |

At those opportunities, removing the cooldown still does not obtain clearance.
The later late-join rejection is real, but the audit finds no earlier safe
approval suppressed solely by the timer at these two bends. This supports
retaining both the cooldown and the late-join guard; it does not support loosening
traffic forecast margins to recover their lost time.

There is a stale hold at the earlier corner window 1124–1366 m: the copied reader
approves at 11 sampled times, 27.4–28.4 s / route 1004–1059 m, while the live
cooldown has 1.1–0.1 seconds left. This is not the central hotspot. Later traffic
refuses that corner again, so this audit does **not** establish a net time saving
from taking the earlier opportunity. Seeds 0 and 42 show no fresh pre-entry
approvals during their checked cooldowns.

## Reproduce

Run from the repository root in PowerShell. The environment options below apply
only to these processes. The script writes JSON under
`artifacts/raceability-experiment/`; labels keep comparisons separate.

```powershell
# Current behaviour plus the read-only audit.
$env:NS_STOP_REVISION = 'v1' # Historical scoped comparison in this section.
$env:NS_STOP_LABEL = 'current'
$env:NS_STOP_RACES = 'gen-30,gen-22,gen-56'
$env:NS_STOP_SEEDS = '0,42,314159'
Remove-Item Env:NS_STOP_EXPERIMENT -ErrorAction SilentlyContinue
node --import ./scripts/raceability-experiment-loader.mjs --experimental-strip-types --no-warnings scripts/raceability-experiment.ts

# Same cases with the candidate enabled from race start.
$env:NS_STOP_EXPERIMENT = '1'
$env:NS_STOP_FORK_TICK = '0'
$env:NS_STOP_LABEL = 'swept-full'
node --import ./scripts/raceability-experiment-loader.mjs --experimental-strip-types --no-warnings scripts/raceability-experiment.ts

# For the initial same-state fork, use NS_STOP_FORK_TICK='3600',
# NS_STOP_RACES='gen-22', NS_STOP_SEEDS='314159', with a separate label.
# For the remaining gen-22 seeds, use NS_STOP_SEEDS='1000,271828,1'.
```

Validation: typecheck passed; both prefix-state and physics-snapshot assertions
passed; all 12 paired outcomes were checked; the read-only audit matched the
control's full state hash. `git diff -- src` is empty. The existing reset and road
implementations were neither patched on disk nor replaced by the loader.
