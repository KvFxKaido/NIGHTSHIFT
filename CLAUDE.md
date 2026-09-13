# CLAUDE.md

Context for AI assistants working on NIGHTSHIFT. Short on purpose: this file
says what the project is, the rules that never bend, where things live, and
the traps that have already bitten someone. The stories behind the traps are
in `design/FIELD_NOTES.md`; read the relevant one before touching a system.

## What this is

A compact arcade street racer — night, one district, one car the player
grows attached to, rivals as driving personalities. The design document
at `design/GDD.md` is the source of truth; when this file and the GDD
disagree, the GDD wins, and when code and the GDD disagree, say so out
loud instead of quietly picking one.

Working title: Project Nightshift. Status: Early Prototype — Phase 1
(handling), with a playable Port Alder slice around it.

## The two laws (non-negotiable)

1. **The renderer draws; the sim decides** (GDD §17.2). `src/sim/`
   imports nothing from three.js — no exceptions, no "just this once."
   Vehicle state, race rules, rival behavior, progression, traffic,
   input mapping: all sim. The render layer translates state into
   meshes, lights, particles, and camera; it never decides anything.
2. **The sim is deterministic.** Fixed tick (`TICK_HZ` in
   `src/sim/sim.ts`), no clock, no `Math.random`, no platform queries
   inside the sim. Every tick's input is logged; (start state + input
   log) must always reproduce the run. This is the ghost/replay
   foundation and it cannot be retrofitted, so any change that would
   break it is a design discussion, not a refactor. When Rapier carries
   physics, it steps inside the sim tick at fixed DT — never in the
   render loop — and its determinism constraints (same build, fixed
   timestep) are part of law 2. Rapier is pinned exactly; physics revisions
   carry `PHYSICS_VERSION`. Reset reconstructs the world/contact caches.
   Same-runtime collision replay is tested tick-for-tick and by world snapshot;
   this does not certify cross-browser floating-point parity. Future saved
   ghosts must carry physics/build identity and reject incompatible versions.

## House rules (inherited from the SENTINEL workshop)

- **Execute the claim.** Before asserting something is verified, run the
  exact thing that would fail if the assertion were false. Inspecting
  code, narrating arithmetic, or grepping for the convenient form of a
  pattern is a claim wearing verification's clothes.
- **The repo is the only witness an agent gets.** Handling tuning is
  committed on its own, with `design/HANDLING.md` updated in the same
  commit, so `git log -- src/sim/sim.ts` and the physics revision in
  HANDLING.md are the record of Phase 1 work. Read them before concluding
  from commit titles that handling has been neglected: a content sprint
  in the log does not mean the car was not driven. Pad feel is real
  evidence that the suite cannot hold; a dated line in HANDLING.md is
  where it goes.
- **Respect the current slice boundaries** (GDD §21). Port Alder may grow
  naturally from driving feedback. Police and other selective LA ideas are
  deferred possibilities, not permanently prohibited or already authorized
  implementation tasks. Do not restore a second playable map or expand the
  current feature set without a user scope decision.
- **Handling is the first quality gate** (GDD §22). Poor handling cannot
  be rescued by more content. Phase 1 work outranks everything until the
  car feels good.
- Phase 1's handling values are intentionally centralized in `HANDLING` in
  `src/sim/sim.ts`. Tune from evidence gathered on the handling course; do not
  scatter feel constants through simulation or rendering code.
- More than one assistant works here (Claude and Codex have both done work).
  Docs beside the code (`design/HANDLING.md`, `design/PORT_ALDER.md`) are
  updated by whoever changes the system; this file is not the place to
  narrate a session. Put the story in `design/FIELD_NOTES.md` and the
  trap, in one line, under Traps below.

## Product direction

- MC3 spiritual successor, with selective LA ideas possible later.
- Open racing: no unnecessary barriers, no wrong-way penalties, just slower
  alternatives between ordered checkpoints. Real obstacles retain collision.
- Port Alder is the sole demo map; grow it organically. It is adapted from
  Seattle centerlines and keeps the borrowed street names, but the city is
  its own place (renamed 2026-09-11). Code handle `alder`, display name Port
  Alder; `seattle.html` and `?world=seattle` still resolve here. "Seattle"
  in the docs means the real city the data came from. MC3 San Diego is a
  scale reference, not a demand for another city or a fixed area.
