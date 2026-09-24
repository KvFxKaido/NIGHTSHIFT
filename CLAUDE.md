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
- **Mark what a change moves.** Changing a layer of the sim (the tyres, a tune, the world, lanes, how traffic
  drives or which traffic, the rival, the generator) means finding its row in `design/COUPLINGS.md` and marking
  every number measured on it suspect; re-measuring marks it current, and a new tuned number gets an entry. The
  lane corner share 0.80 was measured on traffic that moved turning cars 15 m in a tick and on steering that asked
  for a third of the wheel, both fixed within two days, and nobody went back to it.
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
- Graphics resemble upscaled/emulated MC3 rather than photorealism. The city is
  a working port on the night shift, with sodium lamps and dry streets; its
  rules, and the check anything new passes first, are `design/LOOK.md`. The cars
  are drawn like the rival portraits: three flat bands of their own colour, an
  ink outline, the race's cyan on the rim (`src/render/cel.ts`). Since
  2026-09-24 the buildings are too: the same ink on every footprint, and bands on
  the facades that keep the night's blue and lift the lit sides off black
  (`src/render/drawn-buildings.ts`). Traffic is not drawn.
- Preserve the current handling in Three.js/Rapier. PC prototype first;
  RedMagic 10 Pro is the eventual device, port and testing later. Capacitor
  is an option, not a decision. The Godot workshop in `godot-prototype/` is
  a reference experiment, not a migration.
- Customization target: body parts, paint and a few simple performance
  upgrades. Today: paint, wheel finish, visual ride height, and a layered
  livery editor (`src/customization/livery.ts`); those appearance edits are visual
  only. Car ownership and buying Bulwark are implemented separately.
- **Surge** (GDD §3.6, 5.1, 8.4) is the proposed nitrous verb and is **not
  implemented**: a few finite tanks, capacity bought in the garage, full at
  every event start, no mid-race refill and no passive recharge. Style earns
  no reputation and converts into nothing; reputation unlocks performance
  parts, and a ten-name Blacklist that opens with losing the NS-01 gates the
  career (GDD §5, 5.1). The ten-name career (three stages each), cash and car
  ownership are implemented; the opening, later chapters, reputation and Surge are not. The Live Cred style-to-speed
  economy it replaced was dropped on 2026-09-12 and kept, superseded, in
  `design/LIVE_CRED.md`; do not reintroduce it without a scope decision.
- Procedural races are the direction (`design/PROCEDURAL_RACES.md`). A career
  stage draws once; losses retry that course. Two wins unlock the pink slip; the
  third retires the name from the map. The race list keeps won stages.
  Learning from earlier wins remains unimplemented and could affect later
  stages; retirement supersedes repeat street encounters after the pink slip.

## What exists (2026-09-15)

Port Alder is the only playable map and the default at `/`. Blackglass was
retired on 2026-09-10; its geometry and GLB are developer regression
fixtures outside the playable bundle, and old world links redirect.

