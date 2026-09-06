# Blackglass / Rivergate Blender workshop

First authored environment slice: the existing tunnel and bridge, not a new
route. Road position, elevation, width, barriers, tyre forces and replay remain
simulation-owned. This environment does not supply physics colliders.

## Edit and see it in the game

1. Open `assets/tracks/blackglass/blackglass-rivergate.blend`.
2. The Outliner separates **Editable environment** from locked **Road and
   collision guides - NOT EXPORTED**. Select a named wall, beam or portal.
3. `Tab` enters Edit Mode, `G` moves, `R` rotates, `S` scales; `Ctrl+Z` undoes.
   Metres, Z up in Blender. Keep the top-level root at identity.
4. Save with `Ctrl+S`. Run `pnpm track:export "C:\path\to\blender.exe"`, or set
   `BLENDER_EXE` and run `pnpm track:export`. Refresh the browser.
5. Alternatively, switch an area to Text Editor, select the embedded
   **Export track to NIGHTSHIFT.py**, and press `Alt+P`. This exports current
   unsaved edits too; `Ctrl+S` is still how you preserve them in the source.

Normal export **never rebuilds or saves over your .blend**. It evaluates a
temporary copy and batches by spatial section/material; your individual source
parts stay editable. Keep the .blend in this directory so the button finds the
project. Node and installed project dependencies are needed for optimization.

The browser loads `public/assets/tracks/blackglass-rivergate.glb` by default.
`?environment=classic` explicitly selects the old procedural tunnel and bridge
for comparison/recovery. The rest of the course is still procedural.

## Boundaries that matter

- Guides come from `src/sim/track.ts`, not from eyeballing the rendered course.
  Moving the reference road does **not** move the drivable surface.
- Keep solid scenery outside the collision barriers and at least 6 metres
  above the road when crossing overhead. Decorations are not new obstacles.
- `blackglass-rivergate` root has an `assetVersion` and `routeFingerprint`.
  Export/runtime reject a stale stamp after a route change. Do not update the
  stamp to silence the error: re-import/reconcile guides and test clearance.
- `anchor-*` empties check orientation/scale/alignment. Leave them at the guide
  points. `light-*` empties position runtime illumination, with `lightKind`
  equal to `tunnel` or `bridge`. Keep them below their fixture, inside the road.
- Groups directly under the root are spatial export sections. Parent new
  meshes under one of those groups. Materials are shared deliberately.
- Road and barrier references are excluded, as are Blender cameras/lights.
  No duplicate drivable floor or alternate collision system is exported.

## Regeneration and validation

`pnpm track:guide` writes a fresh route-guide JSON without changing the .blend.
`scripts/build-blackglass.py` is the original reproducible generator and
**overwrites the .blend**. It is not the normal export command.

The export uses glTF Transform weld/dedup/prune and glTF Validator before
publishing. Maximum 2.5 MB and 160 spatial/material mesh batches; no textures,
compression decoder, downloaded assets or fonts. The lettering is original
grid geometry. Source created with the installed Blender 5.3 Alpha.

Run `pnpm test` and `pnpm build` after export. The asset tests inspect the
actual shipped GLB, route stamp/anchors, budgets, guide exclusion, and road
clearance. Browser checks must still inspect the driver's view and shadows.

Lighting is hybrid: authored emissive lenses, runtime pooled point lights and
the existing city/moon lighting. No final light bake, LOD set or new sky/water
system in this slice. Spatial batching keeps culling local; a full city pass
will need a separate LOD/performance budget.
