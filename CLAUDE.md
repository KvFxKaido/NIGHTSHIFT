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
- Graphics resemble upscaled/emulated MC3 rather than photorealism. The city is
  a working port on the night shift, with sodium lamps and dry streets; its
  rules, and the check anything new passes first, are `design/LOOK.md`. The cars
  are drawn like the rival portraits: three flat bands of their own colour, an
  ink outline, the race's cyan on the rim (`src/render/cel.ts`).
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
  (only a second 12 s reset where the last one put it may go past a blockage). It
  races the player rather than yielding: passes, holds its line, blocks and
  does not lift for contact (`RIVAL_RACING`, `design/PORT_ALDER.md`). On a street
  it rests half-way into the inner lane going its way (`RIVAL_LANE`) and drives
  each junction as an arc within its own side (`RIVAL_STREET_CORNERS`). Its
  cornering is tuned to recorded laps; past about 0.8 of the grip-limited speed its
  tracking, not its grip, is the limit. Steering feedforward raised that ceiling
  without removing it, and only on streets, so the two surfaces now take their
  corner speed from their own plan (`design/PORT_ALDER.md`, "How hard the rival
  corners"): a street 0.80 (`RIVAL_CORNERING`), a racing line 0.76
  (`RIVAL_BRAKING`), which is all its own width leaves it. On
  Ridge Circuit it drives a K1999 racing line (`racing-line.ts`) at the player's
  pace, held by steering feedforward (`RIVAL_STEERING`, streets too since their
  corners are arcs) and a braking plan that leaves grip for
  cornering, which the brake rides down in hard stops (`RIVAL_BRAKING`) rather
  than waiting to be over it; streets keep the old brake, which strays less in
  traffic. A route must get its line once: drawing a line
  through a route that already carries one doubles the offsets.
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
  unplayable (`design/PORT_ALDER.md`, "Race list").
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
- **Traffic.** About 260 kinematic vehicles with reserved junction
  movements (`traffic.ts`); a solid hazard nothing can push, never a second
  handling model. It yields to the player and rival (`TrafficRacer`): follows
  one going its way and holds a junction for one crossing it. Brake lights and
  indicators show what it will do. Each car's turns are decided in advance and it shows the next one on
  amber indicators (`trafficSignal`). `forecastTraffic` drives that plan
  forward exactly; the rival does not read it yet (`design/PORT_ALDER.md`), and
  if it does, it reads no more than the indicators show the player. One per 900 m of lane (`TRAFFIC_SPACING`) over Port Alder's 302 km,
  which is still sparse. The density-24 and ceiling-55 figures in
  `design/FIELD_NOTES.md` are the retired district's 192 lanes, not this map.
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
| Ridge Circuit: layouts, races, drawing | `arena.ts`, `arena-events.ts`, `render/arena.ts` | `design/PORT_ALDER.md` |
| Street circuit | `street-circuit.ts`, `circuits.ts` (either circuit from a race id) | `design/PORT_ALDER.md` |
| Lap recording, replay check, save endpoint | `lap-recorder.ts`, `lap-replay.ts`, `src/recording/`, `scripts/laps-server.mjs` | `recordings/README.md` |
| Rival portraits, HUD contact card | `design/reference/characters/<id>/`, `src/ui/rival-card.ts` | `design/CHARACTERS.md` |
| The Blacklist: ten career names, stages, pay, ladder screen | `settings/blacklist.ts`, `settings/progress.ts`, `ui/blacklist-panel.ts` | `design/BLACKLIST.md` |
| Drag, drift, gearbox | `drag-*.ts`, `drift-*.ts`, `transmission.ts` | `README.md` |
| Rendering, and the city's look | `src/render/` | `design/LOOK.md` (what may enter the city), `design/DISTRICT.md` (night dressing) |
| Race list: playlist store, list model and screen | `src/settings/playlist.ts`, `race-build.ts`, `src/ui/race-list.ts`, `race-list-panel.ts` | `design/PORT_ALDER.md` |
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
  change for AI, learned or not. The one place it may be helped (Shawn,
  2026-09-13): recovery out of the player's sight. A stuck rival may be put
  back on its line at its own route position, sooner than the 12 s reset,
  when the player is far enough away not to see it. Never further along,
  never faster, never a different car. The handling is what is sacred.
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
  changes only with its `CarTune.revision`, and a rival's car with `RIVAL_REVISION`
  too; the fingerprint test prints the repin.
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
- Compare heights above the road, never raw. The rival's 3 m filter meant for
  bridges compared raw heights and hid same-street traffic on about a third of the
  city at top speed; it now reads `routeHeightAt`. The check on the racing player
  above the traffic loop still compares raw heights.
- A launch buys grip and torque. On shared power the tyres are the limit off the
  line and extra drive alone changes nothing, but a tune with less power is limited
  by its engine, and grip alone gave it nothing at all (the Bulwark, unnoticed, and
  the Kestrel, 2026-09-19). The launch rides `driveGripScale` and scales the drive. Anything that moves a rival, the countdown included, is a
  `RIVAL_REVISION` bump, or raced recordings diverge instead of being refused:
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
`?car=<id>` drives one of your own cars, and SILENTLY falls back to the Cinder
for a Blacklist car the career has not won; `&unlock=1` drives it anyway, for
pad testing a tune against another (`?race=sable-yard-drift&car=ns01&unlock=1`).
It is a preview like the rest: nothing is written, the garage still reads Locked,
and a slot saved while driving one records the Cinder. `pnpm test:cinder` pins
both the fallback and that the unlock grants nothing. Browser harnesses:
`scripts/check-track-browser.js`, `scripts/check-controls-browser.js`.
The cars and their tyre smoke are drawn by default (`src/render/cel.ts`,
`src/render/smoke.ts`); `?look=plain` shows the cars undrawn and `?look=fx`
undrawn with the drawn smoke, for comparison, never saved. A burnout (e-brake
and gas at a standstill) smokes anywhere, which is the quick way to look at it;
Wharf Garage's apron is walled, so line up with the street before letting go.
Live play draws each car between its last two ticks (`src/render/interpolate.ts`),
up to one tick late; `?smooth=0` draws the last tick, which shakes on displays
faster than 60 Hz.
Staged poses are visual checks, not a driven lap; the reference-lap test is
the driving gate, and screenshots do not certify mobile GPU performance.

## Commands

```
pnpm dev              # run
pnpm test             # deterministic simulation checks (~7 min)
pnpm build            # typecheck + build (what CI runs)
pnpm alder:critique   # route-choice report; --json for agents, --try=x1,z1,x2,z2[,w] to price an alley
pnpm alder:turf       # what each Blacklist turf does to the draw; --pull=, --radius=, --seeds=, --json
pnpm laps             # recorded circuit laps; --verify replays each session, --json for tools
pnpm pace             # fit the route-choice pace model to recorded Uptown laps; --json for tools
pnpm pace --sensitivity # what moving the pace does to the map's verdicts and to the draw (needs no recordings)
pnpm cars             # every car's measured card; before and after a tune. --laps (AI laps), --try=, --json
pnpm golden           # 14 hashed runs through every vehicle kind: --save before a change, then compare
pnpm car:export       # export saved Blender car edits (see assets/cars/README.md)
```

## Relationship to SENTINEL

Same engineering doctrine, different universe — deliberately. Do not
import SENTINEL lore, factions, or aesthetics here; the decision and its
reasoning live in the SENTINEL session history (2026-07-30). If a
crossover ever happens, it is Shawn's call at naming time, not an
assistant's flourish.