- **Driving.** Four-tyre planar model. The handling belongs to the body, not
  to a menu: each car is a tune of the one model (`CAR_TUNES` in
  `src/sim/car-handling.ts`, 2026-09-19) — its drivetrain (the Cinder RWD, the
  Bulwark AWD), a few multipliers and a mass that is felt only in contact — so
  changing car starts a fresh drive. `pnpm cars` measures every car; the Cinder
  is the anchor the others are tuned against. The Bulwark (r2) is the first car
  tuned off its layout: heavy and planted, a second quicker to 60 than the
  Cinder and slower wherever the road is fast. Moth's Kestrel (r2) is tuned to
  about even with the Cinder, a little quicker on streets, Stray's Latch (r2)
  to about even, Rivet's Hammer (r2) to a quarter mile a clean Cinder just wins,
  Bollard's Breakwater (r2) to a heavy brick that wins every shove, Deuce's
  Wager (r2) to a revvy rotary 2.5% quicker on streets, and Sable's NS-01 (r2) to
  the drift car (the card's slide columns: 15.02 s held at 29.6 degrees, both the
  fleet's highest), and Plumb's Meridian (r2) to a fast wagon
  4% quicker on her street circuits, and Crest's Skim (r2) to the lightest car on
  the best tyres, Wake's Reign (r2) to the all-rounder at #2, and Tally's Vesper
  (r2) to the one car past the cap at 165 mph. Every Blacklist car is tuned, and
  street pace climbs the list (`design/HANDLING.md`, "The ladder pass"), Rivet
  apart: her race is the drag strip and she is poor on streets by design
  (`design/BLACKLIST.md`, "Top speeds and pace, per car"). `createSim` still defaults to the
  shared model on FWD, which is what the regression fixtures measure, and
  `?drivetrain=` / `__ns.drivetrain()` stay developer controls that keep the car
  and do not persist. Physics revision `four-wheel-v6`; see
  `design/HANDLING.md` for the
  model, executed gates and known limitations. Automatic countersteering has
  been off since v3; v5 added RWD slide-exit traction sharing and brought
  FWD/RWD to the same 140 mph governor as AWD; v6 makes grass and bare ground
  past the pavement cost a 2WD car grip and pace (AWD exempt), wherever the
  world reports ground (`RoadWorld.ground`, `alderGround`).
- **Free roam** starts at Wharf Garage in SoDo. Stop at the shutter to
  enter; the garage has a fixed camera, starts new profiles in Cinder, sells
  Bulwark for $1,500 and allows each won Blacklist car to be selected. It offers
  paint, wheel finish, visual stance and a livery editor whose panels derive
  from each body (appearance edits only; liveries are a per-car browser profile,
  not part of save slots).
  The garage shows measured stat bars from `src/customization/car-stats.json`, regenerated by `pnpm cars:stats`.
- **Encounters and generated races.** Moth cruises a freight-block loop
  near the garage; flash her (F / Square) to race. Since 2026-09-15 the other
  seven non-parked Blacklist names cruise loops in their turfs
  (`alder-cruisers.ts`, sim `cruisers`); a flash draws `gen-<id>-<seed>[-kind]` of
  their nearest race type in their own car. Only the lowest unbeaten name's flash
  is a career stage (`progress.flashName`); anyone higher races for nothing. The generator draws gates
  per seed from the route-choice arithmetic (`route-choice.ts`,
  `race-generator.ts`) and starts the race where you flashed
  (`race-start.ts`). Sprint, two-lap circuit and unordered variants;
  `?race=gen-[<turf>-]<seed>[-circuit|-unordered]` (`race-id.ts`). A turf leans
  a rival's draws toward its home ground (`alder-turf.ts`, nine names, soft pull):
  Moth's stages draw `gen-moth-<seed>`. Sound to Sky is the authored race
  and the rival tests' fixture.
- **Rival.** One AI driver in the same physics world, routed line, no
  rubber-banding, reversing recovery and a local reset after 12 s stuck, or
  after 2.5 s out of the player's sight (`UNSEEN_RECOVERY`), never further along
  (only a second 12 s reset where the last one put it may go past a blockage).
  Behind the player and more than 140 m away it drives the road as if it were
  empty (`UNSEEN_ROAD`, `driver-v4`, 2026-09-23): it cannot be shaken, and it is
  never faster than its own clear-road self. It
  races the player rather than yielding: passes, holds its line, blocks and
  does not lift for contact (`RIVAL_RACING`, `design/PORT_ALDER.md`). On a street
  it rests half-way into the inner lane going its way (`RIVAL_LANE`) and drives
  each junction as an arc within its own side (`RIVAL_STREET_CORNERS`). Its
  cornering is tuned to recorded laps; past about 0.8 of the grip-limited speed its
  tracking, not its grip, is the limit. Steering feedforward raised that ceiling
  without removing it, and only on streets, so the two surfaces now take their
  corner speed from their own plan (`design/PORT_ALDER.md`, "How hard the rival
  corners"): a street 0.80 (`RIVAL_CORNERING`), a racing line 0.76
  (`RIVAL_BRAKING`), which is all its own width leaves it. The one street race
  with no traffic, Uptown Circuit / Clear, drives a street racing line that cuts
  the corners that are not grass (`alderDrivable`), at 0.88 (`RIVAL_STREET_LINE`,
  Shawn 2026-09-20: about a second a lap quicker than his best with no pedal assist). In
  traffic (generated street races and Uptown; not Sound to Sky, cruisers or Moth) the
  route stays the centreline with its lane arcs, and the same line rides on it as a shift
  from the lane that is taken one corner at a time, while traffic's forecast shows that
  corner clear (`street-line.ts`, `full-line-v29`): in its lane into a corner, across the
  apex, wide on the way out. A pass of slower traffic on a straight is planned whole and
  held to one side (`traffic-pass.ts`, `full-line-v30`, Codex). Over 83 races alone in
  traffic that is 4.8% quicker with no contact on a line or in a committed pass; Uptown
  is 9 s a lap quicker. Each Blacklist name takes a line's corners at its own share
  of the grip (`BLACKLIST_CORNERING`, 0.84 for Moth to 0.975 for Tally, `full-line-v31`;
  `design/BLACKLIST.md`); a race with no name on it, the circuits included, keeps
  0.88. Shawn raced Uptown in traffic at v30 and won both laps it finished, by 1.5 and 2.9 s, and
  Wake at v31 by 5.2 s, which produced `full-line-v32`: every rival steers for the wheel a turn
  takes and not its geometry alone (`steadyWheelAngleFor`, `RIVAL_STEERING.slip`), reads a car that
  follows its road in the road's frame where that car is (`RIVAL_TRAFFIC_FRAME`), stays out in a
  pass blocked only by the car being passed, and gets a line through a gentle bend where that is
  quicker than the lane (`design/PORT_ALDER.md`, "What one recorded race found"). Over 83 races
  alone against v30: 1.0% quicker, 149 ticks of contact to 12, nothing off the pavement. Shawn then raced
  Wake three times at v32 (2026-09-22): once through the open ground, 1:10.68, and twice on the streets, 1:17
  against her 1:21, 4 s a race, and her spin into a sedan behind him is `driver-v2` (the will-be check
  below; `design/PORT_ALDER.md`, "Three races against Wake"). On
  Ridge Circuit it drives a K1999 racing line (`racing-line.ts`) at the player's
  pace, held by steering feedforward (`RIVAL_STEERING`, streets too since their
  corners are arcs) and a braking plan that leaves grip for
  cornering, which the brake rides down in hard stops (`RIVAL_BRAKING`) rather
  than waiting to be over it; streets keep the old brake, which strays less in
  traffic. A route must get its line once: drawing a line
  through a route that already carries one doubles the offsets.
  The rival in traffic is good enough for Phase 1 at `traffic-v8` / `driver-v2` and not part of
  the handling gate (Shawn, 2026-09-23, `design/HANDLING.md`): over six traffic layouts it meets
  traffic in about one race in ten, alone. Reopening it is a scope decision, and starts from
  `design/COUPLINGS.md`, "What was ruled out": a type per frame first, then plan-then-commit.
- **The launch.** Hold the handbrake and the gas through a race countdown, let
  the handbrake go at the flag, and the first 1.6 s carry extra traction: about
  two car lengths by five seconds, less the later you release, a penalty if you
  bog or spin, a plain start if you let go early (`src/sim/launch.ts`,
  `design/HANDLING.md`). Rivals launch by
  Blacklist rank (`BLACKLIST_LAUNCH`): about 3 m to a rival, 0.7 m of that from
  rank, so it removes the player's free gap without being a difficulty lever.
  Drag races keep the gearbox's own launch. The **burnout** is the same hold
  anywhere else, the player's only: stopped, e-brake and gas hold the front
  wheels, the stick swings the tail round them (an assist, `applyBurnout`), and
  letting the handbrake go launches on what the hold charged. The HUD's right
  meter, MC3's boost bar, shows the charge and the boost (`launchMeter`).
- **Rivet / Harbor Quarter drag** with a five-speed manual gearbox
  (`transmission.ts`, `drag-rules.ts`), the Hammer rival car, assisted lane
  changes. **Sable / South Wharf drift** yard with chained scoring
  (`drift-rules.ts`). The garage-area cruiser is **Moth** in a Kestrel rally
  hatch (`MOTH` in `encounter.ts`; the challenge id is her id). Pull alongside
  any of the three and the HUD shows their contact card — face, name, car and
  what the challenge is (`src/ui/rival-card.ts`). Rival portraits, and the
  style that keeps them one game: `design/CHARACTERS.md`. All ten Blacklist
  names have a car asset (`BLENDER_CARS` in `src/render/blender-car.ts`, drives in
  `CAR_TUNES`): Tally's Vesper and, from 2026-09-13, Latch, Breakwater,
  Wager, Meridian, Skim and Reign (working names). Each cruises and races as its
  rival (above) and is a saved player car once its name is beaten (Sable's NS-01
  as `ns01`), driving its car's own tune, the same whoever drives it. Build
  notes and open review flags: `design/reference/cars/BLACKLIST_CARS.md`.
- **Career/shop.** `src/settings/progress.ts` stores `nightshift.progress`
  separately from manual slots (schema 4): each Blacklist name's wins and accepted
  courses (`src/settings/blacklist.ts` holds the stages), cash and the purchased
  Bulwark; a name's car is owned once its third win lands. A stage pays $750 at #10
  plus $250 a place up, the pink slip double, once each. A completed pink slip
  removes that name from free roam. The Blacklist screen (title or Pause) shows
  the ladder (`src/ui/blacklist-panel.ts`). Old save slots never roll
  ownership back; migration writes the legacy Bulwark grant before a car change.
  Stored courses carry generator/world identity; incompatible pending courses
  require explicit replacement in the garage.
- **Race list** (title or Pause): the authored races, the Blacklist's won stages and
  kept generated races (`nightshift.playlist`), each raced with the rival or
  solo (`?solo=1`, circuits by `-solo`); Keep on a generated race's results;
  Draw a race here in free roam. Entries from another build stay listed,
  unplayable (`design/PORT_ALDER.md`, "Race list"). Authored sprints are generated courses
  pinned as data (`authored-sprints.ts`, `?race=sprint-jackson-mercer`, 2026-09-23): gen-wake-42 as
  Shawn cut it, through Spruce Cut, so no change to the map or generator redraws it.
- **Ridge Circuit** (working name) east of Madrona Ridge, off Pine East: one
  facility, three layouts (`arena.ts`), open edges, three-lap races with the
  rival on the centreline (`?race=arena-full|arena-east|arena-ridge`, `-solo`
  for no rival). Every lap there is recorded (`lap-recorder.ts`) and saved under
  `pnpm dev` to the git-ignored `recordings/laps/`; the input log replays exactly
  (`lap-replay.ts`, `pnpm laps --verify`). Lap lengths are pinned because
  recordings depend on them (`design/PORT_ALDER.md`, "Ridge Circuit").
- **Uptown Circuit** (working name): an authored three-lap loop of Uptown's
  streets, a gate at every turn, recorded the same way, in traffic or clear, with
  or without the rival (`street-circuit.ts`, `?race=street-uptown[-clear][-solo]`).
  Authored, not generated, so recordings survive generator changes; its lap
  length is pinned (`design/PORT_ALDER.md`, "Uptown Circuit").
- **Generated races are recorded too** (2026-09-20): the career's stages, a flash,
  a kept race, each as ONE lap from the flag to its last gate, saved when finished,
  replayed and compared like a circuit lap (`src/sim/recorded-event.ts`,
  `recordings/README.md`). The career is sprints, and until this only the rival's
  side of one could be measured.
- **Traffic.** About 260 vehicles with reserved junction movements
  (`traffic.ts`), never a second handling model. Kinematic, except that since
  `traffic-v9` (2026-09-23, Shawn: the MC3 feel) a car near a racer is for that tick
  a physics body of its kind's mass (`TRAFFIC_KINDS`), so a hit is shared by mass: the
  Cinder clipping a sedan 12 m/s faster loses 4.1 m/s at the hit, where the wall cost it 9.4.
  Knocked off its lane it is a wreck, rolls on braking to rest, is an obstacle traffic
  queues behind, and goes back on its lane at rest out of the player's sight
  (`TRAFFIC_KNOCK` in `sim.ts`). A box truck has no mass and is still a wall. It yields to the player and rival (`TrafficRacer`): follows
  one going its way and holds a junction for one crossing it. Brake lights and
  indicators show what it will do. Each car's turns are decided in advance and it shows the next one on
  amber indicators (`trafficSignal`). `forecastTraffic` drives that plan
  forward exactly, and since 2026-09-20 the race rival reads it (`forecastTrafficPath`)
  for corner lines and passes: no more than the indicators show the player. It is a
  forecast, not a promise: a car waiting at a line may be let go, and one that has
  slowed is forecast still slow. One per 900 m of lane (`TRAFFIC_SPACING`) over Port Alder's 302 km,
  which is still sparse. The density-24 and ceiling-55 figures in
  `design/FIELD_NOTES.md` are the retired district's 192 lanes, not this map.
  Since 2026-09-22 each attempt at a race meets its own traffic: the game draws a seed
  (`SimOptions.trafficSeed`, `createTraffic`) that moves where every car starts and salts
  which way it turns, and the recording carries it. Free roam, the tests, the batch and
  the golden master keep seed 0, the one traffic there used to be. `?trafficSeed=` fixes
  one for a session, to reproduce a report (`design/PORT_ALDER.md`, "Traffic per attempt").
  A car claims its junction only if no moving racer will cross it before the car is clear, and
  since `traffic-v8` it reckons that as it will drive it, slowing for its corner (`clearingTime`):
  reckoned from its speed, it turned across the rival in 26 races on one seed ("Six layouts").
  113 junctions are dressed with flashing signals or stop signs (`ALDER_INTERSECTIONS`,
  `design/INTERSECTIONS.md`), amber along the road that goes straight through. Since `traffic-v10`
  (2026-09-24) traffic obeys them: on a red flash or a stop sign a car stops with its front at the
  painted bar and stands 0.8 s (`STOP_DWELL`) before it may claim, where it claimed from 34 m out on
  the move; amber lanes and the 59 undressed junctions are as before, and racers still get the
  junction (Shawn: MC3). The gate's crossing incidents are nearly all at the undressed ones.
- **UI.** Speed dial / tachometer and heading-up minimap (`src/ui`), the
  neighbourhood's name as you cross into it in free roam (`district-banner.ts`,
  after 1.2 s so a border street never flickers), a city map overlay (M) naming
  all seven neighbourhoods from their polygons, named save slots, versioned browser-local settings,
  Controls remapping, performance overlay, telemetry toggle.
- **Editor** at `editor.html` places buildings in Port Alder; validated saves
  go to `src/sim/alder-layout.json`. Read `design/EDITOR.md` first.
- **Critique tools.** `pnpm alder:critique` scores route choice and can price
  a proposed alley (`--try=`); run it before and after authoring streets.

## Where things live

| Area | Path | Doc |
|---|---|---|
| Vehicle model, `HANDLING`, `PHYSICS_VERSION`, tick | `src/sim/sim.ts` | `design/HANDLING.md` |
| Each car's tune, its measured card | `src/sim/car-handling.ts`, `car-card.ts` | `design/HANDLING.md` ("Cars") |
| Port Alder streets, terrain, plots, layout | `src/sim/alder*.ts`, `src/sim/alder-*.json` | `design/PORT_ALDER.md` |
| District machinery: footprints, surface, aprons, lanes, kerb props | `src/sim/district.ts`, `street-*.ts`, `building-*.ts`, `lanes.ts`, `kerb-props.ts` | `design/DISTRICT.md` |
| Route choice, race generation, race ids, turfs, race start, race rules | `route-choice.ts`, `race-generator.ts`, `race-id.ts`, `alder-turf.ts`, `race-start.ts`, `race.ts`, `events.ts` | `design/PORT_ALDER.md`, `design/PROCEDURAL_RACES.md` |
| Rival, encounter, cruisers, traffic | `rival.ts`, `alder-rival.ts`, `encounter.ts`, `alder-cruisers.ts`, `traffic.ts` | `design/PORT_ALDER.md` |
| Junctions: signals, stop signs, bars, and where traffic stops for them | `intersection-dressing.ts`, `street-traffic.ts` (`control`), `render/intersection-dressing.ts` | `design/INTERSECTIONS.md` |
| Ridge Circuit: layouts, races, drawing | `arena.ts`, `arena-events.ts`, `render/arena.ts` | `design/PORT_ALDER.md` |
| Street circuit | `street-circuit.ts`, `circuits.ts` (either circuit from a race id) | `design/PORT_ALDER.md` |
| The rival in traffic: corner lines, committed passes, the 83-race batch, the six-seed gate, one race as a scene | `street-line.ts`, `traffic-pass.ts`, `scripts/street-line-batch.ts`, `scripts/rival-gate.ts`, `scripts/rival-scene.ts`, `design/measurements/` | `design/PORT_ALDER.md` ("Corner lines in traffic", "Committed traffic passes") |
| Lap recording, what a race id means to one, replay check, save endpoint | `lap-recorder.ts`, `recorded-event.ts`, `lap-replay.ts`, `src/recording/`, `scripts/laps-server.mjs` | `recordings/README.md` |
| Rival portraits, HUD contact card | `design/reference/characters/<id>/`, `src/ui/rival-card.ts` | `design/CHARACTERS.md` |
| The Blacklist: ten career names, stages, pay, ladder screen | `settings/blacklist.ts`, `settings/progress.ts`, `ui/blacklist-panel.ts` | `design/BLACKLIST.md` |
| Drag, drift, gearbox | `drag-*.ts`, `drift-*.ts`, `transmission.ts` | `README.md` |
| Rendering, and the city's look | `src/render/` | `design/LOOK.md` (what may enter the city), `design/DISTRICT.md` (night dressing) |
| Chase cameras and the sense of speed | `src/render/camera.ts`, `scene.ts` | `design/SPEED.md` (measured, one experiment built, proposals undecided) |
| Jumps, drift and the drawn body: what the car does now, a crest census, proposals | — | `design/JUMPS_AND_DRIFT.md` (undecided; Shawn liked the drawn body and crests) |
| Race list: playlist store, list model and screen | `src/settings/playlist.ts`, `race-build.ts`, `src/ui/race-list.ts`, `race-list-panel.ts` | `design/PORT_ALDER.md` |
| HUD, menus, map, saves, controls, livery UI | `src/ui/`, `src/settings/`, `src/input/`, `src/customization/` | `README.md`; `design/EDITOR.md` for the workshop |
| Debug API (`window.__ns`) | `src/debug/debug.ts` | below |
| Car and course assets | `assets/` | `assets/cars/README.md`, `assets/tracks/blackglass/README.md` |
| MC3 / MCLA rosters, unlocks, REP economy (research data, csv) | `design/reference/midnight-club/` | its `README.md`, then `digest.md` |
| The yard by the start, and the chaos it is meant to prove | — | `design/CHAOS.md` |
| What a change in one layer moves in another, and what each tuned number was measured on | — | `design/COUPLINGS.md` |
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
  equal distance are not abreast through a bend; routes stay centreline. The one
  exception is Ridge Circuit's racing line, which has its own `along` and never
  compares distances with a lane; streets stay centreline (lines hit traffic).
  A street rival's route, distances and gates are centreline too; only the path it
  aims along is rounded at corners (`sampleDrivingPath`), and its progress through
  a corner must be read round the arc, never off the nearer leg, which jumps 11 m.
  Rival routes are resampled about every 29 m: measure anything about a corner
  against the straight run to the next corner, never the segment beside it.
- A traffic vehicle may claim a junction only at the head of its approach;
  claiming from a queue deadlocks. The test asserts the grant, not the
  symptom, because the symptom has moved once already.
- Lanes are independent offset polylines, so consecutive lanes do not meet, and
  a lane's heading snaps at each of its own vertices. Traffic drives a curve over
  both (`Corner` in `traffic.ts`, since traffic-v6): tangent to the lane at each
  end, covered along its own length. It is never written straight onto the next
  lane: that moved a vehicle up to 15 m in a single tick on 85% of turns, and
  traffic bodies are kinematic, so the sweep evicted whatever was beside them — it
  launched the race rival at 42 m/s. Lane and distance stay the bookkeeping
  everything else is measured in; a curve is shorter than the lane it replaces, so
  the ground is integrated along the curve and the distance read back (`advance`).
  Stepping distance at a rate instead threw a van 21.6 m in one tick, and a
  curve's end rebuilt from its start came out 2e-15 short, which parked a vehicle
  on a corner it had finished. Every tick is guarded, in `tests/alder.test.ts` and
  `tests/traffic-intent.test.ts`; the other traffic invariants sample every tenth
  tick and cannot see a one-tick discontinuity.
- An offset lane folds where a street segment is shorter than its mitre's
  pull-back (`offset * tan(turn / 2)`): the lane runs that segment backwards.
  `unfold` in `lanes.ts` repairs the lane and leaves the street alone, whose
  lengths route choice and stored courses are drawn from. A repaired segment has
  no length, and a lane still has one vertex per street point, so anything
  reading a lane's vertices must treat coincident ones as one place
  (`TrafficNetwork.bends` does). `tests/alder.test.ts` holds every lane to it.
- A rival on the clamp is not a rival with more grip. With no assist, a tyre asked
  for exactly what it has left delivers exactly that, so the clamp (an assist of
  1, which every rival, cruiser and fixture drives) is the player's tyres under a
  perfect right foot, force for force. "No grip change for AI" holds, and the
  cards still stand. What would break it is giving a rival a number the player
  cannot reach, or taking the drag strip off the clamp without retuning the Hammer:
  that race is won by 0.02 s (`tests/pedal-assist.test.ts`).
- A parked rival is a racer traffic yields to, and it never moves: parked within
  `RACER_IN_LANE` (2.6 m) of a lane's line and facing along it, it stops that lane
  for good. Rivet did, from the middle of Harbor Way's outer lane. Park them off
  the carriageway, and keep a turf's centre apart from its rival's car
  (`RIVET_TURF`): the centre is part of what a seed draws.
- Anything that makes traffic wait at its lines more finds holes in the
  reservation rules that fast traffic hid. Two were locks (2026-09-20): a car
  refused because of the car queued behind it on its own lane (a queue, not a
  crossing), and a chain granted through a lane somebody was already waiting on.
  Soak traffic alone for ten minutes and list what has stood for over one; a test
  that runs two minutes at the shipped density passed through both.
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
  `--try`, draw one, measure again. Do not go crazy with them. Since the shoulders
  a FULL `build-alder.py` re-places every generated plot and breaks the clearance
  overlay: append the alley's road to the data and rebuild `--surfaces-only`, and retire
  what its carriageway, shoulder and sidewalk cross in `alder-clearance.json` (Spruce Cut).
- The rival gets its own forces, then ONE `world.step()` for both bodies.
  Never a second physics world. No catch-up, no rubber-banding, no grip
  change for AI, learned or not. The places it may be helped are out of the
  player's sight, and both are Shawn's: recovery (2026-09-13), a stuck rival put
  back on its line at its own route position, sooner than the 12 s reset, when
  the player is far enough away not to see it; and the road (2026-09-23,
  `UNSEEN_ROAD`), behind the player and more than 140 m away it drives as if the
  road were empty. Never further along than driving gets it, never faster than
  its own clear-road self (to the bit, `tests/rival-unseen.test.ts`), never
  ahead of the player, never a different car. The handling is what is sacred.
- `SimOptions.encounter` is a handbraked vehicle with no race state; never
  add race clock or checkpoint progress to it. Moth is `encounter` and the other
  cruising names are `cruisers`: keep her there, since tests and harnesses read
  `state.encounter`, and create cruiser bodies after hers.
- Settings never persist physics snapshots, replays, camera poses or debug
  flags. URL overrides are previews; deliberate menu edits save only their
  own field.
- Owning a car is `ownsCar`, never `isPlayerCarId`: every Blacklist car is a
  player car id from the start, and only its name's third win makes it yours. A
  generated Blacklist stage must store its course (only Moth's migrated one-win
  profile may have wins without courses), or the whole career fails to load.
- `decodeSaves` requires each slot's build to decode as exactly `"saved"`, and
  its throw sits outside the loop: one slot naming a value that only *recovers*
  discards every slot, not that one. Retiring a `PlayerCarId` therefore needs an
  entry in `RETIRED_CARS` (`settings.ts`), which migrates the old value without
  reporting recovery. The NS-01 became Sable's car this way. Rolling back to a
  build that rejects Kestrel likewise makes every slot unreadable if one names it.
- `src/sim/alder-data.json` is 24 MB. Fine on PC; a load-time question on
  the phone. Do not add to it casually.
- Sable's yard score cannot rank cars against each other: it is a chain game, so
  a car that banks fewer, longer chains beats one that drifts more in shorter ones
  (the Hammer 7,231 to the NS-01's 6,558 on identical clips, links and less raw
  chain). Rank drift on the card's `slideSeconds` / `slideAngle`; the event says
  whether a car can pass it.
- `carHandling` memoises per `car/drivetrain` key, so a probe tune registered under
  an id that has already been measured silently returns the first one's numbers. A
  sweep gives every candidate its own id, as `--try` does with `<car>*`.
- Being caught is every car's floor; how far it swings is the car's own. The
  recovery gates take their peak-slip ceilings from `CAR_PEAKS`
  (`tests/helpers/handling.ts`), which the NS-01 raises because a drift car that
  cannot swing is not one; settling under 3 degrees, yaw stopped, still moving is
  never per car (2026-09-19).
- A number a car can change is read from that vehicle's `CarHandling`
  (`sim.state.handling`, `rival.handling`, `handlingFor(route)`), never from
  `HANDLING`, or a rival plans corners with a grip its tyres do not have. A tune
  changes only with its `CarTune.revision`, which is also part of the name of any rival that drives it
  (`rival-revision.ts`); the fingerprint test prints the repin.
- A racing line through streets is drawn with `STREET_RACING_LINE`, never `RACING_LINE`, which is Ridge Circuit's and
  leaves 4 m spikes at street corners on some laps and not others (`racing-line.ts`). Ridge does not take the street
  fixes: they move its lines, and with them the rival every raced Ridge recording names. Judge a line on every lap, never the one in the middle,
  and a rival quicker than the one raced cannot be measured by replaying the player's inputs at it: they collide.
  A route that IS a line (`lateral`) is for a race with no traffic, since it ignores lanes: Uptown Circuit / Clear
  alone. Its gate arrows still come from the centreline, and `pnpm cars --laps` drives the in-traffic route so its
  column did not move.
  Where it cuts a corner it is further from the road's centre than the road is wide, so anything in `rivalInput` that
  bounds the aim by `lateral` must not push it past the line itself; and the cut keeps 4 m, not 2.6, because the rival
  runs up to 1.9 m inside its own line at a tight apex. The line's pace is pinned by a test: moving it is a decision.
- In traffic a line rides on a centreline route as a SHIFT (`RivalDefinition.line`, `street-line.ts`), never as the
  route. It is stored as positions matched to the route by the line's own length through each corner window, not
  as an offset across the lane's corner arc: on a narrow street that arc's radius is 8 to 10 m and the cut is deeper,
  so its normals all meet the line at once (the shift went from +0.4 m to -10.8 m in 10 m and the corner was lost).
  A line that swings OUT for a corner does it in the braking zone, and that swing is itself a bend the rival brakes
  for: it gave back on every straight what it gained in every corner, so into a corner the line stays in its lane.
  With no corner given to it a line-carrying route must drive exactly as the route without one, and a rejected pass
  must change nothing (both tested); the driver's line and pass fields are absent on every other route so their state
  is what it was. Gate the whole thing on `pnpm rival:gate`, the 83-race batch at six traffic seeds, against its
  baseline: contact on a line or in a pass is zero at seed 0 and not across six (11 and 27 ticks at `traffic-v8`), so a
  change must not add to it. Read total contact as incidents per race, never ticks: which races touch traffic is a lottery.
- That batch parks the player, so it gates the rival ALONE and cannot see what only happens in a race: Wake sat beside
  a sedan at its speed for 5 s against Shawn, and the batch is identical to the tick with and without the fix. And the
  pass planner read a player catching her from behind as in its corridor and braked her to let him by (`pass-v2`: the
  player counts only while ahead of her). A recorded race and `pnpm laps:compare` are the other half; a replayed
  player does not know where a changed rival is, so read one only up to where the player's own path first moves. Several seeds share a course's first kilometres, so one
  incident can be four rows, and a regression in it may be an OLD crash ending somewhere new: check the baseline's
  events at the same place before blaming the change (`gen-78`).
- The rival's steering feedforward is the wheel a steady turn takes (`steadyWheelAngleFor` in `sim.ts`), which restates
  the tyres in `sampleWheelForces`: stiffness, load, the load exponent, RWD's driven rears. Change those and it must
  follow; a test holds it to the car on every drivetrain (17% high on front drive flat out, stated there, not fixed).
  Geometry alone is a quarter of the wheel at 130 mph and ran a rival 5 m wide into oncoming traffic through a bend
  that was correctly planned flat. Any change to it moves every rival, Ridge's included: a `RIVAL_REVISIONS.driver` bump.
- A recording names the rival it raced by what THAT race's rival is made of (`rivalRevision(route)`,
  `src/sim/rival-revision.ts`), not one string for all: to 2026-09-21 `RIVAL_REVISION` went through 32 values in eight
  days and each refused every raced recording there was. What a route is told to be names itself (its car and tune
  revision, launch, share of the grip, a fingerprint of the drawn line), so redrawing a line or retuning one name's car
  needs no bump and refuses only the races it moved. How it drives is code and cannot: bump `RIVAL_REVISIONS.driver`,
  `.streetLine` or `.pass` for a change to that layer's CODE, never for another's. Each layer's tables are
  fingerprinted beside its token, so a changed number is caught without the bump; a new table of the driver's belongs
  in `RIVAL_TABLES` (`rival.ts`) or it is not.
