# Port Alder's look

Design note, 2026-09-16. **Adopted the same day:** Shawn chose the night shift,
sodium lamps, keeping amber, and dry streets; on 2026-09-17, Capitol Hill for
the strip and neighbourhood polygons for district identity; on 2026-09-18,
drawn cars.

The rival portraits have a look in one sentence and rules that exclude
(`design/CHARACTERS.md`); the city they are lit by did not. GDD §15.1 listed
what a night racer could have: wet pavement, pools of coloured light, haze,
sodium lamps, fluorescent signage, reflective paint. Almost any night racer
could sign that list, so it cannot say whether a new asset belongs. This page
is meant to.

The rules describe the target. "Today, measured" describes the render on
2026-09-16, read from the code and from the car. Where the two disagree, that is
work to schedule, not a bug in either.

## The look, in one sentence

A working port on the night shift: plain hard-edged masses under one warm
municipal lamp, lit where somebody is working and dark where nobody is, with
colour only where something is still open. MC3's plain streets at three in the
morning; the city of the people who work nights, not the people who go out.

## Rules

### Form

- **Plain masses, hard edges, flat colour.** A building says what it is with
  its silhouette first (roofline, setback, water tank, loading dock, crane) and
  its surface second. Detail that only reads from a standstill is not detail.
- **If a script could not build it, it is not in the style.** No photographic
  or generated image textures on the world. Pattern is geometry, flat colour, or
  a tile a script draws; the facade tile in `src/render/night.ts` qualifies. The
  portraits draw the same line, and it is the line that keeps an endless supply
  of plausible generated surfaces out of the city.
- **One of each municipal thing.** The city bought one streetlamp, one bin, one
  lane paint, one bollard, and put them everywhere. A second lamp design is a
  rule change, not an asset. This is Port Alder's blandness, and it is specific:
  dull on purpose, and the same dull everywhere.
- **The cars are drawn, like the rival portraits.** Their light is cut into
  three flat bands of their own colour, with an ink outline, one hard highlight
  shape on the paint and the race's cyan on the flanks (`src/render/cel.ts`).
  Traffic is not drawn, which keeps it in the city rather than the race.
- **Tyre smoke is drawn the same way** (`src/render/smoke.ts`, after NFS
  Unbound's, 2026-09-18). Lumps of mid warm grey that billow into one cloud
  with one thin ink edge, lit like the portraits: sodium along the top, cyan
  down a flank, a halftone underside. Nothing fades; a lump dies by eroding into
  ink-rimmed tatters. A burnout or a held launch stays around the wheels, so the
  car and the road ahead stay in view. Near-black, it read as coal; white, it
  would out-shout the car at night.

### Light

- **The municipal light is sodium, and old.** Every street is lit by the same
  lamp in sodium orange, the key light the portraits are drawn under; the city
  never replaced its sodium lamps with LEDs. White light
  means somebody private paid for it: Ridge Circuit's floodlights, the drift
  yard, the inside of the garage.
- **Lit means occupied.** A lit window is someone at work or awake. Office towers
  light in floor bands, because a cleaning crew does one floor at a time, not in
  scattered cells. Residential hills light a few rooms. Warehouses light their
  docks, not their walls. Warm rooms outnumber cold ones.
- **Dark is allowed, and it has an edge.** Water, parks, hills and freight yards
  are dark. Where the dark meets the road or the skyline, a line of light says
  where it ends (pier lamps, crane beacons, the seawall), so an open section
  never collapses into void.
- **The sky is not black.** A faint cold haze, lifted near the horizon by the
  city, so roofs, evergreens and the tower read as silhouettes against it.
- **Dry streets.** No wet pavement, no puddles, no rain, no environment
  reflections. Seattle rains; Port Alder is its own place, and wet asphalt at
  night is the genre's most repeated image. GDD §15.1 no longer lists it.

### Colour

Colour means something here, as it already does in the HUD.

- **Warm is the city.** Sodium orange on the streets, amber and cream in the
  windows and on the docks.
- **Amber is shared, and brightness separates it.** The HUD's objective colour
  (`--ui-objective #ffb347`) and the finish gate are the lamps' hue. A gate is
  bright and on the road; a lamp is dim and ambient. If a screenshot ever
  confuses the two, that is the moment to revisit, not before.
- **Cyan belongs to the race.** Cyan is somewhere the player goes or something
  the player is part of: the HUD's navigation colour (`--ui-navigation #59d8ff`
  in `src/ui/theme.css`), the start gate, Wharf Garage's sign and turntable
  ring, the rim light on every rival portrait. The city never spends it on
  decoration, so anything cyan seen from a distance is a destination.
- **Red is cars.** Tail lights, brake lights, the rival's HUD colour
  (`--ui-rival #ff3158`), and aviation beacons on tall structures. Neon does
  not use it.
