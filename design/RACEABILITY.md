# Port Alder reference races

Read-only diagnosis, 2026-11-09. No roads, traffic rules, handling, generator or AI
behaviour changed. These are reference measurements, not new authored race entries.

The subsequent [tick-level investigation](RACEABILITY_TRACES.md) identifies the
causes: a turning sedan hits the stopped rival on gen-22, followed by the progress
fallback; denied bend lines and late-entry protection slow gen-56. Rapier puts the
first gen-22 impact at 65.183 s, earlier than the approximate marker below.

## Open the map

`artifacts/raceability/index.html` is a self-contained interactive report. Open it
in a browser, or serve the directory locally. It has course and traffic-seed
selectors, pan/zoom, per-stretch time differences, braking, speed, approximate
traffic contact, ground contact, slowdown episodes and scene reproduction commands.
Grey means untested. Selecting a stretch shows its nearest street name and route
distance; separate directed route positions are never merged into a street average.

Rebuild the HTML from the saved measurements without running physics:

```powershell
pnpm rival:map --render --input=design/measurements/raceability-reference.json
```

Collect a fresh reference set (one clear run and three traffic seeds per course):

```powershell
pnpm rival:map
pnpm rival:map --seeds=0,1000,271828,1,42,314159 --output=artifacts/raceability-six-seeds
pnpm rival:map --races=gen-30,gen-22,gen-56,gen-39,gen-24 --output=artifacts/raceability-survey
pnpm rival:catalog
```

The catalog ranks the existing 82 batch sprints by absolute heading change per
kilometre, expressed as equivalent right-angle turns. This is geometry, not an AI
performance score. It does not change checkpoint placement or generated courses.

## The three references

All times below are seconds, using **Cinder RWD** for the rival, with the player
parked as in the existing gate. Traffic density and driving rules are unchanged.
Each route has one traffic-free control and seeds 0, 42 and 314159. Both conditions
carry the same street line; this is not the separate Uptown / Clear mode.

| Role | Course | Route length* | Clear | Seed 0 | Seed 42 | Seed 314159 |
|---|---|---:|---:|---:|---:|---:|
| High-speed | `gen-30` | 2.244 km | 44.55 | 45.10 | 47.97 | 44.25 |
| Technical | `gen-22` | 2.623 km | 68.12 | 72.10 | 71.05 | 76.07 |
| Traffic stress | `gen-56` | 4.194 km | 84.92 | 87.70 | 85.35 | 93.37 |

*The rival's route extends beyond the final checkpoint. Its unvisited tail remains
grey even on a completed race. The map marks the checkpoint as the finish.

`gen-30` has the lowest turn density of the 82 candidates (0.869 equivalent
right-angle turns/km), and `gen-22` the highest (3.768). The traffic-stress choice
followed fresh simulation of `gen-56`, `gen-39` and `gen-24`, rather than assuming a
historical incident still occurs. The latter two finished all four runs without
approximate traffic contact; gen-39 / seed 42 had one out-of-sight reset. Their traffic ranges were 109.35–113.40 s against 106.32 s
clear, and 126.75–130.95 s against 124.12 s clear, respectively. The complete local
survey is retained in `artifacts/raceability-survey/data.json`.

These three overlap near the common grid. They are focused reference routes,
not representative coverage of every district, an AI ranking, or a human pace gate.
“Traffic stress” means observed sensitivity at normal density, not added traffic.

## Places to inspect first

1. **Alaskan Way, `gen-22`, seed 314159, route 2200–2250 m.** This 50 m bin takes
   6.07 s longer than its clear counterpart. The approximate contact event is at
   2221 m / 66.2 s, near (-582.71, -711.38). The whole run is 7.95 s slower and
   has one out-of-sight reset, with no ordinary reset or reversing recovery. This is a localized observation,
   not proof that Alaskan Way's geometry is defective.
2. **Alder Service Road into Jackson East, `gen-56`, seed 314159, roughly
   2350–2700 m.** Several of the largest bin differences occur here. The whole
   run is 8.45 s slower, without approximate contact, while the census reports
   only 0.37 s below the rival's own plan. The current evidence does not establish
   the cause; line availability and downstream speed recovery need a trace.
3. **Yesler Way, `gen-30`, seed 42, route 1150–1200 m.** The largest local
   increase is 1.20 s; the complete run is 3.42 s slower. On seed 314159 the
   race is instead 0.30 s faster than clear. Signed differences matter.

For example:

```powershell
pnpm rival:scene gen-22 --car=cinder --seed=314159 --from=2050 --to=2300
pnpm rival:scene gen-56 --car=cinder --seed=314159 --from=2300 --to=2750
```

The added `--car` option is diagnostic only. Without it the existing scene/batch
keeps the drawn rival's car (these unnamed generated races currently draw a Kestrel,
despite the old batch comment saying Cinder). The map ignores environment tuning
knobs; use a shell without PLAN/REACH/BEND/BENDTANGENT/WORTH/SLIP/FOLLOW/FRAME
overrides when reproducing its observations with the original tools.

## Measurement limits and provenance

- 50 m bins follow the rival's directed route coordinate. They are not junction
  movement IDs; opposite approaches and repeated course positions remain separate.
  Street names are nearest-centreline labels, which can be ambiguous at a junction.
- Entries count visits, not successful traversals. Stationary and recovery time
  remains in the occupied bin. Unvisited bins and timed-out runs are not healthy
  samples. The 330 s timeout is the existing batch's limit.
- Census loss retains `rival-slowdowns.ts`'s definition: time below its own corner
  plan during a qualifying non-corner hold and recovery. It cannot identify an
  inherently slow corner plan, and it is not the measured traffic/clear difference.
- Contact uses the original batch's approximate box-overlap heuristic, not a
  physics collision impulse. Reset and reversing-recovery events are separate.
- No clean run here certifies the driver when racing a human, shortcut parity,
  every traffic seed, or cross-runtime determinism. No 6% player-relative target
  was adopted.
- The saved JSON includes source hash, commit, world/physics/traffic identities,
  runtime, per-course rival identity and a route/checkpoint fingerprint. Compare
  identities before comparing a future run: an unchanged generated id alone is
  insufficient. Rendering uses the saved street geometry, not the current map.

Validation: 20 candidate runs completed; `pnpm test` passed 842/842; `pnpm build`
passed. The map's `gen-30` / seed 0 result matches the original batch with
`--car=cinder`: exact finish time, every census episode field, approximate contact
ticks and reset count. Browser checks exercised course/seed/metric selection,
episode details and fit/city controls. These checks do not constitute pad testing.
