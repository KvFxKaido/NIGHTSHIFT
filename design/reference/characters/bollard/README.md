# Bollard

Number seven on the Blacklist (`design/BLACKLIST.md`): a crane operator in her
forties who races the Elliott Avenue waterfront the way she works it, and the
one who uses contact. Broad-shouldered and weathered, dark hair pulled back
tight under black industrial ear defenders, a safety-yellow hi-vis work jacket
with the collar up and two flat reflective bands. Steady, heavy-lidded and
unbothered; she does not move out of the way. Her accent is safety yellow, and
her car, a compact 4x4 ute that does not exist yet, has to carry it. Her
silhouette is the ear defenders, a wide head with a cup on each side, chosen to
be nothing like the goggles, beanie, hood, bare head or backwards cap before
her at a hundred pixels.

She is not in the game: no sim constant, no car, no contact card. The two
served portraits (`public/assets/characters/bollard.png`, `bollard-alley.png`)
exist ahead of the card.

## Files

| File | What |
| --- | --- |
| `bollard-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `bollard-calm.png`, `bollard-sore.png`, `bollard-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `bollard-front.png`, `bollard-side.png` | The sheet views, same rig. |
| `bollard-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. |
| `bollard-round1.png` | The chosen round-one candidate, at 512 px, for provenance. |

## How she was made (2026-09-12)

Same pipeline as the others, drawn before her car, with Rivet's bust as the
only reference and the yellow named in words. Round one for the five new
names on the list (Bollard, Deuce, Plumb, Crest, Wake) ran in parallel.

1. **Round one** asked for two candidates differing only in the pose of the
   head, with the accent briefed as a solid block. Both held the style, with the
   ink line and hard skin bands already in place, so there was no round two.
   Candidate A, slightly more front-on, is the bust. The yellow measures a hue
   of about 50 degrees and covers 38% of the figure, 30 degrees from Stray's
   acid green: yellow, not orange and not green, under the orange key.
2. **Rounds two and three** used the bust for the sore and alley expressions and
   the front and side views, run at the same time. Only the face moved.
3. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate B, a near twin.

The silhouette rule was tested against her once. The first Plumb wore a race
engineer's headset whose dark earcup read as the same shape as these ear
defenders; Plumb was redrawn rather than Bollard.
