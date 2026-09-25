# Couplings

What a change in one layer of the sim moves in another, and what each number the
game runs on was measured on. Started 2026-09-22, after the traffic seed showed
that every rival gate had been measured on one traffic layout, and a look back
showed the lane corner speed (0.80) had been set on traffic that teleported cars
at turns and steering that asked for a third of the wheel.

Three parts. The map says who reads each layer, what names it, and what to re-run
when it changes. The ledger says what each live number was measured on, and
whether anything under it has changed since. The last says what was ruled out, and on
what, since a rejection goes stale the same way.

**The rule.** Changing a layer: find its row in the map, and mark every ledger
entry measured on it **suspect**, with the date and what changed. Re-measuring:
update the entry (how, on what, when) and mark it **current**. A new tuned number
gets an entry when it lands. The ledger is a snapshot of what was live on
2026-09-22, not a history; older changes are in `git log` and `FIELD_NOTES.md`.

## The map

| Layer | Where | Named by | Read by | Re-run when it changes |
|---|---|---|---|---|
| Tyres and `HANDLING` | `sim.ts` | `PHYSICS_VERSION` | every car; the car cards; the rival's steering, whose feedforward restates the tyres (`steadyWheelAngleFor`); every rival corner share, which is a share of a car's grip; the pace model, fitted from driven laps | `pnpm cars`, `pnpm golden`, the steady-turn test in `rival-racing.test.ts`, `pnpm rival:gate` |
| A car's tune | `car-handling.ts` | `CarTune.revision`, and the rival's name through it | that car's card and garage bars (`car-stats.json`); the rival in it, which plans corners by its grip (`handlingFor`) | `pnpm cars` (with `--laps --streets`), `pnpm cars:stats`, gate races in that car |
| The pedal assist default | `pedal-assist.ts` | the lap's `pedalAssist` | the player's pace; anything fitted to the player's laps (the pace model); Shawn's verdicts | a human, driving |
| World, solids, paving | `alder*.ts`, `district.ts` | the world id chain (`ALDER_DATA.version`); paving has no token of its own (`CHAOS.md`) | street lines, which cut corners only over `alderDrivable` ground; the 2WD grass penalty; the rival's lost and ground checks; the generator's map; every recording | `pnpm rival:gate`, the generator fingerprints, `pnpm laps --verify` |
| Lanes | `lanes.ts` | inside `TRAFFIC_REVISION` when traffic moves | traffic's reservation spans (a lane's length is part of both junctions'); the rival's lane rest | `pnpm traffic:soak`, `pnpm rival:gate` |
| How traffic drives | `traffic.ts` | `TRAFFIC_REVISION` | the rival's hazard loop, pass planner and street-line reader (the forecast); the indicators; every race in traffic; since `traffic-v9` every racer's contact with it (masses, `TRAFFIC_KNOCK`) | `pnpm traffic:soak` on several seeds, `pnpm rival:gate` (six seeds), `pnpm laps --verify` |
| The junctions' dressing | `intersection-dressing.ts` | inside `TRAFFIC_REVISION` since `traffic-v10` | the signals and signs drawn; since v10 where traffic stops (a red or a stop sign is a bar a car stands at, amber is priority) and so everything traffic moves | `pnpm traffic:soak`, `pnpm rival:gate`, `tests/traffic-stop.test.ts` |
| Which traffic | `createTraffic`'s seed | a session's `trafficSeed` | everything measured in traffic: a number measured at seed 0 alone is a number about one layout | the same, on seeds other than 0 |
| The rival driver | `rival.ts` | `RIVAL_REVISIONS.driver` and its tables | every rival race; **the car cards' street pace and AI laps**, which are the rival's planner driving each car (`pnpm cars --streets`, `--laps`), so the ladder the cars were tuned against moves with the driver | `pnpm rival:gate`, `pnpm cars --laps --streets`, the rival tests |
| Street lines | `street-line.ts`, `racing-line.ts` | `RIVAL_REVISIONS.streetLine`, the drawn line's fingerprint | generated races and Uptown in traffic; Uptown / Clear and Ridge Circuit draw their own lines (`racing-line.ts`) | `pnpm rival:gate`; the Uptown / Clear pace test |
| Committed passes | `traffic-pass.ts` | `RIVAL_REVISIONS.pass` | the same races | `pnpm rival:gate` |
| The generator, route choice, `PACE` | `race-generator.ts`, `route-choice.ts` | `GENERATOR_REVISIONS` | which races exist; stored career courses; **the batch itself**, whose 82 generated races are generator draws, so a generator change changes what the batch runs and a before/after comparison across it compares different races | the generator fingerprints; a fresh `pnpm rival:gate --save` |

