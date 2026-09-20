# NIGHTSHIFT

**Status: Playable Port Alder PC prototype — free roam, open checkpoints, garage and workshop.**
Working title: *Project Nightshift.*

A compact arcade street racer: illegal nighttime racing, one car worth
caring about, rivals with recognizable driving personalities, and a dense
fictional district the player learns until it stops being roads and
becomes a network of possibilities.

> "A small city can feel enormous when the player is still learning how
> to race through it."

The full design is in [`design/GDD.md`](design/GDD.md) — read that first.
This README covers what exists and the two laws the codebase is built on.

## Direction

MC3 is the main inspiration: open racing, city knowledge and car ownership.
“No unnecessary barriers, no wrong ways, just slower ways.” Port Alder supplies
the street structure, adapted into a fictionalized racing city. Grow it from
play feedback; MC3 San Diego informs the eventual feel of scale rather than
an exact size requirement.

The graphics target is upscaled/emulated MC3. Keep the current Three.js/Rapier
handling and develop the PC prototype first. The eventual target device is
**RedMagic 10 Pro**; Android packaging and on-device testing can follow.
Customization should focus on body parts, paint and a few understandable
performance upgrades. Selected LA ideas, including police, can be considered
later. The current demo does not implement body-part swaps, purchased upgrades,
police, career progression or Surge.

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
pnpm dev        # → http://localhost:5173
pnpm test       # deterministic simulation smoke tests
pnpm build      # typecheck + production build
```

The demo now opens in **Port Alder**, a fictionalized, compressed city slice with
83.5 km of open streets and 12.6 km² inside the connected street network's outer boundary, Belltown,
Alder Center and its broadcast tower, Queen Anne and Capitol Hill climbs,
the Central District, Madrona Ridge, parks, evergreen groves, traffic, and the
four-checkpoint **Sound to Sky** race. Free roam starts outside **Wharf Garage**
in SoDo. Stop by the marked shutter and press E/Enter or Cross/A to enter.
Collidable evergreen trunks break up broad cross-country cuts while roads,
alleys and selected passages through the groves stay open.
The existing arcade handling, reset, and keyboard/gamepad controls are
retained. **Sound to Sky now has one AI rival**, driving the garage car you did
not select: NS-01 versus Bulwark. It follows a preferred route, brakes for corners
and traffic, and can reverse/rejoin after getting stuck. After 12 seconds without
progress, it can reset onto nearby clear road while keeping its race clock and
checkpoints. Both racers collide in
the same physics world. Position and rival finish status appear in the race HUD.
A rival cruises a repeatable freight-block loop from Wharf Garage along First
Avenue S, Holgate and Fourth Avenue S, marked red on the minimap. It targets
10 m/s (22 mph), avoids traffic and can reset locally after getting stuck.
Approach at cruising speed and flash headlights with **F / X–Square**
(remappable in Controls), or click the nearby prompt, to line up for a generated race.
Challenges draw from three event types: ordered **sprints**, two-lap **circuits**
that return to the start junction each lap, and **unordered** races where all gates
must be collected once in any order (the last collected gate finishes the race).
The HUD shows lap or collection progress; unordered races show every remaining
gate on the map, minimap and in the world. Rivals follow a routed reference order.
For repeatable test drives, use `?race=gen-3&scene=track`,
`?race=gen-3-circuit&scene=track`, or `?race=gen-3-unordered&scene=track`.

**Rivet / Harbor Quarter** is a dedicated standing-start drag, reached by flashing
Rivet's cream-and-black **Hammer** on southern Harbor Way. The city map labels
`Rivet / Drag`; the normal cruising rival still draws sprint, circuit and unordered
events. Rivet stays parked at the meetup and drives the Hammer in the race.
The quarter mile is 402.336 m, with equal grid positions, a three-light countdown,
cleared traffic and two marked lanes. Left/right requests an assisted lane change;
car contact remains physical, and leaving the outer strip disqualifies you.
Drag uses a five-speed manual gearbox: **Left Shift / Left Ctrl** shift up/down;
new controller defaults are **RB / LB**. Saved controls retain their bindings and
allocate unused buttons for shifting; the HUD shows your actual bindings.
The dial becomes a tachometer, with numeric RPM, gear, shift light and reaction time.
Stage at 3,800-5,500 RPM (feather the throttle), then accelerate on green. Shift at
7,400-7,900 RPM; shifts interrupt power, early shifts lose torque, and the limiter
cuts drive. Launching outside the window reduces initial drive. Rivet uses the
same gearbox and reacts after 0.15 seconds. Other events retain their handling.
Drag times display to milliseconds from fixed ticks (1/60 s resolution).
The Hammer is an original Blender-authored rival car with a hood scoop, deep-dish
wheels and rear slicks; Rivet uses the existing RWD handling model.
For inspection, `?scene=track&visit=rivet` starts near the meetup;
`?scene=track&race=rivet-quarter-mile` starts directly on the grid.

**Sable / South Wharf Drift** lives in the floodlit freight yard south of Harbor
Way. The wide driveway stays open in free roam. The map labels the yard and
Sable; flash her parked NS-01 to start a solo 90-second run against 3,000 points.
Follow the warehouse sweeper into the offset container section, or practice your
own line. Yellow ground rings and the minimap identify the next clipping bonus.
Full steering and existing drivetrain handling apply; there is no lane assist or
drag gearbox. Build speed, turn and briefly use the handbrake to initiate a slide.
Scoring requires at least 7 m/s and 10 degrees of sideways slip. Speed and angle
build a chain, sustained drifting raises the multiplier to x4, and linked changes
of direction add bonuses. Drift through the numbered clips in order for +200 each.
Straightening for one second banks the chain. Contact, a spin, reversing or leaving
the yard loses unbanked points; saved points remain. The timer banks the last valid
chain and shows the result. Restart gives a fresh timed attempt.
`?scene=track&visit=sable` starts beside Sable;
`?scene=track&race=sable-yard-drift` starts on the yard grid.

**Ridge Circuit** is an official circuit east of Madrona Ridge, at the end of
Pine East past Ridge Scenic Way, with three layouts: Full (2.5 km), East (1.9 km,
flat) and Ridge (1.6 km, on the hillside). Its edges are open; the grass past the
shoulder costs a 2WD car pace. It is open to drive in free roam, and each layout
is a three-lap race against the rival: `?scene=track&race=arena-full`,
`?scene=track&race=arena-east` or `?scene=track&race=arena-ridge`. Add `-solo`
(`?scene=track&race=arena-full-solo`) to drive it alone. Under `pnpm dev` every
lap you complete there is recorded to `recordings/laps/`; `pnpm laps` lists them
and `pnpm laps --verify` replays them. See [`recordings/README.md`](recordings/README.md).

Crossing the finish in a rival race pauses the drive and shows your result/time,
with **Return to free roam** or **Go to garage**. Both clear the race and retain
your car/setup; free roam restarts outside Wharf Garage, while garage opens the
customization screen. If the rival finishes first, you can still finish your run.
The pause menu also offers **Return to free roam** during a race.
In-game replay and the recorded-input ghost remain removed. See [`design/PORT_ALDER.md`](design/PORT_ALDER.md).

**Port Alder map** in the pause menu opens a map overlay without unloading
the drive. **M / Select–View–Share** toggles it during play (remappable in
Controls). It pauses both racers and traffic, shows current positions and active
race gates, and returns to the screen it was opened from. Drag/scroll to pan/zoom,
or use the controller-accessible Find car, Whole city and zoom buttons.
The standalone `/alder.html` route board remains available. Its **Edit Port Alder** link opens the
building workshop at `/editor.html`; validated placements are shared by the
renderer and collision system. See [`design/EDITOR.md`](design/EDITOR.md).

Port Alder is the only playable demo map. Old Blackglass links redirect to it;
Blackglass geometry and asset files remain offline regression fixtures and
are excluded from the playable map/rendering bundle.

Surge is the proposed nitrous verb: a small number of finite tanks, bought as
garage capacity, full at the start of every event and never refilled mid-race.
It is a design target, not functionality in the current build. The Live Cred
style-to-speed economy it replaced was retired on 2026-09-12 and is kept in
[`design/LIVE_CRED.md`](design/LIVE_CRED.md).

The garage previews all twelve cars live on its rotating platform. Use the
previous/next arrows (or left/right while the selector is focused) to browse;
Enter/controller confirm or **Drive this car** equips an owned car. Locked cars
show their pink-slip requirement, and the Bulwark can be purchased from its preview.
Browsing leaves the saved car and current drive untouched; leaving without equipping
restores your car. Equipping a different body starts a fresh drive with its own handling.
Paint, wheel finish, stance and livery editing are available for the equipped car.
Your equipped car and visual setup save on this browser and return after refresh.
Options and Garage show settings status; blocked storage leaves the game usable with
session-only choices. Performance parts, prices, race progress and saved replays
are not implemented by this settings save.

**Named saved games:** the title offers **Continue** (most recently saved slot),
**Load game**, **New drive**, **Garage**, and **Options**. Pause → **Save game**
writes one of three named slots, including your car, customization,
and free-roam location. These are manual saves; choosing an occupied slot requires
**Replace save**. Loading starts the car stationary. Race saves and locations
blocked by new scenery return to Wharf Garage; race clocks and opponents are not
resumed. A new drive does not erase any slots. Audio and remapped controls remain
global preferences. Saved games use `nightshift.saves` in this browser, not cloud
storage; clearing site data removes them.

Audio and remapping live under **Options**.
**Options → Performance metrics** toggles a persistent diagnostic
overlay: FPS, mean/p95 frame interval over the last two seconds, simulation and
render-submission CPU time, draw calls, triangles, renderer resource counts, and
render-buffer size. CPU times exclude GPU execution; resource counts are not
memory usage in bytes. Readouts refresh four times per second and reset after
tab or menu changes. The map hides it; on small screens it appears during driving
only. Its on/off setting is stored separately as `nightshift.performance`.
Handling telemetry remains a separate toggle. There is no drivetrain control in
either menu; each car has its own. Pause keeps Resume, Save game, Port Alder map, Options, Main menu, and
**Return to garage** (or **Restart race** / **Return to free roam** during a race).

Settings use the versioned `nightshift.settings` localStorage entry. They are
local to this browser and origin: `localhost:5173` and `127.0.0.1:5173` have
separate saves, and clearing site data removes them. Explicit URL choices remain
temporary previews and never overwrite the save on load. Selecting an option
in a menu saves that field and removes its URL override so refresh honors it.
Use a plain `?scene=garage` link to restore your entire saved setup.

The default car is the original **NS-01 Blender coupe**, with the **Bulwark**
available alongside it in the garage. Its editable source,
export workflow and small hands-on guide are in
[`assets/cars/README.md`](assets/cars/README.md). Paint, wheels and stance work on
the imported GLB; the original procedural car is still available at
`?scene=garage&car=classic` for comparison. This changes visuals, not handling.

The archived Blackglass Blender course and
[`track workshop guide`](assets/tracks/blackglass/README.md) remain developer
references. Its GLB is in `assets/tracks/blackglass-rivergate.glb` and is not
shipped in `public/` or loaded by Port Alder.

Open **Options → Controls & remapping** from the main or pause menu for the driving guide and remapping.
The guide is no longer overlaid while driving. Select a keyboard/controller binding,
then press its replacement; Escape cancels, and **Restore defaults** resets all
bindings. Conflicts are rejected. Menu navigation, arrow-key driving and stick axes
stay fixed. Controller button remapping preserves analog trigger values. A trigger
reads exactly up to half travel and past 88% counts as fully pressed, so a pad whose
trigger stops short of its maximum still reaches full throttle.
Bindings save separately in `nightshift.controls` on this browser; blocked storage
keeps changes usable for the session.

Default controls: WASD/arrows or the left stick steer, W/RT accelerates, S/LT brakes,
and Space/A applies the handbrake. The right stick orbits the camera; R3/C
recenters it. V (remappable) or D-pad Up (fixed) cycles the chase camera through
Near, Standard, Standard B and Far; the choice saves in `nightshift.camera` on this
browser, apart from settings and save slots, and
`?camera=near|standard|standardB|far` previews one without saving. Near and Far
are fitted to Midnight Club 3's close and zoomed-out cameras. Standard B is an
experiment (2026-09-20): Standard's framing, carried with the car instead of only
eased after it, so it sits the table's 9.9 m behind at 140 mph where Standard
trails to 18.6 m, and pulls back on the gas and in on the brakes
(`ChaseFollow` in `src/render/camera.ts`). It is there to be compared, then
promoted into Standard or deleted. D-pad Left / Right (fixed) skip to the previous / next soundtrack track
while driving, starting the music if it was off, and the HUD names the track;
the D-pad steered until 2026-09-18. R/Y resets and H/LB toggles
telemetry. Escape/Options pauses; arrows or the D-pad navigate menus, and
Enter/Cross selects. The HUD confirms when a standard gamepad is ready.
In the garage, the right stick rotates the car and its platform under a fixed
inspection camera; R3/C resets the platform angle.
Headless tests also measure road-surface clearance and exercise both a paced
reference lap and a deliberately doomed throttle-pinned lap.
The elevation profile is simulation-owned: the road, car, barriers, camera, and
small uphill/downhill acceleration effect use the same Port Alder height function.
Blackglass reference-lap tests remain offline regression coverage.

## Structure

```
NIGHTSHIFT/
├── design/
│   └── GDD.md        # the design document — source of truth
├── src/
│   ├── sim/          # the game: deterministic, renderless, testable
│   ├── input/        # physical controls → simulation actions
│   ├── render/       # the picture: three.js, knows nothing else
│   ├── editor/       # Port Alder building placement and scene exchange
│   └── main.ts       # wiring: input → fixed tick → render + input log
├── tests/             # headless deterministic simulation checks
└── index.html
```

## Godot trial and third-party assets

The separate [Godot workshop](godot-prototype/README.md) is an editor-workflow
trial, not a replacement for the browser build. Its reference sports sedan and
palette texture come from [Kenney's Car Kit](https://kenney.nl/assets/car-kit)
under CC0; the [license](godot-prototype/assets/kenney-car-kit/License.txt) and
[source/processing notes](godot-prototype/assets/kenney-car-kit/README.md) are
included beside the model.

The local `car inspiration/` and `track inspiration/` folders are not cleared
project assets and are excluded from version control. Generated screenshots,
test reports, build output, and Godot caches are also excluded. Do not remove
these exclusions when preparing a public source release.

## Production order

GDD §20 records the phases and current checkpoint. Port Alder driving, the
open-checkpoint event, garage and workshop are playable. Improve the city
through driving feedback while preserving handling; career, upgrades and rival
personalities remain future work. GDD §21 bounds the current slice and permits
natural Port Alder expansion. A later phone port is not a blocker for PC work.

## Lineage

Same garage as [SENTINEL](https://github.com/KvFxKaido/SENTINEL),
different car: this game shares that project's engineering doctrine
(sim/renderer separation, determinism as a test, replay-as-data) but not
its universe. NIGHTSHIFT's current Port Alder slice has street lighting, civilian
traffic and Wharf Garage; it does not simulate businesses.

### Interface styling

`src/ui/theme.css` owns the shared interface palette: cyan navigation, amber objectives, red rivals/warnings, and mint success. Menus and HUD use the same smoked panels and numeric typography; drag and drift share an instrument slot. Contextual prompts follow the last keyboard/controller input and saved bindings, with PlayStation labels for recognized Sony controllers.

### Kestrel / garage-area rival

The cruising rival near Wharf Garage drives an original ivory Kestrel rally hatch, including generated sprint, circuit, and unordered challenges. Switching the player's car does not change it. The garage offers Cinder and Bulwark. The NS-01 is the car Sable keeps in the South Wharf yard, and the Kestrel and Hammer belong to Moth and Rivet; all three are rival-only bodies. A saved game that still names the NS-01 migrates to the Cinder, and an old `?car=blender` link resolves the same way.

Source: `assets/cars/ns-kestrel-01.blend`. Rebuild with Blender's `--background --python scripts/build-kestrel.py` (`-- --render` also produces front/rear studio renders). Export hand edits using `scripts/export-kestrel.py`, then run `node scripts/optimize-car.mjs --car=ns-kestrel-01`. The texture-free GLB uses the existing steering/spin pivots and shared vehicle collider.

### NS-01 livery editor

Open **Garage → Livery**. Pick a panel (hood, roof, either door, rear), then add stripes, racing numbers, chevrons, bolts, or a NIGHTSHIFT/text label. Select layers to change their color, position, size, rotation, or panel, mirror onto the opposite door, reorder, or delete them. Base paint supports hex colors and gloss/satin/matte finishes. Color swatches, number buttons, and the existing keyboard/controller menu navigation make common edits possible without typing; custom text and hex values use keyboard input. Right stick rotates the platform.

Up to 12 layers save automatically per browser for NS-01, with 40 session undo steps and redo. Livery off restores factory paint while keeping the design. Choosing a factory paint preset also turns the livery off. Graphics follow the body into driving and survive reloads and switching cars; Bulwark keeps its existing customization and does not edit NS-01's design. Designs are a per-car browser profile, not part of individual game-save slots. Bulwark livery authoring, image imports, and freehand painting are future work.

Graphics are projected only onto outward-facing painted triangles and remain local to the body for stance and motion. No glass, tire, or rival materials are modified. This first slice uses panel projections instead of a full-wrap UV texture; edited graphics can clip at panel edges. `src/customization/livery.ts` owns validated design data/history; `src/render/livery.ts` owns projection and texture disposal; `src/ui/livery.ts` owns garage editing and persistence.
