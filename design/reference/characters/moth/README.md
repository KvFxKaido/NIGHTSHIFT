# Moth

The cruiser: the rival who circles the freight block by Wharf Garage in a
cream-and-teal Kestrel, the first one anyone meets, the one whose flash draws
a generated race. Named 2026-09-12, for the thing that is always there when
the sodium lamps come on. Mid forties, the veteran of the docks who has
circled this block for twenty years and taught half of it to drive.
Weathered, warm, a small old scar through one eyebrow; a teal rain shell
with the hood up, cream lining, a cream gaiter under the chin, grey-streaked
strands escaping the hood. Calm, patient, a little amused; she already knows
how the race ends. Her accent colours are the Kestrel's secondary, teal over
cream, and her silhouette is the hood, chosen to be nothing like Rivet's
goggles or Sable's beanie at a hundred pixels.

In code she is `MOTH` in `src/sim/encounter.ts`; the challenge prompt says
her name, so the card and the game agree.

## Files

| File | What |
| --- | --- |
| `moth-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `moth-calm.png`, `moth-sore.png`, `moth-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `moth-front.png`, `moth-side.png` | The sheet views, same rig. Optional, made because they cost one round. |
| `moth-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. |
| `moth-round1.png` | The first acceptable candidate, at 512 px, for provenance. |

## How she was made (2026-09-12)

Same pipeline as Rivet and Sable: Codex's image tool from the terminal, one
brief a round, references attached so only the named change moves.

1. **Round one** attached Rivet's bust as the style reference (with the
   instruction not to copy her face, hair, clothes or age) and the Kestrel
   render for colour, and asked for two candidates of the character above.
   Both held the style at once: same rig, same facets, the hood reading as
   a hood. A was chosen over B because the face is older; B pulled the
   hood down over the brow and the eyes, which is the part of a face that
   carries at a hundred pixels, and read ten years younger for it. The
   deviations were the same as Sable's: a lighter ink line and skin painted
   soft across the cheek.
2. **Round two** re-issued A with Rivet's bust as the shading target and
   two changes only: skin in three hard bands, and an ink line of the same
   weight as hers. That is the bust. The cheek still blends a little where
   the key meets the mid tone, as Sable's does; it was accepted, because
   the two of them now match each other as closely as either matches Rivet.
3. **Rounds three and four** used the bust as the reference for the sore
   and alley expressions and the front and side views, everything else
   held, the two rounds run at the same time because both depend only on
   the bust.
4. `scripts/character-sheet.py` made the thumbnail and the palette.

Third character, same brief structure, same two-round shape, and the first
one whose silhouette is a garment rather than headgear: the hood is a
rounded peak with drawstrings, and at 96 px it is not a beanie and not
goggles.
