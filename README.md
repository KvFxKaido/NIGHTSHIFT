# NIGHTSHIFT

**Status: Early Prototype — Phase 1 (handling lab).**
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
pnpm dev        # → http://localhost:5173
pnpm test       # deterministic simulation smoke tests
pnpm build      # typecheck + production build
```

What's on screen today is the first Phase 1 environment prototype: a low-poly
tuner on the 1.70 km Blackglass Circuit, with physical barriers, a long lit
tunnel, a genuinely elevated steel-frame bridge, rolling district grades, an
urban skyline, custom arcade vehicle forces resolved through Rapier, a
grip-limited steering envelope, speed-sensitive chase camera,
keyboard and standard gamepad controls, a controller-navigable title, track,
garage, and pause flow, instant reset, replay, and optional handling
telemetry. The handling values are deliberately exposed together in
`src/sim/sim.ts`; this is a tuning surface, not a finished vehicle model. The
course brief and current prototype boundaries live in `design/BLACKGLASS.md`.

The **Blackglass District** is the default world, and **Drive** goes straight
into it as free roam: 11.31 km of street across 33 junctions in a 935 x 935 m
block, with no route, no timing and no finish line. The top-down board at
`/district.html` — or **District map** on the title screen and in Pause —
previews seven route guides over the same streets; `?route=<id>` overlays one
and draws its arrows and gates. Junctions are open and races are not scored
yet. `?world=blackglass` returns to the original closed course. See
[`design/DISTRICT.md`](design/DISTRICT.md) for scope and playtest questions.

The proposed core gameplay hook is documented in
[`design/LIVE_CRED.md`](design/LIVE_CRED.md): stylish racing creates temporary
Cred that can be burned on Surge or carried across the finish line to buy
parts. It is a design target, not functionality in the current build.

The garage is a functional first visual-customization slice. It uses the same
car mesh as the track and currently offers paint, wheel finish, and visual ride
height. FWD is the default drivetrain. Your drivetrain, paint, wheel finish and
stance automatically save on this browser and return after refresh/reopening.
Pause and Garage show save status; blocked storage leaves the game usable with
session-only choices. Performance parts, prices, race progress and saved replays
are not implemented by this settings save.

Settings use the versioned `nightshift.settings` localStorage entry. They are
local to this browser and origin: `localhost:5173` and `127.0.0.1:5173` have
separate saves, and clearing site data removes them. Explicit URL choices remain
temporary previews and never overwrite the save on load. Selecting an option
in a menu saves that field and removes its URL override so refresh honors it.
Use a plain `?scene=garage` link to restore your entire saved setup.

The default car is the original **NS-01 Blender coupe**. Its editable source,
export workflow and small hands-on guide are in
[`assets/cars/README.md`](assets/cars/README.md). Paint, wheels and stance work on
the imported GLB; the original procedural car is still available at
`?scene=garage&car=classic` for comparison. This changes visuals, not handling.

The tunnel-to-bridge stretch is now Blender-authored too: faceted tunnel
cladding, service details, portals, deeper bridge trusses/piers and a small
skyline backdrop. The rest of the circuit remains procedural. Open the source
and follow [`the track workshop guide`](assets/tracks/blackglass/README.md), then
use `pnpm track:export "C:\path\to\blender.exe"` and refresh. Normal export
preserves hand edits; it does not regenerate the source. `?environment=classic`
selects the old tunnel/bridge explicitly. Road geometry and physics are unchanged.

Controls: WASD/arrows or left stick/D-pad steer, W/RT accelerates, S/LT brakes,
and Space/A applies the handbrake. The right stick orbits the camera; R3/C
recenters it. R/Y resets, P/View replays the current run, and H/LB toggles
telemetry. Escape/Options pauses; arrows or the D-pad navigate menus, and
Enter/Cross selects. The HUD confirms when a standard gamepad is ready.
In the garage, the right stick orbits the inspection camera and R3/C recenters it.
Headless tests also measure road-surface clearance and exercise both a paced
reference lap and a deliberately doomed throttle-pinned lap.
The elevation profile is simulation-owned: the road, car, barriers, camera, and
small uphill/downhill acceleration effect all use the same sampled course data.

## Structure

```
NIGHTSHIFT/
├── design/
│   └── GDD.md        # the design document — source of truth
├── src/
│   ├── sim/          # the game: deterministic, renderless, testable
│   ├── input/        # physical controls → simulation actions
│   ├── render/       # the picture: three.js, knows nothing else
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
