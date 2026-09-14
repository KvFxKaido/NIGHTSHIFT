"""Measure identity colors in untouched 660x440 in-game garage captures.

These image counts are visibility checks, not a segmentation of painted panels.
Silver and white use brightness/saturation, since neither has an identity hue.
"""
from pathlib import Path
import colorsys
import json
from PIL import Image

root = Path(__file__).resolve().parent.parent
windows = {
    'latch': (65, 100), 'breakwater': (40, 65),
    'wager': (290, 325), 'skim': (210, 245),
    'meridian': None, 'reign': None,
}
counts = {}
for car, window in windows.items():
    counts[car] = {}
    for view in ('front', 'rear'):
        image = Image.open(root / f'design/reference/cars/{car}-{view}.png').convert('RGB')
        assert image.size == (660, 440)
        count = 0
        for px in image.getdata():
            h, light, saturation = colorsys.rgb_to_hls(*(channel / 255 for channel in px))
            if window:
                matches = saturation > .3 and .08 < light < .85 and window[0] <= h*360 <= window[1]
            else:
                matches = saturation < .25 and .18 < light < .85
            count += int(matches)
        counts[car][view] = count
print(json.dumps(counts, indent=2))
assert all(count >= 1500 for views in counts.values() for count in views.values()), 'Identity color needs a stronger in-game read'
