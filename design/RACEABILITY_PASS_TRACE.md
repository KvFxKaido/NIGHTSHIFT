# gen-77 / traffic seed 271828: box-truck pass approval

> **Not acted on, 2026-11-10 (Shawn): the pass is left alone until the rival in traffic is reopened.** The probe
> loaders and scripts named below are on the branch `codex/raceability-stopping-experiment`, not on `main`, and the
> collision exists only with stopping v2 loaded, which is there too.
>
> Read this beside what the pass already carries, which the trace does not mention. A car off its pass's path is
> an old failure: gen-46, 91 mph into a sedan from 2.2 m off the path, "the pass began from where she was headed,
> not where she was" (`PORT_ALDER.md`, "What is left of the brake"), and `PASS_ASTRAY` (1 m, `rival.ts`) is the
> guard it produced: past it the emergency check looks `15 + 1.6 v` ahead instead of `length + 0.45 v`. In the
> table below the error passes 1 m between planner ticks 2928 and 2952, about 49.0 s, and `pass-hold` starts
> braking at about 49.5 s. **Inference, not traced:** the existing guard fired here and was too late at 103 mph,
> which makes this the second case of gen-46's failure rather than a new one. Whoever reopens it should start by
> confirming that, and from the frames already measured for that check (`CLAUDE.md`, the trap beginning "A committed
> pass is clear of a car that is ON its path"): read against the pass path plus its error, the car sat on the
> passed car's side through every pull-out. The envelope recommended below is a neighbour of that frame.

Read-only investigation, 2026-11-09. Standard drawn Kestrel, parked player,
stopping v2 enabled from tick zero. No production behavior changed. v2 remains
opt-in and its full-gate promotion remains rejected.

## Finding

The pass evaluator certifies an ideal path, then keeps certifying it after the
real car no longer tracks within its 0.55 m allowance. This is a validation bug,
not evidence that traffic caution or cooldowns should be relaxed.

At planner tick 2892 (48.2 s), the lane candidate is occupied. Both passing
candidates are clear in the evaluator: offset -0.085723 m at 58.218 m/s,
predicted evaluation time 5.731 s; offset +6.638369 m at 48.008 m/s,
6.849 s. It chooses the faster negative-offset path, starting from 1.45625 m,
with 81.505 m to pull out. These are evaluator traversal times, not race times.

`evaluatePass` constructs every footprint from `passingPoint`, including its
first footprint. It reads actual speed but does not anchor the trajectory to
actual x/z, heading or lateral velocity. Every 12-tick recheck through tick 3000
still returns clear and 58.218 m/s. There is no stale-read explanation here.

Exact pre-decision lateral errors relative to the planned path:

| Planner tick | Error toward truck | Evaluator |
|---|---:|---|
| 2892 | -0.346 m | clear |
| 2916 | 0.289 m | clear |
| 2928 | 0.602 m | clear |
| 2952 | 1.214 m | clear |
| 2976 | 1.711 m | clear |
| 3000 | 1.868 m | clear |

At race tick 3010 (50.1667 s), the real footprint overlaps truck 171; the ideal
footprint at that station does not. Rapier reports a 30,069.43 impulse and seven
contact ticks in this encounter. The 17.254 m/s speed at the impact row is AFTER
physics, not the approach speed; it was still 46.134 m/s at race tick 3000.
Planner snapshots are pre-step; scene rows are post-step and their `along` was
calculated before that step. Do not mix those two frames for exact error values.

The separate `pass-hold` emergency check starts braking around 49.5 s, while
the planner still approves full speed. Its intervention is too late in this
replay. The stopping experiment itself is inactive during committed passes.

## What is and is not responsible

- The truck forecast already includes both holding speed and acceleration,
  checked with quarter-second timing slack. At admission the accelerating
  forecast is within about 0.203 m of the nearest corresponding saved truck
  pose around the future encounter; at the last pre-impact recheck, 0.027 m.
  Those comparisons have scene-sampling uncertainty. Missing acceleration is
  not the explanation supported by this trace.
- Steering telemetry shows the pass requests a steering response and gets
  nonzero curvature feedforward. The actual car nevertheless remains on the
  truck side of the path. Chord compensation uses a constant aim offset,
  whereas the passing path changes offset; that is a separate execution
  inconsistency worth testing, not a proven one-line cure for this collision.
- v2 changes an earlier encounter and consequently the arrival time. Current
  AI passes the truck while it is waiting; v2 meets it moving. Current finishes
  in 81.75 s, v2 in 90.85 s. Earlier contact also changes, so the entire 9.10 s
  difference must not be attributed to this truck alone.

## Smallest recommended experiment

Keep the pass shapes, side selection and timing constants. Make pass admission
and revalidation conditional on an actual-state footprint envelope: start from
the measured position/heading and account for lateral motion relative to the
pass path, rather than granting immediate ideal tracking. When that envelope
is occupied, use the existing occupied-plan speed response and keep the chosen
side. A tracking failure must not be mistaken for a blocked return that can
be cured by extending the pass beyond the target.

Start with this narrow validator experiment, not a global margin increase,
blanket truck ban, cooldown edit or steering retune. The short-horizon envelope
must not assume instant lateral recovery or instant braking; its recovery
model is the implementation detail that still needs validation.

A deliberately simple OFFLINE counterfactual adds the current lateral error
to a second footprint check, alongside the original ideal one, retaining the
same forecasts and arrival-time calculation. It first rejects at tick 2928:
occupied at 79.882 m / 1.372 s. Later rechecks also reject. This isolates the
missing actual-state check; it is not a validated envelope or a simulated fix.
It leaves initial approval clear, does not project lateral error growth, and
does not prove the existing brake can avoid the hit. A mere late error
threshold is therefore insufficient as a claimed solution.

Before keeping any implementation: replay this exact case, preserve gen-22's
improvement, test gen-53/gen-70 and the previous Uptown regression, then repeat
the full 498-pair gate against current AI and inspect new physical encounters.

## Evidence and reproduction

`artifacts/raceability-pass-probe/` holds exact evaluator inputs/results,
steering terms, geometric analysis, counterfactual results and the audit.
`scripts/raceability-pass-probe-loader.mjs` only observes decisions; the separate
envelope loader is for offline captured-call analysis, never installed in the
sim. Instrumented and original replays match exactly, including all 1,003 saved
rows. All 193 checked production/experiment sources match full-gate hashes.

```powershell
$env:NS_STOP_EXPERIMENT='1'
$env:NS_STOP_REVISION='v2'
$env:NS_STOP_FORK_TICK='0'
node --import ./scripts/raceability-experiment-loader.mjs --import ./scripts/raceability-pass-probe-loader.mjs --experimental-strip-types --no-warnings scripts/raceability-gate-case.ts --race=gen-77 --seed=271828 --label=pass-probe
node --experimental-strip-types --no-warnings scripts/analyze-pass-probe.ts
node --import ./scripts/raceability-pass-envelope-loader.mjs --experimental-strip-types --no-warnings scripts/raceability-pass-envelope.ts
node scripts/audit-raceability-pass-probe.mjs
```

`pnpm typecheck` passed. Roads, resets, cooldowns, steering and pass logic on
disk are unchanged.
