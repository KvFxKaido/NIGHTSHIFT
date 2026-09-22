# Field notes

The session log that used to be `CLAUDE.md`, moved here on 2026-09-12 so the
context file could be short. Nothing was cut in the move: each section below is
the text as it stood, under a heading that says what it covers. Where a story
also lives in `design/DISTRICT.md` or `design/PORT_ALDER.md`, that doc is the
fuller version and wins; this file is the running record of what was found,
what was first assumed, and why the assumption was wrong.

Read a section before touching the system it describes. The lessons are in the
past tense, but the traps are still in the code.

## Six layouts, and whose crash it was (2026-09-22)

Asked for: start on COUPLINGS' suspect list. The car ladder first (it held, `HANDLING.md`),
then the batch at several traffic seeds as the gate. What was assumed and wrong:

- That the rival's new incidents on other seeds were the rival's. Dissecting all 21 at
  three seeds (what the traffic car was doing, when it claimed its junction, where the
  rival was then) put 12 on traffic: cars turning across or into the rival's road, having
  claimed with it 50 to 570 m away. The rule was right; the car's reckoning of how long it
  would be in the junction was its speed now, and it then slowed to turn.
- That fixing it would cut the incidents. It cut the contact ticks (one incident had been
  26 races at a shared grid) and not the incidents: once one junction goes another way a
  race meets other traffic from there, and seven went while eight came. Count incidents by
  place, and read what each new one is before calling a change good or bad.
- That the next fix, the rival not pulling out into oncoming cars, was one rule. It
  removed those and opened a side the rival had never reached, the kerb side of a car on
  a narrow street, from which it steered back through that car once the far side cleared.
  Held back. A reactive rule that re-picks a side every tick needs a commitment, not
  another look.

## A seed per attempt, and what one traffic had been hiding (2026-09-22)

Asked for: the traffic seed per attempt, after Shawn noticed a restart meets the same
cars. What was assumed and wrong, in order:

- That a seed was variety: a small change to where cars start and a salt on which way
  they turn, seed 0 kept byte for byte, done in an hour. The plumbing was that. What
  it found took the evening: seed 0 is the one traffic every traffic fix was soaked on
  and every rival number was measured on, and it is the cleanest of twelve.
- That the long stands were locks, because the traps say new waiting finds holes in the
  reservation rules. They were starvation: a car needing a chain through a junction
  cluster refused on nearly every tick by a stream of 27 to 33 other cars, never all at
  once. The tally that showed it counted the refusing rule and the blockers each tick,
  which no reading of the code had suggested.
- That fairness would fix it. Keeping a refused car's turn helped that car and cost the
  cars behind everyone it blocked, and seed 0 itself got worse. Measured on twelve seeds
  and reverted. What is left is a property of reserving whole chains through short lanes
  under crossing traffic, and it wants a design, not a rule.
- That the rival's traffic numbers were the rival's. The 83-race batch is 83 races
  through one traffic. Under two other seeds it meets two to three times the distinct
  incidents, including contact on a line and in a pass, the two gates that had read zero
  since they were built. The batch now takes `TRAFFIC_SEED`, and a rival change that is
  measured at seed 0 alone is measured on the layout it was fitted to.
- That the renderer would follow. It would have, only because the count and each id's
  kind stayed put: it sizes its instanced meshes once, at load. The phase along the ruler
  was chosen for that, and a test holds it.

## Three races against Wake, and what "traffic slows her down" was (2026-09-22)

Asked for: nothing, at first. Shawn raced Wake through the open ground because a new
player would, then twice on the streets, and said traffic in the second half slows
the rival down, and that it spawns the same way every restart. What was assumed
and wrong, in order:

- That the cheat race, with its two cuts subtracted, said how a clean race would go:
  "about a second". Two clean races said 4 s. A replay with the cuts removed is
  still a race he drove knowing he would cut, and the corners either side of a cut
  are not driven the same.
- That "traffic slows the rival" was traffic. It was the rival driving into a sedan
  at 85 mph, 24 m after choosing to pass it, because the hazard loop judged the
  sedan against where she meant to be and not where she was. The third time a
  frame has bitten this loop: `side` against `carOffset` (2026-09-13), the aim
  point's frame round a bend (2026-09-20), now intent against position. Each fix
  was right and none of them named the rule: every number in that loop must say
  which frame it is in, and a prediction must start from where the car is.
- That the rule was then one line. Six versions were measured on the batch before
  the one shipped, and four of them were frames: her offset at the aim point
  carried to the truck's station as a displacement (0.65 m wrong through a bend, a
  100 to 35 mph brake for a truck 4.6 m beside her line); `nearestSide` for where
  she is, which through a corner arc is 1.6 m from the path she drives (she
  matched a sedan's speed beside it into a junction); no credit for the lateral
  motion she had not started (a car 30 m ahead in the lane read as unavoidable);
  and the loop's 2.6 m corridor applied to a prediction good to 0.2 m (brakes for
  gaps of 2.2 to 2.5 that driver-v1 drove through). The last two were the margin:
  scaled by closing speed it shrank as she braked and released her mid-manoeuvre,
  and held from engagement it kept her stopped beside a stopped car. The numbers
  came from a hook printing what the check saw, not from reasoning about it; the
  reasoning was wrong six times. The rule as shipped compares offsets only at
  their own stations, adds a flat 0.3 m, and lets go under 4 m/s of closing.
- That the 83-race batch would have found it. It cannot: she was 2 m right of her
  lane because Shawn had just passed her and she covered his side. Alone she is in
  her lane, left of that sedan, and the planner commits a pass. Four of the last
  five rival faults came out of his recordings; the batch is the rival alone, and
  says so.
- That the same traffic on every restart was a bug. It is law 2: traffic has no
  seed, so a race from the grid is the same race, cars and all. Whether that is
  what a retried stage should be is a design question, written down as one.

## One recorded race, and the crash under the batch's one regression (2026-09-20)

Asked for: "I raced wake just now." The first generated race with a recording.
What was found and built is in `PORT_ALDER.md`, "What one recorded race found", and
`measurements/rival-v32.json`. What was assumed and wrong, in order:

- That the 83-race batch gates the rival. It gates the rival ALONE. Wake lost 5.4 s
  of that race held beside a sedan at its own speed by her own pass planner, and the
  batch is identical to the tick with and without the fix: the player is parked in
  it, and it took him being there. A recorded race and `pnpm laps:compare` found in
  one evening what 83 races could not see. Several seeds also share a course's
  first kilometres, so the batch is fewer independent races than 83 and one
  incident can be four rows.
- That a bend needed a line and that was all. With a window at every gentle bend
  Crest's race got 5.5 s quicker and Tally's got slower: at 150 mph any line that is
  not perfectly straight is planned below the lane, which between bends is. The
  filter that fixed that (keep a window only where its line beats the lane) then
  dropped the very bend the idea came from, correctly: a 60 m window at 115 mph is
  half a second to leave the lane and return, and the line drawn in it is tighter
  than the lane. The idea is right and the window is the wrong size for it.
