# Cosmetic intersection infrastructure

The first pass dresses 113 complete road-network junctions: 236 signal heads,
170 stop signs and 136 marked crossings. These are visual infrastructure;
traffic and racers retain their existing driving behavior.

`ALDER_INTERSECTIONS` exposes stable junction and street identities, approach
directions, stop positions, pole positions and control types. Later traffic
rules can consume this inventory rather than reverse-engineering meshes.

Three or more non-alley arms qualify. Junctions with at least three approaches
16 m wide receive signals; smaller junctions receive stop signs. Signals flash
amber along the selected primary axis and red across it at 1 Hz. They never
display a green phase. Four-arm signalized junctions receive crosswalks.

Degree-two bends, alley-only junctions, acute merges and approaches that cannot
fit are omitted. The complete junction is withheld if any required pole cannot
stand on raised sidewalk clear of solids, parking/site entrances and existing
street props. Paint must fit the approach asphalt and clear crossing roads.
Existing longitudinal paint is trimmed from the stop bar through the junction.
Signal poles extend where necessary to retain 4.8 m of head clearance on hills.

Geometry is batched by material and spatially chunked. Signs use a small
Node-safe bitmap texture; signal flashing changes two shared materials and
uses simulation time, so freezing the scene also freezes the flashing.
The props introduce no new collision obstacles or route/pricing changes.

Validation: `tests/intersection-dressing.test.ts`, `tests/road-markings.test.ts`,
`tests/city-chunks.test.ts`; `pnpm build`; and
`node scripts/test-sidewalks.mjs --signals` for daylight/night overhead,
approach, stop-sign and mobile captures.

## Step 2: traffic that reads the junctions (sketch, 2026-09-24, undecided)

Asked for by Shawn after step 1 ("let's sketch it"). Nothing here is built. It is written against the code as it
stands so whoever builds it starts from the same page.

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

**Questions for Shawn.**

- Should traffic on the amber axis keep giving a junction to a racer who runs the red across it? Recommended yes for
  now (arcade), and revisited when police exist.
- A full stop (about 0.8 s, reads clearly) or a rolling stop (keeps side streets moving)? Recommended full.
- Stop at the painted bar even where it is 40 m back? Recommended yes: the paint is the promise.
