# Procedural races

Design note, 2026-09-10. The GDD wins where they disagree; this is the longer
form of GDD §7.3's "Generated, not authored" paragraph.

**Status.** The generator exists: `src/sim/race-generator.ts` draws a race
from the city per seed, `?race=gen-<seed>` is the race, and the flash in
free roam originally drew a new one every time (commit `c4a8b5b`). The career
now draws once per Moth stage and retains that course for losses/retries. The flow rule
(2026-09-11, `GENERATOR.flow`) keeps a draw from doubling back, and gates
carry the direction the line leaves them for the marker's arrow; both are in
`design/PORT_ALDER.md`. The ordered list below marks implemented and future work.

## Shawn's two ideas (2026-09-10), revised by the career cadence below

1. **Every flash is a new race.** When you flash a rival, the race is
   procedurally generated every time. A race repeats only if you save it to
   a playlist.
2. **The rivals you flash learn your line.** After racing a rival enough
   times, that rival — not the other racers in a race — learns from your
   racing line.

These arrived as a possible "more elegant solution" to the shortcut rule
("every shortcut has a cost"). The reading below is how they were taken.

## Adopted career cadence (2026-09-15)

Two wins unlock a rival's pink slip; the third win takes the car and removes
the rival from the map. Moth implements sprint, circuit rematch, then unordered
checkpoints; since phase 2 every Blacklist name has three stages of its race
(`design/BLACKLIST.md`, "The chain"). A new stage draws once, losses retry it, and old wins never advance
or pay again. The future playlist is where retired rivals' races remain playable.
This supersedes the original every-flash redraw and indefinite post-win encounters
for career rivals. Edge-bank learning is still unimplemented; learning from the
first two wins could affect later stages, not resurrect a retired street rival.

## How they fit together

- **The seed needs versioned context.** The course identity is
  `(ALDER_VERSION, GENERATOR_REVISIONS[kind], race id, start)`. The race id combines
  seed and variant, `gen-<seed>[-circuit|-unordered]`; Moth's stage chooses the
  variant, while a developer link may name it outright. A future playlist also
  needs the rival once rivals differ; a ghost additionally needs physics/build
  identity and its recorded run. The pace calibration changed the race 280 of
  300 seeds drew while the world version stood still. `GENERATOR_REVISIONS`
  names that dependency, and `tests/race-generator.test.ts` fingerprints the
  draw so it cannot silently move under the same name.
- **A rival is the distribution of races it proposes.** Bias the draw
  towards a rival's own streets and it has a personality before it has
  driven a metre: the SoDo rival drags you through the docks, the hill rival
  up the hill. Cheaper and more legible than tuning driver AI.
- **Learning is per street edge, not per race.** Keep, per (street,
  direction), the best trace seen — the player's or the rival's — as apex
  speeds and lateral offsets, not raw inputs, because a line is only fast in
  context. The rival drives from that bank where it has one and from the
  routed centreline where it does not. Learning per edge is what survives
  generated races: streets recur even when routes do not. The moment it is
  felt: he takes your alley.
- **A rival learns only from races the player won against it** (2026-09-12).
  The bank takes the player's trace from a win, never from a loss. Rivals are
  also the career's Blacklist (GDD §5), and a name that learned from every
  failed attempt would get harder with each retry, the loss spiral GDD §5.1
  rules out. Studying the line that beat them makes a rematch harder and a retry
  not.
- **The shortcut rule is the generator's constraint.** Risk per street is
  computed from the map (width, bends, grade, blind corners); reward per leg
  is the time the real alternative costs; the draw weights legs whose fast
  way is the risky way. A cost-free shortcut is not fixed by any of this — a
  learning rival makes it shared, not interesting — so the map still needs
  authored cut-throughs, and `pnpm alder:critique` says where.

## Proposed, in order

1. **Start where you flashed.** *Done 2026-09-11.* The flash pose is snapped
   to the right-hand lane of the street it is on, facing the way it was
   going and at least 15 m short of the junction ahead (`src/sim/race-start.ts`),
   carried across the page transition as `?start=x,z,heading`, and snapped
   again on load so the pose the URL carries is the pose driven. The
   generator's origin is the junction ahead of it and the rival starts 7 m
   ahead in the other lane, in the start's own frame. A race's identity is
   now (generator revision, world version, race id, start), the id being the seed plus its
   variant; a playlist keeps all four. The authored
   race ignores `start`, since its line was authored from the grid, and a
   flash from off every street still starts on the grid.
2. **Rival turf bias.** *Done 2026-09-15* as data for nine names and a lean
   on Moth's stage draws (`src/sim/alder-turf.ts`; `design/PORT_ALDER.md`,
   "Rival turf"). Shawn's calls: all ten names now, geography only, a soft pull
   toward a centre and radius. Measured, the pull has a ceiling: from nine turf
   centres a race is 34% inside its 800 m turf with no pull and 42% at the
   pull chosen, because the flow rule carries a 3 km race out of any area that
   size. Where a rival's races start, which is where it cruises, is most of what
   makes them its own; the pull is the rest. Street taste is still a proposal.