- That the batch's one regression (`gen-78`, wheels off the pavement) was the bend
  work. It was a 120 mph crash into an oncoming van that v30 has too, ending on the
  grass this time instead of on the road. Seven of the eight races that still
  touched traffic did it the same way, at 103 to 119 mph, off any line, in no pass.
- That the rival had not seen the van. It had: the van was in its own lane and the
  rival meant to pass it 4 m away. It ran 5 m wide through a bend planned flat, and
  the plan was right, 56% of the grip. The steering was wrong: it asked for the
  turn's geometry, and at 130 mph the tyres need nearly four times that. Nobody had seen
  it because at corner speeds the difference is 3% of the lock.
- That the closed form was then just stiffness. It matched the car only once the
  load was in it (the front carries about 46% flat out) and, for rear drive, the grip
  the driven rears give the engine. A further term, the driven fronts' own push
  doing some of their cornering, fitted all-wheel drive exactly and moved the other
  two drivetrains twice as far as it should, so it is not in: 17% high on front
  drive flat out is stated in the test rather than explained away.
- That holding a bend needs lock in hand, so a lane's bends should be planned to
  the lock. True of the arithmetic (that bend is 93% of the lock at 130 mph) and
  not of the batch: 0.06% slower, no cleaner. Taken out again rather than shipped
  as a knob nobody had evidence for.
- A pass is planned for a car that is on its path. `gen-46` was 1.2 m off it a
  fifth of a second in, with 1 m/s of drift the other way from the bend before,
  and a committed pass looks 26 m ahead at 105 mph because the path is clear.

## Committing to a traffic pass (2026-09-20)

Asked for: rivals that retain their competitiveness in traffic. The first slice
is a complete passing maneuver with one chosen side and a checked return, using
the same car physics. The implementation and measurements live in
`PORT_ALDER.md` and `measurements/traffic-pass-v30.json`.

- A clear predicted path did not mean the car would drive it. The old hazard
  loop still braked for its own linear prediction, costing gen-7 nine seconds.
  The accepted path has to own both steering and speed, with a short emergency
  check for tracking error or a changed situation.
- Holding traffic's current speed is insufficient for a merger. Checking its
  normal acceleration as well cleared gen-20's repeated alongside contact.
- A geometric footprint on a bend understates the real car's tracking error.
  The new maneuver is limited to straights and gentle bends; larger bends keep
  their existing driver. Otherwise gen-35 needed a reset despite its sampled
  path being clear. Replacing an already-clear pass also caused a late rejoin
  on gen-40, so a materially identical corridor is left alone.
- A rejected plan must be inert. Applying following speed after rejection
  changed gen-54's encounter timing enough to cause a later collision, with no
  committed pass to implicate in the trace. A test now compares both inputs and
  driver state against the original response to a close lead.

The 83-race harness uses the actual rival slot with the player parked at Wharf.
It measures repeatable traffic encounters, not performance against a human.
Less contact is useful, but is not proof of pace parity with clear streets.

## Taking the line in traffic, a corner at a time (2026-09-20)

Asked for: the rival that had just beaten Shawn on clear streets, in traffic,
where every race still fielded the lane-arc driver. Measured before it was built
(80% of corners clear of forecast traffic, one false clear in eight races), then
built by Claude as far as a passing 83-race batch and landed by Codex when the
session ran out (`full-line-v29`). What was assumed and wrong, in order:

- The line was first stored as an offset across the lane's corner arc, and it
  folded, the same family of fault as the hairpin that morning: a narrow street's
  lane arc has a radius of 8 to 10 m, the cut is deeper, and every normal of the
  arc meets the line at once. It is a position now, matched by the line's length.
- Turning the line into that overlay searched for "the point of the line abreast
  of this station" with no bound, and where a route doubles back every point of
  the far leg is abreast too: one race got a 128 m shift and six resets. The
  search is bounded, and a corner whose shift cannot be trusted is left in lane.
- A full out-in-out line made the corners much faster (14 to 32 mph at the slowest
  point in lane, 29 to 47 on the line) and the race no faster: 5.9 s gained in
  gen-39's corners, 0.3 s over the race. Swinging out for a corner happens in the
  braking zone and is itself a bend, so the rival braked 50 m earlier on every
  approach. Widening the windows did not fix it and at 200 m put contact ON the
  line. Staying in lane into the corner did: 2.7% to 5.3% on eight races.
- Total contact went UP with the final design, 141 ticks to 266, and it was not
  the design: 14 races touched traffic in lane and 12 with the line, only two of
  them the same races, and one 113-tick incident 800 m from any corner carried
  the total. Counted as ticks it read as a regression; as incidents, a lottery.

## A racing line through a street corner (2026-09-20)

Asked for: fix lap 1, because a rival given a racing line through Uptown Circuit
was 7 to 16 s slower on its first lap and, on one setting, "went backwards". The
name of the bug was the first wrong thing about it.

- It was not lap 1. A tick-by-tick trace showed the rival at full lock at 15 mph
  at some corners on some laps, lap 2 included. Dumping the line sample by sample
  showed the same corner solved as a 23 m arc on one lap and a 118 degree spike on
  the next. The solver works coarse to fine from nodes 64 m apart, a lap is not a
  multiple of 64 m, and which answer a corner got depended on where a node fell.
- It was not reversing. "Went backwards" is the lap recorder's name for the car's
  place on the track falling 20 m, and a car orbiting a hairpin does that going
  forwards. That guess had gone into the doc as a finding.
- The measured lap was the lucky one, so the experiment's headline (the line is
  worth 0.6 s, the corner-speed plan is everything) was a measurement of a broken
  line. On a sound one the line is worth 4.8 s a lap and the plan about the same.
  That had been reported to Shawn as a correction of an earlier guess; it needed
  correcting itself.
- The first fix, a curvature that keeps rising past a right angle, mended thirty
  corners out of thirty-three and was the easy part. The hairpin took three tries,
  because each bound on the offsets moved the failure to a different lap rather
  than removing it: the fault was offsetting from a 129 degree vertex at all.
- Ridge Circuit's lines had to stay bit for bit the same, or the one raced
  recording that still replays would be refused. A hash of all three, taken before
  the first edit and compared after every one, caught that the curvature fix moves
  two of them; so the street fixes are an option Ridge does not take.
- Each new test was run with the fix switched off, to see it fail on the original
  symptom and not merely pass with the fix on.
