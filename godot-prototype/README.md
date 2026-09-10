# NIGHTSHIFT / Godot Workshop

**Reference experiment, not the current production direction (2026-09-10).**
NIGHTSHIFT continues with Three.js/Rapier and the sole Seattle demo map.
The RedMagic 10 Pro port follows the PC prototype; this workshop is not an
engine migration or a Seattle port. The trial instructions below remain for
examining the separate experiment.

A separate, playable editor-workflow trial. The browser game in the parent
folder is unchanged and remains the reference. This is **not a complete port**.

## Open and play

Open Godot, choose **Import**, and select this folder's `project.godot`.
Press **F5** to run; the game opens in the garage. Choose **Drive the loop**.
**F8** stops a game launched from the editor.

On Shawn's current machine, from the repository's PowerShell terminal:

```powershell
.\godot-prototype\launch.ps1
```

That opens the editor. Use `-Play` to open just the game, or `-GodotPath`
to choose another Godot executable. No npm, Blender, export templates, or .NET
installation is needed to run this prototype.

## Reference body comparison

In the garage, choose **COMPARE REFERENCE BODY**. NIGHTSHIFT is on the left;
Kenney's sports sedan is on the right. Both are displayed at the same overall
length, with their original proportions, shared neutral lighting, and an
orthographic camera so perspective does not favor either subject.

- **Right stick / hold RMB and drag:** rotate both cars in place; vertical input
  raises/lowers the viewing angle. **C / R3** recenters.
- The material selector switches between **CLAY / SHAPE STUDY** (one neutral
  material on both models) and **ORIGINAL MATERIALS**.
- **BACK TO GARAGE**, **Escape**, or **Circle** returns to customization.
  Escape/Circle closes an open selector popup before leaving the comparison.

This is a shape reference, not a new drivable vehicle or a handling change.
Your current paint, wheel finish, and stance are left alone. The study uses an
independent copy of our authored car, not the customized driving instance.

