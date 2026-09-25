# Cosmetic intersection infrastructure

144 of the 169 road-network junctions that could be are dressed: 338 signal heads,
174 stop signs, 180 marked crossings and 3 STOP legends painted on the road. Step 1
dressed 113 of them (236 heads, 170 signs, 136 crossings); a second pass added 31
(`traffic-v11`, below, "Built: dressing the bare junctions"). They were visual
infrastructure; since `traffic-v10` (step 2, below) traffic obeys them, and racers
still drive as before.

`ALDER_INTERSECTIONS` exposes stable junction and street identities, approach
directions, stop positions, pole positions and control types. Later traffic
rules can consume this inventory rather than reverse-engineering meshes.

Three or more non-alley arms qualify. Junctions with at least three approaches
16 m wide receive signals; smaller junctions receive stop signs. Signals flash
amber along the primary axis and red across it at 1 Hz. The primary axis is the
road that goes straight through, the widest such pair of arms (then the widest
arm where no pair runs straight, 2 of 113); it was the widest single arm until
2026-09-24, which at 12 T-junctions made the stem amber and the through road red.
They never display a green phase. Four-arm signalized junctions receive crosswalks.

Degree-two bends, alley-only junctions, acute merges and approaches that cannot
fit are omitted. In the first pass the complete junction is withheld if any
required pole cannot stand on raised sidewalk clear of solids, parking/site
entrances and existing street props. Paint must fit the approach asphalt and clear
crossing roads. The second pass dresses what the first withheld, with a bar that
needs less room (below), and an arm with no room for a pole keeps its paint alone;
a stop there, with no head or sign to say so, has STOP painted on the road behind
its bar, in the bar's white, bold enough to read from the car coming up to it.
Existing longitudinal paint is trimmed from the stop bar through the junction.
Signal poles extend where necessary to retain 4.8 m of head clearance on hills.

Geometry is batched by material and spatially chunked. Signs use a small
Node-safe bitmap texture; signal flashing changes two shared materials and
uses simulation time, so freezing the scene also freezes the flashing.
The props introduce no new collision obstacles or route/pricing changes. The
inventory itself is traffic's since step 2: which arm flashes amber, where a bar
is painted and which junctions are dressed all move traffic, so a change to
`dressIntersections` is a `TRAFFIC_REVISION` bump.

Validation: `tests/intersection-dressing.test.ts`, `tests/road-markings.test.ts`,
`tests/city-chunks.test.ts`; `pnpm build`; and
`node scripts/test-sidewalks.mjs --signals` for daylight/night overhead,
approach, stop-sign and mobile captures.

## Step 2: traffic that reads the junctions (sketch, 2026-09-24; stop and dwell built, `traffic-v10`)

Asked for by Shawn after step 1 ("let's sketch it"). Rule 2 is built (below, "Built: stop and dwell"); the rest is the
sketch as written, against the code as it stood, so whoever builds the next rule starts from the same page.