3. **Calibrate the pace model.** *Done 2026-09-15*, from recorded Uptown
   Circuit laps rather than the priced corridors, which nobody had driven for
   the record (`pnpm pace`; `design/PORT_ALDER.md`, "Pace, calibrated"). The
   2.5 s per 90 degrees held; the pace was 36% slow and is now 50 m/s. The
   generator's second limits were scaled by 0.7 so races kept their distance,
   and 280 of 300 seeds draw a different race. Width and grade are still
   guesses, and the corridors named here were not driven: a recorded run down
   Western against 1st would test the model where the generator most relies on it.
4. **Playlists.** *Done 2026-09-15*, as the race list (Pause or title → Race
   list; `design/PORT_ALDER.md`, "Race list"). Shawn's calls: the results of a
   generated race offer Keep, and won career stages are listed from the career
   without being kept; free roam can draw a new race from where the car is,
   which is idea 1 outside the career; the authored races are always listed; and
   every entry starts against the rival or solo. Kept races live in their own
   key, `nightshift.playlist` (`src/settings/playlist.ts`), not in settings as
   first proposed: the list grows, and an unreadable one must not take Options
   with it. Each entry carries (`ALDER_VERSION`, its kind's generator revision, race id,
   start); one from another build stays listed, unplayable, until removed.
5. **The edge bank and learning rivals**, with a skill cap so the rival does
   not converge on the player's ceiling and climb past it.

## Rules that hold throughout

- Deterministic: the draw and the bank use the integer hash, never
  `Math.random`; a replay of the cruise draws the same race.
- No rubber-banding, no catch-up boost, no grip change — the rival's rule
  already, and it stays the rule for a rival that has learned. Recovery out
  of the player's sight is allowed (2026-09-13): a stuck rival put back on
  its line where it already was, never further along.
- Learned lines and playlists carry physics/build identity and are rejected
  when it changes, as future saved ghosts must be. For a stored race that is
  `ALDER_VERSION` and its kind's `GENERATOR_REVISIONS` entry.
- Only flashed rivals learn, and only from races the player won against them.
  The field in a race is not a learner.

## The pace model is the course's, not the car's (2026-09-19)

`PACE` in `src/sim/route-choice.ts` prices every street the draw considers, and
its `top` was fitted to recorded Uptown laps in the Cinder. With ten tuned cars
in the game and Tally's Vesper running 165 mph, the obvious question is whether
the draw should know which car is racing. It should not, and the measurement is
what says so rather than taste.

- **`top` is not a top speed.** The fit (`pnpm pace`, 153 corner windows) puts it
  at 50.7 m/s — 114 mph, well under the Cinder's own 140 mph governor — because
  it is the straight-equivalent pace a car actually holds between corners on
  city streets. The fleet's spread in that number is the ladder's street pace:
  the Vesper is 7.1% quicker than the Cinder, so its equivalent `top` is about
  53.8 m/s, not 73.8. For scale, traffic moves the same fitted number by 1.3 m/s
  (clear laps fit 51.7, laps in traffic 50.4), so whether the street is busy
  matters about as much to the model as which of the ten cars is on it.
- **Over that spread the map's verdicts barely move.** `pnpm pace --sensitivity`
  measures it, over 646 legs in the generator's window: 7% quicker with the
  corner cost moved to match reclassifies 2 legs and moves no fastest route.
  Even at the naive 73.8 m/s the `free` legs — the defect class, the shortcut
  that costs nothing — go 123 to 117 and `priced` 98 to 101; most of the
  movement is `twin` against `even`, the two classes that both mean "no
  shortcut either way".
- **But the draw itself is chaotic in the pace.** The same 7% that reclassified
  two legs redrew 212 of 240 races (120 seeds x sprint and circuit). The leg
  window is fixed in SECONDS, so it decides which junctions are candidates at
  all: 728 junction pairs enter the 8-28 s window and 118 leave it, 17% churn on
  5,020, and the weighted draw diverges from the first gate that lands
  differently. The window also grows — 5,020 pairs to 5,630 — so a car-aware
  pace would make the fast cars' races longer in ground as well as different.
  A pace that knew the car would therefore redraw every stored course the moment
  the player changed car — and a stored course's identity (`ALDER_VERSION`, its
  kind's revision, race id, start) has no car in it.

So the pace model stays a declared constant of the city. `tests/route-choice.test.ts`
holds it there by scanning the draw's import closure: nothing `route-choice.ts` or
`race-generator.ts` reaches at runtime may see `car-handling.ts`. A future race
that wants to be priced for its driver needs a car in the stored identity first,
and that is a scope decision, not a tuning one.
