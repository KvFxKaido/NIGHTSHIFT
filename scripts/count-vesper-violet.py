"""Count the brief's violet gate in the unmodified 660 x 440 garage captures."""
from pathlib import Path
import colorsys
from PIL import Image

root = Path(__file__).resolve().parent.parent
for view in ('front', 'rear'):
    path = root / f'design/reference/cars/vesper-{view}.png'
    im = Image.open(path).convert('RGB')
    assert im.size == (660, 440), f'Unexpected capture size: {im.size}'
    count = 0
    for px in im.getdata():
        h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in px))
        if s > 0.3 and 0.12 < l < 0.85 and 255 <= h * 360 <= 295:
            count += 1
    print(f'{path.name}: {count} violet pixels')
    if view == 'rear':
        assert count >= 1500, f'Violet rear identity gate failed: {count}'