- Built the same day at 0.88 for Uptown Circuit / Clear, which turned out to be the
  only street race with no traffic: "clear street races" is one race. What nearly
  went unnoticed is who else drove that rival's route: `pnpm cars --laps` used it
  as its Uptown column, the instrument every car's tune was judged on, and would
  have moved all ten cars' numbers for no tune. It was baselined before the change
  and compared after. And a blind replay cannot test a quicker rival being raced,
  so a second planner in a quicker car was put behind it to be passed.
- Shawn raced it (won by 3.4 s, from twenty) and asked for the CPU to cut corners
  that are not grass. Three things that were not obvious. The lever was twice what
  it looked: rounding every corner was worth 2.1 s a lap before anything was cut,
  the cut about 2 more, so his 0.88 was taken down to 0.80, level with the race he
  had just run, with the numbers laid out for him. That read was forty minutes
  stale by the time it shipped: he raced it five times, was two seconds a lap past
  it by the second, and set it back to 0.88. A pace tuned to one race of a driver
  who is still getting quicker is tuned to the past. Wheels on the grass at the first try were not the
  line's: the rival runs up to 1.9 m inside its own line at a tight apex, so the
  margin where it cuts is the car's, 4 m. And an old clamp that keeps the aim on
  the road by the line's distance from the centre would have quietly pushed it
  off every cut apex, since a cut line is further out than the road is wide.

## How traffic takes a corner (2026-09-20)

Asked for: more natural driving lines, since traffic overshot its turns and
rotated awkwardly. Measured first, every tick: in a right turn the body pointed a
median 137 degrees from the way it was moving. Lanes are offset polylines that do
not meet, so a right turn drove past the lane it wanted and was slid back onto
it, position and heading on separate schedules, at 36 mph.

The fix is a curve per movement, and per vertex of a lane's own polyline, which
turned out to be the other half: every remaining snap after the junctions were
fixed was mid-street, 90 degrees in a tick where a street turns a corner. What
went wrong on the way is the useful part:

- Lane distance has to run faster than the vehicle on a curve that cuts a corner.
  Stepped at a rate sampled once a tick, one van moved 21.6 m in a tick. The
  ground is now integrated along the curve and the distance read back.
- A curve's end rebuilt as `from + span` came out 2e-15 short of the `b` the
  "am I on it" test compared against. Sixty vehicles sat on corners they had
  finished, reporting 9 mph. The end is now the same number the test uses.
- A fixed turning radius put an SUV's corner on the point of an acute junction:
  the kerbs are square. The radius comes from the kerb geometry instead.
- Slowing for corners tripled how long a turning vehicle held its junction, and
  within minutes that turned two old holes in the reservation rules into locks
  (design/PORT_ALDER.md, "How traffic takes a corner"). Both were findable only
  by soaking traffic alone for ten minutes and asking each stopped vehicle which
  rule refused it; every existing test passed straight through them.
- The worry that a traffic revision would cost recorded laps was wrong, and only
  `pnpm laps --verify` said so: the in-traffic sessions were already refused, for
  the rival's revisions.

## Traffic roster (2026-09-18)

The first fleet pass replaces stacked boxes with sedan, SUV, panel van and
box-truck silhouettes; the existing taxi remains a signed yellow sedan variant.
The procedural instancing path was retained rather than using garage GLBs.
Fixed-colour glass, tyres and trim share one additional draw set per kind.
The front/rear review lineup rendered at 31 draw calls including its ground,
3,674 triangles including lamps and the ground, and no page exceptions. Both
lineup captures and the live SoDo street capture were inspected; the rear view
exercises brake lights. Wheels are static low-poly geometry, not articulated.

The 19 existing traffic tests passed with the new deterministic SUV mixture.
Two new render tests cover collision-envelope bounds, finite geometry, a triangle
budget, all kinds spawning, attachment matrices on slopes, braking and render
purity. The production build passed with the existing chunk-size warning.
The full suite then passed all 563 tests; the final whitespace check passed.

## Moth career and shop: first validation and review (2026-09-15)

Before the pace calibration was integrated, the worktree passed 475 tests and
the production build. Browser checks exercised a fresh profile, a loss and
same-course retry, all three flashes/results, buying and reloading Bulwark,
winning and reloading Kestrel, Moth's departure, and a 390px garage layout.
Repositioning and injected finishes checked application flow, not difficulty
or economy balance. The existing favicon 404 and Rapier warning remained.

Claude's review caught that the legacy Bulwark grant lived only in memory: a
car switch followed by reload lost it. It now writes the grant before settings
can switch cars, with a retry if storage fails. Ownership checks apply equally
to Bulwark and Kestrel preview links. Saved course identity was also missing;
unversioned prototype courses cannot be silently relabeled as a newer generator.
The worktree was updated to master `656f7e0`, including the pace calibration and
Claude's `generator-v1` fingerprint. Progress schema 3 stores generator/world
identity, refuses stale course links, and lets the player explicitly replace an
incompatible unfinished stage while keeping completed history, wins, cash and cars.

After integration, 480 tests, the production build and `git diff --check` passed.
Browser regression checks reproduced the Bulwark switch/reload case, tested both
locked car links and a failed migration/retry, rejected an unversioned course,
replaced only its pending stage, verified the new descriptor/link identity, and
rejected a stale tagged bookmark. The mobile garage was inspected at 390px.
A test-harness URL assertion failed outside the page; it was corrected and the
remaining bookmark check passed. No new application exception appeared during
these checks; the Rapier initialization warning remained.

The second review caught two existing browser harnesses that still assumed a
fresh profile could select Bulwark. Both now seed explicit schema-3 ownership
in isolated profiles and accept a worktree preview URL. The actual
`check-garage-cars-browser.js` and `check-encounter-browser.js` passed on port
5174: car loading/retry, selection/reload, driving/reset, keyboard selection,
flash/remapping/pause, race/free-roam transitions, and the simulated controller
challenge. Their garage and encounter screenshots were inspected. Neither
reported a page exception; the expected aborted asset request, favicon 404 and
existing Rapier warning remained. This follow-up changed harnesses and docs
only; the 480-test/build results above were not rerun.

The accepted retirement rule supersedes post-pink-slip encounters. Learning is
still future work and could affect later stages from earlier wins. Product docs
now agree; the validation narrative belongs here rather than in BLACKLIST.md.

PR review clarified that reopening the exact accepted course is an intended
career retry, not a reward bypass. The progress store still requires the saved
course/start/build and pays only once; an unaccepted matching link pays nothing.
A regression exercises that boundary across store reloads. Driver-definition
IDs are not Blacklist identities, so a Moth driver-ID gate was not added.
The static Kestrel label now matches its runtime pink-slip label, and the legacy
startup write is documented as intentional. All 21 focused progress/car tests
and the production build passed; the full suite and browser harnesses were not
rerun for these copy, comment and test changes.

## Port Alder: route choice, alleys, generated races, garage, editor (2026-09-10 to 09-11)

