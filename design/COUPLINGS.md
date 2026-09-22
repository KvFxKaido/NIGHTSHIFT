# Couplings

What a change in one layer of the sim moves in another, and what each number the
game runs on was measured on. Started 2026-09-22, after the traffic seed showed
that every rival gate had been measured on one traffic layout, and a look back
showed the lane corner speed (0.80) had been set on traffic that teleported cars
at turns and steering that asked for a third of the wheel.

Two parts. The map says who reads each layer, what names it, and what to re-run
when it changes. The ledger says what each live number was measured on, and
whether anything under it has changed since.

**The rule.** Changing a layer: find its row in the map, and mark every ledger
entry measured on it **suspect**, with the date and what changed. Re-measuring:
update the entry (how, on what, when) and mark it **current**. A new tuned number
gets an entry when it lands. The ledger is a snapshot of what was live on
2026-09-22, not a history; older changes are in `git log` and `FIELD_NOTES.md`.

## The map

| Layer | Where | Named by | Read by | Re-run when it changes |
|---|---|---|---|---|
| Tyres and `HANDLING` | `sim.ts` | `PHYSICS_VERSION` | every car; the car cards; the rival's steering, whose feedforward restates the tyres (`steadyWheelAngleFor`); every rival corner share, which is a share of a car's grip; the pace model, fitted from driven laps | `pnpm cars`, `pnpm golden`, the steady-turn test in `rival-racing.test.ts`, the 83-race batch |
| A car's tune | `car-handling.ts` | `CarTune.revision`, and the rival's name through it | that car's card and garage bars (`car-stats.json`); the rival in it, which plans corners by its grip (`handlingFor`) | `pnpm cars` (with `--laps --streets`), `pnpm cars:stats`, batch races in that car |
| The pedal assist default | `pedal-assist.ts` | the lap's `pedalAssist` | the player's pace; anything fitted to the player's laps (the pace model); Shawn's verdicts | a human, driving |
| World, solids, paving | `alder*.ts`, `district.ts` | the world id chain (`ALDER_DATA.version`); paving has no token of its own (`CHAOS.md`) | street lines, which cut corners only over `alderDrivable` ground; the 2WD grass penalty; the rival's lost and ground checks; the generator's map; every recording | the batch, the generator fingerprints, `pnpm laps --verify` |
| Lanes | `lanes.ts` | inside `TRAFFIC_REVISION` when traffic moves | traffic's reservation spans (a lane's length is part of both junctions'); the rival's lane rest | `pnpm traffic:soak`, the batch |
| How traffic drives | `traffic.ts` | `TRAFFIC_REVISION` | the rival's hazard loop, pass planner and street-line reader (the forecast); the indicators; every race in traffic | `pnpm traffic:soak` on several seeds, the batch on several seeds (`TRAFFIC_SEED`), `pnpm laps --verify` |
| Which traffic | `createTraffic`'s seed | a session's `trafficSeed` | everything measured in traffic: a number measured at seed 0 alone is a number about one layout | the same, on seeds other than 0 |
| The rival driver | `rival.ts` | `RIVAL_REVISIONS.driver` and its tables | every rival race; **the car cards' street pace and AI laps**, which are the rival's planner driving each car (`pnpm cars --streets`, `--laps`), so the ladder the cars were tuned against moves with the driver | the batch, `pnpm cars --laps --streets`, the rival tests |
| Street lines | `street-line.ts`, `racing-line.ts` | `RIVAL_REVISIONS.streetLine`, the drawn line's fingerprint | generated races and Uptown in traffic; Uptown / Clear and Ridge Circuit draw their own lines (`racing-line.ts`) | the batch; the Uptown / Clear pace test |
| Committed passes | `traffic-pass.ts` | `RIVAL_REVISIONS.pass` | the same races | the batch |
| The generator, route choice, `PACE` | `race-generator.ts`, `route-choice.ts` | `GENERATOR_REVISIONS` | which races exist; stored career courses; **the batch itself**, whose 82 generated races are generator draws, so a generator change changes what the batch runs and a before/after comparison across it compares different races | the generator fingerprints; a fresh batch baseline |

## The ledger

As of 2026-09-22: `four-wheel-v6`, `traffic-v7` with seeds, `driver-v2`,
`street-line-v1`, `pass-v1`.

