# Rival portraits

Design note, 2026-09-12. Rivals are driving personalities (GDD §3.3); a
portrait is how one becomes somebody. This is the style they are drawn in,
the rules that keep eight of them looking like one game, and the sheet a
finished character has to have. The portrait is 2D and stays 2D: produced
with an image model against these rules, the previous pick attached so only
the named change moves, and kept as the PNGs the HUD card shows. Rivet
proved five views of one character hold from one rig; Sable proved a second
character holds the style from a new brief with her bust as the only shared
reference, in the same two-round shape. A scripted Blender build
(`build-rival.py`, like the cars) is not part of the portrait system. It
becomes worth doing only if a rival ever has to stand beside their car in
the world, and the style is one a script can reach for that day.

## The look, in one sentence

A faceted low-poly bust, three-band cel shading with an ink line, lit by the
city's own night: sodium orange from one side, cyan from the other, on
black. Kentucky Route Zero's polygon people with more edge, under a
streetlight. It belongs to Port Alder because it is built the way Port Alder
is built.

## Rules

- **Geometry.** Faceted, as if modelled from about 600 triangles. Flat
  planes on the face, hair and clothes. Hard-edged hair, hats, helmets,
  collars, goggles. No flowing hair, no cloth folds, no fur. If a script
  could not build it, it is not in the style.
- **Shading.** Three bands, light / mid / shadow, hard edges between them,
  and a thin black ink outline. Skin in bands too. No gradients, no soft
  shadows, no ambient occlusion, no gloss, no photorealism.
- **Lighting.** Sodium-orange key from one side, cyan rim from the other,
  nothing else lit, background black. Every portrait, the same rig, so the
  set reads as one night.
- **Framing.** A bust: head and shoulders, three-quarter, centred, on black.
  No text, no UI, no stat bars, no car in frame. The HUD supplies the frame
  (a phone contact or an ID card) and the name; the portrait supplies the
  face.
- **Silhouette first.** At a hundred pixels the read is hat, hair, collar
  and posture; a face carries eyes and a brow line. Every rival gets one
  shape that is theirs alone at that size.
- **One accent colour, and it is their car's.** The card and the car are one
  identity. Where two cars share a body colour (the Kestrel and the Hammer
  are both cream), the rival takes the car's secondary: teal for the Kestrel,
  black for the Hammer.
- **Expressions.** Three per rival: calm, sore (after losing), and the one
  for the day they take your alley. Same head, same lighting; only the brows,
  eyes and mouth move.
- **Register.** Adults, real proportions, seinen not moe. Nobody is cute.

## What a finished character has

Under `design/reference/characters/<id>/`:

- `<id>-bust.png` — the hero portrait, 1:1, three-quarter, on black. This
  is the one the game shows.
- `<id>-calm.png`, `<id>-sore.png`, `<id>-alley.png` — the expressions.
- `<id>-front.png`, `<id>-side.png` — the sheet views, same rig. Optional:
  they cost one round and exist for the day a rival is built in the world.
- `<id>-thumb.png` — the bust at 96 px, to prove the silhouette.
- `palette.json` — the accent and skin tones as hex, taken from the renders.
- `README.md` — who they are in one paragraph, which car, which turf, what
  the model was told, and what was rejected on the way.

The reproducibility test is the second character, not the first. One nailed
portrait proves the pipeline can hit a target once; a second, from a new
sheet with the same rules, proves there is a style. Build two before calling
the style done, and make the second deliberately different in silhouette.

## The pipeline that worked

Concept art is generated from the terminal, one brief per round, with the
previous round's pick attached as the reference so only the named change
moves. Codex's image tool (`codex exec --approve-for-me -i <reference.png>`
with the brief on stdin) did the job in about four minutes a round; the
Gemini agent (`agy` in print mode) hung for its whole nine-minute timeout
and wrote nothing. Expect round one to get framing, lighting and identity right
and the skin wrong, and round two to be "skin in three bands, add the ink
line, change nothing else". Rivet's README has the exact briefs.

## Who exists

| Id | Name | Car | Where |
| --- | --- | --- | --- |
| `rivet` | Rivet | Hammer | The Harbor Quarter drag strip |
| `sable` | Sable | NS-01 | The South Wharf drift yard |
| `cruiser` | (unnamed) | Kestrel | The freight block by Wharf Garage |

Rivet is first. The name in the code is the name on the card.
