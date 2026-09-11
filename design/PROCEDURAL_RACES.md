# Procedural races

Design note, 2026-09-10. The GDD wins where they disagree; this is the longer
form of GDD §7.3's "Generated, not authored" paragraph.

**Status.** The generator exists: `src/sim/race-generator.ts` draws a race
from the city per seed, `?race=gen-<seed>` is the race, and the flash in
free roam draws a new one every time (commit `c4a8b5b`). The flow rule
(2026-09-11, `GENERATOR.flow`) keeps a draw from doubling back, and gates
carry the direction the line leaves them for the marker's arrow; both are in
`design/PORT_ALDER.md`. Everything under "Proposed" below is not implemented.

## Shawn's two ideas (2026-09-10)

1. **Every flash is a new race.** When you flash a rival, the race is
   procedurally generated every time. A race repeats only if you save it to
   a playlist.
2. **The rivals you flash learn your line.** After racing a rival enough
   times, that rival — not the other racers in a race — learns from your
   racing line.

These arrived as a possible "more elegant solution" to the shortcut rule
("every shortcut has a cost"). The reading below is how they were taken.

## How they fit together

- **The seed is the race's identity.** `(world version, seed)` reproduces the
  gates and the rival's line, so a playlist entry is that pair (plus the
  rival, once rivals differ), and a saved ghost carries it the way debug
  links carry world/route identity. Nothing else needs storing. Every tick's
  input is already logged (law 2), so "save this race" costs nothing new.
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
   now (world version, seed, start); a playlist keeps all three. The authored
   race ignores `start`, since its line was authored from the grid, and a
   flash from off every street still starts on the grid.
2. **Rival turf bias** on the draw, once there is a second rival to differ.
3. **Calibrate the pace model** by driving the priced corridors (Western vs
   1st, 6th Ave S vs 4th from Jackson): the model's 32 m/s and 2.5 s per
   90 degrees are guesses, and the leg classes rest on them.
4. **Playlists**: a saved list of seeds in `settings` (it is a preference,
   not a physics snapshot), with the world version they were drawn on.
5. **The edge bank and learning rivals**, with a skill cap so the rival does
   not converge on the player's ceiling and climb past it.

## Rules that hold throughout

- Deterministic: the draw and the bank use the integer hash, never
  `Math.random`; a replay of the cruise draws the same race.
- No rubber-banding, no catch-up boost, no grip change — the rival's rule
  already, and it stays the rule for a rival that has learned.
- Learned lines and playlists carry physics/build identity and are rejected
  when it changes, as future saved ghosts must be.
- Only flashed rivals learn. The field in a race is not a learner.
