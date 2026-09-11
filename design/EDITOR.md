# Seattle workshop

Run `pnpm dev`, then open `http://localhost:5173/editor.html` (or use the
assigned port). The route board also has an **Edit Seattle** link.

This is a small NIGHTSHIFT editor using Three.js's OrbitControls and
TransformControls. It edits building footprints against the real district
roads and terrain. The daytime boxes make placement readable; the game
continues to dress those footprints with its existing night buildings.

## Editing locally

1. Click a building, or choose one from **Selected building**.
2. Drag to orbit, right-drag to pan, and scroll to zoom. **F** frames the
   selection; **Top view** helps inspect its footprint against the street.
3. **W** moves, **E** rotates, and **R** resizes the selected box. Drag its
   handles or enter dimensions and coordinates in the sidebar. Movement
   stays horizontal, rotation stays upright, and the base follows terrain.
4. Check the placement message. Invalid buildings turn red and cannot be
   saved. Undo/redo works across edits and imports; Ctrl/Cmd+Z undoes and
   Ctrl/Cmd+Shift+Z redoes. **Reset building** restores a generated plot.
5. **Add building** places a new authored box where the camera is looking;
   move and size it from there. **Delete building** (or the Delete key)
   removes the selection: a generated plot is retired, an authored one is
   dropped. Neither touches Wharf Garage.
6. **Save to project** (Ctrl/Cmd+S) writes `src/sim/seattle-layout.json`.
7. **Drive map** opens a fresh game using the saved layout. Reload an
   already-open game to pick up a save; saving does not reset a running race.

A generated plot you move or resize becomes an authored building of its own
the moment it changes (the note under the picker says so, and it turns the
authored colour), so a rebuild of the generated map cannot lose it. Roads and
Wharf Garage are fixed. The garage has a special entrance and spawn that
require a dedicated placement workflow. Road authoring, materials, and
decorative props are not supported yet. Height changes can alter the
generated facade's floor count. Placement checks cover street/pavement
distance, the Space Needle, the garage and its forecourt, map boundaries,
slope and other authored buildings; a generated plot an authored one stands
on is not an error — it stands down. A successful save still needs visual
inspection and a drive.

Scene exports compact reference-mesh coordinates to millimetres while leaving
building transforms at full precision. The measured Seattle export is about
19.7 MB; imports are limited to 40 MB.

## Using the official Three.js editor

Open **Files & Three.js editor**, then **Export Three.js scene**. At
https://threejs.org/editor/ use **File → Import** and select that JSON.
Edit the named building boxes using position, Y rotation, and scale. Save
the editor project/scene as JSON and import that file back in NIGHTSHIFT.
Review the resulting draft and placement messages before saving.

The importer reads tagged building transforms from scene JSON or an editor
project's `scene` field. It does not execute scripts or load imported assets.
Vertical placement is re-seated on district ground. Road, geometry and
material edits are ignored. A generated plot's box that is missing from the
scene is a deletion (the plot is retired); a box tagged with an authored id
this project has never seen is a new authored building; an untagged box is
not a building. Duplicated ids, unknown generated ids, garage changes, tilted
or mirrored buildings, and incompatible district baselines are rejected.
Keep the building tags intact.

**Export placement backup** produces the much smaller placement JSON for
sharing or safeguarding a draft. **Reload saved placements** reads the file
currently in the project; Undo recovers the draft that was replaced. If
another editor has saved since this tab loaded, save refuses to overwrite it.
Export your draft, reload saved placements, and reconcile the edits.

## Runtime contract and validation

**Authored plots are their own list (schema 2, 2026-09-11).** The layout
file holds `authored`: first-class buildings in world coordinates with their
own ids (`authored-<n>`, or `authored-from-<plot>` for a generated plot that
was edited, so the editor can pair them again), and `retired`: generated plot
ids that no longer stand, deleted or replaced. Nothing in it is keyed to the
generator's output the way schema 1's per-plot edits were, which refused the
whole file once a rebuild moved one plot. A rebuild now: the builder
(`scripts/build-seattle.py`) reads the authored list, keeps filler three
metres clear of every authored footprint and drops a pinned plot one stands
on; the sim (`resolveSeattleLayout`) composes generated plots less retired
and less any an authored plot overlaps — authored wins, so a build that
predates the plot still loads — then the authored plots; a retired id the
generator no longer produces is ignored, because that plot is gone anyway.
`SEATTLE_LAYOUT.entries` says what stands and where each came from; the
editor keys its boxes by id, never by index. Generated plots keep stable ids
from their X/Z position, and the baseline fingerprint (millimetre precision,
to tolerate last-bit trigonometry differences between Node and browsers)
still identifies the generation a scene export or a schema-1 file was made
against; schema-1 files are upgraded on read. Layout content is included in
the world/replay ID. An empty file retains `seattle-slice-v3` and the
generated Seattle geometry plus its fixed garage. Old Blackglass placement
files have a different baseline and must not be imported as Seattle
placements; the district fixture keeps the schema-1 parser.

The write endpoint exists only in the Vite development server. Writes require
same-origin localhost requests, validate the shared layout, compare the saved
file revision, and atomically replace that one JSON file. A production build
can inspect and export drafts but cannot write project files. After changing
the generated road/plot source itself, restart `pnpm dev` before saving edits
so Node's validator and the browser use the same source modules.

`tests/building-layout.test.ts` checks Three.js JSON round trips, transform
handedness, actual Rapier collider coverage, invalid imports, and placement
rejection. `tests/layout-server.test.ts` checks invalid/foreign writes and two
concurrent saves. `scripts/check-editor-browser.js` exercises the real UI,
saves a height edit, checks the collider in a fresh game, round-trips scene
JSON, and verifies that UI and endpoint both reject a road overlap. It restores
the starting placement file after the check; run it separately from tests
that load the district, since it temporarily edits the live layout.