**Why.** Traffic decides a junction today by reservation: the car at the head of its approach claims its movements
from up to 34 m out, on the move (`CLAIM_RANGE`), if nothing it would cross is held and no racer will cross before it
is clear (`racerCrossing`, `clearingTime`). Without a claim it stops 2 m short of the lane's entry line. It works for
traffic against traffic. Against racers it is a forecast, and every junction incident parked on 2026-09-23 is that
forecast being wrong: a car on a side street claims while moving, turns across a racer arriving faster than it
reckoned, and the two tangle (gen-33 and gen-38 at seed 1, gen-24 and four more sharing a start at seed 271828, gen-75
at Spruce Cut's junction). Step 1's lights say who should give way. Step 2 makes traffic do it, so the rule is visible
and the rival and the player can both read it from the paint.

**The rules.**

1. *Priority* (a signal approach flashing amber): unchanged. It claims on the move as it does now and never stops for
   the junction, only for what is already in it.
2. *Stop* (a signal approach flashing red, and every arm of a stop-sign junction): the car comes to a full stop at the
   painted bar and stands there `dwell` (about 0.8 s) before it may claim at all. From standstill at the bar, not 34 m
   out at cruise. This alone removes the parked incident's shape from every red and stop approach: a claim made from
   standing, visibly, with the racer in view, and reckoned from zero speed (`clearingTime` is already honest about
   that).
3. *Yield to priority*: a stopped car does not claim while a car on a priority approach will reach its own line within
   the stopped car's clearing time. The reservation already refuses a claim across a movement somebody HOLDS; this is
   the one arriving and not yet holding, the same look `racerCrossing` takes for racers, over priority traffic.
4. *All-way stop* (a stop-sign junction): among cars standing at their bars, first to stop goes first. The claim loop
   orders by distance to the line and then id; standing at the bar every distance is the same, so it needs the tick
   each car came to a stop (`stoppedAt`), deterministic like everything else.
5. *Racers run everything*, as in MC3. Traffic keeps holding a junction for a racer crossing it from any approach
   (`racerCrossing`), so a racer blowing a red is still given the junction. (Shawn's call; see questions.)
6. *Alleys yield*: an alley's mouth onto a street is a stop for traffic leaving the alley, whether or not step 1 drew a
   sign there (it does not dress alley arms). Spruce Cut's junction, where gen-75 tangled, is one.
7. *Undressed junctions* (bends, acute merges, the ones step 1 could not fit poles at) keep today's behaviour.

**Plumbing.** `buildStreetTrafficNetwork` already knows each lane's street and the junction it runs into
(`laneExitJunction`), and `ALDER_INTERSECTIONS` names both for every approach (`junctionId`, `streetId`). Matched at
build time, each lane that arrives at a dressed junction gets an optional `control` on `TrafficLane`: its rule (priority
or stop) and `stopAt`, the painted bar projected onto the lane as a distance. The world passes the inventory into the
builder, as it passes the streets; the sim never reads a mesh. `stopAt` may be well back from the lane's entry line (step
1 puts bars 12 to 48 m from the node, where a pole fits); a car stops at the paint, and the entry line stays the hard
barrier it is.

**What it moves.** How traffic drives: `TRAFFIC_REVISION` to `traffic-v10`, and every traffic-row number in
`design/COUPLINGS.md` suspect until re-measured. Raced recordings are refused, as with any traffic change. The golden
master moves wherever traffic runs.

**How it is judged.**

- `pnpm traffic:soak` at several seeds, first and alone: stop-and-yield is exactly where a side street can starve behind
  a busy priority road, and seeds other than 0 already starve a chain for minutes. What stands over a minute, before
  and after.
- `pnpm rival:gate` at six seeds, by kind (`pnpm rival:scene`): the count of "a car crossing, claimed its junction with
  the rival N m away" incidents is the number this is for. Everything else should hold.
- The traps it walks into: a claim from a queue deadlocks (the head-of-queue rule stays); a car stopped at a bar 40 m
  back is at the head of its queue for the claim rule's purposes; a wreck in a junction (`traffic-v9`) is still an
  obstacle a stopped car does not claim through.
- At the pad: cars stopping at the bars, and whether a side street now feels safe to fly past.

**Order, if built.** Each step measured on its own, since the gate cannot tell two changes apart:

1. Stop at the bar and dwell before claiming (rule 2), on red and stop approaches. The core of the parked incidents.
2. Yield to arriving priority traffic (rule 3).
3. All-way-stop order (rule 4) and alley mouths (rule 6).
4. Only then, if the forecast is not enough: the rival reading priority itself. It already reads traffic's own forecast
   (`forecastTrafficPath`), which will include a car stopping at its bar, so it may need nothing.

**Built: stop and dwell (`traffic-v10`, 2026-09-24).** Rule 2, as the questions below were answered. Each lane arriving
at a dressed junction carries its approach's `control` (`TrafficLane.control`, matched by junction and street in
`buildStreetTrafficNetwork`): 708 lanes, a stop wherever the approach is a stop sign or flashes red, priority where it
flashes amber, and `stopAt`, the painted bar as a distance along the lane. On a stop lane a car holding nothing stops
with its front at the bar (on 12 lanes the bar is inside the junction, and it stops at the entry line) and may claim
only after standing there `STOP_DWELL` (0.8 s, counted within 1.5 m of the bar under 0.3 m/s). The forecast a rival reads
holds it there too. Everything else is as it was: the claim's checks, the head-of-queue rule, `racerCrossing`, amber
lanes, undressed junctions. In the game two box trucks stood at a red on a 20 m arm with their fronts 0.25 and 0.41 m
short of the bar's centre, and one claimed after its stand.

The same revision floors a claim's reckoning (`clearingTime`) at the 2 m/s traffic crawls its tightest corners at, where
it was floored at the racer threshold of 3 m/s: counting a claim made standing as a claim, `traffic-intent.test.ts` found
a hairpin reckoned 5.5 s and held 7.7. From a bar the reckoning is its best anywhere (held / reckoned median 0.98, p10
0.93, none of 4,134 claims 2 s past it).

Building it found step 1's axis wrong: the widest single arm made the stem of a T amber and stopped the through road at
12 junctions (1st Ave S at (-9, 780) among them). The axis is now the straight-through pair (above), which changes those
12 junctions' lights too, and is pinned by `tests/traffic-stop.test.ts`.

What it did (`design/measurements/stop-and-dwell.json`):

- Traffic alone, ten minutes at twelve seeds, v9 to v10: vehicles standing over a minute 150 to 100, still standing at
  the end 31 to 18, the longest 427 s to 352. Every car still standing, in both versions, is in ONE undressed cluster
  around (-650, -1080), about 300 m across: a car holding its chain and unable to move with a queue behind it, v9's own
  lock. The longest stand is a lottery (its lane differs in every run). At seed 0: 867 claims from stop lanes in three
  minutes, none before the dwell; median stand at the bar 0.8 s, p90 5.1 s.
