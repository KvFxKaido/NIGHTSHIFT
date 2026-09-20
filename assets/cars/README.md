# NS-01 / Blender workshop

The browser game's default car is now an original, Blender-authored angular
coupe. It keeps NIGHTSHIFT's boxy proportions, with continuous coachwork,
subtractive wheel arches, an enclosed raked greenhouse, five-spoke wheels,
twin-blade lamps and a small ducktail.

- Editable source: `assets/cars/ns-coupe-01.blend`
- Shipped asset: `public/assets/cars/ns-coupe-01.glb`
- Game adapter: `src/render/blender-car.ts`
- Original procedural comparison: `src/render/car.ts`
- New car: `http://localhost:5173/?scene=garage`
- Old car: `http://localhost:5173/?scene=garage&car=classic`

This is a visual replacement only. Physics, tyre positions, collision body,
drivetrain selection and steering tuning are unchanged. The garage offers both
NS-01 and Bulwark, and saves the selected car. Both use the same handling and
visual customization setup; in-game replay and the ghost have been removed. Existing paint,
wheel-finish and stance controls work with the new model. Glass is deliberately
opaque smoked glass; no cabin interior or opening doors are modeled in this pass.

## Hands-on editing: the small version

1. Open `ns-coupe-01.blend`. The `coachwork` object starts selected.
2. Middle-mouse drag orbits; the wheel zooms; numpad `.` frames the selection.
3. Select a part in the Outliner. `Tab` enters/exits Edit Mode. `G` moves,
   `R` rotates, `S` scales; follow with `X`, `Y` or `Z` to constrain an axis.
   `Ctrl+Z` undoes. Move vertices in Edit Mode to keep the object's origin intact.
4. `Ctrl+S` saves your source. Export, then refresh the game.

The main body has live Boolean modifiers for the wheel openings and a small
Bevel modifier for highlight edges. The hidden `Wheel clearance / keep cutters`
collection contains those cutters. Don't delete it or shrink the openings
without rerunning clearance tests. The greenhouse is a welded mesh with paint,
glass and rubber-seal material slots, so its windows follow its pillars.
The body and greenhouse end with an X Mirror modifier: edit their positive-X
half and Blender reproduces the surface on the other side. The mirror runs
after the body bevel/cuts so those cannot triangulate into different left/right
silhouettes. Keep paired clearance cutters as guides; the positive-X result is
the final authority for these two mirrored objects.

### Export from Blender

Switch any area to **Text Editor**, choose the embedded **Export to NIGHTSHIFT.py**
text and press **Alt+P** while your pointer is in that editor. It exports the
current scene and runs the local optimization/validation step. This needs the
project's installed Node dependencies (`pnpm install`) and Node on PATH.

This exports unsaved geometry too; use Ctrl+S if you want to keep it in the source.
The embedded `START HERE.md` text is this guide. Leave the .blend under
`assets/cars/` so the embedded exporter can locate the repository.

### Export saved edits from the terminal

```powershell
# Use the executable path for your installed/portable Blender.
$env:BLENDER_EXE = 'C:\path\to\blender.exe'
pnpm car:export
pnpm test
```

Or pass the executable directly: `pnpm car:export "C:\path\to\blender.exe"`.
The command opens the saved source in background Blender, exports the model
only, optimizes with glTF Transform, then validates before replacing the runtime
GLB. It never regenerates or saves over your edited source. Refresh the game;
no application rebuild is needed while Vite is running.

Do **not** use `scripts/build-coupe.py` for normal edits: that is the original
reproducible generator and deliberately rebuilds/overwrites the source .blend.
Its optional `-- --render` argument produces an ignored studio PNG in `artifacts/`.

## Asset contract

Blender units are metres, Z up, nose toward +Y. glTF exports Y up, nose toward -Z,
matching the game without a scale/rotation correction. Leave root/group transforms
at identity and parent new parts under the appropriate named group:

```text
ns-coupe-01
  body-shell                 paint, glass, trim, lamps; visual stance moves this
  wheel-front-left           (-0.92, 0.40, -1.48) in runtime coordinates
    rolling-front-left       wheel geometry around the local X axle
  wheel-front-right          (+0.92, 0.40, -1.48)
    rolling-front-right
  wheel-rear-left             (-0.92, 0.40, +1.48)
    rolling-rear-left
  wheel-rear-right            (+0.92, 0.40, +1.48)
    rolling-rear-right
```

Use unique kebab-case object names. `car-paint` and `wheel-finish` are shared
material names used by customization. Wheel radius is 0.36 m, half-width 0.125 m.
Stances drop the body up to 0.075 m and inset wheel centres by up to 0.035 m.
The steering clearance gate samples through +/-0.42 radians at every stance,
using a circumscribed wheel envelope that covers every wheel spin.

The body is concave. The old procedural convex-SAT tests still test the old car;
`tests/blender-car.test.ts` tests the actual shipped GLB against individual body
triangles, plus units, naming, materials, pivots, sealed cabin and malformed assets.
Changing the source alone does not test new geometry: export it before testing.

