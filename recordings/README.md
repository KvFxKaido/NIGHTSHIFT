# Lap recordings

Laps driven in Ridge Circuit races land here, in `laps/`, one JSON file per
session. They are the player's own driving and stay on this machine: the folder
is ignored by git except for this file.

**Recording.** Run `pnpm dev` and start a circuit race, solo or against the
rival: `?scene=track&race=arena-full-solo` (or `arena-east`, `arena-ridge`, with
or without `-solo`). The brand line shows `REC`, then `SAVED n LAPS` as each lap
completes; the whole session is rewritten after every lap, so quitting mid-run
keeps every finished lap. Restarting, resetting the car or changing car starts
a new session file. A production build has no endpoint and says `NOT SAVED`.

**Reading.** `pnpm laps` lists every session and lap; `pnpm laps --verify` also
replays each session against the current build; `pnpm laps --json` is for tools.

**The file** (`nightshift-laps-v1`, `src/sim/lap-recorder.ts`):

- Identity: `world`, `physics`, `tickHz`, `race`, `layout`, `solo`, `laps`,
  `car`, `drivetrain`, `start`, and `recordedAt` (wall clock, metadata only).
- `inputs`: throttle, brake, steer and handbrake for every sim tick from the
  first, unrounded. With the identity this reproduces the run exactly; a file
  from another world or physics revision is refused rather than compared.
- `recorded`: completed laps. Each has `seconds` (timed by the race's gates; the
  finish gate is a 12 m circle round the line), `valid` and `reasons`,
  `standingStart` (lap 1 starts from the grid), `gateTicks`, `topSpeed`, and
  `samples`: one array per channel in `channels`, one entry per tick.
- Channels: `tick` (race ticks since the flag), `x`, `z` (m), `heading` (rad),
  `speed`, `lateral` (m/s), `yaw` (rad/s), `throttle`, `brake`, `steer`,
  `handbrake` (the input), `ground` (share of tyres past the paved shoulder),
  `distance` (m round the centreline from the line, negative behind it) and
  `offset` (m from the centreline, positive to the right).
- `trackLimits`: a lap is invalid with any tick fully off the paved surface,
  more than 60 ticks with any tyre off it, or running backwards more than 20 m.

Anything that moves the car outside the fixed tick (debug placement through
`__ns.sim.body`) makes the rest of a session unreplayable, and `--verify` says so.
