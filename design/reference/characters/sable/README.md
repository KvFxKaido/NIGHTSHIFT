# Sable

The drift-yard rival. He runs the South Wharf yard in a red NS-01, and he
is the second rival to get a face, which makes him the reproducibility test
for the style in `design/CHARACTERS.md`: a new character from a new brief,
with Rivet's bust attached as the style anchor and nothing else shared. Mid
thirties, lean, dark skin, a black knit beanie, long hair in a loose tail
over one shoulder, a black bomber with a high shearling collar and signal-red
lining, one silver earring. His accent colours are the NS-01's: red over
black. Calm, half-lidded, unimpressed; he has seen you drive. His silhouette
is the beanie and the collar, chosen to be nothing like Rivet's goggles and
race-suit neckline at a hundred pixels.

## Files

| File | What |
| --- | --- |
| `sable-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `sable-calm.png`, `sable-sore.png`, `sable-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `sable-front.png`, `sable-side.png` | The sheet views, same rig. Optional, made because they cost one round. |
| `sable-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. |
| `sable-round1.png` | The first acceptable candidate, at 512 px, for provenance. |

## How he was made (2026-09-12)

Same pipeline as Rivet: Codex's image tool from the terminal, one brief a
round, references attached so only the named change moves.

1. **Round one** attached Rivet's bust as the style reference (with an
   explicit instruction not to copy her face, hair, clothes or gender) and
   the NS-01 render for colour, and asked for two candidates of the
   character above, turned the opposite way to Rivet. Both candidates held
   the style on the first try — same rig, same facets, banded skin — which
   is the result the test was for. The model added a beard the brief did
   not ask for; it stayed, because it reads. B was chosen over A for the
   sidelong glance. The only deviations were a lighter ink line and slightly
   softer face bands than Rivet's bust.
2. **Round two** re-issued B with Rivet's bust attached as the shading
   target and two changes only: skin in three hard bands, and an ink line
   of the same weight as hers. That is the bust.
3. **Rounds three and four** used the bust as the reference for the sore
   and alley expressions and the front and side views, everything else held.
4. `scripts/character-sheet.py` made the thumbnail and the palette.

Second character, same brief structure, same two-round shape: the style is
reproducible from the rules plus one reference image.
