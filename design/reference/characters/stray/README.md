# Stray

Number nine on the Blacklist (`design/BLACKLIST.md`): nineteen, grown up in the
downtown service lanes of Alder Center, and the one who knows every alley in
them. Short, hard-edged dark hair under an acid-green baseball cap worn
backwards, a black coach jacket zipped halfway over an acid-green T-shirt.
Watchful and restless, chin down and eyes up, the corner of the mouth almost a
grin; he is already picking the gap he is about to take. His accent is acid
green, a yellow-green like fresh spray paint, and his car, a boxy FWD hot hatch
that does not exist yet, has to carry it. His silhouette is the backwards cap,
a rounded crown with the bill behind the head, chosen to be nothing like
Rivet's goggles, Sable's beanie, Moth's hood or Tally's bare head at a hundred
pixels.

He is not in the game: no sim constant, no car, no contact card. The two served
portraits (`public/assets/characters/stray.png`, `stray-alley.png`) exist ahead
of the card.

## Files

| File | What |
| --- | --- |
| `stray-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `stray-calm.png`, `stray-sore.png`, `stray-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `stray-front.png`, `stray-side.png` | The sheet views, same rig. Optional, made because they cost one round. |
| `stray-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. The green comes out as two swatches: `#65ac44`, and `#bbb92a` where the orange key lands on it, which reads yellow and is not the accent. |
| `stray-round1.png` | The chosen round-one candidate, at 512 px, for provenance. |

## How he was made (2026-09-12)

Same pipeline as the others: Codex's image tool from the terminal, one brief a
round, the previous pick attached so only the named change moves. Like Tally,
he was drawn before his car, so no car render was attached and the green was
named in words.

1. **Round one** attached Rivet's bust as the style reference only and asked for
   two candidates of the character above, differing only in the pose of the
   head. Tally's round one had shown that an accent spread as thin lines
   vanishes at 96 px, so the green was briefed as two solid blocks, the cap and
   the T-shirt. The two came back nearly identical; Shawn chose A. It is the
   first round one to arrive with the ink line and hard skin bands that round
   two normally adds, so there was no round two: **A, as is, is the bust.**
   Measured from the render, the green sits at a hue of about 80 degrees (the
   middle 80% of its pixels between 75 and 85), clearly green under the orange
   key, and covers 21.7% of the figure, more than Tally's violet (14.7%) or
   Sable's red (7.2%) but less than Moth's teal (about 33%) or Rivet's cream
   (about 31%, both from rougher hue windows). It is the most saturated accent
   on the list rather than the largest. The face reads younger than nineteen,
   with an anime fringe; that was raised and left as it is.
2. **Rounds two and three** used the bust as the reference for the sore and
   alley expressions and the front and side views, run at the same time. The
   side view turns the shoulders slightly toward the viewer.
3. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate B, a near twin with the head tilted further.