The reference comes from [Kenney's CC0 Car Kit](https://kenney.nl/assets/car-kit).
Source/license/normalization notes are in `assets/kenney-car-kit/README.md`.
Open `scenes/reference_car.tscn` to inspect its imported body/wheel hierarchy;
open `scenes/reference_comparison.tscn` to edit the study setup.

Reference validation: the optimized GLB passes glTF validation with no errors
or warnings. Tests cover length/ground/orientation, embedded textures, material
restoration and isolation, camera input/projection, garage return, and driving
after comparison. Native clay, side, original-material, and 960x600 captures
were inspected. Physical controller testing still needs your DS4.

Built and tested with installed Godot **4.6.3**, standard (GDScript) edition.
An engine update is not required for this trial.
The desktop default is Forward+ (tested on the RX 6800 XT). Compatibility was
also smoke-rendered, but its tone mapping and lighting differ.

## First hands-on edit

1. In Godot's FileSystem panel, open `scenes/car.tscn`.
2. Select the root **Car** node. Under **Appearance**, change **Body Color**
   or **Stance**. The car updates in the editor.
3. Expand **Visual > BodyShell**, select **hood**, and press **F** to frame it.
   Its Transform controls move/rotate the panel; its BoxMesh resource controls
   the dimensions. Each wheel, glass panel, arch rib, and light is a real node.
4. Save, then **F5**. The garage and driving scene use that same car scene.

Do not move the wheel spin/pivot origins casually: these are the steering and
animation centers. Changing the visual body does not automatically resize the
driving collision box; that lives in `scenes/player.tscn`.

For live experiments while the game runs, the editor's **Remote** scene tree
lets you inspect and change running nodes. Remote changes are temporary. For
saved scene edits, Godot also has **Debug > Synchronize Scene Changes** and
**Synchronize Script Changes**. Not every structural/code change can be safely
hot-reloaded; save and restart with F5 when needed. External file edits should
be reloaded when Godot asks, without overwriting unsaved Inspector work.

[Godot's live-debugging documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html)

## Controls

| Action | Keyboard / mouse | Standard controller / DS4 labels |
| --- | --- | --- |
| Accelerate | W / Up | R2 |
| Brake, then reverse | S / Down | L2 |
| Steer | A/D / Left/Right | Left stick / D-pad |
| Handbrake | Space | Cross |
| Orbit camera | Hold RMB and drag | Right stick |
| Recenter | C | R3 |
| Garage / drive | G | Share |
| Pause / resume | Escape | Options |
| Reset to start | R | Triangle |
| Menu navigation | Arrows, Enter, Escape | D-pad / left stick, Cross, Circle |

Controller bindings are implemented, but physical DS4 testing still needs your
controller. Click the game window if it does not have input focus. Driving
pauses when the application loses focus. Customization carries between garage
and track during a session; there is no save-game system in this trial.

## What is included

- The existing car and garage transferred to editable native scenes.
- Paint, wheel finish, ride height, and camera orbit.
- A roughly 580 m flat test loop with barriers, a tunnel, and night lighting.
- Garage/drive/pause navigation and keyboard/standard-controller bindings.
- A 60 Hz custom handling model using the browser's flat-road tuning/equations,
  with per-tick input recording (no replay UI yet).

What is deliberately not ported: the full BLACKGLASS layout and hills, replay,
audio, progression, race opponents, and Live Cred. Wall contact uses Godot's
kinematic collision handling, not Rapier; impact feel is **not equivalent**.
The handling tests establish repeatability within this engine build, not
cross-engine or cross-platform bitwise determinism. Lighting is a first pass.

## Where we edit together

| Want to change | Open |
| --- | --- |
| Car shape and authored default appearance | `scenes/car.tscn` |
| Garage props and lights | `scenes/garage.tscn` |
| Road, tunnel, barriers, buildings | `scenes/circuit.tscn` |
| Menus, camera, environment, starting scene | `scenes/workshop.tscn` |
| Handling numbers in the Inspector | `resources/handling.tres` |
| Handling equations | `scripts/handling_sim.gd` |
| Collision adapter | `scripts/player.gd` |
| Input mappings | `scripts/controls.gd` |

Scenes are text files: you can author them visually while I work on scripts or
different scenes. Avoid editing the **same unsaved scene** in both places at
once. The car/garage are not regenerated at startup, so your saved edits stay.

`tools/bootstrap_from_browser.mjs` is a **one-time transfer tool**, not part of
normal development. It refuses to overwrite existing scenes. Do not rerun it
on edited scenes or treat the browser and Godot versions as automatically synced.

## Checks

```powershell
$godotExe = 'C:\dev\Godot_v4.6.3-stable_win64.exe\Godot_v4.6.3-stable_win64_console.exe'
& $godotExe --headless --path .\godot-prototype --editor --import --quit
& $godotExe --headless --path .\godot-prototype --fixed-fps 60 --script res://tests/smoke.gd
& $godotExe --headless --path .\godot-prototype --fixed-fps 60 --script res://tests/drive_loop.gd
& $godotExe --headless --path .\godot-prototype --fixed-fps 60 --script res://tests/reference.gd
& $godotExe --path .\godot-prototype --fixed-fps 60 --script res://tests/capture.gd
```

The last command requires a real renderer, opens a temporary test window, and
captures garage/reference-clay/reference-side/reference-materials/compact-view/
white-slammed/track/tunnel PNGs into ignored `artifacts/`.
Headless assertions are not a replacement for those native screenshots or
your side-by-side handling test.

Initial validation on 2026-09-05: clean engine import; **22 smoke assertions
passed**; the automated driver completed all 120 route samples in 29.53 simulated
seconds (maximum center-sample distance 2.52 m); all four native render captures
were inspected. Physical controller feel and live editor synchronization still
need hands-on confirmation.
