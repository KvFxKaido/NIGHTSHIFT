# Port Alder's look

Design note, 2026-09-16. **Adopted the same day:** Shawn chose the night shift,
sodium lamps, keeping amber, and dry streets; on 2026-09-17, Capitol Hill for
the strip and neighbourhood polygons for district identity.

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

  The neon and shopfront part of each sentence is built as a density
  (`NEIGHBOURHOOD_DRESSING` in `src/render/alder.ts`). Windows, cranes and dock
  floods are not yet.
- **Landmarks are infrastructure, seen above the roofs.** The Broadcast Tower is
  the model: a steel lattice, red beacons, the city's own name. A district earns
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
| One municipal lamp | 1,265 identical lamps: head `SODIUM_HEAD #ffa24a`, additive pool `SODIUM_POOL #c8782f` at opacity 1, centred 4 m in from the post (`alder.ts`). Before, the pool was `#c09b65` at 0.28 and centred on the post, 1.7 m past the kerb, so its core lit the pavement and sodium could not be seen from the driving line. Ridge Circuit's lamps are near-white `#fff0cf` (`arena.ts:180-201`), which fits "private light is white". | holds |
| Plain masses | 1,728 generated boxes with flat roofs: no setbacks, parapets or roof detail (the `faces` loop in `night.ts:214`). Silhouette is the unused lever. | partial |
| Script-built surfaces | One canvas facade tile, canvas text signs, no image textures anywhere in the world. | holds |
| Lit means occupied | One 24-cell window tile with 10 lit cells for every building in the city; only its horizontal phase shifts (`facadePanel` in `night.ts`). | open |
| Dark has an edge | Elliott Bay is a flat dark plane with no streaks (`water` in `alder.ts`); the port cranes are unlit. From the waterfront the city is a thin strip on a black horizon. | open |
| Sky is not black | No sky in Port Alder: flat background `#05080f` behind fog `#070c16`, so the horizon is a hard band (`scene.ts:121-122`). | open |
| Dry streets | By omission: no environment map and no wet roughness. The wet asphalt was Blackglass's. | holds |
| Cyan belongs to the race | Neon is `#c46bff #ff4fd8 #8cff5a #6f6bff`: violet, magenta, green, indigo (`SIGN_COLORS` in `night.ts`). It was `#ff2d6f #39f0c2 #ffb03a #5ac8ff #c46bff #ff5f3c`, two cyans, the objective's amber and two reds beside the rival's, with only the violet free. Shopfront glass stays warm and cool white. | holds |
| Neon is an accent on faces a driver reads | Each wall's frontage is measured along its own normal to the carriageway it faces, and a building in the way blocks it (`src/sim/frontage.ts`). Signs go on walls within 40 m, shopfronts within 30 m (`ALDER_REACH` in `alder.ts`): 2,097 and 1,597 of 6,912 walls. In the running game that is 4,112 glow quads and 1,540 shopfront spills, down from 15,260 and 6,740, when `alder.ts` passed zero for every wall and neon hung on back walls and hillsides. `tests/frontage.test.ts` checks the wall under every drawn sign triangle, and fails with 36,770 of 52,568 off if the zeros come back. | holds |
| Signs name places | Where there is text, yes: PORT ALDER, WHARF GARAGE, RIDGE CIRCUIT, SOUTH WHARF / DRIFT YARD. The neon is blank. | holds |
| Districts differ | Seven neighbourhood polygons hold every building exactly once: SoDo 127, Alder Center 118, Belltown 131, Queen Anne 191, Capitol Hill 538, the Central District 285, Madrona Ridge 339. Neon and shopfronts follow each one's sentence: neon quads are Capitol Hill 1,103, Belltown 79, Alder Center 38, SoDo 17, and none in the three asleep. `tests/alder-neighbourhoods.test.ts` checks the coverage, that the map labels and Blacklist turfs land in their named places, and the neon rule. Windows are still one tile everywhere, so the difference is at street level only. | partial |
| Landmarks are infrastructure | The Broadcast Tower is the only landmark, and it is the model. | holds |
| Red is cars | Traffic paint is muted on purpose (`traffic.ts:34-35`), so tail lights own the red. | holds |

Before the first pass, from the car, SoDo, Queen Anne, Capitol Hill, the Central
District and Madrona Ridge read as one block repeated: dark boxes, cream window
cells, and blade signs in every colour at street level. The city was coherent
everywhere and specific nowhere; the garage and the Broadcast Tower were the two
places that looked authored. After it, streets carry a sodium pool every 55 m and
neon only on the walls that face them. After the neighbourhoods (2026-09-17),
Broadway reads as a strip from both kerbs and a Central District avenue is dark
but for its lamps. Above street level every district still looks the same,
because the window tile does not know where it is.

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

GDD §15.1 points here, and CLAUDE.md names this page beside the renderer, so
anything made for the city is checked against it first.