- A browser and Node are not the same arithmetic: Chrome 152 and Node 24 differ in the LAST BIT of `Math.atan2(0.3, 1.7)`
  and `Math.tanh(0.7)`, and the tyres use both. A lap recorded in the game replays in Node to the recorder's rounding
  (a centimetre), never to the bit, so anything that has to agree between the two is compared at a rounding: a drawn
  line is fingerprinted to the millimetre (`rival-revision.ts`), because hashed exactly Ridge Circuit's was one rival in
  the game and another in `pnpm laps --verify`. Check a new identity in BOTH runtimes before trusting it; a test in Node
  cannot see this.
- A car that follows the rival's road is read in the road's frame WHERE THAT CAR IS (`RIVAL_TRAFFIC_FRAME`), never the
  aim point's: round a bend that frame is turned by the bend between them, and a van keeping to the oncoming lane
  reads as crossing into this one (a full-brake stab at 123 mph). Anything not on this road is read as before.
- A street line's window is kept only where its line is QUICKER than the lane through it (`STREET_LINE.worth`): at
  150 mph a line a touch less straight than the lane is planned slower, and a window at every gentle bend cost Tally
  2.7 s. A bend's line is also an arc (`bendArcs`, `street-line-v2`): the solver held to its lane within 60 m either
  side swings out and back tighter than the lane, and a longer reach kinks, so where a bend has both the one that saves
  more is kept (the solver's still wins gen-crest-23's run of bends by 3.5 s). An arc is joined only where it leaves the
  lane and read to where it rejoins it (`corners[].bend`, `bendRejoin`); held to that, corners lost lines they took
  cleanly and went off the pavement, so it is bends' alone. The lane's 0.80 is the steering lock at 150 mph as much as
  nerve: 0.84 runs the Reign 3.25 m wide through a fast gentle bend, and the shared FWD fixture hides it.
