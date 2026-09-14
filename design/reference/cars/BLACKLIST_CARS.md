# The six remaining rival cars

Built 2026-09-13 from the directions in `design/BLACKLIST.md`. Names are
Codex's working names for review. Each is original geometry inspired by the
listed proportions, with no borrowed model, badges or textures.

| Rival | Car / asset id | Base drive | Body identity | GLB bytes |
| --- | --- | --- | --- | ---: |
| Stray | Latch / `latch` | FWD | Acid-green sport liftback, visor spoiler | 332,720 |
| Bollard | Breakwater / `breakwater` | AWD | Safety-yellow enclosed off-roader, tailgate spare | 402,008 |
| Deuce | Wager / `wager` | RWD | Magenta rotary-inspired sports car, low ducktail | 326,236 |
| Plumb | Meridian / `meridian` | AWD | Silver four-door wagon, long cargo roof | 365,876 |
| Crest | Skim / `skim` | FWD | Cobalt two-seat roadster, fitted dark hardtop | 375,052 |
| Wake | Reign / `reign` | AWD | White upright coupe, separate boot and bridge wing | 405,212 |

Source files are `assets/cars/ns-<id>-01.blend`; optimized runtime files are
`public/assets/cars/ns-<id>-01.glb`. All six use the existing rig at
(+/-0.92, 0.40, +/-1.48), and all pass the same swept-tyre clearance checks.
The off-roader's spare belongs to the body shell, never the rolling wheel rig.

This adds renderable rival bodies and their base drivetrain declarations.
It does not implement encounters, unlocks, engine simulation, per-car mass,
speed or grip. `isPlayerCarId` still accepts only Cinder and Bulwark.

## Build and export

Use the configured Blender executable in place of `blender` below. From the
repository root, a complete rebuild of one car is:

```powershell
blender --background --python scripts/build-blacklist-cars.py -- --car=latch --render
node scripts/optimize-car.mjs --car=ns-latch-01
```

The six build functions share mesh, glazing, wheel and studio helpers; each
authors its own sections, cabin proportions and detailing. `--car` is required
so rebuilding never silently overwrites a different car's hand edits.
`--render` writes studio front/rear views into this directory.

To export an edited source without rebuilding or saving over it:

```powershell
blender assets/cars/ns-latch-01.blend --background --python scripts/export-blacklist-car.py
node scripts/optimize-car.mjs --car=ns-latch-01
```

## Runtime color measurements

`scripts/capture-cars.js` uses the actual garage camera, turntable and lighting,
with authored paint and the shared red tail PointLight. Each capture is
660 x 440. The optional second argument selects a subset of car ids.

`python scripts/count-blacklist-colors.py` counts visible identity colors in
the untouched captures. Saturated colors use HLS saturation > 0.3 and
lightness 0.08–0.85, with hue windows: green 65–100, yellow 40–65,
magenta 290–325, cobalt 210–245 degrees. Silver and white use saturation
< 0.25 and lightness 0.18–0.85, because they have no identity hue.
The working visibility gate is 1,500 pixels in each view.

These are whole-image visibility counts, not segmentation of car paint.
Neutral counts can include lamp highlights. They do not prove that silver and
white are perceptually distinct; that still needs visual judgment. Their
different wagon/coupe silhouettes provide an additional identity cue.

| Car | Front pixels | Rear pixels |
| --- | ---: | ---: |
| Latch | 15,015 | 11,969 |
| Breakwater | 16,271 | 6,101 |
| Wager | 14,956 | 12,904 |
| Meridian | 19,132 | 11,210 |
| Skim | 19,590 | 13,802 |
| Reign | 5,096 | 4,419 |

Reign's rear garage view was compared with Sable's NS-01: the taller cabin,
raised bridge wing, separate boot and six square lamp cells distinguish it
from Sable's low ducktail and horizontal blade lamps. This is a visual review,
not a claim that a player's recognition test has been run.

## Validation and review

The full suite passed **467/467 tests**; the final production build passed.
All six final GLBs also passed the 12 focused asset/clearance tests after the
last lamp adjustment. Each exports with zero glTF errors and warnings.

- `node --experimental-strip-types --test tests/blacklist-cars.test.ts tests/cars.test.ts`
  checks glTF validity, size, adapter contract, drive assignment, rival-only
  status, defining body geometry and full-lock tyre clearance.
- `pnpm test` and `pnpm build` cover the repository.
- `<id>-front.png` / `<id>-rear.png`: in-game garage views.
- `<id>-studio-front.png` / `<id>-studio-rear.png`: Blender studio views.
- `blacklist-lineup.png`: six-car studio review sheet.
- `blacklist-runtime-lineup.png`: six-car in-game rear review sheet.

The browser captures completed without JavaScript exceptions. The browser
also reported the existing missing favicon and Rapier initialization warning.

## Open review notes (Claude, 2026-09-13)

Accepted as they are for now, by Shawn's call; recorded so the next pass on
these bodies starts from them.

- **Reign reads as Hammer from the front.** In the in-game front captures
  (`reign-front.png`, `hammer-front.png`) both are boxy upright notchbacks with
  the same pair of rectangular headlamps, and the garage light turns Reign's
  white cream, so Hammer's black hood scoop is the main difference. This is the
  risky pair `design/BLACKLIST.md` names (Wake's white against Rivet's cream).
  The rear views separate them (Reign's bridge wing and six lamp cells), and the
  NS-01 comparison above was made on the rear view only. Directions if it is
  revisited: a lower, wider stance with flared arches, a colder pure white, or a
  darker two-tone.
- **Meridian's silver also renders cream from the front** (`meridian-front.png`),
  so three fronts read near-white: Hammer, Meridian and Reign.
- **The silver and white counts do not measure identity.** Both use one
  low-saturation bucket over the whole capture, floor and walls included, so they
  cannot tell silver from white, and Reign's brightest paint likely falls above
  the 0.85 lightness cutoff (5,096 front pixels against Meridian's 19,132). The
  four hue-window counts stand; for Meridian and Reign a count restricted to the
  car's paint, compared against Hammer's and Moth's captures, would be the real
  check.
- **The names are working names** awaiting Shawn's approval: Latch, Breakwater,
  Wager, Meridian, Skim, Reign.
