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
police, career progression, Live Cred or Surge.

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
A rival waits on First Avenue S just north of Wharf Garage, marked red on the
minimap. Approach at cruising speed and flash headlights with **F / X–Square**
(remappable in Controls), or click the nearby prompt, to line up for Sound to Sky.
The pause menu offers **Return to free roam** during a race.
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

The proposed core gameplay hook is documented in
[`design/LIVE_CRED.md`](design/LIVE_CRED.md): stylish racing creates temporary
Cred that can be burned on Surge or carried across the finish line to buy
parts. It is a design target, not functionality in the current build.

The garage is a functional first visual-customization slice. It uses the same
car mesh as the track and offers **NS-01** and **Bulwark** car choices, paint,
wheel finish, and visual ride height. Both cars currently share the same handling
and visual setup. FWD is the default drivetrain. Your car, drivetrain, paint, wheel finish and
stance automatically save on this browser and return after refresh/reopening.
Options and Garage show settings status; blocked storage leaves the game usable with
session-only choices. Performance parts, prices, race progress and saved replays
are not implemented by this settings save.

**Named saved games:** the title offers **Continue** (most recently saved slot),
**Load game**, **New drive**, **Garage**, and **Options**. Pause → **Save game**
writes one of three named slots, including your car, drivetrain, customization,
and free-roam location. These are manual saves; choosing an occupied slot requires
**Replace save**. Loading starts the car stationary. Race saves and locations
blocked by new scenery return to Wharf Garage; race clocks and opponents are not
resumed. A new drive does not erase any slots. Audio and remapped controls remain
global preferences. Saved games use `nightshift.saves` in this browser, not cloud
storage; clearing site data removes them.

Audio and remapping live under **Options**. Drivetrain selection lives in the
**Garage**. Pause keeps Resume, Save game, Port Alder map, Options, Main menu, and
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
stay fixed. Controller button remapping preserves analog trigger values.
Bindings save separately in `nightshift.controls` on this browser; blocked storage
keeps changes usable for the session.

Default controls: WASD/arrows or left stick/D-pad steer, W/RT accelerates, S/LT brakes,
and Space/A applies the handbrake. The right stick orbits the camera; R3/C
recenters it. R/Y resets and H/LB toggles
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