- In `rivalInput` a slower car following the road is judged against where this car WILL be when it gets there
  (`willBe`: its offset across the road at its own station, moving at the rate it is and credited `followAcross`,
  towards the side being chosen and never past it), not `intent` alone. `intent` moves 4 m/s the moment a side is
  chosen, and at 85 mph the car moved 0.4 m in the time that took: a sedan 24 m ahead read as out of the path, no lift,
  a 5 s spin in Shawn's race (`driver-v2`). Offsets across the road are one quantity along the road and are compared
  only at their own stations: her offset at the aim point and her offset projected onto the road 60 m on differ by
  0.65 m through a bend, and `nearestSide` (across the polyline leg) is 1.6 m from the driving path through a corner
  arc. Six versions of the rule were measured on the batch before the one shipped, four of them frames, on top of the
  three that had bitten this loop already: say which frame every number is in, and read it where the thing is. The
  rule is honest to about 0.2 m and its margin is 0.3: a pass driver-v1 made at 2.2 m it may brake for, and a value
  that separates that from a 2.3 m pass does not exist. Measure a change to it on the batch AND the rear-end test.
- A route's `width` is the carriageway traffic drives; Port Alder's asphalt runs `shoulder` (5.6 m) past it each side
  (2026-09-23). Anything in the rival bounded by the width adds `route.shoulder`, or on the shoulder it is lost (held
  to 22 mph), makes no progress toward a reset, and a pass onto it is clamped back: `lost`, the progress mark, `edge`,
  `evaluatePass`, `bendArcs`. A world change that redraws the seeds makes the gate's races other courses: re-save its
  baseline on the new world before judging a change on it.