## Wharf arena world change — 2026-09-23

`drift-yard-v4` replaces the old fence with a colliding shell and shifts Sable's
course/props 100 m south. All earlier **world-dependent** measurements below
are suspect on this world revision: Ridge and street-line shares, per-name
shares, steering sweeps, pass/window gates, street car-card pace, route-choice
calibration, rival-gate totals, and recorded-race contact/recovery results.
Their older statuses describe their measured worlds, not a fresh arena gate.
Tyre/tune bench fixtures, isolated lane fixtures, traffic-only reservation
fixtures and authored distance rules are unchanged. Existing recordings carry
a different world identity and must not be treated as comparable new-world laps.

Re-measured here: both entrances and perimeter collision using real cars;
Sable's complete event in FWD/RWD/AWD, including repeat RWD determinism; matching
visual/collision triangles and retained-prop clearance. The six-seed rival gate
and stored-lap verification have not been rerun for this scenery change.
All six generated-course fingerprints were re-measured unchanged: Sable's
street territory keeps its established anchor independently of the drift grid.

## The ledger

As of 2026-09-24: `four-wheel-v6`, `traffic-v11` with seeds (stop and dwell at 144 dressed junctions, `design/INTERSECTIONS.md`), `driver-v5`,
`street-line-v3`, `pass-v3`, on `alder-slice-v8` (the shoulders, `design/ROAD_EDGES.md`, and Spruce Cut).

