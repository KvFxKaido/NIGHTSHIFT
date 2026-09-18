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
| Lit means occupied | Four window patterns (`WINDOW_PATTERNS` in `night.ts`), chosen by neighbourhood and height: offices 207 buildings, ribbon windows dark but for two cleaners' floors in a 24-floor tile and a few late desks, each building starting the tile on its own floor so a lit floor runs round all four walls; residential 778, a few warm rooms; freight 126 (SoDo), small high windows almost none lit; scattered 617 (Belltown, Capitol Hill), the tile every building had before. `tests/alder-neighbourhoods.test.ts` counts each building into its pattern's mesh. | holds |
| Dark has an edge | Elliott Bay is a flat dark plane with no streaks (`water` in `alder.ts`). The four port cranes are lit (2026-09-18): a red beacon over the legs and at the boom's end, three white work lights under the boom with pools on the pier deck, the beacons and lamps fog-exempt so the port reads on the horizon. There are no pier lamps or seawall lights, so the rest of the waterfront edge is still dark. | partial |
| Sky is not black | No sky in Port Alder: flat background `#05080f` behind fog `#070c16`, so the horizon is a hard band (`scene.ts:121-122`). | open |
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
white work lights. The start view up 1st Ave S still passes open lots.

## Remaining work

What the rules above still ask for, measured against the render on 2026-09-18,
roughly in the order it would show. Each item names the rule it serves; none is
scheduled.

1. **The sky is not black** (Light). Still a flat `#05080f` behind a slightly
   different fog colour, so the horizon is a hard band and roofs, evergreens and
   the tower have nothing to stand against. A faint cold haze lifted near the
   horizon, one gradient, is the whole job. The drawn cars' ink outlines need it
   too: black ink against a black sky does not show.
2. **Dark has an edge** (Light). The cranes are lit; the seawall, the piers and
   Elliott Bay are not. Pier lamps and a line of lights along the seawall, and a
   few static reflection streaks on the water, so the waterfront stops
   collapsing into void from the road 500 m in.
3. **The start** (Districts, SoDo). The first view, up 1st Ave S from Wharf
   Garage, passes open lots, so the first seconds of the game are the dimmest.
   A layout question more than a lighting one: framing the start, or building
   on those lots, through the editor and the plot rules.
4. **Silhouettes** (Form). Every building is a box with a flat roof. Rooflines,
   setbacks, water tanks and loading-dock canopies are where Port Alder's
   identity above the street would come from next, and a script can build all
   of them.
5. **Signs name places** (Colour). The neon is blank quads. A few words (TIRES,
   DINER, 24 HR, PARKING) on the strip and at SoDo's docks, drawn by the canvas
   the facades already use.
6. **Landmarks** (Districts). The Broadcast Tower is the only one. One per
   district at most, infrastructure seen above the roofs: a crane row, a water
   tower, a bridge.
7. **Housekeeping the survey found** (2026-09-16), none of it visible alone:
   the fog colour does not match the background; the Port Alder dressing mixes
   tone-mapped and un-tone-mapped materials, so city lamp heads look dimmer
   than the dressing beside them; the park trees are much darker than the
   evergreens; the city's meshes still carry Blackglass names (`district-*`),
   and a few comments still describe the retired bridge and tunnel.
8. **The map at whole-city zoom.** Every label now reads, but a few crowd one
   another (Deuce under Broadcast Tower). Zooming in separates them; a
   collision pass would not need to.
9. **Smoke colour as a choice.** Unbound lets a player pick a smoke colour.
   That would sit with paint and livery under "customization creates
   ownership", and is a scope decision before it is work.
10. **The phone.** Ink outlines double each car's triangles, and the city now
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