| Number | Where | Set | Measured on | Changed under it since | Status |
|---|---|---|---|---|---|
| Lane corner share 0.80 | `RIVAL_CORNERING` | 09-19 (`6f6ccc9`) | eight races clear and in `traffic-v5`, which could move a turning car 15 m in a tick; a bend-width test with steering that asked only for a turn's geometry | curved traffic corners (`traffic-v6`, 09-20); the slip feedforward (09-21, 8 m wide to 1.7 m on a fast bend); traffic seeds | **suspect**: "past about 0.8 its tracking is the limit" was measured with the old steering |
| Ridge line share 0.76 | `RIVAL_BRAKING` | 09-13 (`eaf7b95`) | Ridge Circuit laps, no traffic; its grass margins swept 0.76 to 0.86 on 09-19 (`6f6ccc9`) | the slip feedforward (Ridge laps 0.15 s quicker, one bend 7.12 m out) | **suspect**: margins not re-swept |
| Street line share 0.88 | `RIVAL_STREET_LINE` | 09-20 (Shawn, raced) | Uptown / Clear | the slip feedforward | **holding**: the pinned pace test (82 to 84 s) passes at `driver-v2`; the grass ceiling is not re-swept |
| Per-name shares 0.84 to 0.975 | `BLACKLIST_CORNERING` | 09-20 (`40cbf00`) | clear Uptown laps in each name's car; the Reign on grass at 0.99, the Vesper clean to 1.00 | the slip feedforward | **holding**: the three highest names' driven-lap test passes at `driver-v2`; the limits are not re-swept |
| Launch skills | `BLACKLIST_LAUNCH`, `RIVAL_LAUNCH_SKILL` | 09-16 | the launch's own arithmetic, from the grid | nothing it reads | **current** |
| Feedforward 0.8, lead 0.3 | `RIVAL_STEERING` | 09-13 | swept 0.6 to 0.9 on Ridge's full line, with the geometry term alone | the slip term (09-21) | **suspect**: the sweep predates the slip term |
| Slip term 1; traffic frame; `PASS_ASTRAY`; the will-be check | `RIVAL_STEERING`, `RIVAL_TRAFFIC_FRAME`, `RIVAL_RACING` | 09-21 and 09-22 | the batch at traffic seed 0, and Shawn's recorded races | traffic seeds | **suspect on seeds**: gated at seed 0 only |
| Street line windows (`bendFrom` 12, `worth` 0.1, reach 60) and the pass planner | `STREET_LINE`, `TRAFFIC_PASS` | 09-20 and 09-21 | the batch at traffic seed 0 | traffic seeds: contact on a line and in a pass at seed 271828 | **suspect on seeds** |
| Traffic's reservation rules | `stepTraffic` | 09-20 | ten-minute soaks at seed 0 | traffic seeds: starvation to 396 s | **suspect** (`measurements/traffic-seeds.json`) |
| Traffic density, one per 900 m | `TRAFFIC_SPACING` | 09-09, the retired district | not traced | a whole new map | **unknown** |
| The ladder: street pace climbs the list | `CAR_TUNES` (`HANDLING.md`, "The ladder pass") | 09-19 | `pnpm cars --streets`: the rival's planner driving each car through six fixed generated sprints, clear for the pace and in traffic for incidents | the slip term; for the incidents, curved traffic corners and seeds; and a generator change redraws the six sprints | **suspect**: the order was measured by a driver that has since changed |
| Car cards without AI laps (0 to 60, top speed, grip, slide) | `car-card.ts`, `car-stats.json` | 09-19 | `pnpm cars` on `four-wheel-v6` | nothing it reads; the fingerprint test guards each tune | **current** |
| Route-choice pace (114 mph top, 2.5 s per right angle) | `PACE` | 09-15 (`61de175`) | Shawn's recorded Uptown laps, driven on the pedal clamp | no pedal assist by default (09-20) | **suspect, low stakes**: re-fitting redraws most seeds (every `GENERATOR_REVISIONS` entry) |
| The 83-race batch baseline | `measurements/driver-v2.json` | 09-22 | seed 0, `traffic-v7`, `driver-v2` | nothing | **current** as a seed 0 baseline; not a claim about the rival across traffic |
| Out-of-sight recovery, 2.5 s beyond 120 m | `UNSEEN_RECOVERY` | 09-13 (Shawn) | a rule, not a measurement | nothing | **current** |