| Number | Where | Set | Measured on | Changed under it since | Status |
|---|---|---|---|---|---|
| Lane corner share 0.80 | `RIVAL_CORNERING` | 09-19 (`6f6ccc9`) | eight races clear and in `traffic-v5`, which could move a turning car 15 m in a tick; a bend-width test with steering that asked only for a turn's geometry | curved traffic corners (`traffic-v6`, 09-20); the slip feedforward (09-21, 8 m wide to 1.7 m on a fast bend); traffic seeds; claims reckoned as driven (`traffic-v8`) | **current** (re-measured 09-23, `RIVAL_CORNERING`'s note): with the slip term the 35 degree test bend is 0.96 m wide at 0.80 and 1.26 at 0.92 in the shared FWD fixture, but in the names' own cars a fast gentle bend at top speed is the limit, at full lock: the Reign 1.45 m at 0.80, 3.25 at 0.84, 6.10 at 0.86; the Vesper 2.33 at 0.80. It is the lock at speed as much as nerve. Junction arcs not re-swept |
| Ridge line share 0.76 | `RIVAL_BRAKING` | 09-13 (`eaf7b95`) | Ridge Circuit laps, no traffic; its grass margins swept 0.76 to 0.86 on 09-19 (`6f6ccc9`) | the slip feedforward (Ridge laps 0.15 s quicker, one bend 7.12 m out) | **suspect**: margins not re-swept |
| Street line share 0.88 | `RIVAL_STREET_LINE` | 09-20 (Shawn, raced) | Uptown / Clear | the slip feedforward | **holding**: the pinned pace test (82 to 84 s) passes at `driver-v2`; the grass ceiling is not re-swept |
| Per-name shares 0.84 to 0.975 | `BLACKLIST_CORNERING` | 09-20 (`40cbf00`) | clear Uptown laps in each name's car; the Reign on grass at 0.99, the Vesper clean to 1.00 | the slip feedforward | **holding**: the three highest names' driven-lap test passes at `driver-v2`; the limits are not re-swept |
| Launch skills | `BLACKLIST_LAUNCH`, `RIVAL_LAUNCH_SKILL` | 09-16 | the launch's own arithmetic, from the grid | nothing it reads | **current** |
| Feedforward 0.8, lead 0.3 | `RIVAL_STEERING` | 09-13 | swept 0.6 to 0.9 on Ridge's full line, with the geometry term alone | the slip term (09-21) | **suspect**: the sweep predates the slip term |
| Slip term 1; traffic frame; `PASS_ASTRAY`; the will-be check | `RIVAL_STEERING`, `RIVAL_TRAFFIC_FRAME`, `RIVAL_RACING` | 09-21 and 09-22 | the batch at traffic seed 0, and Shawn's recorded races | traffic seeds; `traffic-v8` | **suspect on seeds**: gated at seed 0 only. The six-seed gate (`pnpm rival:gate`) is what re-sweeps them |
| Street line windows (`bendFrom` 12, `worth` 0.1, reach 60; since 09-23 a bend's arc, `bendTangent` 150, `bendRejoin` 40, joined only where it leaves the lane) and the pass planner | `STREET_LINE`, `TRAFFIC_PASS` | 09-20 and 09-21; arcs 09-23 (`street-line-v2`) | the batch at traffic seed 0; the arcs on the six-seed gate (contact on a line 30 ticks to 21, in a pass 27 to 14) | traffic seeds: contact on a line and in a pass at seed 271828 (the line's from 18 ticks to 4 at `traffic-v8`, the pass's unmoved at 27) | **suspect on seeds** |
| Traffic's reservation rules | `stepTraffic` | 09-20 | ten-minute soaks at seed 0 | traffic seeds: starvation to 396 s; stop and dwell (`traffic-v10`, 09-24) | **suspect** (`measurements/traffic-seeds.json`). `traffic-v8` changed only how a claim near a racer reckons its hold. Re-soaked at twelve seeds for v10 (`measurements/stop-and-dwell.json`): standing over a minute 150 to 100, still standing 31 to 18, longest 427 to 352 s. Every car still standing, before and after, is in one undressed cluster at (-650, -1080), a chain holder unable to move with a queue behind: the starvation is that cluster's, and not fixed. v11 (31 more junctions dressed, some in that cluster): level, 100 to 108, 18 to 22, 352 to 313 s, still all the cluster, some of it now waiting at bars (`measurements/junction-dressing.json`) |
| Stop dwell 0.8 s; at the bar within 1.5 m, standing under 0.3 m/s | `STOP_DWELL`, `AT_BAR`, `STANDING` (`traffic.ts`) | 09-24 (Shawn: a full stop, which reads) | a rule, bounded by measurement: 867 stop-lane claims at seed 0 in three minutes, none early; median stand 0.8 s, p90 5.1 s | nothing | **current**. Not felt at the pad yet |
| Traffic density, one per 900 m | `TRAFFIC_SPACING` | 09-09, the retired district | not traced | a whole new map | **unknown** |
| The ladder: street pace climbs the list | `CAR_TUNES` (`HANDLING.md`, "The ladder pass") | 09-19 | `pnpm cars --streets` at `driver-v2`, 09-22 (`HANDLING.md`, "Re-measured"): the same six sprints, clear | a generator change redraws the six sprints | **current**: the order holds, every car within 0.31 points of 09-19. The traffic column is `traffic-v7` at seed 0 |
| Car cards without AI laps (0 to 60, top speed, grip, slide) | `car-card.ts`, `car-stats.json` | 09-19 | `pnpm cars` on `four-wheel-v6` | nothing it reads; the fingerprint test guards each tune | **current** |
| Route-choice pace (114 mph top, 2.5 s per right angle) | `PACE` | 09-15 (`61de175`) | Shawn's recorded Uptown laps, driven on the pedal clamp | no pedal assist by default (09-20) | **suspect, low stakes**: re-fitting redraws most seeds (every `GENERATOR_REVISIONS` entry) |
| The rival gate's baseline | `measurements/rival-gate.json` | 09-24 | the 83-race batch at six traffic seeds (0, 1000, 271828, 1, 42, 314159), `traffic-v11`, `driver-v5`, `street-line-v3`, `pass-v3`, on `alder-slice-v8` (Spruce Cut), whose seeds draw other courses than v7's | nothing | **current**; re-saved by the change that moves it (`pnpm rival:gate --save`). Against v9 (v10): contact 4,869 to 1,515 ticks, resets 35 to 22, distinct incidents 50 to 52; v10 to v11: claimed crossings 8 to 3, distinct incidents 52 to 55, rear-ends 12 to 22. Incidents by kind are in `measurements/stop-and-dwell.json` and `junction-dressing.json`. Its contact counts were built for traffic that was a wall; since v9 contact continues, so read its outcomes (time, resets, finishing, off the pavement). `driver-v2.json` is the seed 0 batch at `traffic-v7`, kept |
| What a hit on traffic costs: masses (sedan 900 kg to van 1,500, the box truck none) and `TRAFFIC_KNOCK` (knock at 1.2 m/s or 0.35 rad/s, a wreck braked at 4 m/s², back 2 s after rest out of sight), collider friction 0.15 | `TRAFFIC_KINDS`, `sim.ts` | 09-23 (Shawn: the MC3 feel) | the one-tick cost of a hit 12 m/s faster (sedan 4.1 m/s, the wall 9.4); a sedan clipped on a corner turning 29 degrees; the six-seed gate | nothing | **current by feel**: Shawn drove it on 2026-09-23, "This feels great"; glancing hits fine, a head-on clip could be stiffer (left for now). Tuned at the pad if it proves too easy |
| How long a junction claim reckons it will hold (`clearingTime`) | `traffic.ts` | 09-22 | 5,300 claims, traffic alone, seeds 0, 42, 271828: held / reckoned median 0.94 to 0.95 by seed, p10 to p90 0.85 to 1.00, none held 2 s past it (the old reckoning: 1.36 to 1.40, 0.63 to 1.74, a third of them) | stop and dwell (`traffic-v10`): a claim from a stop lane is made from standing at a bar that may be 40 m back | **current** (re-measured 09-24, traffic alone five minutes at seeds 0, 42, 271828): from a stop bar, 4,134 claims, median 0.98, p10 0.93 to 0.94, none 2 s past; priority 0.97 / 0.87; undressed 0.95 / 0.85, 5 past 2 s. The floor was `RACER_MOVING` (3 m/s) until then, and traffic crawls its tightest corners at 2: a hairpin was reckoned 5.5 s and held 7.7, and that alone was 3 of the 8 past 2 s. Pinned by `traffic-intent.test.ts` |
| Out-of-sight recovery, 2.5 s beyond 120 m | `UNSEEN_RECOVERY` | 09-13 (Shawn) | a rule, not a measurement | nothing | **current** |
| The road out of sight: a ghost beyond 140 m behind the player, solid within 120 m, 6 m clear | `UNSEEN_ROAD` | 09-23 (Shawn) | a rule, bounded by measurement: a ghost is its clear-road self to the bit (`rival-unseen.test.ts`); on Shawn's three Wake races, 2.3 s given back where he got 362 m away, nothing in the two close ones | nothing | **current**. Its distances are a guess at night-time sight: shorter would help her more and risk being seen |

## What was ruled out, and on what

A rejection is a measurement too, and it goes stale the same way: an idea dropped on
09-13 was dropped on the steering, traffic and frames of 09-13. Most of the rules the
rival and traffic still carry were made that day, on a rival that rode the centreline,
steered with a quarter of the wheel a fast bend takes, read traffic in the wrong frame
and compared raw heights, among traffic that jumped at its corners, could not see a
racer and had one layout. One rejection has already come back: steering feedforward on
streets, dropped on 09-13, has been shipped since. Re-examined 2026-09-22, when a day of
gating on six traffic seeds kept fixing one incident to find the next.

| Ruled out | When, on what | Changed since | Status |
|---|---|---|---|
| Swerving round an oncoming car: "slowed for, not swerved round" (`rival.ts`, oncoming branch) | 09-13, Sound to Sky, the rival resting on the centreline, where an oncoming car in its own lane was "genuinely in its way" | the rival rests in its own lane; an oncoming car is in its way only when it is out passing, and the rule braked it in the oncoming lane (gen-70, 125 mph) | **stands**. Re-tested 09-22 as a decision against where the rival is going rather than where it is, which is no swerve: on the six seeds, time 47,437 to 47,436 s and contact on a line 11 to 19 ticks. Once a side an oncoming car would enter is refused (`passOncoming`) the rival is already going home, and the rule changed almost nothing. Removed |
| A pass to either road edge (`PASS.reach` 3.8 m) | 09-13, twelve races, a 31.5 m stray | every stray-maker since: frames, heights, rounded corners, feedforward; the cap left a collector pass no side but the oncoming one | **stands**. Re-tested 09-22 as its own half to the kerb margin, the oncoming half still capped, a side wholly in its own half first: on the six seeds, distinct incidents 51 to 61, races with contact 54 to 76, contact on a line 70 to 418 ticks, off the pavement 428 to 1,021 (seed 0 from none to 403). A pass on the kerb side meets the corner lines and the kerb. Removed |
| Traffic that moves aside: "a traffic design change, not made" | 09-13, traffic blind to racers | traffic follows and yields to racers since traffic-v2; moving aside is the other half | **not built**: paused with the rival in traffic (2026-09-23). On a wide street a car easing to the kerb moves into the side a pass would take, so it is a narrow-street rule if it is one |
| A claim given back short of the line | 09-13, 42 races: circling and time lost halved, dropped for more standoffs and one pinned seed at 29.8 m | its diagnosis (a claim checked only when made) is traffic-v8's; the standoffs came from blind traffic and a centreline rival | **not shipped**. Re-tested 09-22 on traffic-v8 under driver-v3: distinct incidents 53 to 48 and races with contact 56 to 48, with 11 more resets and twice the reversals, the 09-13 standoffs in part. The best incident counts of the day, and not clean (`measurements/driver-v3.patch`, `RACER_GIVE_BACK`) |
| Traffic given the racer's route, for claims near a bend | 09-22, as helping the rival and not the player | in a race both racers are on the same course, so it would be symmetric | **open**; a claim given back covers the same cases without it |
| Reading the forecast for corner speed | 09-20, before the slip feedforward and the traffic frame | the forecast is read for lines and passes since | low priority |
| Keeping a refused car's turn | 09-22, twelve seeds | nothing | **stands**: starvation wants junction priority or signals, not fairness |
| Slowing for a car it cannot step round; holding speed through a turn; the whole inner lane near corners | 09-13 | the will-be check absorbed the first; the others failed on geometry that has not changed | **stands** |
| Rubber-banding, and help out of sight beyond recovery | Shawn's rule | nothing | **stands**, and not only as a rule: each would hide the failures the gate can now see |
| driver-v3: a pass never pulls out into a car coming the other way that meets it before it is past and back, and a pass keeps its side of a car it is beside | built 09-22 from the six-seed incidents (gen-70 at 125 mph; gen-16, gen-56) | | **not shipped**. Gated in three forms: distinct incidents 51 to 53 against 53, races with contact 54 to 56 against 66, contact in a pass up in all three (39 to 41 ticks against 27) and on a line in two (52 and 70 against 11); the first two forms each failed on a bug in the new rules themselves. It trades one kind of incident for another (`measurements/driver-v3-gates.json`, `driver-v3.patch`) |

**Where the rival in traffic stands (Shawn, 2026-09-23).** Good enough for Phase 1 at
`traffic-v8` / `driver-v2`, and not part of the handling gate (`HANDLING.md`). The day
above measured the limit of the reactive loop as much as any rule: a rule that removes
one kind of incident sends a race past a different car, and the gate cannot tell that from
an improvement at this size. A change that decided almost nothing (the oncoming decision)
still moved contact on a line from 11 ticks to 19, so read five distinct incidents in fifty
as noise. When it reopens, in this order:

1. **A type for each frame.** Most of the loop's bugs have been an offset read in one frame
   and compared in another: from the car against from the route, at the aim point against
   where a car is, and on 09-22 where the rival aims (`avoidance`) against where it is
   (`carAcross`). A branded type per frame (route offset, a car's offset at its own station,
   the aim, a station along the road) makes those a compile error. Brands do not survive
   arithmetic, so they belong on fields and function boundaries, not inside expressions.
2. **`pnpm rival:scene <race> --seed=`** turns any incident the gate lists into a scene:
   every contact dissected, and `--from= --to=` for the rival tick by tick.
3. **Plan, then commit.** The committed pass (`traffic-pass.ts`) reads traffic's forecast,
   chooses a path over a horizon and keeps it unless it breaks; the reactive dodge decides
   from nothing every tick. Making the dodge a fallback under a planner is the structural
   route, and the one whose effect should be large enough for the gate to see.
4. The unshipped rules and their numbers: `measurements/driver-v3.patch`, `driver-v3-gates.json`.