- Treat the released SoDo/Belltown/Alder Center area as the southwest corner
  of the eventual map and preserve its driving geometry. Newer areas favour
  shorter blocks, varied streets and connected routes north and east.
- Graphics resemble upscaled/emulated MC3 rather than photorealism.
- Preserve the current handling in Three.js/Rapier. PC prototype first;
  RedMagic 10 Pro is the eventual device, port and testing later. Capacitor
  is an option, not a decision. The Godot workshop in `godot-prototype/` is
  a reference experiment, not a migration.
- Customization target: body parts, paint and a few simple performance
  upgrades. Today: paint, wheel finish, visual ride height, and a layered
  NS-01 livery editor (`src/customization/livery.ts`); all visual only.
- **Surge** (GDD §3.6, 5.1, 8.4) is the proposed nitrous verb and is **not
  implemented**: a few finite tanks, capacity bought in the garage, full at
  every event start, no mid-race refill and no passive recharge. Style earns
  no reputation and converts into nothing; reputation unlocks performance
  parts, and a ten-name Blacklist that opens with losing the NS-01 gates the
  career (GDD §5, 5.1; none of it implemented). The Live Cred style-to-speed
  economy it replaced was dropped on 2026-09-12 and kept, superseded, in
  `design/LIVE_CRED.md`; do not reintroduce it without a scope decision.
- Procedural races are the direction (`design/PROCEDURAL_RACES.md`): every
  flash a new race, playlists keep one, flashed rivals learn your line per
  street. Read it before touching races or rivals.

## What exists (2026-09-12)

Port Alder is the only playable map and the default at `/`. Blackglass was
retired on 2026-09-10; its geometry and GLB are developer regression
fixtures outside the playable bundle, and old world links redirect.

- **Driving.** Four-tyre planar model. The drivetrain belongs to the body, not
  to a menu: the Cinder is RWD and the Bulwark AWD (`CAR_DRIVETRAIN` in
  `src/customization/cars.ts`), so changing car starts a fresh drive.
  `createSim` still defaults to FWD, which is what the regression fixtures
  measure, and `?drivetrain=` / `__ns.drivetrain()` stay developer controls
  that do not persist. Physics revision `four-wheel-v6`; see
  `design/HANDLING.md` for the
  model, executed gates and known limitations. Automatic countersteering has
  been off since v3; v5 added RWD slide-exit traction sharing and brought
  FWD/RWD to the same 140 mph governor as AWD; v6 makes grass and bare ground
  past the pavement cost a 2WD car grip and pace (AWD exempt), wherever the
  world reports ground (`RoadWorld.ground`, `alderGround`).
- **Free roam** starts at Wharf Garage in SoDo. Stop at the shutter to
  enter; the garage has a fixed camera and offers Cinder and Bulwark bodies,
  paint, wheel finish, visual stance and a livery editor whose panels derive
  from each body (all visual only; liveries are a per-car browser profile,
  not part of save slots).
- **Encounters and generated races.** A rival cruises a freight-block loop
  near the garage; flash it (F / Square) to race. The generator draws gates
  per seed from the route-choice arithmetic (`route-choice.ts`,
  `race-generator.ts`) and starts the race where you flashed
  (`race-start.ts`). Sprint, two-lap circuit and unordered variants;
  `?race=gen-<seed>[-circuit|-unordered]`. Sound to Sky is the authored race
  and the rival tests' fixture.
- **Rival.** One AI driver in the same physics world, routed line, no
  rubber-banding, reversing recovery and a local reset after 12 s stuck.
- **Rivet / Harbor Quarter drag** with a five-speed manual gearbox
  (`transmission.ts`, `drag-rules.ts`), the Hammer rival car, assisted lane
  changes. **Sable / South Wharf drift** yard with chained scoring
  (`drift-rules.ts`). The garage-area cruiser is **Moth** in a Kestrel rally
  hatch (`MOTH` in `encounter.ts`; the challenge id is her id). Pull alongside
  any of the three and the HUD shows their contact card — face, name, car and
  what the challenge is (`src/ui/rival-card.ts`). Rival portraits, and the
  style that keeps them one game: `design/CHARACTERS.md`.
