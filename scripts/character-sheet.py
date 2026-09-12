"""Finish a rival's sheet from its renders: the 96 px thumbnail that proves the
silhouette, palette.json (the accent and skin tones as hex, taken from the bust
rather than typed), and the portraits the HUD contact card actually serves.
Pillow only.

    python scripts/character-sheet.py design/reference/characters/rivet rivet
"""
import json, sys
from collections import Counter
from pathlib import Path
from PIL import Image

folder, rid = Path(sys.argv[1]), sys.argv[2]
bust = Image.open(folder / f"{rid}-bust.png").convert("RGB")

# The thumbnail: the whole bust at the size the HUD card shows it.
thumb = bust.resize((96, 96), Image.LANCZOS)
thumb.save(folder / f"{rid}-thumb.png", optimize=True)

# The served portraits: what the contact card loads, at twice the 96 px it is
# drawn at so the facets and the ink line stay hard on a dense screen. These
# are committed derivatives of the masters beside them, the same arrangement
# the cars have between assets/cars/*.blend and public/assets/cars/*.glb.
# Calm is the hero bust; keen is the alley face, worn once you have flashed.
served = Path(__file__).resolve().parent.parent / "public" / "assets" / "characters"
served.mkdir(parents=True, exist_ok=True)
for source, name in ((f"{rid}-bust.png", f"{rid}.png"), (f"{rid}-alley.png", f"{rid}-alley.png")):
    Image.open(folder / source).convert("RGB").resize((192, 192), Image.LANCZOS).save(served / name, optimize=True)

# The palette: quantise the bust to a few colours, drop the black background,
# and report the rest by how much of the portrait they cover.
small = bust.resize((256, 256), Image.LANCZOS)
quantised = small.quantize(colors=12, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
counts = Counter(quantised.getdata())
total = sum(counts.values())
swatches = []
for (r, g, b), n in counts.most_common():
    if max(r, g, b) < 28:
        continue  # the black ground is the frame, not the character
    swatches.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "share": round(n / total, 3)})
(folder / "palette.json").write_text(json.dumps({"id": rid, "source": f"{rid}-bust.png", "swatches": swatches}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"thumb": f"{rid}-thumb.png", "served": [f"{rid}.png", f"{rid}-alley.png"], "swatches": [s["hex"] for s in swatches]}))