- A committed pass is clear of a car that is ON its path, and looks only 26 m ahead at 105 mph because of it. More
  than `PASS_ASTRAY` off that path the car looks as far as it would with no pass; a tracked pass must not change.
- A rival's difficulty is its car (`CAR_TUNES`) and its driver's share of the grip (`BLACKLIST_CORNERING`,
  `BLACKLIST_LAUNCH`), never its position in the race. The share is `RivalDefinition.skill` and reaches a LINE's
  corners only: `cornering` would move the lane's corners too, where the limit is tracking (past about 0.82 a lane
  arc runs wide). Judge the ladder by a name near its top in its own car, not by the circuits, which field Moth's.
- A recording replays against what `recordedEvent` draws from the session (race id, laps, `startCode`, solo), so the
  game builds a generated race from that same call, never beside it: a race the game assembles differently from the
  replay is a recording that diverges with nothing to name why. A generated race is one lap to the recorder, so it is
  saved only when finished, and a player who wins leaves the rival with no lap: `laps:compare` lets it finish after
  the log and says so. A generated race's flash (`startCode`) is part of what its id draws.
- A lap recording replays only from an unbroken run: moving the car outside
  `step` (`__ns.sim.body`, placement helpers) breaks it from that tick on.
  `pnpm laps --verify` flags it; never edit a recording by hand to make it pass.