- **Traffic.** About 260 kinematic vehicles with reserved junction
  movements (`traffic.ts`); an immovable hazard, never a second handling
  model. One per 900 m of lane (`TRAFFIC_SPACING`) over Port Alder's 302 km,
  which is still sparse. The density-24 and ceiling-55 figures in
  `design/FIELD_NOTES.md` are the retired district's 192 lanes, not this map.
- **UI.** Speed dial / tachometer and heading-up minimap (`src/ui`), a city
  map overlay (M), named save slots, versioned browser-local settings,
  Controls remapping, performance overlay, telemetry toggle.
- **Editor** at `editor.html` places buildings in Port Alder; validated saves
  go to `src/sim/alder-layout.json`. Read `design/EDITOR.md` first.
- **Critique tools.** `pnpm alder:critique` scores route choice and can price
  a proposed alley (`--try=`); run it before and after authoring streets.

## Where things live

| Area | Path | Doc |
|---|---|---|
| Vehicle model, `HANDLING`, `PHYSICS_VERSION`, tick | `src/sim/sim.ts` | `design/HANDLING.md` |
| Port Alder streets, terrain, plots, layout | `src/sim/alder*.ts`, `src/sim/alder-*.json` | `design/PORT_ALDER.md` |
| District machinery: footprints, surface, aprons, lanes, kerb props | `src/sim/district.ts`, `street-*.ts`, `building-*.ts`, `lanes.ts`, `kerb-props.ts` | `design/DISTRICT.md` |
| Route choice, race generation, race start, race rules | `route-choice.ts`, `race-generator.ts`, `race-start.ts`, `race.ts`, `events.ts` | `design/PORT_ALDER.md`, `design/PROCEDURAL_RACES.md` |
| Rival, encounter, traffic | `rival.ts`, `alder-rival.ts`, `encounter.ts`, `traffic.ts` | `design/PORT_ALDER.md` |
| Rival portraits, HUD contact card | `design/reference/characters/<id>/`, `src/ui/rival-card.ts` | `design/CHARACTERS.md` |
| The Blacklist: the ten career names (sketch) | — | `design/BLACKLIST.md` |
| Drag, drift, gearbox | `drag-*.ts`, `drift-*.ts`, `transmission.ts` | `README.md` |
| Rendering | `src/render/` | `design/DISTRICT.md` (night dressing) |
| HUD, menus, map, saves, controls, livery UI | `src/ui/`, `src/settings/`, `src/input/`, `src/customization/` | `README.md`; `design/EDITOR.md` for the workshop |
| Debug API (`window.__ns`) | `src/debug/debug.ts` | below |
| Car and course assets | `assets/` | `assets/cars/README.md`, `assets/tracks/blackglass/README.md` |
| MC3 / MCLA rosters, unlocks, REP economy (research data, csv) | `design/reference/midnight-club/` | its `README.md`, then `digest.md` |
| The stories | — | `design/FIELD_NOTES.md` |

## Traps (each one has already cost a day)

- A solid's `rotation` is `blockCorners`' convention, a 2D rotation in (x, z).
  Placement, footprint tests and the mesh share it; the Rapier collider must
  NEGATE it (`roadRotation(-rotation, 0)`). Walls keep their own sign.
- Rapier spatial queries answer nothing until the world has stepped once,
  and its translations are f32: match at 1e-3, not 1e-6.
- Deterministic hashing in the sim is the integer hash, never the renderer's
  `Math.sin`-based `hash01`, whose low bits differ across engines. `hash01`
  is for dressing only.
- Every building measures from `base` (lowest drawn ground under it), never
  from datum. The night dressing is built in the building's frame and turned
  by `-site.rotation`; footprints passing does not prove the drawn mesh is
  in the footprint. Scan rendered vertices before trusting a screenshot.
- A merged city-wide mesh has a city-wide bounding sphere and is therefore
  drawn in full from everywhere; only chunked geometry culls. New merged
  scenery must be listed in `CHUNKED_SCENERY` (`render/city-chunks.ts`) or it
  silently costs its triangles from every position on the map. Chunk children
  are named `name:cell`, like the evergreens'.
- Footprint separation is a separating-axis test (`blockPenetration`), never
  circumscribed circles. Clearance samples every footprint edge against the
  width the road actually has there, never corners and never the narrowest
  width.
- `lanePose` distance is arc length along the lane's own path. Two lanes at
  equal distance are not abreast through a bend; routes stay centreline.