- **Neon is where something is still open.** A diner, a bar, a tyre shop, an
  all-night gas station, a taxi depot. It is an accent (BLACKGLASS.md's rule,
  still right), in colours that mean nothing else: not cyan, not the rival's red,
  not the city's amber. That leaves violet, magenta, green and indigo
  (`SIGN_COLORS` in `src/render/night.ts`). It goes on ground floors that face a
  street a driver uses, never on backs, courtyards or upper floors.
- **Signs name what a place is, never a brand.** TIRES, DINER, 24 HR, PARKING,
  PORT ALDER. No invented logos, no holograms, no animated billboards.

### Districts

- **Each district compresses to one lighting sentence, and the difference is
  density, not a new language.** Same lamp, same wall family, same window tile
  family. What changes is how many windows are lit, how much neon there is, and
  what the rooflines carry. A building's neighbourhood is the polygon its centre
  stands in (`src/sim/alder-neighbourhoods.ts`), with boundaries along streets,
  so a street's two sides can belong to different places. Seattle's character
  is the starting point rather than the brief:
  - **SoDo and the port:** freight after hours. Lamps and dock floods, lit
    cranes, container colour, almost no neon, dark lots.
  - **Alder Center:** offices with the cleaners in. Towers lit in floor bands;
    nothing above the ground floor glows in colour.
  - **Belltown:** the corner bar. Some neon, low-rise, lit ground floors.
  - **Capitol Hill:** the strip that is still open, and the only place neon is
    dense (GDD §6.1's "neon commercial strip"). Broadway is on the Hill from both
    sides, and Pike/Pine is its south edge.
  - **Queen Anne, the Central District, Madrona Ridge:** asleep. Few lit rooms,
    porch lights, evergreens black against the haze. No neon.

  The neon, shopfront and window parts of each sentence are built
  (`NEIGHBOURHOOD_DRESSING` in `src/render/alder.ts`, `WINDOW_PATTERNS` in
  `src/render/night.ts`); a tower of 40 m or more is offices wherever it stands
  but among SoDo's warehouses. SoDo's warehouses dress their street walls as
  docks instead of shopfronts: roller doors, some open on a strip-lit inside,
  and white floodlights over them lighting the apron. The port cranes carry red
  beacons and white work lights, drawn through the haze so they read from the
  waterfront road 500 m off.
- **Landmarks are infrastructure, seen above the roofs.** The Broadcast Tower is
  the model: Signal House's concrete shaft, open crown supports, angular radio
  lantern and red beacons, with KALD 88.5 / Port Alder Radio signage. A district earns
  at most one, and it should help a driver learn the city (GDD §3.2): a row of
  cranes, a water tower, a bridge. Never a building made interesting by its
  surface.

### Excluded outright

In one place, so a review can check them in one pass: photographic or generated
textures; wet pavement, puddles, rain and environment reflections; bloom as
atmosphere (glow stays per fixture, as today); neon on every face; cyan or the
rival's red as decoration; brand names and invented logos; holograms and animated
screens; a second design of any municipal fixture; detail on a face no driver
sees.

## Does it belong?

Before anything new enters the city (a building kind, a prop, a sign, a
district's dressing), it answers these, in order:

1. **Which rule on this page does it follow?** If the honest answer is "a new
   one", that is a scope conversation with Shawn, not an asset.
2. **Does it read at driving speed?** From the chase camera at 100 m it reads in
   silhouette or in one colour, or it is not doing its job.
3. **What does its colour say?** Warm is the city, cyan a destination, red a
   car, neon something open. Anything else needs a reason.
4. **Is it built by a script or placed as data?** Not painted, and not generated
   as an image.
5. **Is it the same fixture as the rest of its kind?** If not, go back to 1.

"Is it good?" is not on the list. Most generated things are good.

## Today, measured

2026-09-16, after the first pass (sodium, neon colours, frontage). File
references are `src/render/` unless given. The survey covered every renderer
file; the drive-by covered SoDo, the Broadcast Tower, Queen Anne, Capitol Hill,
the Central District, Madrona Ridge, the waterfront and the garage.

| Rule | Today | State |
|---|---|---|
| One municipal lamp | 1,335 identical lamps: 1,257 on the streets, none in a roadway since 2026-09-18 (`ALDER_LAMPS` in `src/sim/kerb-props.ts`), and 78 along the seawall (`ALDER_SEAWALL_LAMP_POSES` in `src/sim/alder.ts`), drawn in the same meshes: head `SODIUM_HEAD #ffa24a`, additive pool `SODIUM_POOL #c8782f` at opacity 1, centred 4 m in from the post (`alder.ts`). Before, the pool was `#c09b65` at 0.28 and centred on the post, 1.7 m past the kerb, so its core lit the pavement and sodium could not be seen from the driving line. Ridge Circuit's lamps are near-white `#fff0cf` (`arena.ts:180-201`), which fits "private light is white". | holds |
| Plain masses | 1,728 generated boxes with flat roofs: no setbacks, parapets or roof detail (the `faces` loop in `night.ts:214`). Silhouette is the unused lever. | partial |
| Script-built surfaces | One canvas facade tile, canvas text signs, no image textures anywhere in the world. | holds |
| Lit means occupied | Four window patterns (`WINDOW_PATTERNS` in `night.ts`), chosen by neighbourhood and height: offices 207 buildings, ribbon windows dark but for two cleaners' floors in a 24-floor tile and a few late desks, each building starting the tile on its own floor so a lit floor runs round all four walls; residential 778, a few warm rooms; freight 126 (SoDo), small high windows almost none lit; scattered 617 (Belltown, Capitol Hill), the tile every building had before. `tests/alder-neighbourhoods.test.ts` counts each building into its pattern's mesh. Signal House is dark but for its overnight booth on the Broad St corner and the crown control room (2026-09-21); its station lettering and aviation beacons identify the landmark without lighting every floor. | holds |
| Dark has an edge | No road comes within 116 m of Elliott Bay (Harbor Way is 495 m inland, SoDo's 1st Ave S 1,170 m), so the city used to end in void. Since 2026-09-18 the seawall carries the street lamp every 55 m for its whole 4.3 km, its pools lighting a warm strip at the water's edge; each of the four piers has eight white pole lamps along its edges (private light); the cranes have red beacons and white work lights. The lamps glow through the haze, fog-exempt and never smaller than 6 pixels (`farGlow` in `alder.ts`), because 500 m of haze takes 82% of a bare lamp head: from Harbor Way the edge is a line of sodium points with white clusters at the piers. Elliott Bay stays a flat dark plane, and has no reflection streaks on purpose: no road has water between it and any of these lights, so a streak would be an invented reflection. Worth drawing if a road ever reaches the water, or the bay gets a far shore or ships. `tests/alder-neighbourhoods.test.ts` holds the line and the glows. | holds |
| Sky is not black | A dome of vertex colour follows the car (`sky.ts`, 2026-09-18): `NIGHT_ZENITH #05080f` overhead, the colour the whole sky used to be, lifting to `NIGHT_HAZE #1b2638` at the horizon, most of the lift within about 15 degrees of the skyline. The fog is the haze colour, so distance fades into haze rather than black. Before it the background was `#05080f` behind fog `#070c16`, a third colour, so the horizon was a hard band and roofs, evergreens and cranes had nothing to stand against. `tests/alder-neighbourhoods.test.ts` holds the two ends of the gradient. | holds |
| Dry streets | By omission: no environment map and no wet roughness. The wet asphalt was Blackglass's. | holds |
| Cyan belongs to the race | Neon is `#c46bff #ff4fd8 #8cff5a #6f6bff`: violet, magenta, green, indigo (`SIGN_COLORS` in `night.ts`). It was `#ff2d6f #39f0c2 #ffb03a #5ac8ff #c46bff #ff5f3c`, two cyans, the objective's amber and two reds beside the rival's, with only the violet free. Shopfront glass stays warm and cool white. | holds |
| Neon is an accent on faces a driver reads | Each wall's frontage is measured along its own normal to the carriageway it faces, and a building in the way blocks it (`src/sim/frontage.ts`). Signs go on walls within 40 m, shopfronts within 30 m (`ALDER_REACH` in `alder.ts`): 2,097 and 1,597 of 6,912 walls. In the running game that is 4,112 glow quads and 1,540 shopfront spills, down from 15,260 and 6,740, when `alder.ts` passed zero for every wall and neon hung on back walls and hillsides. `tests/frontage.test.ts` checks the wall under every drawn sign triangle, and fails with 36,770 of 52,568 off if the zeros come back. | holds |
| Signs name places | Where there is text, yes: PORT ALDER, WHARF GARAGE, RIDGE CIRCUIT, SOUTH WHARF / DRIFT YARD. The neon is blank. | holds |
| Districts differ | Seven neighbourhood polygons hold every building exactly once: SoDo 127, Alder Center 118, Belltown 131, Queen Anne 191, Capitol Hill 538, the Central District 285, Madrona Ridge 339. Neon and shopfronts follow each one's sentence: neon quads are Capitol Hill 1,103, Belltown 79, Alder Center 38, SoDo 17, and none in the three asleep. `tests/alder-neighbourhoods.test.ts` checks the coverage, that the map labels and Blacklist turfs land in their named places, and the neon rule. The windows follow too (the row above), and SoDo's walls are docks. `tests/alder-neighbourhoods.test.ts` holds floodlights to SoDo's warehouses. | holds |
| Landmarks are infrastructure | The Broadcast Tower is the only landmark, and it is the model. | holds |
| Red is cars | Traffic paint is muted on purpose (`traffic.ts:34-35`), so tail lights own the red. | holds |

Before the first pass, from the car, SoDo, Queen Anne, Capitol Hill, the Central
District and Madrona Ridge read as one block repeated: dark boxes, cream window
cells, and blade signs in every colour at street level. The city was coherent
everywhere and specific nowhere; the garage and the Broadcast Tower were the two
places that looked authored. After it, streets carry a sodium pool every 55 m and
neon only on the walls that face them. After the neighbourhoods (2026-09-17),
Broadway reads as a strip from both kerbs and a Central District avenue is dark
but for its lamps. After the windows (2026-09-18), Alder Center's towers are dark
but for the floors the cleaners are on, the hills show a few warm rooms, and
Capitol Hill is the busiest thing in sight. SoDo, where the game starts, went
dark with its freight windows and is lit again by its docks: rows of roller
doors under white floodlights, and cranes on the horizon with red beacons and
white work lights. The start view out of the garage runs up Harbor Way, not 1st
Ave S, and its open yards are lit by their own masts since 2026-09-19. After the
sky (2026-09-18), rooflines, Madrona's evergreens and the cranes stand dark
against a faint haze instead of vanishing into black. After the edge, looking west
from any road ends in a line of lamps along the water instead of in nothing.

## Remaining work

What the rules above still ask for, measured against the render on 2026-09-18,
roughly in the order it would show. Each item names the rule it serves; none is
scheduled.

1. **The start: build the lots** (Districts, SoDo). Harbor Way leaves Wharf
   Garage past 200 m of open ground, the nearest building 196 m off. Six yard
   masts light it now (`START_YARD_MASTS` in `alder.ts`, 2026-09-19): the dock's
   own flood on a mast instead of a wall, near the kerb and alternating sides,
   clear of the junction where the road widens. Measured first: the corridor is
   19 m wide, centred at x -9, and its six street lamps were all the light there
   was. Reframing the start was tried and rejected on the evidence — facing south
   or west from the garage is as dark or darker. What remains is the layout: real
   buildings on those lots. That is what LOOK asks for and it is deferred on
   purpose, because `alder-layout.json` holds no authored plots yet, so the first
   one appends a layout fingerprint to `ALDER_VERSION` — refusing all 13 lap
   recordings and invalidating pending career courses. Worth doing when the car
   tuning that reads those recordings is finished and they can be re-recorded.
2. **Silhouettes** (Form). Every building is a box with a flat roof. Rooflines,
   setbacks, water tanks and loading-dock canopies are where Port Alder's
   identity above the street would come from next, and a script can build all
   of them.
3. **Signs name places** (Colour). The neon is blank quads. A few words (TIRES,
   DINER, 24 HR, PARKING) on the strip and at SoDo's docks, drawn by the canvas
   the facades already use.
4. **Landmarks** (Districts). The Broadcast Tower is the only one. One per
   district at most, infrastructure seen above the roofs: a crane row, a water
   tower, a bridge.
5. **Housekeeping the survey found** (2026-09-16), none of it visible alone:
   the Port Alder dressing mixes tone-mapped and un-tone-mapped materials, so
   city lamp heads look dimmer than the dressing beside them; the park trees
   are much darker than the evergreens; the city's meshes still carry
   Blackglass names (`district-*`), and a few comments still describe the
   retired bridge and tunnel.
6. **The map at whole-city zoom.** Every label now reads, but a few crowd one
   another (Deuce under Broadcast Tower). Zooming in separates them; a
   collision pass would not need to.
7. **Smoke colour as a choice.** Unbound lets a player pick a smoke colour.
   That would sit with paint and livery under "customization creates
   ownership", and is a scope decision before it is work.
8. **The phone.** Ink outlines double each car's triangles, and the city now
   has four facade materials a chunk. Fine on the PC; a budget question for the
   RedMagic port, measured then, not guessed now.

## Decisions

Decided by Shawn, 2026-09-16:

1. **The thesis:** the night shift's city, not a city of people out for the
   night.
2. **Sodium:** the lamps move from pale amber to sodium orange, matching the
   portraits' key light.
3. **Amber:** the objective colour keeps it; brightness separates a gate from a
   lamp.
4. **Dry streets:** wet pavement is struck from GDD §15.1.

Decided by Shawn, 2026-09-17:

5. **The neon strip:** Capitol Hill.
6. **District identity:** neighbourhood polygons, not the Blackglass `zone`
   split or the turf centres. Drawn in game coordinates along streets, since the
   hill districts were authored and Seattle's real boundaries would not line up.

Decided by Shawn, 2026-09-18:

7. **Drawn cars, by default.** Chosen from screenshots of the same Broadway
   spot and slide in three looks: today's rendered cars (at night, two tail
   lights and a dark shape), Driving Rogue's recipe of rendered cars under drawn
   effects (`?look=fx`), and drawn cars. `?look=plain` keeps the rendered cars
   reachable for comparison.

GDD §15.1 points here, and CLAUDE.md names this page beside the renderer, so
anything made for the city is checked against it first.

## Grass volume and tyre response (2026-09-20)

Open ground and parks have a mottled, rough grass mat (`render/grass-ground.ts`)
under short, tapered blade clusters (`render/grass.ts`). Blades vary in height,
orientation and colour, and lean gently in coherent wind. Their roots stay on
the shared Alder landform. Paving, the garage forecourt, water and oriented
building/tree footprints exclude them; there is no second surface rule in the sim.

The player and named moving rivals press two paths through the grass. The renderer
sweeps each wheel between its previous and current presentation pose so fast
movement still leaves a continuous path. Blades bend in the direction of travel
and recover over seven seconds. A reset stamps only the landing position. This
is temporary vegetation movement, not persistent tyre decals or a handling change.

Instances live in at most 121 nearby 16-metre tiles. New tiles are populated nearest
first over several frames, released when distant, and repeat their original
scatter when revisited. An outer ring is prefetched without drawing it. Each tuft
has a repeatable fade endpoint between 40 and 62 m, with a 24 m transition;
this breaks up the visible moving edge of the original uniform 38–47 m cutoff.
New tiles also ease into view over 0.65 seconds, staggered across their tufts;
wind and recovery run in the vertex shader. No grass shadow pass or transparent
cards. The simulation and recordings are untouched.

`tests/grass.test.ts` covers placement exclusions, separate tyre paths, resets,
bounded tile lifetime and simulation isolation. `node scripts/test-grass.mjs`
checks the actual WebGL shader and captures a driven strip on the local dev server;
`GRASS_LIGHTING=night` selects the normal presentation instead of work lighting.

## Coastal fir (2026-09-21)

The grove evergreen uses a tapered nine-sided trunk with broad bark stripes,
visible lower branch forks, and outward limbs that droop at their tips
(`render/fir-tree.ts`). Eleven staggered tiers carry forked needle sprays down
the trunk. Each limb has three smaller sprays, built from crossed cutout cards
with a seeded, script-drawn needle texture (`render/fir-needles.ts`). A narrow
faceted core keeps the crown solid at distance. Broad needle strokes and muted
green clusters keep the detail readable; three toon-lighting bands keep them compatible with
the drawn cars without borrowing their cyan rim, paint highlight or heavy ink.
The same materials respond to work lighting, moonlight and headlights.

This replaces the evergreen's three stacked cones, not its planting or physics.
Park trees retain their separate model. The fir fits inside the existing crown
radius and height, with its trunk inside the existing collision footprint. Both
geometries remain shared, instanced in the existing 256 m batches: two draws per
visible batch. The model is 1,480 triangles per tree. Foliage uses alpha testing
and writes depth, avoiding transparent sorting across the grove. Wood samples
a padded opaque area of the same texture so distant mip levels retain branches.

The downloaded pine packs are reference only, kept locally in gitignored
`inspiration/fluffy-pine-trees-free-standard/` and
`inspiration/pine-tree-low-poly-stylized-tree/`, outside `public/`. The latter
informed the outward branching and lower foliage. Neither pack's geometry or
textures are used by this tree or included in the build.

`node scripts/test-fir.mjs` captures the actual model with a car for scale, then
in a Port Alder grove at night. `tests/alder-evergreens.test.ts` checks the mesh
envelope and budget alongside the existing placement, rendering and collision
checks. Captures are in `artifacts/fir-study.png`, `artifacts/fir-grove.png`,
`artifacts/fir-distance.png` and `artifacts/fir-city-night.png`.

## Occupied corners (2026-09-21)

Eight trial corners now have solid parcel dressing (`sim/corner-dressing.ts`,
`render/corner-dressing.ts`). Downtown uses concrete planting beds with pale
coping and low shrubs; hillside corners use stepped masonry beds; freight
corners use concrete yard blocks with amber reflectors and timber storage crates.
Their short returns give the objects a reason to occupy the parcel. They do not
form a continuous barrier along the streets.

The paved apex remains open. Every solid footprint is at least 3.8 m beyond
every carriageway, including alleys, so it clears the 2.8 m pavement too. The
geometry, collision, rival line clearance, saved-location checks and grass
exclusions share the same solid list. Low vegetation is soft decoration on the
beds; all hard masses match their collision boxes. Bases sink to the lowest
ground corner and coping stands above the highest, in short stepped sections.

Sites use ordinary frustum culling, with no distance-based spawning or fading.
Pale top edges and amber freight reflectors make their mass readable at night.
`node scripts/test-corner-dressing.mjs` captures all sites under inspection
lighting and three representative night/approach views in `artifacts/corners/`.

The trial deliberately preserves alleys, the garage forecourt, the drift-yard
access and the reserved park passages. It is not a guarantee that every possible
cross-country route is blocked. `tests/corner-dressing.test.ts` drives deep cuts
before/after and shallow clips in AWD, then fields the rival through every
corner in both directions, with and without traffic.

## First architectural block: Alder Market (2026-09-21)

The first detailed building is the three-storey corner at (799, -945),
on the west side of Olive Way just north of Pine East. It replaces the existing
18 x 18 x 10 m plot's presentation, retaining its footprint, base and collision.
Pine Rooms at (799, -977), 25 m tall, and Paper and Ink at (765, -913), 20 m tall,
use the same kit with different bay widths, concrete/shopfront tones and a raised central
parapet on Pine Rooms. Existing building footprints and heights stay intact.
The other buildings retain their existing decoration seeds. Exact plot shapes
select the kit; a resized/relocated/retired plot falls back to the normal building
renderer rather than leaving a detached custom model behind.

`render/brick-corner.ts` builds the original subtle concrete grain, recessed glazing,
grey jambs and sills, a charcoal-teal wraparound shopfront, small ALDER MARKET
lettering, shelf silhouettes, service doors and downpipes. Stepped cornices and
a parapet surround the flat roof; a low ventilation unit and chimney stay inside
the original height. Upper windows are selectively lit. Broad cel light bands
and dark concrete-grey walls keep it in the same city as the firs. Lighter grey molding uses
the light bands without receiving the district shadow map, avoiding crawling
self-shadow stripes on thin steps; it still casts shadows.

Repeated details merge into nine material batches per building, totalling 50,208
triangles across the three. All three share two tiny textures (concrete grain and cel ramp).
There are no added dynamic lights or distance spawning. This is a small authored
block, not a budget for duplicating full detail over every plot; a district rollout
needs distance simplification and batching across buildings.

`sim/market-block.ts` owns the connected frontage polygons, eight-metre rear lane,
cross-alley and two service bins. The pale apron meets the Pine and Olive pavement;
the service lane is darker, with flush drains and clear door landings. Green
pockets remain inside the block. Shared paving drives tyre grip and grass exclusion,
with a cheap bounds rejection before polygon checks. The bins join ALDER_SOLIDS
and the layout editor rejects buildings that overlap them. Rendering uses five
additional batches. Roads, routes and building collision footprints remain fixed;
the added surface and utility solids advance world identity with `-market-v1`.

`node scripts/test-brick-corner.mjs` captures the study, night, rear and driving
views in `artifacts/brick-corner/`, using D3D11 on Windows. `BRICK_MEASURE=1` also
compares isolated render timings with the whole block shown/hidden. The geometry
test checks bounds against the existing solids and caps the material/mesh cost.
`tests/market-block.test.ts` verifies paving/grass agreement, physical utility
clearance and actual player drives through both passages in both directions.

## Tower detail and the existing skyline (2026-09-21)

The released tower silhouettes and their lit-window patterns are the distant
LOD. `render/tower-detail.ts` adds architectural relief to office towers at least
40 m tall: shallow mullions aligned to the existing window grid, floor edges,
occasional stronger structural bands, corner piers, street-facing entrance
surrounds and low rooftop equipment. Dark concrete-grey and charcoal metal fit
the Market kit. The original batched walls, roof planes and seeded lit rooms
remain untouched; the near layer contains no duplicate facade or window lights.

Detail is solid through 110 m from the camera to the building base and fades
with opaque screen-door coverage through 210 m. At 240 m Three.js LOD stops
submitting it entirely. An 8% hysteresis band restores geometry before the fade
becomes visible on approach. No transparent sorting or new lights are needed.
The original shell owns shadows; thin relief does not sample or cast into the
coarse district shadow map. Building footprints and simulation identity do not
change for this presentation layer. The daytime editor blockout stays simple.

Each nearby tower adds two merged meshes sharing two materials across the city.
All geometry is built at scene creation, not on the driving path. The current
163 tower envelopes total about 209,000 additional triangles in storage, with
only nearby, visible towers submitted. Tests cap an individual tower at 2,200
triangles and the full set at 230,000. This is the office-tower kit, not a rollout
to every residential building or warehouse.

`node scripts/test-tower-detail.mjs` captures near, street-height, rooftop and
distant views. Its browser comparison verifies visible detail nearby, identical
pixels after the fade, and zero detail draw calls beyond the cull distance.
`tests/tower-detail.test.ts` also checks original geometry/UV preservation,
rotated placement, hysteresis and the geometry/material budgets.
`TOWER_MEASURE=1` also alternates isolated render timings with detail enabled
and disabled after warmup. The first D3D11 near-tower view measured 6.6 ms versus
6.9 ms median (7.5 versus 7.8 ms p95), with six extra draw calls and 4,992 extra
submitted triangles. That is one view's render cost, not a whole-city driving
frame-time guarantee.

## Skyline peaks and old-growth firs (2026-09-21)

`sim/alder-skyline.ts` selects sixteen existing towers for 1.5x height. Most peaks
sit in Alder Center and the Central District; Belltown and Capitol Hill get a
few smaller accents. The tallest is now 111 m. Footprints, rotation and ground
positions stay fixed. Scaling the shared generated baseline gives collision,
the editor, the distant shell and the nearby architecture the same height.
Facade grids add normal-height floors instead of stretching window textures.
Authored editor replacements retain their explicitly chosen dimensions, and
both layout parsers and the editor now accept heights through 150 m.

The evergreen generator keeps all 4,439 positions and enlarges 242 existing
trees (5.45%) to 1.5x height, crown radius and trunk width. These 21–36 m trees
are scattered through the park/woodland interiors, with none on the freight
edge. Selection is seeded and repeatable. Failed growth candidates remain
ordinary trees. The larger crown must clear the existing road and building
buffers and the full reserved passage; spatial-index bounds include the
expanded radius. Enlarged trunks are shared physical solids, grounded at their
lowest corner. Original crown orientation and tint are retained. Instanced
tree counts, geometry and material batches do not change.

The world revision adds `-scale-v1` because shared solid dimensions changed.
The taller generated baseline also updates the editor's layout fingerprint.
`tests/alder-scale.test.ts` checks the selected peaks, ordinary floor pitch,
editor limits and unchanged tree population/positions. The evergreen suite
checks every road (including the circuit), all building clearances and drives
against both ordinary and enlarged trunks. `scripts/test-alder-scale.mjs`
captures the skyline and compares ordinary/enlarged tree instances from a
fixed roadside camera; the tower browser check verifies the taller distant
silhouette still matches exactly after the detail fade.
# Modular frontage pilot

Three authored plots now use a shared frontage recipe on their existing envelopes:
Harbor Supply (-44, 585), Bell Row (-477, -1140), and Meridian House (-110, -564).
The ordinary upper walls, window pattern, roof silhouette and tower LOD remain.
These three sites replace random ground-floor panels/signs with fitted modules;
the rest of Alder keeps its existing dressing while the kit is evaluated.

Each tenant owns a door, signs and any glazing/lighting. Harbor Supply has a
personnel entrance, two ribbed loading shutters, bay numbers and white work
lamps. Bell Row pairs Night Owl coffee and Second Spin records with individual
doors, fascias and canopy-edge neon; Bell Rooms has a separate residential
entrance. Night Owl also demonstrates a two-sided projecting blade sign.
Meridian House has a double-door lobby, glazing, an address plaque and a canopy.

`sim/building-fronts.ts` owns facade modules and street-connected access patches;
the renderer consumes that plan, and the ground query uses the same paving to
exclude grass and supply tyre grip. The warehouse and shops receive forecourts;
the tower keeps green setbacks beside a four-metre lobby walk. The first kit is
deliberately limited to level, unobstructed plots. Edited envelopes or blocked
approaches fall back to the original building dressing rather than leaving
floating doors or orphaned paving. Sloped sites need a future platform/ramp kit.

Signs share one mipmapped atlas, with lettering laid out at each sign's physical
aspect ratio. Architecture merges per material/building (seven materials and at
most 21 meshes across the entire pilot); no dynamic lights are added. Fine ribs,
handles and brackets dither away at 100–160 m and stop submitting at 180 m.
The core entrance, canopy and sign remain, preserving identity at distance.
Run `node scripts/test-building-fronts.mjs` for night/study/driver captures and
browser budgets; `tests/building-fronts.test.ts` checks access, overlap, fallback,
shared paving, geometry budgets and preservation of the original upper shell.
## Saved frontage generation and authoring

The frontage pilot is now backed by `src/sim/alder-frontages.json`: complete
module choices and local access strips, not a seed evaluated by the game.
The first district pass adds 94 Belltown buildings (97 total including the three
locked pilots). The saved set contains 48 shop rows, 26 residential entrances,
22 office lobbies and Harbor Supply. Thirty-six sites remain in the needs-attention
list rather than receiving blocked, floating or disconnected entrances.

Open `/editor.html` and scroll to **Building frontages**. Select a district and
use **Generate missing** to preview additional buildings. **Reroll unedited
district** preserves locked and hand-edited work. To replace one chosen frontage,
unlock it, choose its building use and press **Reroll selected**. **View entrance**
frames the street face. Module fields edit position, size, sign name/caption,
mounting and tenant accent; applying an edit locks that frontage. Door/access,
overlap and frame-clearance checks reject invalid module edits. Each frontage
draft has undo/redo, export, reload and an explicit **Save frontages to project**
action. Generation and preview never write the file on their own.

Placement and frontage saves remain distinct. Save building placement first;
then **Refit access** checks the moved/resized building against the updated road,
terrain, trees and prop geometry while preserving the tenant/module choices.
Modules follow the building in the editor preview. A changed envelope is flagged
and uses the ordinary runtime frontage until its access is refitted and saved.
Authored replacements retain ownership through their original plot identity.
Loading also checks saved paths against current neighbours, trees and terrain;
blocked access is withheld and reported without replacing the stored choices.
Deleted buildings' stored frontages remain dormant so restoring a plot restores
its authored choices. The garage and custom Market block keep their own models.

The development endpoint validates the complete document and fitted access
before atomically replacing the file; revision checks reject stale editor tabs.
Local drafts survive saves and hot updates. Sign-only edits preserve race/world
identity; changed paving contributes a surface fingerprint to the world version.

The same generator can be run from the terminal:
`pnpm frontages:generate --district=belltown` previews a missing-only pass.
Append `--write` to save it, or `--reroll-unedited` to regenerate the unlocked,
unedited part of that district. Each building has an independent stable seed,
so changing processing order or adding another plot does not reroll neighbours.

The wider renderer deduplicates signs into bounded 1024 × 1024 atlas pages and
batches core geometry in 256 m cells. Fine detail retains per-building distance
fading. The 97-building set contains about 101k triangles, four sign atlases and
no new dynamic lights. This is a geometry budget, not a whole-city FPS claim.
`pnpm test:frontage-editor` exercises non-destructive preview, manual-edit locks,
undo/redo, real save/reload and placement-refit warnings; the test restores its
temporary sign edit afterward. `node scripts/test-building-fronts.mjs` captures
both the pilots and generated examples in study, night and driver-height views.

### SODO industrial frontage pass

SODO now adds 97 saved industrial frontages: 37 freight warehouses, 34 repair
workshops and 26 trade depots. The original 97 frontages, including every
Belltown choice and the three pilots, are preserved exactly. Another 28 SODO
sites are flagged for attention rather than forcing a fit (64 across both
passes). Use `pnpm frontages:generate --district=sodo` for a missing-only preview;
the workshop's district controls use the same generator.

The industrial variants keep a separate personnel entrance and closed vehicle
bays. Freight uses wide receiving shutters; repair shops use narrower service
bays and a shallow canopy; larger depots add a trade-counter window. Twelve
business identities supply painted names, bay numbers and practical captions.
Concrete panel seams, restrained paint wear and flush loading guides make the
ground floor legible while retaining the original upper shell and skyline.
Guides are clipped to the shared, validated forecourt; they add no collision
objects. The paving still supplies driving grip and grass exclusion.

Painted signs use a non-emissive, alpha-tested standard material, sharing bounded
atlas pages separately from illuminated signs. There are no new dynamic lights.
**Sign finish** in the editor switches a wall sign between painted lettering and
an illuminated board; projecting blade signs require the board finish. Saved
industrial style and sign finish survive edits, export, reload and rerolls of
other buildings. Existing documents without these optional fields load unchanged.

Both the original urban kit and SODO's industrial variants now wrap all four
ground-storey elevations. Cladding, base courses, cornices and corner trim are
continuous; side/rear walls use recessed windows, with quieter industrial high
windows and rear service grilles. They do not duplicate the front's businesses
or invent entrances without a validated path. The original upper masses and
window treatment remain. Side windows use flat panels with modeled sills to
keep the extra geometry bounded, and the same concrete material owns all walls
so subsequent palette changes remain coherent.

Across all 194 frontages the checked budget is 435 meshes (including each site's
fine-detail LOD), 420,554 triangles, eight 1024-square atlases and 15 shared
materials. Geographic core batching and fine-detail fading remain active. These
are asset budgets, not a claim of measured whole-city frame rate. In-game captures
cover all three industrial variants at night, with study lighting, from driver
height, and around front/rear corners. `pnpm test:frontage-editor --industrial` additionally exercises a
painted workshop sign through the real save/reload path and restores the data.

The original window shell is cropped at each saved frontage's exact band height
on all four walls. Its remaining UVs keep their original world scale and phase;
upper windows and roofs do not move. Tower piers and base trim also yield that
ground storey to the frontage. Keeping both full walls separated by only 5 cm
caused distance-dependent depth flicker, so the underlying geometry is removed
rather than relying on draw order. `node scripts/test-frontage-distance.mjs`
moves a camera through 100–480 m with a high-contrast hidden shell and checks
that none of it leaks into any of the four ground-floor kits.

### Coordinated building materials

The 194 fitted buildings now choose a stable charcoal, weathered-grey or warm
cement palette from their saved building identity. Art-direction values live in
`src/render/building-palette.ts`. Upper wall albedo compensates for the original
texture's blue-grey concrete, matching the modular base's concrete colour; trim,
metal, fine detail and roofs use darker or lighter related values from the same
palette. Upper window UVs, room-light patterns, emissive intensity, tenant accents
and all saved frontage/module choices remain unchanged. Palette choice does not
depend on building iteration order or alter the race/world fingerprint.

Vertex colours carry variation through the existing shared materials and spatial
batches. SODO's upper wall texture includes mipmapped panel joints; its ground
floor seams use the same facade-grid boundaries. Restrained metal caps end at the
existing roof height, preserving the silhouette. No second upper wall layer or
dynamic light is added. The frontage set now uses 420,554 triangles, 435 meshes,
15 materials and the same eight sign atlas pages. All four kits retain the
100–480 m hidden-wall regression check. Browser studies compare Belltown, offices
and SODO from the front, street height, corners and rear.
