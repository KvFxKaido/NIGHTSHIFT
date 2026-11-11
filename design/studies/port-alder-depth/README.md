# Port Alder: give the city depth

2026-10-28. **Visual proposal, not implemented or approved construction.**
Open `index.html` for the overhead plan and three baseline/concept pairs.

## The decision this study supports

Keep the existing driving network. Give the space between road and skyline a
deliberate sequence: freight frontage, a commercial street base, then inhabited
terraces. Use architectural depth and ground connections that read from the car.
Synthcity prompted this study: overlapping masses, intermediate building shapes,
and infrastructure make its world feel substantial. Its neon palette, infinite
generation and density are not proposed for Port Alder.

## Evidence and limits

Baseline: repository commit `4f92489`, captured with the existing adoption harness,
default look, fresh browser context, staged stationary car and settled chase
camera. `capture.json` records world identity, poses and browser errors. These
are not driven passes or proof of handling, performance or visibility at speed.
The raw captures are copied here as `baseline-*.png`; the harness's small labeled
versions are also retained. In the harness metadata, `after` means the current
checkout, not an implemented redesign.

`overhead.svg` uses the 320 source roads and 1,725 resolved building footprints
from the current checkout, with an authored study-route overlay. It omits detailed
frontages, vegetation, surfaces and non-building solids. Dashed areas are loose
study envelopes, not surveyed building sites. Regenerate with:

```
node --experimental-strip-types design/studies/port-alder-depth/make-plan.mjs
```

The three concepts are AI-generated edits of those screenshots using the built-in
image-generation tool. Exact prompts are in `prompts.json`. They express intent,
not measured geometry: perspective, car proportions, lighting and small road
details may drift. The source map and baseline captures govern implementation.
No runtime, map, collision, handling or saved-world identity was changed.

## One connected study drive

Leave Wharf Garage onto First Avenue and go north. View 01 is at (-4,720), facing
north toward Holgate. Continue north and turn east onto S Jackson St. View 02 is
at (30,-63), facing east. Follow Jackson east to its northward bend at x=333,
then follow Yesler East. View 03 is at (600,-34), facing approximately east.
The route is traced from existing road polylines; this study has not driven it.

Terrain samples: view 01 is at 2 m, view 02 at 3.29 m and view 03 at 29.82 m.
At (850,-30) the terrain is 29.50 m: the third view is already on elevated ground,
not a proposal to create a steep new climb in that frame.

## 01 / Working edge

Baseline observation: warehouse frontage has readable large masses, but repetitive
flat faces and a long, visually weak horizon. The existing Holgate adoption stays.
Proposal: supported loading canopies, recessed dock bays, parapets and low roof
plant; a service-yard edge with a proper entrance. Keep the open-road vista.
The concept's extensive warm lighting is an upper bound, not a lamp replacement
specification. Keep more bays dark and concentrate occupation in one or two bays.

Reusable pieces: bracketed canopy, recessed dock module, roof-plant cluster.
Check first: existing frontage attachments, corner sightlines, sidewalk clearance,
visibility of new roof forms behind nearer roofs, and yard access.

## 02 / A street with a base

Baseline observation: towers establish depth, while the near right ground floor
has little architectural relief. The tower-to-sidewalk transition is abrupt.
Proposal: a continuous but articulated ground-floor base, recessed doors,
structural piers, shallow canopies, and one occupied diner frontage. Existing
towers remain the background; no new skyline is needed to prove this idea.

Reusable pieces: recessed entrance, storefront pier/canopy family, corner return.
Check first: actual plots and entrances, frontage editor compatibility, junction
clearance, and whether the commercial use fits the district at this location.

## 03 / Buildings that meet the ground

Baseline observation: apartment masses stand beside grass and sidewalk with few
visible clues about access or how they sit on elevated terrain.
Proposal: low stepped retaining edges, real gaps for pedestrian stairs, plinths,
recessed entrances and sparse porch lighting. Keep windows mostly dark. Walls
belong within off-road setbacks and must not become arbitrary race barriers.

Reusable pieces: stepped plinth, wall with access interruption, entrance porch.
Check first: terrain sections, building bases, actual rise at each stair, existing
open-ground routes and collision implications. No continuous wall is approved.

## Recommended first proof

Start with the freight canopy/recess/roof kit at one short frontage visible from
view 01, coordinated with the existing Holgate Cold Store. It offers the clearest
architectural test without needing to redesign a road or create a new district.
Compare equal-exposure before/after frames, then scripted passes in both directions
and a real drive. Judge silhouette, depth and occupation at speed. Only then extend
the kit along the route. Physical additions require shared geometry/collision and
the project's normal coupling checks; this document does not authorize a build.

Reference: https://github.com/jeffbeene/synthcity (screenshots 01 and 04,
`src/classes/GeneratorItem_CityBlock.js`, inspected 2026-10-28).