- The rival gate, six seeds, v9 to v10: contact ticks 4,869 to 1,515, contact on a line 278 to 114, resets 35 to 22,
  reversals 11 to 1, 157 s quicker over 498 races; distinct incidents 50 to 52, inside the noise; off the pavement 14 to
  70, all one race (gen-54 at seed 271828, below).
- By kind (every contact replayed and read): crossings by a car that had claimed its junction 9 to 8. **The rule barely
  touches them, because they are not where it is.** All nine of v9's were claimed from undressed approaches; of v10's
  eight, six are undressed, one amber (claimed on the move from 34 m, rule 1) and one from a bar after its stand, with
  the rival crawling past 7 m away at 6 mph, under `RACER_MOVING`. gen-54 is the same story: a van claiming at an
  undressed junction from 30 m out with the rival 263 m away, now met at another moment, and she spun braking from 130.
- 59 of the map's 172 junctions of three or more street arms are undressed: 56 withheld whole because one approach could
  not fit paint or a pole, three acute merges. gen-75 at seed 1, the one parked incident that motivated this sketch
  still in the baseline, is at one of them (the others were drawn on an older world and were not re-checked).

So the next step is not rule 3. It is the undressed third: dressing the 56 (a junction whose one awkward approach loses
its pole but keeps its paint, say), or giving them a rule with no paint, which breaks "the paint is the promise". Shawn's
call. The undressed cluster at (-650, -1080) starves on its own and is a separate job.

**Built: dressing the bare junctions (`traffic-v11`, 2026-09-24).** Shawn took the recommendation above, and its premise
was wrong: "one approach could not fit paint or a pole" had been counted as one reason, and letting an arm keep its paint
without its pole dressed exactly one more junction. What kept the rest bare, arm by arm over the 55 that pass the shape
checks: 75 arms found a crossing road inside the 6 m step 1 keeps clear in front of every bar, at every distance it tried;
6 had paint leaving their own asphalt; 2 were too short for a bar. The 6 m is a crosswalk's depth, and only a four-arm
signal gets a crosswalk; a bar is 0.45 m. On a short block with a 20 m road and its 5.6 m shoulders at each end, step 1's
search (12 m out to 42% of the arm, 2 m steps) found no spot outside them.

So a second pass (`dressIntersections`), run after the first so every junction the first dressed is dressed exactly as it
was (all 113 checked field by field against the old inventory): a bar keeps only its own depth clear where there is no
crosswalk; the search runs from 8 m to 48% of the arm in 1 m steps and checks 4.5 m of asphalt behind the bar for a
legend; a four-arm signal that cannot fit its crosswalks keeps its bars without them (5 junctions); and an arm with no
room for its pole keeps its paint (7 approaches), a stop among them painting STOP (3). 31 more junctions, 30 of them
signals: 144 of 169, and 6 of the 8 junctions where the v10 gate's claimed crossings were. `tests/intersection-dressing`
pins the count, because a changed inventory moves traffic.

What it did (`design/measurements/junction-dressing.json`, against v10):

- The gate, six seeds: crossings by a car that had claimed its junction 8 to 3, which is what this was for. One is a
  chain out of the cluster claimed with the rival 400 m off, past the 8 s racer horizon; two are at walking pace. Totals
  within the noise: distinct incidents 52 to 55 (the gate's count), contact 1,515 to 1,538 ticks, 67 s over 498 races; contact on a line 114
  to 27, in a pass 30 to 0; resets 22 to 30. Rear-ends rose (into the back 8 to 14, from behind 4 to 8): of four read,
  three are at junctions v11 did not touch, the timing lottery, and one is new in kind, gen-19 at seed 1000 hitting an SUV
  standing at a new bar at 110 mph. It read the SUV, 1.5 to 1.9 m to its right, as out of its path while drifting towards
  it. That is the rival's reading of a car standing just off its line, and a car standing at a bar is what v11 put there.
  Off the pavement 70 to 293 ticks is two races: gen-54 at seed 42, at the same still-bare junction v10's gen-54 met at
  seed 271828, and gen-75 at seed 1000, spun by a car hitting it from behind at 97 mph.
- Traffic alone, twelve seeds: level (standing over a minute 100 to 108, still standing 18 to 22, longest 352 to 313 s).
  All of it is still the cluster at (-650, -1080), which v11 dressed in part, so some of its lanes now wait at a bar for a
  gap in a priority stream where they waited at the line: the same lock in another shape, still a separate job.

25 junctions stay bare: 3 acute merges, and 22 whose arms still find no spot (the ones around 99 and 246 among them).

**Questions for Shawn** (all three answered yes, 2026-09-24: racers keep the junction on a red, a full stop, at the painted bar).

- Should traffic on the amber axis keep giving a junction to a racer who runs the red across it? Recommended yes for
  now (arcade), and revisited when police exist.
- A full stop (about 0.8 s, reads clearly) or a rolling stop (keeps side streets moving)? Recommended full.
- Stop at the painted bar even where it is 40 m back? Recommended yes: the paint is the promise.
