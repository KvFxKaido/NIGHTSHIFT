# Crest

Number three on the Blacklist (`design/BLACKLIST.md`): the hill racer, late
twenties, who takes Queen Anne's blind crests flat out. Lean, calm and
weather-tanned, dark hair shaved short at the sides and tied into a topknot on
the crown, a cobalt-blue track jacket zipped to the chest over a black top.
Calm and far-sighted; he has already seen over the next hill. His accent is
cobalt blue, and his car, Skim, a FWD hardtop roadster, carries it. His silhouette is the topknot, chosen to be nothing like the
goggles, beanie, hood, bare head, backwards cap, ear defenders or pompadour at a
hundred pixels.

He is not in the game: no sim constant or contact card; the car asset is built. The two served
portraits (`public/assets/characters/crest.png`, `crest-alley.png`) exist ahead
of the card.

## Files

| File | What |
| --- | --- |
| `crest-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `crest-calm.png`, `crest-sore.png`, `crest-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `crest-front.png`, `crest-side.png` | The sheet views, same rig. |
| `crest-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. |
| `crest-round1.png` | The chosen round-one candidate, at 512 px, for provenance. |

## How he was made (2026-09-12)

Same pipeline as the others, drawn before his car, with Rivet's bust as the
only reference and the cobalt named in words. His round one ran in parallel
with Bollard's, Deuce's, Plumb's and Wake's.

1. **Round one** asked for two candidates differing only in the pose of the
   head, with the accent briefed as a solid block. Both held the style, ink line
   and skin bands included, so there was no round two. Candidate B is the bust:
   A glared, and B has the calm the brief asked for. The cobalt measures a hue of
   about 222 degrees, clear of the cyan rim light at about 199, and covers
   about half the figure (51%), more than any other accent measured by hue.
2. **Rounds two and three** used the bust for the sore and alley expressions and
   the front and side views, run at the same time. Only the face moved.
3. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate A, for the glare.

## Skim (2026-09-13)

Original hardtop roadster, inspired by Elan M100 proportions; cobalt blue carries the
portrait identity. Low two-seat cabin with a fitted dark hardtop, short rear deck and flush nose covers.

`skim` declares **FWD** in `CAR_DRIVETRAIN`. The body uses the shared
wheel rig and existing handling profile: no mass, speed, grip or engine
simulation changes. It is registered for rendering, not a saved player car.
The encounter and career reward remain unimplemented.

Source: `assets/cars/ns-skim-01.blend`; runtime: `public/assets/cars/ns-skim-01.glb`.
Rebuild with `scripts/build-blacklist-cars.py -- --car=skim --render` in Blender.
Export hand edits with `scripts/export-blacklist-car.py`, then
`node scripts/optimize-car.mjs --car=ns-skim-01`.

Studio and in-game front/rear captures are in `design/reference/cars/`,
prefixed `skim-`. See `design/reference/cars/BLACKLIST_CARS.md` for the
measured runtime colors and the complete build/validation commands.