explicitly retired the Blackglass map on September 10, 2026. Old world links
migrate to Port Alder; `district.html` redirects to the Port Alder map board.
Read `design/PORT_ALDER.md` for source geometry, regeneration and scope.

`pnpm alder:critique` is the measuring stick for route choice, and the
material a race generator would draw from. The rule the map is held to is
"every shortcut has a cost": between two gates the faster way should be the
riskier way, or it is just a shorter road. The script scores risk per street
from the map data (width, bends, grade, blind corners) and reward per leg as
the TIME the best genuinely different alternative costs, routed on the line
graph so turns cost and straight-through is free — on a grid two ways round a
block are the same length, and only time tells them apart. First reading of
the slice: 1056 directed legs between choice points, 77% with an alternative
within 40% of the fastest time, median detour 11%; but only 66 are PRICED
(fastest is riskier) against 254 FREE (fastest is also safest) and 250 twins.
The grid's arterials win nearly everywhere; the real shortcuts are Western
Ave, 6th Ave S and the 2nd Ave / James St corridor. **Blind corners are sight
distances** (2026-09-11): how far before a corner a driver first sees down
the other arm past what stands on the inside, by the sight triangle (d ≤ p /
cos(φ/2)), measured at bends inside a street AND at every junction approach
a route arrives on, because on a grid the turns are at the junctions. The
first version counted building corners within ten metres of a mid-street
bend, found none on 108 streets, and a fifth of the risk weight was dead.
Blindness is 1 − sight / 60 m (the stopping distance from top speed, a
proposal); it lives on the `Drive` for junction arrivals and `routeRisk`
adds it per drive. On the expanded map 41 of 216 approaches see the cross
street only inside 60 m, the nearest 26.5 m (Yesler at 1st, Holgate at 4th),
and two mid-street bends are under it; the classes moved by a handful of
legs (priced 326 → 334). The term is live; the setbacks are what keep it
small, and pulling corner buildings in is now something the report can see.
Width belongs in risk, not pace — with width cutting pace, every narrow
street was dominated by construction and the report said so about the model,
not the map. The pace model and the risk weights are declared proposals; it
asserts nothing; `--json` is for agents. Run it before and after authoring.
**Alleys go where the draw runs out of priced legs** (2026-09-11): the
generator's draw, measured per junction and arrival, said 382 of 1167 draws
over 300 seeds were made where nothing priced or even lay ahead, 300 of them
the first leg of every race (the run up 1st Ave S has no alternative). `pnpm
alder:critique --try=x1,z1,x2,z2[,width]` scores an alley between the two
junctions nearest those points — arrivals at each end by class before and
after, and the draw over 300 seeds. One alley, Freight Cut (255 m, 8 m,
Harbor Way & 1st to Holgate & 4th, `assets/maps/alder/alleys.json`), took
dead draws to 59 and the priced-or-even share from 48% to 62%; the downtown
and Pioneer Square candidates moved nothing globally and were not drawn.
Alleys are noded only among themselves, join the grid at existing junctions,
carry the `sea-alley-` prefix, displace the pinned plots they cut through,
and are the lane model's alley class. Do not go crazy with them: score, draw
one, measure again.
That arithmetic lives in `src/sim/route-choice.ts` (risk per street, the line
graph, `measureLeg`, `legTable`) and the critique only formats it, because
**races are generated from it**: `src/sim/race-generator.ts` draws three to
five junction gates per seed, each leg weighted by its class (priced 4, even
1.5, free 0.5, twin 0.3, none 0.4, +1.5 in the 10–25% sweet spot), never
reusing a street, 12–40 s a leg and 45–160 s a race, and routes the rival's
line through the gates from the streets' own points exactly as the authored
Sound to Sky line was built. `?race=gen-<seed>` is the race; the flash in
free roam loads `gen-${seedFromTick(tick)}`, so a replay of the cruise draws
the same race and every real flash draws a new one. **A race starts where you
flashed** (2026-09-11): the flash pose is snapped to the right-hand lane of
its street, facing the way it was going and 15 m short of the junction ahead
(`src/sim/race-start.ts`), carried as `?start=x,z,heading` and snapped again
on load; the generator's origin is the junction ahead of it and the rival
starts 7 m ahead in the other lane in the start's own frame. A race's
identity is (world version, race id, start), the id being the seed plus the
variant added the same day (`gen-<seed>[-circuit|-unordered]`). Sound to Sky ignores `start`; a
flash from off every street still starts on the grid. A flow rule (2026-09-11)
keeps a race going somewhere: the next gate lies within 120° of the heading
the last one is reached on, and the leg's first street leaves within 135°.
Without it the class weights pulled the draw straight back to the few priced
corridors — 23% of legs sent you to a gate more than 120° behind you, 9% to
one more than 150° behind, and Yesler & James's Y sent 32 races in 300 out
of a gate in a hairpin (the expanded map has a second, Broad St & 5th Ave N
at 170°). The rule costs choice, measured: priced-or-even legs fall from 53%
to 39% of the draw (uniform 26%; 35% once junction sight entered the risk
and moved the classes near the grid); 60 of 60 seeds still draw,
the rival still finishes with no recoveries and no resets, and every seed
draws a different race than it did before the rule, which is why it landed
before playlists. Each gate carries the direction the rival's line leaves it
(`withExits` in `rival.ts`, read from the line when `createSim` pairs a race
with its rival; the finish has none) — absolute, along the exit street,
because the sim cannot know which way the player arrives, and a hint in open
racing, never a rule. The beacon draws it as a sign that faces the camera
and turns in its own plane (up for straight on, left or right for a turn),
with a tick on the minimap ring; an arrow lying in the world reads as a
sliver or a box from the chase camera, and projecting the sim's direction
into the view is presentation, not a decision. Sound to Sky stays as the
authored race and the rival tests' fixture. The seed uses `mix`, never
`Math.random`; the leg table is measured once per graph, so a draw costs
microseconds after the first. `design/PROCEDURAL_RACES.md` holds Shawn's
procedural direction — every flash a new race, playlists keep one, flashed
rivals learn your line per street — and the order of the work that follows;
read it before touching races or rivals.

Free roam starts at Wharf Garage in SoDo. Stop at its mapped entrance to
enter; the garage camera is fixed and right stick rotates the platform/car.
Races keep their separate street start and cannot enter the garage. The
handling model and tuning are unchanged.

The visual building workshop at `editor.html` now edits Port Alder. Read
`design/EDITOR.md` before changing save behavior. Validated saves go to
`src/sim/alder-layout.json`; rendering and Rapier share the resolved solids.
Roads, Wharf Garage and its forecourt are protected. Three.js scene export
and import remain supported. **Authored plots are their own list**
(2026-09-11, schema 2): `authored` buildings in world coordinates with their
own ids, and `retired` generated plot ids; nothing is keyed to the
generator's output, so a rebuild cannot orphan a hand-placed building — the
builder keeps filler clear of authored footprints and drops pinned plots
under them, the sim lets an authored plot win where a stale build overlaps
it, and a retired id the generator no longer produces is ignored. An edited
generated plot becomes `authored-from-<plot>` with the plot retired; the
editor can add and delete buildings. The district fixture keeps schema 1.

