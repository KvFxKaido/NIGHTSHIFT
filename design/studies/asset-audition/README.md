# Buildings and streets pack: asset audition

Prepared for Shawn, 2026-10-31. No game/map integration.

**Verdict: useful facade donors, not a ready-made architecture kit for Port Alder.**
Of these three samples, the apartment is the strongest geometry donor. The shop
could save some modeling, but its identity depends heavily on its photograph.
The warehouse is a shallow panel rather than a building shell. This conclusion
is limited to the three rendered samples, with a broader OBJ geometry inventory
used to select them; it is not a verdict on every asset in the pack.

## View it

`index.html` is a self-contained local report using saved renders.
For the interactive Three.js viewer, from the repository root:

```
node design/studies/asset-audition/serve.mjs
```

Open http://127.0.0.1:5192/design/studies/asset-audition/viewer.html
Select each asset; orbit or zoom the left canvas to move all three cameras.
The normal toggle is a diagnostic, not an approved mesh repair.

## Download and provenance

- Source: https://dream-search-repeat.itch.io/buildings-and-streets-pack
- Author: DREAM_SEARCH_REPEAT; underlying urban textures credited by the author to Scouser.
- Download: original `Buildings and streets pack.rar`, itch upload 8958230.
- Archive bytes: 418,588,158. SHA-256:
  `FF92AAB074532E1010970FBD0AF56AEBDC9CAF698D786FBC08B6D0A5D6EE386E`.
- Local archive, source files, saved source page and audition GLBs:
  `inspiration/buildings-streets-pack/` (git-ignored, outside the playable bundle).
- Extracted archive: 210 files, 429,154,570 bytes. 7-Zip extraction passed.
- The creator states on the source page that the assets and textures are CC0,
  allow modification and commercial use, and do not require attribution.
  No separate license/readme/credits file was found in the extracted archive.
  This records the creator's statement, not an independent rights audit.

## Actual samples

| Sample | Triangles | Width × height × depth, source scale | What remains with flat materials |
|---|---:|---|---|
| `shop_front14` | 750 | 5.00 × 4.25 × 3.98 | Door and display-window shapes, recesses, fascia, room behind |
| `warehouse_front` | 522 | 22.49 × 6.11 × 0.19 | Shallow door divisions and upper edge |
| `apartment_block8` | 2,380 | 5.00 × 2.50 × 0.63 | Repeated window frames/recesses and balcony forms |

These dimensions are **not certified metres**. In particular the apartment has
multiple floors within 2.50 source units; world scale must be established before
any placement. Each is a frontage section, not a complete watertight building.
Counts are source triangles; GPU stats in `validation.json` include the two
triangles of the comparison ground plane.

The inventory found much flatter alternatives: `shop_front5` is 24 triangles and
0.07 deep, `apartments2_side` is 0.01 deep. The selected shop and apartment give
the pack a fairer geometry test than choosing those flat examples.

## Material experiment

Three equal-camera renders per sample:

1. Source color and normal images translated from legacy Blender nodes into
   standard glTF PBR, under neutral inspection lights.
2. Source color/normal maps removed; actual `drawnBuilding()` and
   `BUILDING_PALETTES` weathered wall color from the repository, roughness 0.82.
   Existing glass material groups receive a separate dark glass color.
3. The same replacement materials with the city's two hemisphere light
   colors/intensities, moon color/intensity, and exposure 1.05. Moon direction is
   adapted for the small stage. No local lamps, headlights, fog or city environment.

No AI images are used. No replacement signs, window textures, emissive rooms or
architectural geometry were added. Thus this tests the **existing mesh's value**,
not the best look attainable after substantial re-authoring. Most opaque faces
share one source material, so semantic wall/trim/door colors would require face
assignments. The current city's box-footprint ink hull is omitted because it is
not an appropriate outline for an open facade. This is actual material banding,
not the complete in-game building pipeline.

Source glass is rendered opaque in the PBR reference, so shop interior visibility
is not faithful to Blender's glass shader. Geometry is preserved. Source normals
show diagonal band artifacts on nearly planar faces. A flat-face toggle removes
those interpolation artifacts but also suppresses smooth curvature; production
cleanup should inspect smoothing/hard edges rather than flatten every face.

## Export and validation

Blender 5.3 alpha, factory startup, background, auto-execution disabled.
`export_audition.py` bakes the source world transform, recentres the facade,
grounds it, repairs image paths, translates legacy materials, and exports only
the selected object from an isolated scene. It does not save source blend files.
Run it with the configured Blender executable; source files stay unchanged.

- GLB validation: zero errors for all three. Warnings remain for source PNG
  metadata and runtime-generated tangent space; see `gltf-validation.json`.
- All three models loaded and rendered in Chromium/D3D11 with no page errors.
- Material variants preserve triangle counts, captured in `validation.json`.
- Asset switching and flat-normal toggle executed; 390 px layout has no overflow.
- These are inspection-stage checks, not city/mobile performance or collision tests.
- No game source, map, collision, handling, world identity, or build entry changed.

## Recommendation

Keep the pack as a donor/reference library. The apartment's frames/balconies and
selected shopfront openings could be reused after scale, normal and material
cleanup. Do not adopt it as the main source of whole buildings: we would still
need shells, roof silhouettes, side/rear walls, ground connections, entrances and
our own signs/window treatment. Those are precisely the depth-study requirements.
The next asset search should prioritize genuinely modeled modular architecture
with separable wall/trim/glass materials, rather than photo-textured facade tiles.
