# Reference asset: Kenney Car Kit 3.1 / sedan-sports

- Author: **Kenney**, https://kenney.nl
- Source: https://kenney.nl/assets/car-kit
- Downloaded: 2026-09-05
- License: **Creative Commons Zero (CC0 1.0)**; original `License.txt` included.
- Source archive: https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip
- Selected source: `Models/GLB format/sedan-sports.glb` plus its referenced
  `Textures/colormap.png`.

The shipped GLB was processed with glTF Transform **4.5.0** `dedup`, then `prune`.
Its palette texture is embedded; no external texture or runtime decoder is
needed to transfer the GLB. Godot extracts the adjacent `sedan-sports_colormap.png`
on import; keep that generated asset and its import settings with the project.
No simplification, remeshing, or lossy geometry compression was applied.
Godot's automatic LOD generation is disabled for this close-up shape reference.
Body, spoiler, and four wheel nodes remain individually identifiable.
Processed size: **91,068 bytes**. SHA-256:
`6ac40c52d65140f30bf7c6d933ab98ec3ff0fa663c76729387170f536b5cf845`.

The wrapper in `scenes/reference_car.tscn` turns the source's +Z front to our
-Z convention. Uniform scale 1.8121996 changes its original 2.55 m overall length
to approximately 4.6211 m, matching the current NIGHTSHIFT car. Ground height and
longitudinal center are aligned without changing the reference's proportions.
This is a shape study, not a claim that its proportions are the intended final
NIGHTSHIFT art direction.

It is display-only: no collision, controller, or driving behavior is imported.
The comparison scene uses a separate instance of our car and non-destructive
material overrides. The driving car and its customization remain untouched.