Shared projection, footprints and lane-network construction live in
`street-path.ts`, `building-footprint.ts`, and `street-traffic.ts`. Do not
import the legacy district to reuse a helper: the production build rejects
old district/course renderers and district simulation data. Blackglass
source remains only as developer regression fixtures. Its GLB is archived
at `assets/tracks/blackglass-rivergate.glb`, outside public/demo assets.


## Blackglass and the district build: the long version

Historical prototype notes. Blackglass is a developer fixture now, not the
demo, but the district machinery (footprints, aprons, lanes, traffic, the rail
rule, the night dressing) was built and debugged here and Port Alder runs on it.

Phase 1 environment prototype: one low-poly car on the 1.70 km Blackglass
Circuit, including a long tunnel, steel-frame bridge, primitive city massing,
four-wheel tire forces with independent combined grip limits, front/rear and
left/right load transfer, and Rapier-integrated yaw/contact
response, keyboard and standard gamepad input, speed-sensitive
chase camera with right-stick orbit, reset, toggleable telemetry, and a
light DOM menu shell for title, track selection, garage, and pause. Wharf Garage
occupies an existing warehouse plot beside Wharf Road, with a G marker on the
district map and minimap. Free roam starts at its entrance. Stop there outside
a race and press E/Enter or Cross/A to enter; leaving resumes the same run.
The garage uses a dedicated presentation scene and the same car mesh as the
track. Right-stick horizontal input turns the car and platform under a fixed
camera; R3/C resets the platform. Paint,
wheel finish, and visual ride height carry across views and save locally. The
drivetrain saved alongside them until 2026-09-12, when the garage toggle went
away and the drive split became a property of the body: Cinder RWD, Bulwark
AWD, and changing car starts a fresh drive. A drivetrain stored before that is
dropped on load rather than reported as damage, because `decodeSaves` throws on
anything short of "saved" and its throw is outside the per-slot loop, so one
stale slot would discard all three. Drivetrain tuning itself is unchanged.
They do not alter simulation handling or represent purchased performance parts.
Menu state gates fixed simulation ticks rather than living inside the renderer.
The default car is the original NS-01 Blender asset (`assets/cars/ns-coupe-01.blend`
-> `public/assets/cars/ns-coupe-01.glb` -> `src/render/blender-car.ts`). The old
procedural `src/render/car.ts` body is retained behind `?car=classic`; its geometry
tests do not validate the new model. Read `assets/cars/README.md` before editing
or exporting the Blender car. `pnpm car:export` exports saved hand edits without
regenerating the source; `scripts/build-coupe.py` deliberately overwrites it.
New body clearance uses triangle-vs-convex-wheel tests because its wheel arches
make it concave. Neither asset changes the simulation collider or handling.
The tunnel/bridge now load `public/assets/tracks/blackglass-rivergate.glb` via
`src/render/blender-course.ts`. Read `assets/tracks/blackglass/README.md` before
editing the source. `pnpm track:export` preserves saved hand edits; the original
`build-blackglass.py` generator overwrites the .blend. `track:guide` exports
reference road/barrier data but does not update the authored model. A quantized
route fingerprint plus three anchors reject stale/misaligned exports. Do not
silence that check by changing the stamp without reconciling geometry. The
renderer keeps road/barrier meshes and all physics procedural; only tunnel,
bridge and distant backdrop are authored. `?environment=classic` explicitly
selects the old presentation. Export batches a temporary copy by spatial
section/material; source pieces remain editable. There are four pooled runtime
lights, no imported Blender lights/textures, and no silent asset fallback.
`tests/blender-course.test.ts` checks actual GLB validity, inward winding,
road-envelope clearance, alignment and unchanged road presentation. The browser
harness is `scripts/check-track-browser.js`; staged poses are visual checks,
not evidence of a completed driven lap. The reference-lap test remains the
driving gate. Desktop/mobile screenshots do not certify mobile GPU performance.
The sampled course has
automated centerline, road-clearance, corner-envelope, and reference-driver
checks. It also owns a 24 m elevation profile used by vehicle height,
pitch, barriers, presentation, and deterministic grade acceleration. Vertical
contact remains an arcade road constraint rather than a raycast suspension
model. Four virtual tyre patches do not yet simulate wheel lift, inertia or
individual lockup. The course brief is `design/BLACKGLASS.md`.
The handling model, deliberate assists, limitations, and measured acceptance
gates are described in `design/HANDLING.md`.
The district layout study is documented in `design/DISTRICT.md`. It is now the
default world and is entered as **free roam**: no track selection, no route, no
finish. `/district.html` previews six route guides over shared fixed streets;
`?route=<id>` overlays one, and `?world=blackglass` returns to the original
closed course. These are not scored races: junctions stay open, arrows guide a
route when one is selected, and there are no lap/checkpoint/payout rules yet.
The network is closed by a boundary that belongs to no street, because junction
clipping opens boundary pieces wherever streets cross and the network now
reaches the district's edge; the river banks and lineside are walled the same
way, opened only where a street genuinely spans them. Road class lives in
`src/sim/lanes.ts` with the carriageway width and lane count it implies —
they are one fact, not two — and lanes are laid out to a street's narrowest
point so they do not wander with the junction flare. Massing blocks are solid via `RoadWorld.solids`, kept
apart from `walls` because a wall is 1.3 m of guard rail and renders as one.
Two footprints are kept apart by a separating-axis test on the rectangles
(`blockPenetration`), never by circumscribed circles: a circle cannot express a
shared party wall, so it needs slack, and slack let 15 pairs interpenetrate by
up to 4.21 m. A solid's `rotation` is in `blockCorners`' convention — a 2D
rotation in the (x, z) plane — which placement, every footprint test and the
drawn mesh (`rotation.y = -rotation`) share; the Rapier collider must NEGATE it
(`roadRotation(-rotation, 0)`), because a rotation about +Y has the opposite
handedness. With the sign dropped every building's collider was the mirror
image of its footprint for two days — near-square core blocks hid it; a 32 x 11
warehouse put an invisible wall across Crane Alley and the first race found it.
`tests/district.test.ts` now asks Rapier itself whether each long building's
collider contains its own corner and not its mirror's; note Rapier's spatial
queries answer nothing until the world has stepped once, and its translations
are f32, so match them at 1e-3, not 1e-6. Walls keep their own sign.
Every building has a `base`: the LOWEST drawn ground under its footprint, so no
corner floats and the uphill side is buried by at most the ground's spread,
and placement refuses a plot whose ground drops more than 4 m across it (18
did, all beside the old loop's grades; they stay embankment). Mesh, collider
and every element of the night dressing measure from `base`, never from
datum — at datum, on a district that climbs 20 m, 227 of 321 buildings stood
more than a metre underground and a road on an embankment ran through a
building's floors, which from the car reads as a building clipping the road.
The boundary walls stand on `outerTerrain` for the same reason. A shop spill is
stamped with its own building's base as a vertex attribute so the test that
says "on its own pavement" has a reference that neither flips to the Rivergate
deck (nearest road) nor steps 11 m beside the loop (drawn ground) nor pairs it
with a building on the other level (nearest building). The race readout needs
`#race[hidden] { display: none; }`: its own `display: flex` beat the attribute
and it showed GATE 1/3 in free roam on every screen.
Three rules Shawn asked for are tests in `tests/district.test.ts`, each
mutation-checked: **buildings cannot clip roads** (every footprint edge sampled
against the asphalt that is actually there — already held), **buildings cannot
clip barriers** (no rail piece inside a footprint, no footprint in the river
or rail corridor — the map broke this: 46 buildings in the water, 7 on the
line, 27 rails through 19 of them; placement now clears the corridors and the
walls, 320 buildings became 274, and the wall half of that helper is not
load-bearing on today's map — the test is what enforces it), and **ground
cannot clip above road textures** (terrain, verges, river and rail ribbons
against the carriageway, 10 cm tolerance because the rail ribbon stands 5 cm
proud at a level crossing on purpose — already held). Barriers include the
authored structures: placement refuses a footprint inside a corridor of road
half-width plus 6 m along the tunnel and bridge spans (`blockClearsStructures`),
because to it the tunnel section was just a road and 14 buildings stood inside
the bore 12-15 m off its centreline, five on the floor and nine rising up
through its walls. The bore was measured against the asset, not the profile
that authored it: horizontal rays from the centreline hit the walls at
10.7-11.8 m. On this loop the tunnel runs straight onto the bridge, so the
structural span is one contiguous run, not two. 274 buildings became 272. The
frontage test measures against the kerb that is actually there, never the
narrowest width lanes are laid to — on a flare that put the kerb metres
inboard and read 162 of 272 buildings as off their frontage when 242 stand
within 5 m of the real one. **The night dressing is
built in each building's own frame and then turned by `-site.rotation`** — the
blockout's sign, which matches `blockCorners`. It used to be placed
axis-aligned at `site.x +/- width/2` with the rotation never applied, while the
footprint, the collider, the blockout massing and every clearance test rotate:
218 of 272 buildings were drawn more than a metre out of their own footprint,
with corners in roads, through rails and five metres into the tunnel bore. It
was the actual cause of "buildings clipping" in every night-mode screenshot,
and three other real fixes landed before it was found, because each of them
measured the FOOTPRINT and the footprint was right. `tests/night.test.ts`
now asserts every drawn facade vertex lies inside a real footprint, and that
no lamp post stands in the tunnel (`nearStructure` keeps street furniture out
of the structural corridors; the tunnel lights itself). When a screenshot
disagrees with a passing footprint test, scan the rendered scene's vertices —
`addDistrict` into a bare scene and project them — before trusting either.
The fourth rule the screenshots want is
road-over-road inside junction aprons, which is the apron work below.
**The rail rule.** A rail stands only where it guards something: the boundary,
the river and rail fences, the tunnel and bridge (their barriers are the
deck's edge and the bore's wall), or a street edge with a drop of 1.5 m in
the raw terrain to either side — or water, which the terrain does not show
because the river is drawn 1.6 m under it. 10,808 pieces became 1,756 (1,363
street rails, 192 boundary, 131 river fence, 70 rail fence); buildings are
the walls now and the gaps between them are the shortcuts. `DISTRICT_WALLS`
is the concatenation of four exported sources so a test can ask each its own
question; classifying by geometry mistook a fence piece inside a river bend
for a street rail. The fences follow a MITRED offset of their corridor, like a
lane — per-segment offsets opened an 89 m hole outside the river's bend and
piled up inside it — and a fence piece is removed only where a road CROSSES it
(near and transverse) or where it stands ON a carriageway: the west bank's line
runs down Wharf Road and the east bank's down Ferry Reach, and there the
road's own rail is the barrier. "Near a road" alone opened 77 m of bank beside
Ferry Reach. With the rails gone the car can leave the road, so `RoadWorld`
carries an optional `surface` the sim rides through `drivenSurface` at all
three of its height reads: the road across the carriageway, the drawn ground
beyond it, chamfered over 1.5 m at the kerb because the ground sits 0.35 m
under the road and that step in one tick is a jolt. Blackglass has no
`surface` and is unchanged. `tests/offroad.test.ts` drives off a kerb chosen
by measurement and asserts the car rides the ground without a step.
The district takes the tunnel and the bridge from the authored course, not its
horizon: the Rivergate backdrop was composed "beyond the bridge" of the closed
circuit, and in the district those coordinates are inside the street grid —
its 104 m tower stood across Millgate Crossing with no collider, and no
footprint rule saw it because it is not a `DistrictBlock`. `addDistrict`
detaches `rivergate-backdrop`; Blackglass keeps it. The general lesson: a
thing drawn in the district that the district did not generate is outside
every rule the district enforces, and `__ns.pick` on the offending pixel is
how it was identified — geometry alone spent an hour on the wrong candidates.
Junctions now have one asphalt mesh each: ribbons stop at measured overlap
cuts and share their seam vertices with 35 radial aprons. The driven height
blends street coverage (8 m feather inside, 4 m spill outside the kerb), and
all overlapping grading discs contribute instead of selecting the first.
`src/sim/street-surface.ts` blends nearby segment heights continuously within
each street; selecting the nearest segment at the graded ring-hotel inside
kerb used to jump 0.409 m in 2 cm. The regression scan now measures 0.0041 m.
Fine ribbon sampling interpolates original mitres; recomputing a mitre on
shorter segments folded the inside kerb backwards. The road meshes ask only
for height, avoiding unnecessary pitch projections. `tests/aprons.test.ts`
checks 37,569 drawn-surface probes (one surface, no overlapping interiors,
maximum mesh deviation below 5 cm) and 14,037 hairpin probes. The district
world identity is v3 because its vertical physics changed; Blackglass stays
unchanged. This costs more at load: approximately 1.8 s blockout / 3.2 s night,
versus 0.8 / 1.2 s before aprons on the same machine. See design/DISTRICT.md. `blockClearsStreets` samples every footprint edge against the
width the road ACTUALLY has there, never corners only and never the narrowest
width: corners let a straight frontage cut the chord of a bend by 10 m, and the
narrow width let a building stand on a junction flare a car can drive on.
Placement searches its setback up to 6 m back from the pavement rather than
rejecting, and walks a face's whole perimeter carrying the stride across
vertices — restarting per 4 m vertex generated no candidates at all on ten of
eighteen faces and left the outer two thirds of the district unbuilt.
`pnpm district:critique` is the measuring stick that found that; run it before
and after any layout change, and score a candidate link with
`--try=from,to,metres` before drawing it — Northgate Street was chosen that way,
and no single link moves route choice more than a few points, so do not expect
one to. The south bank's 1065 m run with no decision is the brief's river
barrier, not a bug, until Shawn says otherwise. `groundHeight` is the drawn ground — `outerTerrain`'s shape
clamped below the roads — and the terrain mesh, verges, river and lineside all
read it so they sit on one surface. `outerTerrain` conforms only to the ORIGINAL
loop, which left ground drawn over 39% of road samples; it cannot be fixed
inside `outerTerrain` because street construction calls that for node heights
and the dependency would be circular. A terrain vertex asks `groundHeightNear`
for the lowest ground in its cell, because what is drawn between two vertices is
a straight line a curving road passes under. Before the apron surface work, projection cost fell to 14.5 us
from 50: `projectOntoPath` indexes each polyline in runs of eight segments with a
box each and skips runs that cannot be nearer (bit-identical to the plain
scan, and tested against it), but that was only a quarter of the cost — the
rest was the fallback `candidates.length ? candidates : DISTRICT_STREETS`,
which projected every terrain vertex beyond the roads onto all fifty streets.
`nearestStreetProjection` widens the box margin instead until the nearest
found is provably nearer than anything the boxes excluded. That also corrected
an old wrong answer: with a non-empty candidate set the old code never widened,
so a point inside one long street's box was answered with that street even when
a nearer street's box had missed it; the test compares against brute force
over every street. That brought district construction to 0.9 s before the apron work
(2.2 s before indexing); current construction timings are given above. `RoadWorld` supplies the sim's start,
boundaries and projection; reset must retain that world.
Baseline Blackglass references and handling stay unchanged. District junction
grading is shared by physics and road meshes; do not "fix" it only visually.
`src/sim/lanes.ts` owns the lane model: two lanes each way whose width breathes
with the carriageway (16-22 m here), signed so every lane sits on the right of
its own direction of travel, plus arc-length sampling and `lanePose` — what a
traffic follower or a rival needs to sit in a lane. A lane is its own mitered
polyline; do not go back to offsetting a centreline sample sideways, which jumps
up to 2.79 m at an authored vertex. `lanePose`'s distance is arc length along the
lane's OWN path, in the lane's direction. It was the street's centreline until it
was reparameterised, which made a vehicle's odometer disagree with the ground by
+/-4.62% on the hairpin, opposite in sign between a street's inner and outer
lane; two lanes at equal distance are therefore no longer abreast through a bend
and nothing may assume they are, while routes stay centreline distances. Lane
geometry is memoised, and is a pure function of its inputs rather than state.
It is world geometry, so it
lives in the sim; the renderer paints those lanes rather than deriving its own,
and `laneMarkings` is the single authority on where a divider or an edge line
goes. `districtLanePose` binds it to the district's graded surface. Lanes are
district-only so far; `RoadWorld` does not carry them and Blackglass has none.
`src/sim/traffic.ts` drives those lanes: about two dozen vehicles over the
district (GDD §12 asks for sparse, not dense), deterministic via an integer hash
— never the renderer's `Math.sin`-based `hash01`, whose last bits are not
specified across engines. Conflicts are reserved, not avoided: every crossing is
computed offline from lane geometry, which is only possible because the district
guarantees carriageways overlap only at junctions. The invariant is that nothing
is inside a junction without holding it, enforced by a hard stop on the entry
line. Traffic is kinematic — an immovable hazard, never a second handling model.
That is also why its pose has to be continuous. On 2026-09-12 a lane change was
found to write a vehicle straight onto the next lane, and consecutive lanes do
not meet, so 85% of turns moved one several metres in a single tick — worst
measured 15.25 m against a legal 0.26 m. A kinematic body cannot be pushed, so
the solver evicts whatever the sweep catches: it threw the Sound to Sky rival
sideways at 42 m/s, a gain of 259 g in one tick, and cost her a twelve-second
fallback reset. Giving Moth AWD only changed her arrival time; the defect was
there for any car, including the player's. Three explanations died on the way to
it, each refuted by measurement rather than argument: a raw `setTranslation`
teleport (it already used `setNextKinematicTranslation`), penetration recovery
(the contact manifold read `deepest=0.000`), and a wedge against static geometry
(the only contact was the lorry). The manifold dump settled it. The offset is
absorbed over twice its own length now, which costs a turning vehicle half a
step per tick on top of the step it was taking; interpolating toward the new
lane's pose instead does not work, because that target recedes as the vehicle
drives and the correction grows rather than decays.

A vehicle may claim a movement only at the head of its own approach; claiming
from behind a queue reserves a junction it can never reach and never releases,
which deadlocks every conflicting movement. That was first mis-read as a
capacity cliff at 24-27 vehicles; it is not one, and the test asserts the grant
rather than the deadlock because the symptom has already moved once. Real
capacity is ~55: past that, queues exceed the stall budget and a grant made 34 m
short of the line is stale by the time it is used. Shipped density is 24.
Raising the ceiling means per-conflict-point arrival windows instead of
whole-movement occupancy. `createSim(..., { traffic: false })` turns it
off, which the district reference drivers use because they are geometry checks.
`src/render/traffic.ts` draws it as instanced bodies and lamps, eight draw calls.
**Open-checkpoint racing exists** (GDD §7.3, the Midnight Club format, and the
primary event). `src/sim/race.ts` is the rules — ordered gates, a tick-based
countdown that the sim enforces by zeroing driving input, splits, finish — as a
pure step over the vehicle state, so a replay reproduces the splits;
`src/sim/events.ts` holds the district's races as checkpoint sequences plus a
reference route that is the grid and an authored rival's line, never a
constraint on the player. `SimOptions.race` / `SimState.race` mirror traffic:
stepped after `syncState` at the end of `step()`. `?race=<id>` is a page-level
choice like `?route=` (the main-menu Race button reloads into it); the HUD
shows gate, countdown/clock/finish and position at top centre and draws the
next gate on the minimap (a ring, or a chevron on the rim); `src/render/race.ts`
stands a column of light on the next gate from `state.race.next`. In-game
replay, input recording and the recorded-input rival have been removed.
Restart starts a fresh run. Port Alder now has an authored-route AI opponent;
see the racing-rival notes below. Flexible city navigation remains future work.
Checkpoints are placed where route choice exists, measured per leg with the
critique's arithmetic; `tests/race.test.ts` gates every race on most legs
having a real alternative, and drives the reference line through every gate
with the real sim. The first event is Crane to Crest: Wharf Gate to Hillcrest,
0.88 km, and both real-choice legs are the two alleys.
The district is dressed for night by default (GDD §15.1): lane paint dropped
onto the graded surface, sodium lamps with additive light pools, lit facades and
shopfront glass, neon signage, wet asphalt and a camera-following sky dome. All
of it is generated from the street/block/junction data, is deterministic
(`hash01`, never `Math.random`), and merges into a handful of meshes rather than
adding lights. `?lighting=blockout` restores the flat work view with no dressing
at all, because neon hides the surface errors that view exists to find. There is
no bloom pass and no reflections. Baseline Blackglass presentation is
untouched. `src/ui/hud.ts` draws the speed dial and the heading-up minimap from
`src/ui/hud-state.ts`; the map reads street data, never the renderer, and the
cluster binds to ids that `tests/hud.test.ts` checks against `index.html`.
Changing map/race pages reloads the run and retains saved preferences.
Never use the original `courseGap` for district guides; `districtRouteGap`
wraps circuits and keeps sprint gaps linear. Debug links carry world/route
identity, which future saved ghosts must validate as well as physics/build.
Automatic countersteering is off (`four-wheel-v3`). Manual catches get faster
response and extra range only when the player requests countersteer; neutral
input never steers itself. Ordinary turn-in keeps its speed envelope, while
unwinding is quicker. Pause contained AWD/FWD/RWD comparison
buttons until 2026-09-12, when the drivetrain became a property of the car;
`?drivetrain=` and `__ns.drivetrain()` still reach the same boundary.
Changing layout resets the run; ordinary reset retains the run's drivetrain. Full countersteer can catch longer
30 m/s slides; weak/late corrections and prolonged highway-speed slides remain
limitations. Tests distinguish manual recovery from automatic intervention.
Garage offers NS-01 and Bulwark as selectable bodies with shared handling and
appearance settings. Load the selected body at boot; selecting the other loads
it on demand, preserves simulation/camera state, and saves the selection.
Settings schema 3 adds car selection and migrates schema 1/2 preferences.
`src/settings/settings.ts` owns versioned browser-local preferences, outside the
simulation. Restore preferences before creating the sim/view; synchronize menu
selections from that state. URL overrides are temporary: `settings.preview()`
suppresses writes while `applyDeepLink()` drives the real menu callbacks. Deliberate
menu edits save only their own fields and clear matching URL parameters. Do not
persist physics snapshots, replay data, camera poses or debug flags in this store.
Save failures are visible in Pause/Garage and do not block playing. Historical
AWD performance/contact fixtures name that layout explicitly; default-FWD and
all-layout behavioral coverage remain separate.

Live Cred was the proposed core economy hook until 2026-09-12: style earned in
a race could be burned on Surge or carried across the line as parts currency.
It was dropped, unimplemented, the same day an MC3 progression reference was
read against it. The point of Cred had only ever been to stop nitrous becoming
a crutch, and three currencies, chain rules, a self-feeding-loop guard and a
settlement path replays must not re-run is a large machine for one question.
Finite Surge tanks answer it directly: capacity is bought in the garage, every
event starts full, nothing refills mid-race, and the hoarding problem never
arises because you buy the bottle rather than the fill. Style became reputation
only. `design/LIVE_CRED.md` is kept and marked superseded, because the
reasoning is worth reading before anyone proposes it again.
Every mesh in the car and the course carries a kebab-case `name`, and
`src/debug/debug.ts` installs `window.__ns` for inspection that both people and
agents can drive: `__ns.pick(x, y, screenshotWidth)` names the mesh under a
pixel, `__ns.find`, `__ns.state`, `__ns.drive("W600,WD90")`, `__ns.freeze()`,
`__ns.shot()`. Scene state is reachable by URL — `?scene=garage&paint=blackglass
&stance=slammed`, `?scene=track&drive=W600&freeze=1` — which is the supported
way to reach a specific state; do not script menu clicks. The API clicks the
real menu buttons, so a scripted jump cannot diverge from a human's.
For drivetrain comparisons use `?scene=pause&drivetrain=rwd`, or
`__ns.drivetrain('awd' | 'fwd' | 'rwd')`; these use the same restart boundary.

`pnpm dev` to run, `pnpm test` for deterministic simulation checks, and
`pnpm build` to typecheck + build. CI runs the build on every push.


## Controls menu and input remapping

Main and Pause open the Controls screen. Returning from Controls restores its
originating menu and never resumes a paused run. The driving HUD has no permanent
control guide. `src/input/bindings.ts` defines validated keyboard and controller
button mappings; `src/ui/controls.ts` renders the guide, captures through the input
controller, and saves schema 1 in `nightshift.controls`. Keep navigation and stick
axes fixed so players cannot lose access to menus. Capturing consumes input,
waits for controller-button release, rejects duplicates/reserved controls, and
cancels on Escape, Menu/Options, blur or screen exit. Preserve the driving release
gate and analog trigger values. The garage prompt and recenter hint read bindings.
Tests cover mappings, capture and pause return; `scripts/check-controls-browser.js`
checks live keyboard/simulated-pad delivery, storage, navigation and viewport fit.



## First racing rival

`SimOptions.rival` opts a race into the AI driver. Free roam uses
`SimOptions.encounter` instead: a handbraked dynamic vehicle with no race state,
spawned from `ALDER_ENCOUNTER`. Fixtures omit both by default. `canChallenge`
owns proximity/speed/elevation eligibility. The input adapter supplies a remappable
flash command; main presents the double flash and loads the existing race grid.
Never add race clock/checkpoint progress to the waiting encounter. Keep the garage
body pairing and return-to-free-roam path working in both modes.
`Sim.state.rival` owns vehicle, race, input and driver state;
`Sim.rivalBody` is another dynamic body in the same world. Apply both vehicles'
forces before the single world step; sync both and evaluate their gates afterward.
Do not give the rival a separate physics world or call `world.step()` per vehicle.
Reset reconstructs both bodies, traffic and the driver. The player handling
constants stay unchanged; AI speed plans use the shared cornering envelope.
`alder-rival.ts` owns Sound to Sky's preferred line and checkpoint distances;
`rival.ts` supplies actual inputs and reversing recovery. After 12 seconds without
4 metres of net forward progress, `sim.ts` may reset it at rest near its own route
position. Preserve its clock/checkpoints, stay behind the next gate, check physical
and approaching-vehicle clearance, and retry once per second if blocked. No
catch-up relocation or rubber-banding. The opponent always takes the other garage body, including after
an in-page garage selection. `view.rivalCar` is presentation only; `__ns.state()`
includes rival diagnostics. `tests/rival.test.ts` and the browser harness cover
completion, contact, reset and integration. General routing and personalities
remain future work. See design/PORT_ALDER.md for the first driver's limitations.