## Delivery and provenance

Authored in the locally installed Blender 5.3.0 Alpha. Prefer that build or a
compatible newer Blender when reopening; older-version compatibility is not
claimed. The source includes an original studio rig, excluded from export.

No downloaded vehicle, texture, logo, HDRI or font is used. All geometry comes
from the checked-in generator and subsequent project edits. The private
`car inspiration/` folder remains excluded and was not imported.

The GLB uses standard PBR materials, no textures, no baked lighting, and dynamic
runtime lights. glTF Transform welds/deduplicates/prunes without flattening the
named hierarchy or applying lossy simplification. At roughly 415 KB uncompressed,
an extra Draco/Meshopt decoder is unnecessary for this single hero car. There is
one LOD; traffic fleets/multiple repeated cars would warrant a separate LOD pass.
Physics continues to use the existing simple chassis collider, not render triangles.

Missing or invalid assets show a loading error rather than silently substituting
the old car. `?car=classic` is an explicit comparison/recovery option.

## Hammer / Rivet's drag coupe

Rivet's cream-and-black notchback is an original Blender model, with a raised
hood scoop, opaque glazing, chrome bumpers, a small rear spoiler and deep-dish
wheels. Front tyres are 0.22 m wide; rear slicks are 0.36 m wide. It keeps the
shared axle pivots, 0.36 m tyre radius and chassis collider. The model belongs
to Rivet's parked encounter and drag race; Rivet uses the game's RWD model.

- Source: `assets/cars/ns-hammer-01.blend`
- Runtime: `public/assets/cars/ns-hammer-01.glb`
- Explicit source generator: `scripts/build-hammer.py` (`-- --render` for previews)
- Export saved edits: Blender with `--background assets/cars/ns-hammer-01.blend --python scripts/export-hammer.py`, then `node scripts/optimize-car.mjs --car=ns-hammer-01`

The optimized asset is about 315 KB, with 59 meshes, eight materials and no
textures or decoder dependencies. Studio cameras/lights and clearance cutters
stay out of the GLB. `tests/hammer-car.test.ts` checks the shipped file, including
the wider rear tyres and front steering clearance. No downloaded assets are used.


## Cinder hero sedan

An original first-generation Lexus IS300-inspired four-door: tapered bonnet,
compact greenhouse, paired circular headlamps, silver rear lamp housings with
round red optics, five-spoke wheels, and a small trunk lip. Existing body choices
remain available. The shared simulation, collider and wheel pivots are unchanged.

- Source: `ns-cinder-01.blend`; runtime: `public/assets/cars/ns-cinder-01.glb`.
- Rebuild: Blender `--background --python scripts/build-cinder.py`.
- Export hand edits: open the source in Blender and run `scripts/export-cinder.py`.
- Optimize/validate: `node scripts/optimize-car.mjs --car=ns-cinder-01`.
- Preview: `?scene=garage&car=cinder`; select Cinder in the garage to save it.
- Paint, wheel finish and stance are supported. Panel liveries remain NS-01 only.
- Tests cover shipped asset validation and wheel clearance at every stance/steer.

Proportion reference: https://www.cars.com/research/lexus-is_300-2001/
Geometry is authored here; no third-party model or texture is included.

### Cinder interchangeable parts

The source includes three coherent body sets: factory, street and race. Front
lips, side skirts, rear valances and spoilers can also be selected separately.
Spoilers offer a clean trunk, factory lip, ducktail and supported race wing.
Factory five-spoke, dished six-spoke and split-ten centers share tyres, barrels,
hubs and pivots. The complete texture-free GLB is about 625 KB.

Each variant parent has `customizationSlot` (`front`, `skirts`, `rear`,
`spoiler` or `wheelDesign`) and `customizationOption` extras. Runtime switches
the entire group, including cel outlines and shadows. The window material is
separate from the mirrors; three opaque glass finishes retain the stylized
look without exposing an unauthored interior.

Run Blender with `--background assets/cars/ns-cinder-01.blend --python-exit-code 1 --python
scripts/build-cinder-parts.py` to regenerate only the parts, preserving the
stock body. Then run the usual optimizer. The full Cinder builder also installs
the parts. Export all variants; select them in the garage at runtime.

Garage choices persist. Older saves default to stock; earlier whole-kit saves
resolve to their matching individual parts. `bodyKit` is a preset: choosing
one writes all four body slots together while retaining wheels, tint, paint
and stance. An individual part override produces a custom mix. Other car
bodies do not expose these Cinder slots. All parts are cosmetic.

Preview with `?scene=garage&car=cinder&bodyKit=race&wheelDesign=mesh&tint=dark`.
Individual URL fields (`front`, `skirts`, `rear`, `spoiler`) override the preset.
`pnpm test:cinder` checks kits, mixing, reload, driving, stock restoration and
mobile controls. Asset tests check every body triangle against swept wheels
at every stance, all 108 body/spoiler combinations, and tint/mirror isolation.
