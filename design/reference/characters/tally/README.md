# Tally

Number one on the Blacklist, and the one who keeps it (GDD §5). Early
twenties, the youngest driver in Port Alder and the fastest: Moth's student,
who outgrew her. She writes the ten names and decides who gets a shot.
Close-shaved bare head, winged eyeliner, a charcoal-black coat with thin violet
piping, a tall stand collar closed around the neck in deep violet, and a violet
tally mark on her left chest: two groups of five, ten strokes, one for each
name on the list. Level and unreadable; she watches you the way she would watch
a lap time. Her accent is violet, the one colour the city's sodium and cyan
light never makes, and her Vesper coupe carries it in thin shoulder piping
and a self-lit full-width tail band. Her silhouette is a bare dome on a violet column, chosen to be nothing like Rivet's
goggles, Sable's beanie or Moth's hood at a hundred pixels.

She is not in the game yet: no sim constant or contact card. Her car asset is
built. The two served portraits (`public/assets/characters/tally.png`, `tally-alley.png`)
exist ahead of the card, for the opening cutscene.

## Files

| File | What |
| --- | --- |
| `tally-bust.png` | The hero portrait, 768 px, on black. Calm. |
| `tally-calm.png`, `tally-sore.png`, `tally-alley.png` | The three expressions, same head and rig, only brows, eyes and mouth move. |
| `tally-front.png`, `tally-side.png` | The sheet views, same rig. Optional, made because they cost one round. |
| `tally-thumb.png` | The bust at 96 px, the size the HUD card shows. The silhouette test. |
| `palette.json` | The tones actually in the bust, as hex, by coverage. The lit violet of the collar does not come out as its own swatch; `#281540` is its shadow. |
| `tally-round1.png` | The chosen round-one candidate, at 512 px, for provenance. |

## How she was made (2026-09-12)

Same pipeline as the other three: Codex's image tool from the terminal, one
brief a round, references attached so only the named change moves. She is the
first rival drawn before her car, so no car render was attached and the violet
was named in words.

1. **Round one** attached Rivet's bust as the style reference only, and asked
   for two candidates identical except that A read as a young woman and B as a
   young man. Shawn chose A. Both held the style on the first try. The known
   round-one faults were there (skin painted soft, almost no ink), plus two of
   their own: both glared where the brief asked for level, and the stand collar
   opened in a V that read as a villain's popped collar. The violet measured at
   a hue of about 271 degrees, so it survives the orange key. It covered 7.2%
   of the figure, the same share as Sable's red, but spread as thin piping, so
   at 96 px she read as almost all black.
2. **Round two** re-issued A with Rivet's bust as the shading target and four
   changes instead of the usual two: skin in three hard bands, an ink line of
   Rivet's weight, the collar closed into a straight violet column, and the
   expression relaxed to level. All four landed and nothing else moved; the
   violet rose to 14.7% of the figure, in one block under the chin. The ink
   line is still missing along the orange-lit edge of the skull. It was
   accepted, as Sable's and Moth's soft cheeks were: it does not show at 96 px.
3. **Round three** added one thing, at Shawn's request: a logo. The tally mark
   was the brief; a row scan of the result counts four upright strokes and a
   diagonal in each group. It printed at about 150 px of 1024, smaller than
   the palm size asked for, so it reads on the bust and in a cutscene but is
   texture on the 96 px card. That is the bust.
4. **Rounds four and five** used the bust as the reference for the sore and
   alley expressions and the front and side views, run at the same time. The
   side view turns the shoulders slightly toward the viewer.
5. `scripts/character-sheet.py` made the thumbnail, the palette and the served
   portraits.

Rejected on the way: candidate B, the open V collar, and the glare.

## Vesper

Her signature car is `ns-vesper-01`: an original charcoal, cab-forward coupe
inspired by the first-generation NSX's proportions. The short low nose and
forward canopy leave a long, flat engine deck. Its shallow horizontal flank
intakes, six-spoke wheels and unadorned tail are original; no badges or wing.
Violet shoulder piping and two groups of five tally strokes on each flank
carry her identity, with a self-lit violet band across the full rear width.

Shawn chose the NSX-inspired replacement and RWD on 2026-09-12. RWD uses the
existing profile, with no HANDLING changes. The mid-engine layout is visual:
the simulation still gives every body a 50/50 static load. Her encounter,
reward unlock and individual performance tuning remain future work. Vesper
is registered for rendering, not an unlocked or saved player garage choice.

Slim fixed lamps are the driving lights. `popup-left` and `popup-right` are
closed, hinge-mounted pods with cut pockets; rotating local X by +60 degrees
opens them. No animation or gameplay hook is wired. The shared runtime
headlight and red tail PointLight remain unchanged.

The regenerated 660 x 440 garage captures pass the supplied violet gate:
**rear 4,410 pixels** (minimum 1,500), **front 54 pixels**, measured with
`scripts/count-vesper-violet.py`. These are game captures, with the red tail
light on, not studio measurements. The front carries only subtle accents.

Source: `assets/cars/ns-vesper-01.blend`. Rebuild with Blender using
`scripts/build-vesper.py`; export hand edits with `scripts/export-vesper.py`,
then run `node scripts/optimize-car.mjs --car=ns-vesper-01`.
Garage references: `design/reference/cars/vesper-front.png` and `vesper-rear.png`.
Studio views: `vesper-studio.png` and `vesper-studio-open.png` in the same folder.

The rejected notchback is preserved as `assets/cars/ns-notchback-01.blend`
and `scripts/build-notchback.py`. It is unregistered and has no public GLB;
its future use is undecided. Its builder only regenerates the archived source.
