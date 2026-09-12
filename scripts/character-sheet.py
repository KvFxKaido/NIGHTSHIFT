"""Finish a rival's sheet from its renders: the 96 px thumbnail that proves the
silhouette, and palette.json, the accent and skin tones as hex, taken from the
bust rather than typed. Pillow only.

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
print(json.dumps({"thumb": f"{rid}-thumb.png", "swatches": [s["hex"] for s in swatches]}))
