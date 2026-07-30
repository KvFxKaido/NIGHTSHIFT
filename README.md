# NIGHTSHIFT

**Status: Early Concept — Phase 0 (wiring).**
Working title: *Project Nightshift.*

A compact arcade street racer: illegal nighttime racing, one car worth
caring about, rivals with recognizable driving personalities, and a dense
fictional district the player learns until it stops being roads and
becomes a network of possibilities.

> "A small city can feel enormous when the player is still learning how
> to race through it."

The full design is in [`design/GDD.md`](design/GDD.md) — read that first.
This README covers what exists and the two laws the codebase is built on.

## The two laws

**1. The renderer draws; the sim decides.** (GDD §17.2) `src/sim/`
imports nothing from three.js and owns everything that matters — vehicle
state, race rules, rivals, progression. `src/render/` translates sim
state into a picture. If a value affects gameplay, it does not live in
the render layer. This split is what makes systems testable without a
screen, and it is law from the first commit because it cannot be
retrofitted.

**2. The sim is deterministic: fixed tick, no clock, no `Math.random`.**
Every tick is a function of (state, input), and every tick's input is
logged. Hold that line and (start state + input log) IS the run —
time-trial ghosts, rival ghosts, shareable replays, and cheat-resistant
leaderboards all fall out of this one discipline for free. When Rapier
carries the physics, it steps inside this tick, never in the render loop.

## Run it

```bash
pnpm install
pnpm dev        # → http://localhost:5173 — WASD / arrows drive
pnpm build      # typecheck + production build
```

What's on screen today is Phase 0: a placeholder box on a night grid,
proving input → fixed-tick sim → chase camera end to end, with Rapier's
wasm pipeline initialized. The placeholder kinematics are explicitly not
the handling model — that is Phase 1's entire job, and it is the
project's first quality gate: **poor handling cannot be rescued by more
content.**

## Structure

```
NIGHTSHIFT/
├── design/
│   └── GDD.md        # the design document — source of truth
├── src/
│   ├── sim/          # the game: deterministic, renderless, testable
│   ├── render/       # the picture: three.js, knows nothing else
│   └── main.ts       # wiring: input → fixed tick → render + input log
└── index.html
```

## Production order

Per GDD §20: handling prototype → race prototype → district prototype →
game loop → vertical slice polish. The out-of-scope list in GDD §21 is
binding — features on it are reconsidered only after the core loop has
proven itself.

## Lineage

Same garage as [SENTINEL](https://github.com/KvFxKaido/SENTINEL),
different car: this game shares that project's engineering doctrine
(sim/renderer separation, determinism as a test, replay-as-data) but not
its universe. Nightshift's district has working streetlights, civilian
traffic, and a functioning gas station — none of which survived the
collapse next door.
