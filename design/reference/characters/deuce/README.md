# Deuce

Number six on the Blacklist (`design/BLACKLIST.md`): the gambler, thirties, who
takes the risky line every time, even when he is winning; his turf is the
Belltown loop around the Broadcast Tower. Lean and sharp, a little stubble, a
tall hard-edged pompadour, a black jacket open over a hot-magenta shirt with an
open collar. A lazy half-smile and one raised brow; he would bet on this. His
accent is hot magenta, and his car, Wager, a RWD rotary-inspired sports car, carries it. His silhouette is the pompadour, chosen to be nothing like
anyone else's at a hundred pixels.

He is not in the game: no sim constant or contact card; the car asset is built. The two served
portraits (`public/assets/characters/deuce.png`, `deuce-alley.png`) exist ahead
of the card.

## Files

| File | What |
| --- | --- |
| `deuce-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `deuce-calm.png`, `deuce-sore.png`, `deuce-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `deuce-front.png`, `deuce-side.png` | The sheet views, same rig. |
| `deuce-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. The shirt comes out only as its dark shadow tones (`#690d61`, `#380233`); the lit magenta is not its own swatch. |
| `deuce-round1.png` | The chosen round-one candidate, at 512 px, before the shirt's colour moved. |

## How he was made (2026-09-12)

Same pipeline as the others, drawn before his car, with Rivet's bust as the
only reference and the magenta named in words. His round one ran in parallel
with Bollard's, Plumb's, Crest's and Wake's.

1. **Round one** asked for two candidates differing only in the pose of the
   head. Both held the style, ink line and skin bands included; A was chosen.
   Magenta sits between two taken accents, Sable's red and Tally's violet, and
   it came back at a hue of about 335 degrees: 24 from Sable's red and 72 from
   Tally's violet, too close to the red.
2. **Round two** changed one thing, the shirt's colour, asking for a magenta
   with more purple in it. It landed at about 304 degrees, past the 315 aimed
   for: 55 degrees from Sable's red and 41 from Tally's violet. It was accepted
   because it is far brighter than Tally's dark violet, and at 96 px the two read
   as fuchsia and violet. The face and hair did not move. That is the bust.
3. **Rounds three and four** used the bust for the sore and alley expressions
   and the front and side views, run at the same time. Only the face moved.
4. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate B, a near twin, and the round-one shirt that
leaned red.

## Wager (2026-09-13)

Original rotary-inspired sports car, inspired by RX-7 FD proportions; hot magenta carries the
portrait identity. Low canopy, faceted rounded haunches, a low ducktail and paired round rear lamps.

`wager` declares **RWD** in `CAR_DRIVETRAIN`. The body uses the shared
wheel rig and existing handling profile: no mass, speed, grip or engine
simulation changes. It is registered for rendering, not a saved player car.
The encounter and career reward remain unimplemented.

Source: `assets/cars/ns-wager-01.blend`; runtime: `public/assets/cars/ns-wager-01.glb`.
Rebuild with `scripts/build-blacklist-cars.py -- --car=wager --render` in Blender.
Export hand edits with `scripts/export-blacklist-car.py`, then
`node scripts/optimize-car.mjs --car=ns-wager-01`.

Studio and in-game front/rear captures are in `design/reference/cars/`,
prefixed `wager-`. See `design/reference/cars/BLACKLIST_CARS.md` for the
measured runtime colors and the complete build/validation commands.
