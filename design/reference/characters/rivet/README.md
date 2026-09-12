# Rivet

The drag-strip rival. She runs the Harbor Quarter quarter-mile in the
Hammer, and she is the first rival to get a face, so she is also the test of
the portrait style in `design/CHARACTERS.md`. Late twenties, short dark hair,
drag goggles pushed up on her forehead, a cream race suit with black panels,
a piston patch on the chest and the number 11. Her accent colours are the
Hammer's: cream over black. She does not smile at you until she has beaten
you with your own shortcut.

## Files

| File | What |
| --- | --- |
| `rivet-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `rivet-calm.png`, `rivet-sore.png`, `rivet-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `rivet-front.png`, `rivet-side.png` | The model sheet views for the Blender build: dead-on, and left profile. |
| `rivet-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. |
| `rivet-round1.png` | The first acceptable candidate, at 512 px, for provenance. |

## How she was made (2026-09-12)

Concept art by image model, against the rules in `design/CHARACTERS.md`,
driven from the terminal so the loop was brief, generate, critique, repeat.

1. **Shawn's first pass** (Gemini, in its own app) drew a full figure with
   the car, a poster title, and HP and GRIP stat bars, in daylight studio
   lighting with soft plastic shading. Rejected for everything but the
   geometry language and the design: goggles up, suit, piston patch, number.
   Those were kept.
2. **Round one, two lanes, one brief.** The brief asked for a bust,
   three-quarter, on black; faceted geometry as if 600 triangles; three-band
   cel shading with an ink line; sodium key left, cyan rim right; the
   Hammer's colours; no text, no UI, no car. The Gemini lane (`agy`, print
   mode) hung for its whole nine-minute timeout and wrote nothing. The
   OpenAI lane (Codex's image tool, the Hammer render attached as reference)
   returned two candidates in four minutes that got framing, lighting,
   silhouette and identity right and the skin wrong: painted soft, no ink.
3. **Round two** re-issued candidate A as the reference with two changes
   only: skin in three flat bands, and a thin even ink line. That is the
   bust.
4. **Rounds three and four** used the bust as the reference for the two
   other expressions and the two sheet views, with everything else held.
5. `scripts/character-sheet.py` made the thumbnail and the palette.

What the model was told is the brief above; what was rejected is in this
list. Anyone making the second rival should start from the same brief,
change the character paragraph, and expect round two to be the skin again.