- A traffic vehicle may claim a junction only at the head of its approach;
  claiming from a queue deadlocks. The test asserts the grant, not the
  symptom, because the symptom has moved once already.
- Lanes are independent offset polylines, so consecutive lanes do not meet. A
  vehicle changing lane absorbs that offset as it drives (`beginHandoff` /
  `absorbHandoff` in `traffic.ts`); it is never written straight onto the new
  lane. Doing that moved a vehicle up to 15 m in a single tick on 85% of turns,
  and traffic bodies are kinematic, so the sweep evicted whatever was beside
  them — it launched the race rival at 42 m/s. The per-tick step is guarded in
  `tests/alder.test.ts`; every other traffic invariant samples every tenth tick
  and cannot see a one-tick discontinuity.
- `#race[hidden] { display: none; }` is load-bearing; the readout's own
  `display: flex` beats the attribute. The rival contact card is
  the same shape: it is `display: grid`, so the rule naming `#rival-challenge[hidden]`
  is the only thing keeping a face off the screen in free roam.
- Never import the legacy district or Blackglass to reuse a helper; the
  production build rejects them. Shared helpers are `street-path.ts`,
  `building-footprint.ts`, `street-traffic.ts`.
- Authored plots are their own list (layout schema 2); nothing is keyed to
  the generator's output, so a rebuild cannot orphan a hand-placed building.
- Alleys are noded only among themselves, join at existing junctions, carry
  the `sea-alley-` prefix and displace pinned plots. Score one with
  `--try`, draw one, measure again. Do not go crazy with them.
- The rival gets its own forces, then ONE `world.step()` for both bodies.
  Never a second physics world. No catch-up, no rubber-banding, no grip
  change for AI, learned or not.
- `SimOptions.encounter` is a handbraked vehicle with no race state; never
  add race clock or checkpoint progress to it.
- Settings never persist physics snapshots, replays, camera poses or debug
  flags. URL overrides are previews; deliberate menu edits save only their
  own field.
- `decodeSaves` requires each slot's build to decode as exactly `"saved"`, and
  its throw sits outside the loop: one slot naming a value that only *recovers*
  discards every slot, not that one. Retiring a `PlayerCarId` therefore needs an
  entry in `RETIRED_CARS` (`settings.ts`), which migrates the old value without
  reporting recovery. The NS-01 became Sable's car this way.
- `src/sim/alder-data.json` is 24 MB. Fine on PC; a load-time question on
  the phone. Do not add to it casually.
- The test suite takes about 7 minutes and CI runs `pnpm build` only. A push
  that breaks the tests is green on GitHub. Run `pnpm test` yourself.
- Blackglass fixtures name AWD explicitly where they measure AWD; do not
  "fix" a default-FWD number by editing a historical AWD one.

## Debugging without a screen

Every mesh carries a kebab-case `name`. `window.__ns` (`src/debug/debug.ts`)
exposes `pick(x, y, screenshotWidth)`, `find`, `state` (includes rival
diagnostics), `drive("W600,WD90")`, `freeze()`, `shot()`,
`drivetrain('awd'|'fwd'|'rwd')`. Reach states by URL, never by scripting
menu clicks: `?scene=garage&paint=blackglass&stance=slammed`,
`?scene=track&drive=W600&freeze=1`, `?scene=pause&drivetrain=rwd`,
`?scene=track&visit=rivet`, `?race=sable-yard-drift`. Browser harnesses:
`scripts/check-track-browser.js`, `scripts/check-controls-browser.js`.
Staged poses are visual checks, not a driven lap; the reference-lap test is
the driving gate, and screenshots do not certify mobile GPU performance.

## Commands

```
pnpm dev              # run
pnpm test             # deterministic simulation checks (~7 min)
pnpm build            # typecheck + build (what CI runs)
pnpm alder:critique   # route-choice report; --json for agents, --try=x1,z1,x2,z2[,w] to price an alley
pnpm car:export       # export saved Blender car edits (see assets/cars/README.md)
```

## Relationship to SENTINEL

Same engineering doctrine, different universe — deliberately. Do not
import SENTINEL lore, factions, or aesthetics here; the decision and its
reasoning live in the SENTINEL session history (2026-07-30). If a
crossover ever happens, it is Shawn's call at naming time, not an
assistant's flourish.
