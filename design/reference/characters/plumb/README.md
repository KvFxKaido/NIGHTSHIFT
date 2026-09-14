# Plumb

Number four on the Blacklist (`design/BLACKLIST.md`): a former rally co-driver
in her fifties who now reads roads for a living, and races Madrona Ridge's
broad scenic loop without ever leaving it. Exact, composed and a little severe:
a narrow, angular face, a hard-edged silver bob cut straight at the jaw with a
straight fringe, a small black earpiece whose thin microphone arm runs along
her cheek, and a tailored, collarless silver-grey jacket over a black shirt with
a small pointed collar. Focused and measuring, as if reading the next corner off
a pace note. Her accent is silver, and her car, Meridian, an AWD fast wagon, carries it. Her silhouette is the straight-cut
bob with the mic arm across the cheek.

She is not in the game: no sim constant or contact card; the car asset is built. The two
served portraits (`public/assets/characters/plumb.png`, `plumb-alley.png`) exist
ahead of the card.

## Files

| File | What |
| --- | --- |
| `plumb-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `plumb-calm.png`, `plumb-sore.png`, `plumb-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `plumb-front.png`, `plumb-side.png` | The sheet views, same rig. |
| `plumb-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. The silver comes out as mid greys (`#95877d`, `#877a70`, `#636566`) warmed by the key light. |
| `plumb-round1.png` | The chosen candidate from her second round one, at 512 px, for provenance. |

## How she was made (2026-09-12)

Same pipeline as the others, drawn before her car, with Rivet's bust as the
only reference and the silver named in words. She is the first rival drawn
twice from scratch.

1. **The first round one** ran in parallel with Bollard's, Deuce's, Crest's and
   Wake's, and briefed a race engineer's headset with a boom mic, short grey
   hair and a silver-grey softshell jacket with a high zipped collar. Both
   candidates held the style but failed twice over. The headset's dark earcup
   read as the same shape as Bollard's ear defenders, which broke the
   one-silhouette rule; that brief was Claude's. And, in Shawn's words, she
   looked like an older Moth down to the jacket: grey hair, a high-collared
   outdoor jacket, a weathered warm face. The whole brief was rejected rather
   than patched.
2. **The second round one** was a new brief built to be unlike Moth and
   Bollard: the straight-cut silver bob instead of loose grey strands, an
   earpiece and mic arm instead of an earcup, a tailored collarless jacket
   instead of an outdoor shell, a narrow angular face. Both candidates held the
   style, ink line and skin bands included, so there was no round two. A is the
   bust: her eyes are on you, where B's glance away. Silver cannot be measured
   by hue, so it was checked by warmth: of the bust's pale, low-saturation
   pixels, 3% are warm-tinted, against 78% of Rivet's cream and 91% of Moth's.
3. **Rounds three and four** used the bust for the sore and alley expressions
   and the front and side views, run at the same time. Only the face moved.
4. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: the whole first brief (both of its candidates), and
candidate B of the second, which looked away.

## Meridian (2026-09-13)

Original fast wagon, inspired by RS2 Avant proportions; silver carries the
portrait identity. Long cargo roof, four door handles, roof rails and an upright tailgate.

`meridian` declares **AWD** in `CAR_DRIVETRAIN`. The body uses the shared
wheel rig and existing handling profile: no mass, speed, grip or engine
simulation changes. It is registered for rendering, not a saved player car.
The encounter and career reward remain unimplemented.

Source: `assets/cars/ns-meridian-01.blend`; runtime: `public/assets/cars/ns-meridian-01.glb`.
Rebuild with `scripts/build-blacklist-cars.py -- --car=meridian --render` in Blender.
Export hand edits with `scripts/export-blacklist-car.py`, then
`node scripts/optimize-car.mjs --car=ns-meridian-01`.

Studio and in-game front/rear captures are in `design/reference/cars/`,
prefixed `meridian-`. See `design/reference/cars/BLACKLIST_CARS.md` for the
measured runtime colors and the complete build/validation commands.
