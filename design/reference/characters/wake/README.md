# Wake

Number two on the Blacklist (`design/BLACKLIST.md`), and the former number one.
Tally took the list from him, and he has spent every night since driving her
lines, better than she does; his turf is Capitol Hill. Mid thirties, tired and
handsome, a short dark beard, a black low-crowned hat with a wide, hard, flat
brim, and a white driving jacket with a stand collar over a black shirt.
Patient, tired and faintly bitter; he looks at you as the next one who thinks
they can win. His accent is white, and his car, Reign, an upright AWD coupe, carries it. His silhouette is the wide-brimmed hat, chosen
to be nothing like anyone else's at a hundred pixels. His beard echoes Sable's;
the hat is what separates them at card size.

He is not in the game: no sim constant or contact card; the car asset is built. The two served
portraits (`public/assets/characters/wake.png`, `wake-alley.png`) exist ahead of
the card.

## Files

| File | What |
| --- | --- |
| `wake-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `wake-calm.png`, `wake-sore.png`, `wake-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `wake-front.png`, `wake-side.png` | The sheet views, same rig. |
| `wake-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. `#f3dfb8` is the jacket where the orange key lands on it; it reads cream and is not the accent, which is the white of `#f2f0ec`. |
| `wake-round1.png` | The chosen round-one candidate, at 512 px, for provenance. |

## How he was made (2026-09-12)

Same pipeline as the others, drawn before his car, with Rivet's bust as the
only reference and the white named in words. His round one ran in parallel with
Bollard's, Deuce's, Plumb's and Crest's.

1. **Round one** asked for two candidates differing only in the pose of the
   head. Both held the style, ink line and skin bands included, so there was no
   round two. Candidate A is the bust, for the wider brim, the stronger shape at
   96 px. White was the accent most at risk on the list, next to Rivet's and
   Moth's cream, so it was measured rather than judged: of the bust's pale,
   low-saturation pixels, none are warm-tinted (red more than 25 above blue),
   against 78% of Rivet's and 91% of Moth's. It is white.
2. **Rounds two and three** used the bust for the sore and alley expressions and
   the front and side views, run at the same time. Only the face moved.
3. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate B, the shallower brim.

## Reign (2026-09-13)

Original upright coupe, inspired by Skyline R32 proportions; white carries the
portrait identity. Upright two-door greenhouse, separate square boot, bridge wing and six square tail cells.

`reign` declares **AWD** in `CAR_DRIVETRAIN`. The body uses the shared
wheel rig and existing handling profile: no mass, speed, grip or engine
simulation changes. It is registered for rendering, not a saved player car.
The encounter and career reward remain unimplemented.

Source: `assets/cars/ns-reign-01.blend`; runtime: `public/assets/cars/ns-reign-01.glb`.
Rebuild with `scripts/build-blacklist-cars.py -- --car=reign --render` in Blender.
Export hand edits with `scripts/export-blacklist-car.py`, then
`node scripts/optimize-car.mjs --car=ns-reign-01`.

Studio and in-game front/rear captures are in `design/reference/cars/`,
prefixed `reign-`. See `design/reference/cars/BLACKLIST_CARS.md` for the
measured runtime colors and the complete build/validation commands.