- In `rivalInput`, `side` is measured from the car and `driver.avoidance` from
  the route; compare them only after adding the car's own offset across the route
  at the aim point (`carOffset`), never across the nearest segment, which at a
  corner is still the street being left. Mixing them pinned the rival on a truck's
  bumper for 42 s, then drove it into a truck round a corner. The player-racing
  block above the traffic loop still mixes them.
- A rival's peak distance from a centreline in traffic is a lottery, not a
  measure: one car met head on throws it past 20 m for a second or two, which
  failed one tune and passed the next for a difference neither caused. Measure it
  clear of contact and bound the recovery separately (`tests/helpers/stray.ts`).
- Yielding between traffic and racers runs one way per situation. The rival
  waits for traffic in its path, so traffic follows only racers going its way and
  holds junctions only for racers moving over 3 m/s; every other way traffic also
  waited for the rival made a standoff where neither moved.
- Not every generated course draws: some lanes draw no race for any seed. Ask
  `alderCourseDraws` (the load's own path, `alder-course.ts`) before accepting,
  handing back or offering one; a stored course that throws on load retries forever.
  A start whose junction draws nothing draws one street on (`generateRaceFrom`); two
  waterfront lanes still draw nothing, so keep cruise routes off them.
- The route-choice `PACE` is the city's constant, never a car's: its `top` is a
  street pace (114 mph, under every governor), and moving it to the fastest car's
  redraws most seeds while reclassifying almost no legs. `tests/route-choice.test.ts`
  scans the draw's import closure to keep `car-handling.ts` out of it.
- Changing what a seed draws means bumping that kind's `GENERATOR_REVISIONS`
  entry, and every kind's for the shared draw (route choice, `PACE`, turfs, gate
  rules): a stored race is (`ALDER_VERSION`, its kind's revision, race id, start).
  The per-kind fingerprint tests print the values to repin; repinning without a
  bump is the mistake, and so is bumping every kind for a change to one.
- A circuit is drawn as a circuit (`generateRace`'s `circuit`), never a sprint
  converted after: converting skipped the flow rule at the close, and 469 of 591
  circuits turned the driver around at the last gate or the start.
- A race's gate arrows come from its rival's line (`withExits`). A solo race
  keeps them only because `?solo=1` runs `withExits` before dropping the rival;
  a race handed to `createSim` with no rival and no exits has no arrows.
- Changing how traffic drives means bumping `TRAFFIC_REVISION`: sessions
  recorded in traffic name it, and replay refuses another.
- The junction inventory (`dressIntersections`) is traffic's since `traffic-v10`, not just paint: which arm flashes
  amber, where a bar sits and which junctions are dressed decide where traffic stops, so a change to it is a
  `TRAFFIC_REVISION` bump. Its amber axis is the straight-through pair; the widest single arm it used first made the
  stem of a T amber and stopped the through road at 12 junctions, which nobody saw while the lights were only lights.
- Seed 0 is the traffic every traffic fix was soaked on and every rival gate was measured on, and it is the cleanest
  of twelve seeds measured (2026-09-22): under the others traffic starves a long chain through a junction cluster for
  up to 6.6 minutes, and the rival meets three times the distinct incidents, including the first contact on a line and
  in a pass since those gates existed. A claim about traffic or the rival measured at seed 0 alone is a claim about one
  layout: soak with `pnpm traffic:soak` and gate with `pnpm rival:gate`. Keeping a refused car's turn against
  later cars was tried on the starvation and made it worse on balance (`design/measurements/traffic-seeds.json`).
- The gate has a noise band, and it is wide: a change to the rival's reactive loop sends a race past other cars from
  the first tick it decides differently, so one kind of incident removed is another met. A rule that changed almost
  nothing (2026-09-22) still moved contact on a line from 11 ticks to 19; read five distinct incidents in fifty as
  noise, and judge a change by what KIND of incident went and came (`pnpm rival:scene`), never by the totals alone.
- A car near a racer is a physics body only for the tick, driven along its lane by velocity, and must change NOTHING
  until something touches it: the racer's state the tick before contact is the wall's to the bit
  (`tests/traffic-knock.test.ts`). A wreck is not a lane car: it is out of `occupancy`, an obstacle to traffic
  (`TrafficRacer.obstacle`: queued behind whichever way it points, and a junction it sits in is not claimed) and
  forecast still. It goes back where it RESTS, along its lane from where it was hit, and further along if that spot is
  taken: put back where it was hit it landed behind the car queued for it, and waiting for its own spot waited for a
  rival stopped beside it, which waited for that car (gen-39, seed 314159, 61 resets, no finish).
- Rapier's damping is the same in every direction, and a wreck damped by it stopped as if its wheels had locked: the car
  that hit it ploughed on and lost MORE than the wall had cost. A wreck is braked along its heading and scrubbed across
  it by hand (`TRAFFIC_KNOCK.brake`, `.slide`, `.spin`). Traffic's collider friction is a car's (0.15): at 0.35 a car
  clipped on a rear corner did not turn at all, friction on its rear face cancelling the push, in bare Rapier too.
- Rapier's results depend on collision groups, not only on which pairs they let meet: giving traffic its own membership,
  every filter still admitting it, moved five of the golden master's fourteen runs (2026-09-23). A group is set only
  while it is needed, as the road out of sight sets traffic's while the rival is a ghost and clears it after, so a race
  it never happens in is the race it was.
- Where a junction claim is judged against a racer, the car's time in the junction is what it will DRIVE, braking for
  its corner (`clearingTime`), never its distance over the speed it has: that came out at half the truth for a car
  that slows to turn, and traffic turned across a rival it could not have cleared. Traffic alone never reads it, so a
  soak cannot see a change to it; the gate and `pnpm golden`'s free roam run can.
- A traffic seed keeps the vehicle count and each id's kind, and must: the renderer sizes one instanced mesh per kind
  once, at load (`render/traffic.ts`), and a restart onto another seed draws into the same slots. Starts move by a phase
  along the one ruler, never by adding or dropping a car. Seed 0's vehicles carry no `seed` field, because the golden
  master hashes the state as JSON and seed 0 has to be the old traffic to the byte.
- Compare heights above the road, never raw. The rival's 3 m filter meant for
  bridges compared raw heights and hid same-street traffic on about a third of the
  city at top speed; it now reads `routeHeightAt`. The check on the racing player
  above the traffic loop still compares raw heights.
- A launch buys grip and torque. On shared power the tyres are the limit off the
  line and extra drive alone changes nothing, but a tune with less power is limited
  by its engine, and grip alone gave it nothing at all (the Bulwark, unnoticed, and
  the Kestrel, 2026-09-19). The launch rides `driveGripScale` and scales the drive. Anything that moves a rival, the countdown included, is a
  bump of its layer in `RIVAL_REVISIONS`, or raced recordings diverge instead of being refused:
  check with `pnpm laps --verify` before and after, never only after.
- The test suite takes about 5 minutes. Since 2026-09-19 CI runs it too, beside
  the build and the facade browser check, on master pushes and pull requests; it
  ran `pnpm build` alone before, so anything pushed before then was gated only by
  whoever remembered. Still run `pnpm test` yourself: CI on master tells you after
  the fact, and the golden master (`pnpm golden`) and `pnpm laps --verify` are
  yours to run, not CI's.
- Blackglass fixtures name AWD explicitly where they measure AWD; do not
  "fix" a default-FWD number by editing a historical AWD one.

## Debugging without a screen

Every mesh carries a kebab-case `name`. `window.__ns` (`src/debug/debug.ts`)
exposes `pick(x, y, screenshotWidth)`, `find`, `state` (includes rival
diagnostics), `drive("W600,WD90")`, `freeze()`, `shot()`,
`drivetrain('awd'|'fwd'|'rwd')`. Reach states by URL, never by scripting
menu clicks: `?scene=garage&paint=blackglass&stance=slammed`,
`?scene=track&drive=W600&freeze=1`, `?scene=pause&drivetrain=rwd`,
`?scene=track&visit=rivet`, `?race=sable-yard-drift`.
The player drives with no pedal assist (Shawn, 2026-09-20), except on the drag
strip: `defaultPedalAssist` in `src/sim/pedal-assist.ts`, and `design/HANDLING.md`,
"The pedals, as a choice". `?assist=0..1` overrides it for a session, 1 being the
old clamp, and the HUD names it when it has. The value lives on the sim
(`SimOptions.pedalAssist`), never in a car's tune, so the Cinder stays the anchor
and no rival is touched; `createSim` still defaults to 1, so tests, the golden
master and the cards are as they were. A lap records the assist it was driven on.
A preview link needs `scene=track` (or a `race=`) to be driven at all. A bare
`?assist=0.5` or `?drivetrain=awd` lands on the title, and Continue loads a slot,
which is authoritative over preview links by design (`loadSaveUrl` rebuilds the
whole query): the preview is gone, silently, and the default game is what gets
driven. Shawn drove four assist settings that way and every one was the default.
Check the HUD's mode line, which names a live preview, before trusting a verdict.
`?car=<id>` drives one of your own cars, and SILENTLY falls back to the Cinder
for a Blacklist car the career has not won; `&unlock=1` drives it anyway, for
pad testing a tune against another (`?race=sable-yard-drift&car=ns01&unlock=1`).
It is a preview like the rest: nothing is written, the garage still reads Locked,
and a slot saved while driving one records the Cinder. `pnpm test:cinder` pins
both the fallback and that the unlock grants nothing. Browser harnesses:
`scripts/check-track-browser.js`, `scripts/check-controls-browser.js`.
The cars, their tyre smoke and the buildings are drawn by default, the look
`cel-city` (`src/render/cel.ts`, `src/render/smoke.ts`,
`src/render/drawn-buildings.ts`). For comparison, never saved: `?look=cel`
draws the cars alone (the default until 2026-09-24), `?look=plain` shows the
cars undrawn and `?look=fx` undrawn with the drawn smoke. `?look=cel-traffic`
(2026-09-20) draws the cars and traffic, bands and ink without the stripe or the
cyan rim, with the city undrawn: an undecided comparison, not the look. A frozen page (`?freeze=1`, `__ns.freeze()`) runs no ticks, so a
pad on it does nothing while the HUD still reads LIVE: never hand one over to be
driven (Shawn's triggers "did not work" on one, 2026-09-24). A burnout (e-brake
and gas at a standstill) smokes anywhere, which is the quick way to look at it;
Wharf Garage's apron is walled, so line up with the street before letting go.
Live play draws each car between its last two ticks (`src/render/interpolate.ts`),
up to one tick late; `?smooth=0` draws the last tick, which shakes on displays
faster than 60 Hz.
Staged poses are visual checks, not a driven lap; the reference-lap test is
the driving gate, and screenshots do not certify mobile GPU performance.
`__ns.shot()` and `?freeze=1` settle the chase camera before capturing, and the
Standard camera trails the car by about speed / 6.8 in live play: at 140 mph a
settled shot shows it 8.7 m closer than the player ever sees it. For the live
frame, read the canvas in the same task as the last `__ns.drive("W1")`. Standard
B (`?camera=standardB`) is carried with the car and its settled shot is its live one.
`__ns.drive` silently skips a chunk it cannot parse: its letters are WASDBUJ, so
`N60` is not sixty ticks of neutral, it is nothing. `__ns.tick(60)` is.
Preview configs (`.claude/launch.json`): `nightshift` is `pnpm dev` on any free
port, `nightshift-lan` the same for a phone, `nightshift-build` is `vite preview`
on 4173 and serves whatever `dist/` holds, so `pnpm build` first.

## Commands

```
pnpm dev              # run
pnpm test             # deterministic simulation checks (~7 min)
pnpm build            # typecheck + build (what CI runs)
pnpm alder:critique   # route-choice report; --json for agents, --try=x1,z1,x2,z2[,w] to price an alley
pnpm alder:turf       # what each Blacklist turf does to the draw; --pull=, --radius=, --seeds=, --json
pnpm laps             # recorded circuit laps; --verify replays each session, --json for tools
pnpm laps:compare     # you against the rival, gate by gate, from the newest raced session (a circuit or a generated sprint): replays it and records the rival too
pnpm pace             # fit the route-choice pace model to recorded Uptown laps; --json for tools
pnpm pace --sensitivity # what moving the pace does to the map's verdicts and to the draw (needs no recordings)
pnpm cars             # every car's measured card; before and after a tune. --laps (AI laps), --try=, --json
pnpm golden           # 14 hashed runs through every vehicle kind: --save before a change, then compare
pnpm traffic:soak     # traffic alone for ten minutes per traffic seed: what stood over a minute. Seeds as args, --json
pnpm rival:gate       # the rival alone in traffic, 83 races at six traffic seeds (~20 min), against its baseline; --save re-pins it
pnpm rival:scene      # one gate race at one seed: every contact dissected, or --from= --to= the rival tick by tick
pnpm car:export       # export saved Blender car edits (see assets/cars/README.md)
```

## Relationship to SENTINEL

Same engineering doctrine, different universe — deliberately. Do not
import SENTINEL lore, factions, or aesthetics here; the decision and its
reasoning live in the SENTINEL session history (2026-07-30). If a
crossover ever happens, it is Shawn's call at naming time, not an
assistant's flourish.
