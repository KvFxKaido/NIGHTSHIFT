# Port Alder demo

Port Alder is the demo's only playable map, authorized September 10, 2026 after the separate-map study. **It was Seattle until September 11, 2026.** The map is built from adapted Seattle centerlines and keeps its borrowed street names, but Shawn let go of Seattle as the city's identity once it was clear the work to make it feel like Seattle was never going to be done; the city is its own place now. The code handle is `alder` (`src/sim/alder.ts`, `alder-data.json`, `alder-slice-v4`, `?world=alder`), the display name Port Alder; `seattle.html` and `?world=seattle` still resolve here for old links, and the sentences below that say Seattle mean the real city the data came from. The base URL and old Blackglass world bookmarks enter Port Alder. `district.html` redirects to `alder.html`. Handling and car customization are shared unchanged.

Free roam starts outside **Wharf Garage**, beside First Avenue in SoDo. Stop at the cyan shutter and use **E / Enter** or **Cross / A** to enter. The garage uses the existing fixed camera and rotating car platform. Drive out returns to its forecourt. Races retain the clear northbound street grid and disable garage entry. The minimap and route board mark the garage.

`editor.html` now edits Port Alder. Its validated placements live in `src/sim/alder-layout.json`; the garage and forecourt stay protected. Saved building footprints feed both rendering and Rapier.

The in-game city map opens with **M / Select–View–Share** or the pause
menu's Port Alder map button. It uses the loaded sim and never navigates away:
player, rival, traffic and race clocks pause together. Closing returns to the
originating screen, with driving inputs gated normally on resume. Markers show
the player, cruising/racing rival and the active race's gates (including generated
races), plus the garage and Broadcast Tower. Pan/zoom is available by pointer and
the map's controller-accessible view buttons. Bindings are remappable and old
saves retain their existing assignments. The standalone route board remains a
separate authoring/navigation page.

## Menus and named saves

The title centers on Continue / Load game / New drive, with Garage and Options.
Continue loads the most recently saved of three named slots. Empty slots cannot
be loaded. Pause → Save game records the current build and free-roam position;
a second, explicitly labeled Replace save action is required for an occupied slot.
A new drive never erases slots. Saves are manual and local to this browser.

Slot data lives in `nightshift.saves` (schema 1), separate from global audio,
controls, and last-used garage preferences. Load restores the selected build and
clears conflicting preview URL fields. It starts stationary; race saves, old map
versions, and obstructed/out-of-bounds locations return to the garage. This does
not yet save race progress, rival state, money or career unlocks. Invalid storage
is reported without replacing existing data, and a slot changed by another tab
must be selected again before replacement.

Options groups audio and Controls & remapping. Neither menu has a drivetrain
control — the body carries it; Pause keeps driving, map, save and navigation
actions. Controls returns
through Options to its original menu without resuming the simulation. Names can
be typed with the keyboard; default slot names also allow controller-only saves.
The list-first layout and Continue/garage emphasis draw inspiration from
[MC3's career menu](https://www.speedrun.com/midnight_club_3_dub_edition_remix/runs/zn2vd7vz),
while retaining NIGHTSHIFT's typography and palette. There is no invented Career
menu until the game has career progression.

## Direction

This is the single-city MC3-inspired demo described in [GDD.md](GDD.md).
The target look is upscaled/emulated MC3, with MC3 San Diego as a reference
for eventual scale. Expand Port Alder naturally from driving feedback. Keep
open route choice, understandable customization and the current handling.
PC prototyping comes first; RedMagic 10 Pro is the eventual device, with
Android packaging and testing later. Police and other selective LA features
remain optional future work.

## Current slice

The map has **83.5 km of streets**, 318 graph edges and 1,730 generated building masses, plus Wharf Garage and the Broadcast Tower. The connected street network now spans **12.6 km²**, measured as the convex hull of its street centerlines, with a 14.2 km² road bounding rectangle. Terrain padding and Elliott Bay are excluded from that headline area; it describes the developed footprint, not the area of asphalt. The original SoDo–Belltown–Broadcast Tower slice remains the southwest anchor. Queen Anne, Capitol Hill, the Central District and Madrona Ridge extend north and east with hill climbs, smaller passages, park edges and an outer scenic loop. Buildings reserve clear roads and passages through larger parcels. The generated network has no disconnected islands or clipped dead ends.

Real Seattle centerlines provide the original southwest structure. The new hill districts are hand-authored Seattle-inspired layouts, not a new GIS import or a reconstruction of the actual neighborhoods. Distances, widths, elevation, buildings and connections are deliberately adapted. See `assets/maps/alder/README.md` for attribution and regeneration. The visual target remains an upscaled MC3-like city; this is playable massing, not finished architecture. Alder Broadcast Tower is a fictional steel-mast landmark with a shared station footprint. No surveyed terrain, bridges, tunnels, or police yet.

## Shared surface

**Alder Broadcast Tower** replaces the former Needle silhouette on the same plaza.
The station is a solid 20 × 20 × 18 m concrete base; an exposed, tapering steel
mast reaches 120 m above the site, with red warning lights and PORT ALDER signs
facing all four approaches. The base collider and rendered shell share
`alder-landmarks.json`. Upper latticework is skyline detail, not an invisible
120 m collision box. Repeated beams, sign pixels and lights merge by material
into seven meshes, without downloaded fonts or textures. Both map views label
the landmark Broadcast Tower. The `broadcast-v1` world suffix records the
changed collision volume for saved-location validation.

`src/sim/alder.ts` owns the road world and continuous analytic height function. `src/sim/alder-terrain.json` adds compact, smooth hill profiles to the existing downtown grade; the builder and sim read the same parameters. `scripts/build-alder.py` unions buffered road polygons before constrained triangulation; asphalt, pavement and land are disjoint. Triangles refine at more than 7 mm sampled interpolation error or 80 m edge length, and the surface test checks error below 2 cm. Renderer and simulation use the same height function; selecting a different nearest street cannot switch elevation profiles. The outskirts continue that surface beyond the developed blocks. Park grass is a lifted overlay clipped away from roads and pavement; tree trunks use shared rendered and solid footprints.

Road data also feeds the minimap and existing lane/reservation traffic builder. Traffic remains deterministic. General road projection, building footprint and traffic helpers are separate modules, so importing Port Alder does not initialize the retired district.

The game and editor no longer bundle the old district/course renderers. A build guard rejects their reintroduction. The 1.35 MB Rivergate GLB moved from `public/assets/tracks` to the offline `assets/tracks` folder; it remains a developer asset regression fixture and is not copied to the demo. Other Blackglass source/handling fixtures remain for regression tests, with no playable entry. No changes to `HANDLING` or the physics version. Port Alder's world identity is now `alder-slice-v4-evergreens-v1-broadcast-v1`, with a layout fingerprint when edited.

## Evergreen groves

Six planting regions add 4,440 evergreens to the current layout: Queen Anne slopes,
Union Commons, Capitol greenbelt, Madrona woods, Central greenway and the freight
edge. They break up large empty cross-country cuts without enclosing the roads.
Union Commons has denser planting; smooth patches and feathered edges leave
irregular clearings elsewhere. Two broad passages cross Union Commons and Madrona.
This is a first obstacle-placement pass, not a measured guarantee of race balance.

`src/sim/alder-evergreens.ts` deterministically generates placements after the
building layout resolves. Tree canopies stay five metres beyond road edges
(including alleys), two metres clear of buildings, and out of the garage forecourt.
New authored buildings take priority and displace nearby planting on reload.
Solid 1.25 m trunks share their exact placement and dimensions with the renderer;
branches have no collision. Trunk feet follow the lowest ground corner.

`src/render/evergreens.ts` uses three low-poly crown layers and two instanced meshes
per 256 m geographic batch, with shared geometry/materials and frustum bounds.
The existing park trees remain. No assets need downloading, and there are no new
walls, driving penalties or handling changes. The evergreen version suffix marks
the changed collision world independently of the generated road-data stamp.

## Regeneration caveats

`scripts/build-alder.py` writes `src/sim/alder-data.json` in full, including
its generated buildings. The builder now starts from
`assets/maps/alder/belltown-slice.json`, preserving the released 108 street
identities/vertices and 195 plots, then adds `east-hills-layout.json`.
The new polylines are split at intersections and sampled for lane/grade following.
Do not refresh a historical GIS extract expecting it to rewrite the pinned city.

**Authored plots are their own list (2026-09-11).** `src/sim/alder-layout.json`
(schema 2) holds `authored`, buildings placed by hand in world coordinates
with their own ids, and `retired`, generated plot ids that no longer stand.
Schema 1 keyed every edit to a generated plot id derived from that plot's
coordinates, so a rebuild that moved one plot invalidated the whole file;
the cliff was documented here before the file held anything. Now the
builder reads the authored list, keeps filler three metres clear of every
authored footprint and drops a pinned plot one stands on; the sim composes
generated plots less retired and less any an authored plot overlaps
(authored wins, so a build that predates the plot still loads), then the
authored plots; a retired id the generator no longer produces is ignored.
Regenerating the map can therefore never orphan an authored building. What
a rebuild can still do is move a generated plot out from under a retirement
so that it stands again elsewhere, which is a re-review, not a loss. Measured:
with the file empty the builder's output is byte-identical; with authored
plots over a filler plot and a pinned plot it writes 193 buildings instead
of 195. See `design/EDITOR.md` for the editor's side.

The builder now stamps `alder-slice-v4` and the sim derives its version from
that stamp (plus the evergreen revision and layout fingerprint). The old separate v1/v2 stamps are
retired. Map expansions must bump the builder's stamp deliberately. Generated
race seeds are reproducible within a world version; v3 seeds may draw different
routes on the expanded graph.

### Belltown–Broadcast Tower extension (2026-09-11)

Adds 5.5 km and 45 graph edges, using the city's northern street extract.
Downtown connects through 2nd/4th Avenue, a short adapted 1st Avenue link,
and the extended waterfront approach into Elliott Avenue. Battery, Wall,
Cedar and Broad provide cross-connections; Denny, Queen Anne Avenue N,
Mercer and 5th Avenue N form the campus loop. The three short connector
segments are authored adaptations. Every crossing remains at grade; no SR99
ramps, tunnel or grade-separated geometry was imported.

The campus is reserved from procedural building placement. The Broadcast Tower
has a simplified 120 m silhouette, open plaza and shared collision footprint;
the map board labels it and Belltown. Original street geometry and building
plots are retained, including the garage, encounter and Sound to Sky route.
The v3 extension retained the existing height function. It reached lower
Queen Anne; the v4 addition below provides the hill climb and overlook.

The same route-choice model now reports 2574 directed legs, 86% with an
alternative within 40% (previously 77%), 326 priced legs, and 520 in the
10–25% detour range. These are graph-model estimates, not lap-time promises;
the larger graph changes the comparison pool. Broad / 5th and 2nd / Denny
are new high-ranking gate candidates.

#### Future expansion direction (2026-09-11)

Shawn considers the current playable area the southwest (bottom-left) corner
of the eventual map. Keep its long, straight roads as part of the driving mix;
future expansion should be more compact where practical, growing principally
north and east instead of extending the same grid in every direction.

Favor smaller connected additions with shorter blocks, bends, irregular
junctions and multiple useful connections to existing streets. Compress and
adapt real geography when it improves racing. Judge additions by the route
choices and driving variety they provide within their footprint, rather than
road kilometres alone. Preserve open racing and usable street widths; tighter
districts should gain their character from layout rather than extra barriers.

The subsequent same-day request authorized at least 10 km² with creative
freedom. The east/hills expansion implements that request without reshaping
the released southwest streets.

### East and hill districts — v4 (2026-09-11)

- Queen Anne has a climb, crown loop, smaller residential masses and Kerry Overlook.
- Capitol Hill has a connected hill grid, Broadway, market passages, Belmont Passage and cross terraces.
- The Central District adds diagonal approaches, Fir Street, Spruce Lane and courtyard/service alternatives.
- Madrona Ridge has a broad scenic loop and inner parallel routes, giving long fast runs a place beside the tighter streets.
- Union Commons and Volunteer Green provide open park ground with collidable trees. They are fictional green spaces, not a recreation of Lake Union or surveyed park boundaries.

The old garage, encounter and Sound to Sky course remain. Generated races
use the expanded graph automatically. Their first draw measures only feasible
gate candidates, sharing shortest-path results per origin and caching measured
alternatives. Full all-pairs measurement remains an offline critique operation.
Traffic reservation sampling includes both endpoints at lane transitions so
long vehicles' first metres on an exit cannot be skipped. New 12–14 m streets
have one lane each way; wider existing streets retain their previous lanes.

The workshop's Overview frames the full new bounds. Map overlays label the
districts and parks. This remains a PC blockout; denser geometry and many more
building masses need a later rendering/streaming budget before the phone port.

## Validation and remaining work

Automated checks cover connected route choices, reachable gates, building setbacks, mesh height error below 2 cm, northbound spawn clearance, same-runtime replay, and two minutes of traffic with body-overlap checks. Browser checks cover free roam, race entry, legacy-link migration, garage entry/exit and turntable, camera startup, and both lighting modes. The editor browser check saves and restores a real placement, verifies its physics collider, round-trips Three.js JSON, and rejects road overlap.

Next authoring work should follow driving feedback: reshape repetitive blocks, add useful alleys and destinations, and make each neighborhood recognizable. Phone performance and gamepad playtesting are still separate validation steps; this implementation targets the current PC prototype.

**Surveyed terrain** is still open. The original southwest uses a 34 m
smoothstep grade over 640 m east-west and 500 m north-south. Its historical
63-street critique measured positive grades on 41 streets, steepest 8% on
Yesler Way. V4 retains that grade and adds three compact hill profiles from
the shared terrain JSON. Those old measurements do not describe the expanded
city. The critique's grade risk term remains a ramp saturating at 12%.
The height function exists twice: `alderHeight` in
the sim feeds physics, road meshes, traffic, routing and edited building
bases, while `height` in `scripts/build-alder.py` bakes the generated
buildings' bases and the terrain triangles into `alder-data.json`.
Replacing the authored profiles with a baked heightfield sampled by a C1-continuous
(bicubic, not bilinear) lookup carries every runtime consumer at once and
stays deterministic, but the builder must sample the same field and the
buildings must be regenerated, or their bases stay at the old elevations
and float or sink. Candidate sources, all reusable without Google-style
extraction limits:

- **USGS 3DEP lidar DEM**, 1 m, public domain, covers King County. The
  reference source; needs smoothing to a few metres before sampling or the
  roads pick up kerbs and walls as chatter.
- **City of Seattle contours / DEM** on the same ArcGIS open-data platform
  as `source-streets.json`, under the same terms and attribution already
  cited in `assets/maps/alder/README.md`; fits the existing fetch script
  pattern.
- **AWS Terrain Tiles** (Mapzen terrarium), about 10 m in the US, open;
  coarser and simplest to sample if 1 m is more than the arcade surface
  needs.

Google Photorealistic 3D Tiles are not a source: extracting geodata from
them is prohibited by their terms. Two decisions precede the pipeline work:
vertical exaggeration (the 58% / 50% horizontal compression roughly doubles
real grades if elevation is left unscaled, which must be a chosen number),
and whether road surfaces are graded along the centreline and blended
across, as the district's aprons were, rather than sampled raw. Expect the
3.5 m footprint-spread rule to refuse hillside parcels once grades are real.

## Route choice, measured

`pnpm alder:critique` reports whether the slice has anything to learn. The
rule it measures against is "every shortcut has a cost": between two gates,
the faster way should be the riskier way.

- **Risk per street**, from the map data, each 0..1: narrowness (24 m is 0,
  16 m is 1), bends (turn per 100 m or the sharpest corner, over 90 degrees),
  grade (steepest metre over 12%), blind corners as sight distance (below).
  Weights 0.35 / 0.25 / 0.2 / 0.2, a proposal.
- **Reward per leg**, as time, not length: on a grid two ways round a block
  are the same length. A committed pace of 32 m/s, a 90 degree turn costing
  2.5 s, a climb 1 + 1.5 x grade, routed on the line graph so a turn at a
  junction costs and straight-through is free. Width barely touches pace: the
  lane count is the same on a 16 m street, so width lives in risk. With width
  cutting pace to 78%, every narrow street was dominated by construction —
  the model, not the map.
- **The leg's alternative** is the quickest route that shares under 60% of
  the fast route's time once one of its streets is closed. Under 4% apart:
  a twin, no shortcut either way. Within 40%: priced if the fast route is
  the riskier by 0.05, free if it is the safer, even between.

First reading (2026-09-10): 63 streets, 38 nodes, all of them choice points,
no dead ends. 1056 directed legs of 300–1600 m; 77% have an alternative
within 40% of their time; median detour 11%; 250 in the 10–25% sweet spot.
Priced 66, free 254, even 238, twins 250, no choice 248. The arterials win
nearly everywhere: 4th Ave S and 1st Ave are both the fast way and the safe
way. The slice's genuine priced shortcuts are Western Ave (risk 0.63) against
1st Ave, 6th Ave S against 4th Ave S from S Jackson St, and the 2nd Ave /
James St corridor against 1st Ave / Yesler Way — which is where a generator
would put its gates: Harbor Access / Western / 1st, Western / Madison,
Yesler / James. The first blind-corner metric found none: 16 bends over 25
degrees, and the nearest building to any of them is 24 m away. The no-choice
legs are the waterfront: Harbor Way and 1st Ave S to Pike with nothing under
+53%.

**Blind corners as sight distance (2026-09-11).** The first metric counted
building corners within half a width plus 10 m of a bend inside a street's
own polyline. On a grid that is where no turn happens: it found 0 on 108
streets and a fifth of the risk weight was dead. A blind corner is now a
sight distance, at every junction approach as well as at bends: how far
before the corner a driver first sees down the other arm past what stands
on the inside. The sight triangle: at distance d back along the approach,
the line to a point d down the other arm clears a corner whose projection
on the wedge's bisector is p iff d ≤ p / cos(φ/2), φ the interior angle
between the arms; straight on is always open. Blindness is 1 − sight / 60 m,
60 m being the stopping distance from the 32 m/s top speed at about 0.85 g,
a proposal like the other constants. It lives on the `Drive` for the
junction it arrives at, since it belongs to a direction, and `routeRisk`
adds it per drive; a street's own `blind` is now its worst bend's. Measured
on the expanded map: 41 of 216 approaches see the cross street only inside
60 m, the nearest 26.5 m (Yesler Way and 1st Ave S arriving at their
junction, S Holgate St and 4th Ave S at theirs), two mid-street bends under
it (6th Ave S's right angle sees 39 m). The classes moved by a handful of
legs — priced 326 → 334, even 456 → 446 — because the setbacks are what keep
the term small. It is live, and a corner building pulled in to the pavement
is now something the report can see; `pnpm alder:critique` lists the
blindest approaches. `tests/route-choice.test.ts` holds the geometry and
the map facts.

What this says to authoring: the grid has route choice but not shortcuts.
Cut-throughs — diagonals, passages through the larger parcels, an alley that
saves time and costs width — are what turn free legs into priced ones, and
the report will show the count move. Traffic is not scored yet; it is
seeded uniformly per lane length.

### Alleys, where the draw runs out of priced legs (2026-09-11)

The generator's draw, not the leg table, says where a cut-through matters:
for every junction and every way of arriving at it, what the generator
could draw next (in range, ahead by the flow rule, not a hairpin) by class,
weighted by how often 300 seeds actually arrive there. Measured on the
318-edge map: 71 of 625 arrivals had nothing priced or even ahead, and 382
of 1167 draws were made at one — 300 of them the first leg of every race,
because from the grid the run up 1st Ave S has no alternative within 40% at
all (Holgate to Harbor Access is 680 m without a cross street). The next
were S Jackson St & 4th Ave S northbound (27) and Broad St & 5th Ave N (7).

`pnpm alder:critique --try=x1,z1,x2,z2[,width]` scores an alley between
the two junctions nearest those points: the arrivals at either end by class
before and after, and the draw over 300 seeds. Seven candidates were scored.
The SoDo diagonal from Harbor Way & 1st Ave S to S Holgate St & 4th Ave S
took draws at a dead spot from 382 to 59 of ~1180, the priced-or-even share
of the draw from 48% to 62%, and first legs with a choice from 0 to 196 of
300, displacing two warehouse plots. The downtown diagonal from 4th & Madison
to Union & 2nd fixed its own corner (the northbound 4th Ave arrival from 1
priced leg to 12) but moved nothing globally and created a dead spot at 1st &
Union; a Pioneer Square cut and a second SoDo diagonal added nothing either.
One alley was drawn: **Freight Cut**, 255 m, 8 m wide, one lane each way, in
`assets/maps/alder/alleys.json`. Alleys are noded only among themselves and
join the grid at existing junctions, with their own id prefix (`sea-alley-`)
so the extension's ids stay put; the builder drops the pinned plots an alley
cuts through, and the released-plot pin allows exactly that. The lane model's
alley class carries it (`kind` from width ≤ 10 m). `tests/alleys.test.ts`
holds the geometry, the before-and-after at the grid, the draw over 60 seeds,
and the rival driving a generated race through it in traffic. What remains:
Harbor Access & 1st Ave S northbound (21 of the 59), which is the same SoDo
funnel one junction on, and would need a released street split mid-block.

## Generated races

The flash draws a new race every time. `src/sim/race-generator.ts` takes the
same graph the critique measures, starts at the junction the race grid on
1st Ave S leads to, and draws three to five gates at junctions: each next
gate is chosen among the legs 12–40 s away whose fastest route reuses no
street already driven, weighted by the leg's class — priced 4, even 1.5,
free 0.5, twin 0.3, none 0.4, plus 1.5 for a detour in the 10–25% sweet
spot — until the race is 45–160 s long. The seed drives every draw through
the traffic's integer hash, so `?race=gen-<seed>` is the race and the same
seed is the same race. The rival's line is the streets of every leg in the
direction they are driven, joined at the junctions they share, with the
approach from the grid before the first gate and one street past the finish,
and its gates are the junction vertices every arm's points contain exactly.
The race is named after its first and last gates: "Jackson to Holgate".

First reading: 60 of 60 seeds draw; races average 3.6 gates and 90–130 s;
the weighting takes the share of priced-or-even legs from 27% (uniform) to
54%; six of six generated races driven by the rival in normal traffic
finished with no recoveries and no resets, straying at most 14 m from a
centreline. Sound to Sky remains the authored race and the fixture for the
rival tests.

**The flow rule (2026-09-11).** Playtesting found races that sent you north
to a gate and straight back south across the map to the next. Measured over
300 seeds: 23% of legs led to a gate more than 120° behind the heading the
last one was reached on, 9% more than 150° behind, 205 races in 300 had at
least one such gate, and Yesler & James's Y — the slice's one hairpin
junction — sent 32 races out of a gate at over 150°. The cause is the draw,
not the map: legs are routed with a free first exit and chained at a gate
without looking at the arrival heading, and the class weights kept pulling
the race back towards the few priced corridors. The rule: the next gate
lies within 120° of the arrival heading and the leg's first street leaves
within 135°. Its cost, measured: priced-or-even legs fall from 53% to 39%
of the draw (uniform 26%, so the weighting still lifts it; 35% once junction
sight entered the risk and moved the classes near the grid), 60 of 60 seeds
draw, at least 26 of 30 seeds are distinct, and every seed now draws a
different race than before. The expanded map has a second hairpin junction,
Broad St & 5th Ave N on the campus loop at 170°, which the turn rule also
refuses. A soft falloff kept three more points of
choice but can only be asserted statistically; a hard rule is one a test
can state. A leg's time is still the table's, routed with a free first
exit, so the turn at the gate (under 5 s) is not in it.

**Gate arrows.** A checkpoint carries the direction the reference route
leaves it: `withExits` in `rival.ts` reads it from the rival's line 6 m
past the gate when `createSim` pairs a race with its rival, so the authored
race and the generated ones get it the same way and the fact is kept once.
The finish has none, which is how it looks different. The direction is
absolute, along the exit street, because the sim cannot know which way the
player arrives, and it is a hint: open racing has no wrong way. The beacon
draws it as a sign: a 9 m arrow floating 8 m up inside the column that
faces the camera and turns in its own plane, up for straight on, left or
right for a turn, the way the minimap chevron turns with the heading; the
minimap ring grows a tick the same way. An arrow lying in the world was
tried first, flat on the road and then as a floating slab, and from the
chase camera an arrow pointing away from you is a sliver or a box.
Projecting the sim's direction into the view is presentation, not a
decision. One data quirk it found: 4th Ave begins with a 4 m stub 12° off
its line, so the routing's first-segment direction is the noisier of the
two and the 6 m chord is the better arrow.

A race starts where the flash was (2026-09-11): the pose is snapped to the
right-hand lane of its street, facing the way it was going and 15 m short of
the junction ahead, carried across the page transition as `?start=x,z,heading`
and snapped again on load; the generator's origin is the junction ahead of
it, the rival starts 7 m ahead in the other lane in the start's own frame,
and the race's identity is (world version, race id, start), the id being
the seed plus its variant (`gen-<seed>[-circuit|-unordered]`, which a flash
draws from the seed and a link may name outright). Today the rival
cruises the freight block, so a flash happens on 1st Ave S, Holgate or 4th Ave
S in either direction; the mechanism is what makes a cruise route anywhere
in the city a start anywhere in the city. `tests/race-start.test.ts` snaps,
round-trips the URL, draws from Pike St, Queen Anne Climb, Freight Cut and
4th Ave S southbound, and drives a race from the hill to the finish in traffic.
Not yet: rivals biasing the draw towards their own streets, saved playlists,
and rivals learning the player's line per street.


## First racing rival

Sound to Sky starts with one AI opponent in Moth's Kestrel rally hatch; the drag
event fields Rivet's Hammer instead (`raceOpponentCar` in `src/main.ts`). Both
use the existing four-wheel forces and share one Rapier world. The rival's
drivetrain comes from its own `RivalDefinition`, independently of whichever car
the player brings. Each of Moth's now declares AWD to match the Kestrel body,
as Rivet's has always declared RWD for the Hammer. Nothing derives one from the
other, so `tests/cars.test.ts` holds every rival to `CAR_DRIVETRAIN`: an
undeclared drivetrain is not neutral, it silently means FWD, which is what Moth
raced a rally hatch on until 2026-09-12.

In free roam, the opponent starts on First Avenue S
just north of Wharf Garage and repeats the local First/Holgate/Fourth freight-block
loop defined in `src/sim/encounter.ts`. The line follows shared street geometry,
offset into the right-hand lane, with a 10 m/s (22 mph) target ceiling. It uses the
same physical driver, traffic avoidance, reversing and 12-second local reset as
the racing rival. Its red minimap dot follows its physical position; it remains
a solid car and can be pushed. This is one neighborhood route, not citywide wandering.

Within 32 metres, below 12 m/s and at the same elevation, **F / X–Square** flashes
the headlights and accepts a challenge. Both bindings are remappable; older
saved controls keep their mappings and receive an unused flash binding. The
nearby prompt also works by click. A double flash precedes the page transition
to a generated race's grid/countdown, preserving the selected player/opponent bodies.
Pause freezes the transition. **Return to free roam** in the pause menu
reopens Port Alder at Wharf Garage with the cruising opponent restored. This
encounter draws a generated race.
Sound to Sky remains available as the authored menu race.

`src/sim/alder-rival.ts` defines a continuous preferred line through all four
gates. The player remains free to choose any route. `src/sim/rival.ts` controls
throttle, brake and steering with corner-speed previews, local traffic offsets,
and reversing/rejoining after a stall.

**It races the player (2026-09-13).** Until then the player was handed to the
rival as one more obstacle, the same as traffic: alongside, it moved about 3.8 m
away and braked to let the player through, and on a street too narrow to dodge
it braked behind a player holding the middle. Shawn's read of MC3 and NFS:
Underground was that the missing piece is a desire to win. A racing rival now
takes the player as its opponent (`RIVAL_RACING` in `src/sim/rival.ts`):

- **Behind:** it takes the side the player is not covering and does not brake
  for them; if the gap shuts, that is contact.
- **Alongside:** it holds its line and stays on the throttle.
- **Ahead and being caught** within 25 m: it eases across to cover the
  player's side, at most 0.8 of the room there and 1.8 m/s laterally, and not
  while braking for a corner.
- **Contact:** it does not lift.

A player stopped or crawling below 4 m/s is in the way rather than racing, and
is still avoided and slowed for, as traffic always is. Nothing reads race
position, so it does not drive harder when losing, and nothing changes its
grip, mass or top speed. The cruising encounter is not racing and still yields.
`tests/rival-racing.test.ts` covers each case on a straight road; four of its six
checks fail against the old rival (the other two, passing with room and
avoiding a parked player, are behaviour it already had and must keep). A bump at
40 m/s with the player steering in launches neither car. Per-rival aggression
(Bollard's squeeze into traffic, Deuce's commitment) is not built.

**Traffic, judged by where it will be (2026-09-13).** The rival slowed for any
car within 5 m of its line ahead, at that car's speed along the line. A car
crossing a junction ahead has none, so it braked for cars that would be gone
before it arrived, and it matched slower cars it had room to pass. Each car is
now judged by its offset across the line when the rival reaches it: a crossing
or oncoming car is slowed for only if it will be in the way then, and a
same-direction car is passed on a clear side, queued behind only with both
sides taken or already on its bumper. Measured on Sound to Sky with the player
parked:

| | Race time | Under 8 m/s | Contact with traffic |
|---|---|---|---|
| No traffic | 169.9 s | 22.6 s | 0 ticks |
| Traffic, before | 188.7 s | 39.0 s | 118 ticks |
| Traffic, after | 182.3 s | 28.3 s | 30 ticks |

Of the slowdowns still caused by traffic, 90% are oncoming cars (513 ticks
against 59 for crossing ones). Swerving round them instead was tried and was
worse (187.2 s, 119 contact ticks) and is not shipped. The cause is the line:
rival routes run down the street's centreline (`rivalLineFor`, `alder-rival.ts`),
so an oncoming car in its own lane is often genuinely in the rival's way.
Driving its own lane is the next fix. Separately, even on empty streets the
rival spent 66 s of 170 braking: it planned corners at 62% of its grip and 5 m/s²
of braking. That was corner commitment, not traffic, and it was tuned from
recorded laps the same day (below: **Cornering, tuned to recorded laps**). Racing uses the player's shared 62.6 m/s
(140 mph) speed ceiling, with full throttle available on clear straights. The
corner preview extends with stopping distance instead of ending at 100 metres;
traffic, bends and recovery still lower the target speed. The 10 m/s local cruise
limit is separate. After 12 seconds without gaining another
4 metres of forward route progress, the sim can reset it at rest on nearby clear
road. It keeps its race clock and checkpoints, stays behind the next gate, and
retries once per second if local placements are occupied. This recovery follows
its own route position, with no catch-up speed boost or grip change.
Start/reset reconstructs
both cars and AI state; Pause and Controls pause both racers.

The HUD shows position, a red minimap dot and opponent finish status. Position
uses checkpoint progress, then distance to the next gate; it is an approximation
between gates, not a predicted finishing order. A finished rival brakes to a stop.
When the player finishes a rival race, the results menu pauses the simulation,
shows position and elapsed time, and offers **Return to free roam** or **Go to
garage**. Both destinations reload without race parameters and retain the selected
car and customization. Free roam starts outside Wharf Garage; garage
opens its customization view. Pause/back cannot accidentally resume the completed
race. A rival finishing first does not interrupt the player's remaining gates.

Validation covers a complete race in normal traffic, a parked player and forced
spin, escaping a small unexpected barrier, physical player/rival contact,
timed fallback recovery, blocked placements, checkpoint preservation, and
identical reset state/world snapshots. Browser checks cover both car pairings,
garage changes, countdown, pause/restart, full-race completion and free-roam
isolation. This is the first driver, not general city navigation: aggressive
player blocking, repeated pileups and unusual off-route recoveries need driving
feedback. Moving encounters and rival personalities remain future work.


## Ridge Circuit (2026-09-13)

An official circuit on the open ground east of Ridge Scenic Way, reached by
continuing Pine East about 200 m (`src/sim/arena.ts`; the name is a working
one and lives in `ARENA.name`). It exists to be driven the same way many
times: laps the player records here are to teach the rival corner speeds,
braking points and lines, and the circuit becomes events and progression
afterwards. The code handle is `arena`, so a rename is a display change.

**One facility, three layouts,** all run anticlockwise. Each layout is a closed
polygon of named corners rounded to a radius, so a layout closes by
construction and a corner two layouts share is the same asphalt in both. A link
road down the middle splits a flat east half from a west half on Madrona
Ridge's slope.

| Layout | Race id | Lap | Height | Gates per lap |
|---|---|---|---|---|
| Full | `arena-full` | 2,546 m | 36–53 m | 7 |
| East | `arena-east` | 1,924 m | flat | 5 |
| Ridge | `arena-ridge` | 1,612 m | 36–53 m | 5 |

What each corner is for, as data:

- **T1 hairpin** (two 90s, r22) at the end of the 600 m main straight: the braking point from top speed, on the flat.
- **T2** (r26), then 150 m of straight into the **esses**: a chicane 40 m across in 60 m (r20, r18, r20), a braking point and a change of direction. Revision 1's esses, 18 m across straight after T2, were taken flat on the first recorded laps while the rival braked to 30 mph for them; circuit revision 2 (`ARENA.revision`) replaced them.
- **Ridge 90** (T5, r55): a medium-speed corner at the top of a 4% climb.
- **The Jog** (r16, back to back): the city problem, where the exit of one 90 is the entry to the next.
- **The Drop** (r120): fast, with the road falling away through the exit, then a flat-or-not **kink** (r250).
- **T9**: tightens from r150 to r40 onto the main straight, so braking carries into the turn.
- **The link road's junctions** (r20): flat street-style 90s, for the East and Ridge layouts.

**Open edges, as the product direction says.** No barriers and no colliders.
The racing width is 14 m between white edge lines, with a 1.5 m paved shoulder
beyond each (where the kerbs sit); past the shoulder is ground, which costs a
2WD car grip and pace as it does anywhere (`alderGround`). Gates sit on the
track (radius 12 m) and are spaced so cutting the infield skips one. Lap
invalidation for a recorder, if a lap leaves the track for too long, belongs to
the recorder and is not built.

**Surface.** The laps and the access road are `ARENA_ROADS` in `alder.ts`:
not streets, so no traffic, no routing and no kerb props, but part of
`projectOntoAlder`, so a slope pulls along the track rather than along
whichever street is nearest. Height is the city's own `alderHeight`; nothing
was added to `alder-data.json`. A crest was considered and dropped: the car is
held to the surface every tick, so a crest would be drawn and never felt. The
slope is felt as grade force only, about 0.4–0.5 m/s² at 4–5%.

**Races.** `?race=arena-full|arena-east|arena-ridge&scene=track` starts a
three-lap race on the grid (`src/sim/arena-events.ts`): the player 12 m behind
the line on the right, the rival 5 m behind on the left. Add `-solo`
(`arena-full-solo`) for the same race with nobody else on the circuit, so a
recorded lap is the player's alone; it ends on a session summary with the best
valid lap. City traffic is off for these races. The rival drives a racing line
(below). From a standing start, one lap with the player parked
(`tests/arena.test.ts`): **Full 80.0 s, East 61.5 s, Ridge 51.2 s,** no
resets, no recoveries, never on the grass (on the centreline as first built:
100.8, 78.8 and 66.4 s; with the chicane and tuned cornering: 86.0, 66.0 and
54.3 s). There is no way to reach these races
from free roam yet; the circuit itself is open to drive.

**Drawn** by `src/render/arena.ts`: asphalt to the shoulder, edge lines that stop
at junction mouths, red and white kerbs on corners of r60 or tighter (none on a
side that crosses another road), a chequered line at each start, lamps every
55 m with pools of light, and a gantry at the main line. About 16k triangles in
local meshes, so they cull on their own bounds. The outskirts ground now
reaches 300 m past the circuit. Both maps draw it and widen to include it, and
saved positions there are valid (`ALDER_DRIVE_BOUNDS`). The world identity
gains `-arena-v1`, so free-roam saves from before it return to Wharf Garage once.

**Lap recording (2026-09-13).** Every circuit race, solo or not, records the
player (`src/sim/lap-recorder.ts`). It observes the sim and changes nothing: fed
each tick's input and the state that tick left, it keeps the whole input log
unrounded and, per lap, one rounded telemetry sample a tick (position, heading,
speed, lateral speed, yaw, the pedals and wheel, tyres on the ground, distance
round the centreline and offset from it). Laps end where the race's gates end
them. A lap is invalid, and says why, with any tick fully past the paved
shoulder, more than a second with any tyre past it, or running backwards more
than 20 m. After each lap the session is saved through a dev-server endpoint
(`scripts/laps-server.mjs`, like the editor's) to `recordings/laps/`, which git
ignores: it is the player's driving, about a megabyte for three laps of Ridge.
A reset or car change starts a new session, because it breaks the input log.

The input log with the session's identity reproduces the run, and
`src/sim/lap-replay.ts` checks it: it refuses a file from another world,
circuit revision (`ARENA_IDENTITY`; the world id does not change when only the
circuit does) or physics revision, replays the rest and compares every lap. `pnpm laps` lists
sessions; `--verify` replays them. Executed on 2026-09-13: a three-lap solo run
of Ridge driven in Chrome by a scripted digital-input lap (`__ns.drive`) saved,
showed its summary (1:15.92, 1:11.30, 1:11.35, all valid) and replayed exactly in
Node. That is one machine and two V8 hosts, not cross-browser parity. Format:
`recordings/README.md`.

**Cornering, tuned to recorded laps (2026-09-13).** Shawn's first session, three
laps of Full in the RWD Cinder (best 1:07.17, revision 1), set against a flying
lap by the rival on the same layout (1:37.98), corner by corner:

| | Player | Rival, before | Rival, after |
|---|---|---|---|
| Lateral grip used at the apexes | 74–82% | 19–43% | 60–64% |
| Braking into T1 | 9.6 m/s², from 106 m | 4.8 m/s², lifting 320 m out | 9.3 m/s², from 164 m |
| Apex speed, T1 / T5 / Jog / T9 | 33 / 54 / 37 / 71 mph | 26 / 39 / 22 / 34 | 31 / 48 / 27 / 41 |
| Path radius, T2 / Jog / T9 | 39 / 25 / 84 m | centreline 26 / 16 / 37 | centreline |

`RIVAL_CORNERING` in `src/sim/rival.ts` was 0.62 of the line's grip-limited
speed, 5 m/s² of planned braking and a 12 m margin; it is now 0.76, 10 and 6.
Swept on all three layouts (flying laps) and Sound to Sky in traffic:

| Setting | Full | East | Ridge | Sound to Sky | Worst excursion |
|---|---|---|---|---|---|
| 0.62, 5, 12 (before) | 102.2 s | 78.6 s | 63.9 s | 182.3 s | 6.1 m off the street |
| braking only: 0.62, 10, 12 | 95.3 | 72.2 | 58.8 | 161.8 | clean |
| 0.76, 10, 6 (shipped) | 83.1 | 63.1 | 51.5 | 143.1 | clean; 6.3 m off Full's centreline |
| 0.80, 10, 12 | 83.3 | 63.6 | 51.7 | 153.9 | 7.1 m, on the edge line |
| 0.82, 10, 12 | 82.3 | 63.0 | 51.1 | 164.0 | grass on Full, 19.8 m wide in the city |
| 0.85, 8, 12 | 82.7 | 63.5 | 51.6 | 161.3 | grass on Full |

Braking was safe to match in full. Corner speed was not: past about 0.8 the
rival overshoots the reverse bend after Full's south junction and a city corner,
because it steers a centreline with a lagging controller. 0.74, 0.76 and 0.78
were all clean, so 0.76 keeps a margin below the failure. Sound to Sky also lost
its traffic contact (0 ticks, from 30) at the new speed. The sharp-corner check
in `tests/rival-speed.test.ts` now enters at 20.4 m/s where it entered at 15.7,
braking from 179 m and never more than 2.9 m off the centreline.

What was left was the line, not commitment: where the player's path and the
centreline have the same radius (T1, T5) the rival was within 6–11% of the
player's apex speed; where the player widens the corner (T2, the Jog, T9) it was
27–42% slower. One session of one driver in one car is thin evidence; more
sessions, the other layouts and an AWD car would show whether 0.76 generalises.

**The racing line and the trigger (2026-09-13).** A second session on circuit
revision 2 (1:16.15, 1:13.37, 1:12.43, all valid, replaying exactly) agreed with
the first at every unchanged corner to within 3 mph, braking for T1 at 106 m
both times, so the numbers are repeatable. It also showed the throttle trigger
never read above 231–232/255 in either session while the brake reached 255/255:
the car had never had full throttle. `triggerValue` in `src/input/input.ts` now
passes a trigger through unchanged up to 0.5 and stretches the rest so 0.88 and
above is full. What that cost the recorded laps is unmeasured: replaying them
with more throttle changes every braking point after it and leaves the road.

On Ridge Circuit the rival drives a racing line instead of its centreline
(`src/sim/racing-line.ts`, applied in `arena-events.ts`). The first version was
a smoothed path 2.5 m inside the edge lines. Every line tried on Sound to Sky ran
into traffic (143 to 1,862 ticks of contact against none), so streets keep the
centreline until a line knows the lanes.

**Braking while turning, and a correction (2026-09-13).** The first version's
notes said a true minimum-curvature line (Coulom's K1999) lapped Full in 69–75 s
but left the road at every setting. That measurement was wrong: the script drew
a line through a route that already carried one, doubling the offsets, so the
rival was driving up to 5 m from where the line should have been. Measured once,
the same line 2.5 m from the edges was clean. What put a wider line on the grass
was then traced properly, at T9 on East at about 100 mph:

- **Steering.** The rival steered on heading error alone, and an error-only
  controller holds a steady curve only by being off the line: the steering a
  bend needs comes from the error that makes it, 3–6 m outward at that speed.
  It now steers for the line's curvature first (`RIVAL_STEERING.feedforward`,
  the wheel angle the curvature needs as a share of the lock allowed at speed)
  and corrects with the error. That was the fix.
- **Braking.** The braking plan assumed a straight all the way to a corner. It is
  now a speed profile worked back from the corner in which cornering takes its
  share of the grip first (`RIVAL_CORNERING.frictionShare`), so the rival brakes
  before a curve rather than in it.
- **The outside of a bend.** A rival that errs, errs wide, so the line keeps
  2.5 m more from the edge on the outside of a bend (`RACING_LINE.outsideMargin`).
- **A test artefact, found on the way.** The measuring script left the player
  parked on the grid, where a wide line passes on the second lap; the rival braked
  to nothing for a stopped car at 105 mph and spun. The player now waits in the
  infield in the script and in `tests/arena.test.ts`.

Shipped: the line 2.6 m from the edges, 2.5 m more on the outside of bends,
feedforward 0.8, friction share 0.9. Flying laps over three-lap races, with no
grass, resets or recoveries:

| | Centreline | Smoothed line | Full line | Player, best |
|---|---|---|---|---|
| Full | 83.1 s | 78.5 s | 72.8 s | 72.4 s |
| East | 63.1 s | 59.8 s | 55.2 s | — |
| Ridge | 51.5 s | 48.6 s | 46.3 s | — |

Standing laps: Full 75.3 s (the player's first lap was 76.15), East 58.2, Ridge
48.8. Every neighbouring setting was also clean: edge margin 2.2 to 3.0, outside
margin 2.0 to 3.5, feedforward 0.7 to 0.9, friction share 0.8 to 1.0, corner speed
0.80 (Full 71.0 s). Taking one ingredient out at a time: without feedforward Full
and East went onto the grass, without the outside margin East did, and without
the braking plan the laps were clean and 0.3 s faster, so the braking plan widens
the margin rather than being the fix. The line's tightest radii now match the
recorded laps: T2 37 m (player 39–41), the Jog 25 (25–26), T5 62 (70), T9's exit
82 (83–84). Feedforward is off on street centrelines: they turn at their
polyline's corners, where the curvature it reads is a sampling artefact, and
with it on a generated race put the rival 31 m off the street. Sound to Sky, still
on its centreline and now braking before curves: 144.8 s (from 143.1), no traffic
contact. The rival no longer needs the player to make a
mistake to win on the circuit; it is within half a second of Shawn's best lap.

**Lost, or just wide (2026-09-13).** In the first race against the full line
(Shawn won by about 2 s after taking nearly all of lap 2 to get past), the
replay showed the rival losing 1.5 s in one moment. Shawn passed it at the
Drop; it went for the re-pass, gave it up when Shawn pulled ahead, and swung its
aim back to the line at about 4 m/s across. At 95 mph the car could not follow,
drifted 6.5 m from its line (still 4 m inside the edge), and the old rule that a
rival more than 5 m from its route is lost held it to 10 m/s: full brake at full
lock, 95 to 59 mph into the kink. On a racing line, lost now means off the road,
more than `OFF_ROAD_MARGIN` (1.5 m) past the carriageway; street centrelines keep
the 5 m rule. Re-running Shawn's recorded inputs against the fixed rival, the cap
never fires and it is 1.0 s behind after lap 2 instead of 2.0, but that re-run is
only a hint: recorded inputs do not react to a rival in a different place.

**Braking later and harder (2026-09-13).** In the next race the rival looked slow
off the line. The launch was fine; it was already braking for T1, 164 m out at
0.60 pedal, slowing at 8.8 m/s², where Shawn brakes at about 120 m. Two causes.
The brake answered only excess speed, `(speed − target) / 5`, so it pressed once
the car was already over its plan: it rode 3–5 m/s above a 10 m/s² plan and
slowed at about 7. And the plan itself was 10 m/s². On a racing line
(`RIVAL_BRAKING`), the plan is now 14 m/s² with a friction share of 0.6, and where
it falls at 12 m/s² or more the rival stays flat out until it reaches the plan,
then brakes as hard as the plan falls, less what drag already takes, plus a full
pedal per 3 m/s over it. Flying laps over three-lap races, no traffic:

| | Before | After |
|---|---|---|
| T1 on Full: braking point | 164 m | 144 m |
| T1: deceleration, peak pedal | 8.8 m/s², 0.60 | 11.3 m/s², 0.97 |
| T1: slowest | 33 mph | 33 mph |
| Full / East / Ridge | 72.0 / 55.2 / 46.3 s | 71.8 / 54.9 / 46.2 s |

It brakes where a driver would now and is barely faster: the slowest point of
each corner did not move, so the time is only what the braking zones give back.

Swept at zone 12: plan 13 to 15 m/s² at share 0.6, and share 0.5 to 0.7 at 14,
were all clean; share 0.75 put East on the grass for 13 ticks and 0.9 for 30.
Zone 9 to 13 were clean at 14 and 0.6. What did not work: the riding brake on the
old 10 m/s² plan braked earlier (187 m out) and lost 1.4 s on Full, because
following a gentle plan faithfully is slower than lagging it; and riding the plan
wherever it fell (zone 3) was a second slower on Full than zone 12, because the
lag had been carrying speed into gentle entries and through the chicane.

**Not on streets.** Sound to Sky and gen-3 were fine with it (144.0 and 102.8 s,
no contact), but the full suite failed two street races for straying past 16 m.
Twelve races in traffic (Sound to Sky, the Queen Anne Climb start, generated
seeds 1–10), rival alone:

| Street braking | Total | Worst | Past 16 m |
|---|---|---|---|
| The new braking | 1,241.8 s | 17.3 m | 4 |
| The harder plan, old brake | 1,178.4 s | 24.1 m, a reset | 2 |
| **The old braking (shipped)** | 1,202.4 s | 13.3 m | 0 |

In both traced failures the rival was braking hard for traffic at a junction:
on Freight Cut it stopped where it was hit and looped off the street, and from
Queen Anne Climb it ended on full lock circling its target. Three of the four
reached exactly 16.9 m, which looks like one spot (not traced). Streets keep the
old plan and brake. `tests/arena.test.ts` holds T1's braking point on Full and East.

**A known trait: T9 (2026-09-13).** Left in on purpose. In the first race
against `full-line-v3` Shawn trailed for 205 of 218 s, made two passes with
contact that the rival undid within 3 s (the last bend on lap 2, T1 on lap 3),
and won by about 0.4 s with a clean pass into T9 on the last lap, braking about
100 m later than the rival. Driving alone, the rival brakes the same way every
lap:

| T9 into the last bend, Full | Starts braking | Peak pedal | Slowest |
|---|---|---|---|
| Rival, alone, laps 1–3 | 57 m before T9 | 0.82–0.85 | 58 mph |
| Shawn, best lap (70.67 s) | 23 m before | 1.00 | 71 mph |
| Shawn, the passing lap | 14 m into T9 | 1.00 | 65 mph |

Likely cause, not traced: T9 into the last bend is a braked-in-a-curve zone that
slows at under `RIVAL_BRAKING.zone` (12 m/s²), so the old reactive brake drives
it, and the last bend's corner speed is `speedFactor` 0.76. It is not fixed
because the race was close with it (Shawn a second a lap quicker at his best,
the rival 71.7 s), it is the one clean passing place found so far with no
slipstream, and a rival that is weaker in medium braking zones is a difficulty
knob the Blacklist will need, not a bug. Fixing it means lowering the zone or
tuning medium zones separately, re-sweeping the layouts and the street batch.
Lap recordings with a rival name the driver raced (`RIVAL_REVISION`) and replay
refuses another. Not built: extracting features from recordings automatically,
and the rival learning from them per street.

`tests/arena.test.ts` pins each lap's length (a moved corner makes recorded laps
incomparable), checks the site is clear of buildings, trees and street
pavements, that the drawn asphalt is the paved width the tyres feel, that every
gate lies on the rival's line, and drives the rival round all three layouts.


## Uptown Circuit (2026-09-13)

Working name. A three-lap race round 3 km of Uptown's own streets, recorded lap
by lap the way Ridge Circuit is, so the street rival can be measured against laps
Shawn drove rather than guessed at (`src/sim/street-circuit.ts`).

**Why a new race.** Ridge Circuit got the rival to Shawn's pace, but the rival's
weakness is the street (below), and there were no recorded street laps to tune
from. Sound to Sky was the obvious race and was ruled out: its markers sit at the
middle vertex of whichever street segment comes first in the data with that name,
not where anyone chose (Harbor Way's is mid-block, 677 m from a junction; the
finish is 367 m after the gate before it), and it is the rival tests' fixture. A
generated circuit was ruled out too: near the grid they run 6-7 km a lap, and a
generated race is only as stable as the generator. The flow rule changed the race
every seed draws, which would have orphaned every recording made on one. So the
loop is authored, a list of streets in driven order, and pinned.

**Chosen from every loop.** A search of the routing graph found 101,597 loops of
1.8-3 km that obey the generator's turn rule (135°), scored for variety (turn
count, sharp and open turns, street classes, climb, a long straight), with a
diversity pass so candidates did not share a quarter of their streets. Shawn
picked from four drawn on a map. Uptown:

- Uptown Link's 520 m straight climbing 28 m, the line 120 m along it.
- Broadway, Market Arcade (12 m, local), 12th Avenue, Thomas Street, 23rd Avenue,
  Harrison Terrace, Broadway, then Highland Drive and Dexter Way descending into a
  129° hairpin back onto Uptown Link.
- Ten turns: 58, 72, 64, 80, 67, 84, 98, 79, 52 and 129°. Streets 12-20 m wide.

**Gates.** One at every turn, 20 m radius as generated races use, and the line.
Between turns the city has other ways round (Thomas Street runs straight from
Uptown Link to 23rd Avenue), and a lap through one is not a lap of this circuit.
Only the next gate shows, with its arrow; the arrows come from the route even
solo, since on streets a solo lap needs to know where to turn.

**Races.** `?scene=track&race=street-uptown` in traffic; `-clear` for empty
streets, `-solo` for no rival (`street-uptown-clear-solo`). The grid is 12 m
behind the line in the kerb lane going the circuit's way, the rival 7 m ahead in
the inner lane. Recording, saving, `pnpm laps` and `--verify` are Ridge Circuit's
(`circuits.ts` resolves either); a session names the circuit (`uptown-v1`) and
whether traffic was on, and replay rebuilds the traffic with the world. Traffic
has no revision of its own, so a change to traffic makes an old session in
traffic stop reproducing rather than be refused by name.

**The rival there, first measured** (its centreline, AWD, player out of the way):

| | Lap 1 | Lap 2 | Lap 3 | |
|---|---|---|---|---|
| Clear streets | 101.2 s | 99.1 s | 99.1 s | no grass, no resets |
| Traffic | 100.9 s | 100.0 s | 124.9 s, invalid | 75 ticks of contact, 15.2 m off the street |

`tests/street-circuit.test.ts` pins the lap (2,977.24 m), the turns and gates, the
four variants and their grid, and replays a lap driven through traffic exactly.

**The street rival, measured before any of it** (twelve races in traffic: Sound
to Sky, the Queen Anne Climb start, generated seeds 1-10; each also run on empty
streets). Where the time goes:

- **Junction turns.** 74 turns of more than 50°. The rival's slowest speed through
  them averages 17-22 mph in every race. Likely why (not traced): the centreline
  turns at a vertex, and the rival plans from its curvature sampled 8 m either
  side, which for a right angle is a 5.7 m radius; 0.76 of what holds that is
  15 mph, under the 7 m/s (16 mph) floor. The plan comes from the vertex, not the
  road's width. The 120 m around each turn adds up to 404 s of the 1,141 s the
  races take on empty streets (an overstatement: close turns' windows overlap).
- **Traffic** adds 61.5 s over the twelve (5%), mostly in two races (Queen Anne
  +17.5 s, seed 10 +11.0 s). Contact with traffic, 281 ticks: 134 with oncoming
  cars, 81 same-direction, 66 crossing.
- **Losing it.** 14.4 s in the heading-error mode (held to 6 m/s, circling at full
  lock) and 8.3 s held to 10 m/s as lost, concentrated in the same two races. The
  new braking made this worse and was kept off streets ("Not on streets", above).

Inference, to be checked against Uptown recordings: junction turns are the
biggest street pace limit, traffic the second, and the lost/circling modes cause
the failures. Nothing here says how much faster than the rival a player takes
those turns; that is what the recordings are for.

**First recorded laps (2026-09-13).** Shawn, clear streets, solo, RWD Cinder:
86.83 s standing, then 80.73 and 81.07 s, both invalid for cutting junction corners
past the pavement (up to seven of the ten turns, twice with all four wheels off).
The rival alone, AWD Kestrel: 99.08 s. Averaged over the two flying laps, the
160 m round each turn is 16.1 s of the 18.2 s gap. At every turn the rival is
slowest 5 m short of the junction at 18-25 mph on a 9-20 m radius, usually
already braking 250 m out; Shawn is slowest at 41-58 mph through the square
turns on 35-95 m radii and 79-86 mph through the two open ones, using 4-9 m of
the junction and the handbrake in eight turns. Top speeds on the straights are
within a few mph. Cutting did not buy consistent time: at most turns a clean
pass was his fastest or a cut one his slowest; only Broadway & Market Arcade
shows a clear gain (about 0.5 s). Track limits on streets stay as they are; laps
invalid for cutting are still read, with the cutting noted. Next: laps against
the rival and in traffic, before any tuning.

**Against the rival, and in traffic (2026-09-13).** One session each, all
replaying exactly. Shawn (RWD Cinder): clear against the rival 86.83 / 83.72 /
84.97 s; traffic solo 90.23 / 88.38 / 84.92 s (the last invalid); traffic against
the rival 85.80 / 85.10 (invalid) / 82.10 s. Traffic cost him little: 19 ticks of
contact in one session, none in the other, 1-3 s under 8 m/s a race, and his best
valid lap came in traffic. He passed the rival at the first turn of both races
(82 mph to its 30 on clear streets) and finished 1.2 km ahead on clear streets
and 2.6 km ahead in traffic.

The rival in traffic: 107.02 s, then 138.97 s, 2,619 ticks of contact with
traffic, 2,522 of them with cars going its way. Traced:

- **Pinned behind a truck for 42 s.** Out of the hairpin on lap 1 it came up behind
  a 7.2 m vehicle doing 11 m/s in the inner lane and pushed it at full throttle,
  its target speed never lowered, until a turn 42 s later. The traffic loop in
  `rivalInput` measures `side` from the car but compares it with
  `driver.avoidance`, an offset from the route. Already 3.8 m right of its route
  to pass, the rival saw the truck 1.2 m to its left as 5.0 m out of its path, so
  it neither slowed nor moved. The passing offset is capped at 3.8 m from the
  centreline, which cannot clear a car in the inner lane (2.7 m) on the kerb
  side, and the clear-side check measures candidates from the car too.
- **The hairpin.** Every lap, clear or not, the 129° hairpin puts its aim more than
  1 rad off its heading, which holds it to 6 m/s for about 97 ticks: its slowest
  there is 14 mph to Shawn's 27.
- **After traffic contact at 12th Avenue & Thomas Street** it spent 284 ticks held
  to 6 m/s at full lock.

**The truck, traffic's plan and indicators (2026-09-13).** Shawn's read of
traffic: turns you cannot predict, and stop-start hesitation at junctions. His
suggestion was to give the rival traffic's driving line. Traffic has one: which
way a car turns is decided by `movementAt` when it enters a lane, and a car with
no claim on a junction stops at its line. A plan only the rival could read would
be an edge over a player who cannot, so the plan is drawn as indicators first.

Shipped:

- **The truck (a bug).** `rivalInput`'s traffic loop compared `side`, measured
  from the car, with `driver.avoidance`, an offset from the route, and chose
  passing sides and checked them for other cars from the car too. Offsets are
  now all from the route (`side + nearestSide`). A pass goes to a gap beside the
  car, 3.2 m centre to centre and no more than 3.8 m off the route (`PASS`); free
  to reach the road's edge it strayed 31.5 m in twelve races.
  `tests/rival-racing.test.ts` has the pinned shape, failing on the old loop.
- **The orbit.** More than a radian off, the rival aimed at a point on its route
  about 10 m ahead; at a right-angle corner that point is inside the tightest
  circle the car can turn (8.4 m at 0.34 rad of lock on a 2.96 m wheelbase), so
  at full lock it circled it, and the point never moved because the car made no
  progress. It now aims 2.5 turning radii along the route. Ridge Circuit's laps
  are unchanged to the tenth: it never triggers there.
- **Indicators (`trafficSignal`).** From 45 m before a junction's line until clear
  of it, a car shows the turn it will make; straight on shows nothing. Left or
  right is which side of the approach the exit lies, read 15 m before the line:
  reading the heading at the line itself, where some lanes already bend, flipped
  a 145° left into a right. `tests/traffic-intent.test.ts` watches two minutes of
  the city's traffic and every car turns the way it signalled. Drawn as amber
  lamps at the corners (`render/traffic.ts`); the sim decides, the renderer
  flashes. Hesitation is not addressed: a car waits at a line because it has no
  reservation yet, and nothing shows that.

Measured over 42 races in traffic (Sound to Sky, the Queen Anne Climb start,
generated seeds 1-40), rival alone:

| Rival | Time | Traffic contact | Circling | Lost | Past 16 m |
|---|---|---|---|---|---|
| Before | 4,211.6 s | 894 ticks | 84.4 s | 61.7 s | 5 races, worst 23.0 m |
| **Shipped** | 4,218.4 s | 630 ticks | 65.1 s | 43.6 s | 3 races, worst 22.9 m |
| + the plan, read on arrival | 4,175.1 s | 1,216 ticks | 56.2 s | 30.5 s | 1 race (seed 3), 21.1 m |
| + not passing a car turning across | 4,269.9 s | 766 ticks | 62.1 s | 29.8 s | 1 race (seed 12), 46.5 m, a reset |

On empty streets the shipped rival is 0.9 s quicker over the 42, worst 6.1 m. On
Uptown Circuit it is mixed: in Shawn's recorded traffic race it no longer pins
itself (320 ticks of traffic contact, laps 103.8 and 99.0 s, against 2,619 and
107.0 and 139.0), and the hairpin holds it 73-79 ticks rather than 97; alone for
three laps in traffic its third lap still leaves the road, as before (16.3 m,
461 ticks of contact, against 15.2 m and 75).

Not shipped, and why:

- **The plan (`forecastTraffic`).** A copy of the car driven forward on its lanes,
  through the movements it holds and then the ones already decided, with the same
  handoff slide, stopping at the line of any junction it has no claim to. It steps
  0.1 s on a lane and a tick across a lane change (0.1 s throughout started the
  slide from the wrong place, 1.2 m off after two seconds), and the test holds it
  to real traffic: every car that kept its speed within 0.25 m after 2 s, turns
  included, and a car with no claim stopped at its line. Read where the rival
  would reach each car it was best over the 42 races, but on seed 3, which
  `tests/race-generator.test.ts` pins, it caught a box truck at 100 mph just as
  the truck reached its junction, read it as clear, and hit it as it swung left
  across the street. Not passing a car forecast to turn across fixed seed 3 and
  cost 58 s over the 42 and a 46.5 m stray on seed 12; sweeping the whole
  approach and braking for every predicted crossing hit more traffic, leaving the
  rival slow in junctions traffic does not yield in. The code and its test stay
  in `traffic.ts`; the rival does not read it.
- **Traffic sees neither car.** On seed 15 a rival slowed to turn into a one-lane
  street was pushed 604 ticks by the sedan behind. Traffic that reacts to cars in
  its lane is a traffic design change, not made.

Single races in traffic are chaotic: two runs that should behave alike differed by
20 s over twelve races. No variant was judged on fewer than twelve, and the
choice on these 42. Still open: the block and pass against the player
(`RIVAL_RACING`) take `side` from the car; it shaped Ridge Circuit's racing and
is left for a measured change of its own.

**Traffic that sees racers, and brake lights (2026-09-13).** Every rival failure
traced in traffic came back to traffic being blind to it: shoved down a one-lane
street, a truck turning across it, a crossing car into it. So traffic now yields
to the cars it does not drive, the player, the rival and the parked rivals
(`TrafficRacer`, `TRAFFIC_REVISION` "traffic-v2"), and stays a solid kinematic
hazard nothing can push:

- **It follows a racer going its way** in its lane or the exit it will take, as
  it follows its own kind, measured along the lane.
- **It does not claim a junction** a racer on the move is in, or will cross on
  its present course before the car could be clear.
- **Brake lights**: a car slowing by more than 1 m/s², or held at a standstill,
  lights brighter tail lamps and a high third lamp (`braking`). That is the
  readable half of the stop-start hesitation: a car waiting at a line for its
  turn shows brakes, and its indicator if it is turning.

Yielding has to run one way. The rival already waits for traffic in its path, and
every way traffic also waited for the rival made a standoff somewhere: stopping
for a racer crossing its lane put a car inside a junction in the rival's path
while it waited for the rival (seed 13); stopping head-on to a rival on the
centreline, or holding a junction for a rival stopped in it, left both waiting
(seeds 2 and 5). So traffic follows only racers going its way, and holds
junctions only for racers moving faster than 3 m/s.

Measured, rival alone, over the same 42 races, each part alone and together:

| Traffic | Time | Contact | Circling | Lost | Past 16 m | Reversals | Uptown |
|---|---|---|---|---|---|---|---|
| Blind (before) | 4,218.4 s | 630 | 65.1 s | 43.6 s | 3 | 0 | 441 contact, 16.3 m |
| Follows racers | 4,195.2 s | 616 | 56.4 s | 36.9 s | 3 | 0 | 46, 17.9 m |
| Holds junctions | 4,209.3 s | 530 | 51.2 s | 31.1 s | 4 | 3 | 0, 6.6 m |
| **Both (shipped)** | 4,200.1 s | 564 | 53.3 s | 32.2 s | 4 | 3 | 47, 6.6 m |
| Both, and gives a claim back short of the line | 4,182.8 s | 946 | 31.0 s | 15.7 s | 3 | 7 | 4, 6.6 m |

Uptown here is the rival alone for five minutes; for three laps it ran 102.7 /
100.5 / 105.7 s in traffic, never off the pavement, 6.6 m worst (it left the
road on lap 3 before). Clear streets are unchanged. A reversal is the rival
stuck beside or behind a waiting car for two seconds, then backing out (seeds 1,
20 and 37): a standoff these rules have not removed. Giving a claim back short
of the line when a racer is about to cross halved circling and lost time again,
because checked only when claiming, a car at 10 m/s holds a junction six seconds
and a rival arriving in that time is never seen (seed 10). It also made more
standoffs and put seed 3, which `tests/race-generator.test.ts` pins, 29.8 m off
the street, so it is not shipped.

`tests/traffic-intent.test.ts` holds both rules (a car stops behind a racer
stopped in its lane and drives straight through that spot without one; a car
does not claim a junction a racer is crossing and claims it once the racer is
through), each failing with its rule removed. A session recorded in traffic
names its traffic revision, and replay refuses another: Shawn's two Uptown
sessions in traffic no longer reproduce, because the traffic they met has
changed.

**Recovery out of the player's sight (2026-09-13).** Where NightShift may lie for
the AI, by Shawn's call after comparing notes on how Rockstar and EA fake it: not
in the handling, which the rival drives exactly as the player does, but in getting
unstuck where nobody is watching (`UNSEEN_RECOVERY` in `sim.ts`). A rival that has
made no progress for 2.5 s, more than 120 m from the player, is put back on its
line at rest, where it already was or behind it, never further along, with the
twelve-second fallback's clearance checks. Distance stands in for sight because the
sim cannot ask the camera. It is counted apart (`driver.unseenResets`), so a test
that says the fallback reset never fired still means it.

Over the same 42 races in traffic, rival alone and the player parked on the grid,
so almost always out of sight:

| | Time | Contact | Circling | Lost | Past 16 m | Reversals | Unseen resets |
|---|---|---|---|---|---|---|---|
| Before | 4,200.1 s | 564 | 53.3 s | 32.2 s | 4 | 3 | — |
| **With it** | 4,165.0 s | 497 | 31.5 s | 8.0 s | 2 | 0 | 21, in 16 races |

Clear streets are unchanged to the tenth (no reset fires there), and Uptown in
traffic needs none. The two strays left (seeds 21, 22.2 m, and 10, 16.4 m) happen
in the seconds before a rival counts as stuck. In a race the player is usually
within 120 m and none of this applies. `tests/rival.test.ts` traps the rival 600 m
along Sound to Sky: out of sight it is put back within four seconds, at rest and
never further along; with the player 30 m away it waits, each failing with its
rule broken.

**Traffic at 35 mph and up (2026-09-13).** Racing Uptown, Shawn read traffic as
about 20 mph and asked for 35. Measured, it already cruised at sedan 35, taxi 31,
van 29 and box truck 25 mph and averaged 29.3 mph city-wide (89% of the time at
cruise, 1% stopped), so the fix is a floor: sedan 40, taxi 38, van 36, box truck
35 mph (`TRAFFIC_KINDS`, `TRAFFIC_REVISION` "traffic-v3"). It now averages 35.4
mph city-wide and 36.6 on Uptown's streets. A sedan stops from 40 mph in 21 m,
inside the 34 m a car claims its junction from.

Over the same 42 races the rival touches traffic about half as often, and drives
a little worse around it:

| | Time | Contact | Circling | Lost | Past 16 m | Unseen resets |
|---|---|---|---|---|---|---|
| 25-35 mph | 4,165.0 s | 497 | 31.5 s | 8.0 s | 2 | 21 |
| **35-40 mph** | 4,182.3 s | 261 | 64.0 s | 19.5 s | 3 (worst 18.6 m) | 27 |

Uptown in traffic, the rival alone: no contact, 7.2 m worst. Two traffic tests
were tightened on the way: a car granted its junction during the forecast's
window changed its plan (reaching claim range sooner, more cars now do), and the
junction test now picks a car that claims its junction unhindered.

**Junctions held for a racer that could not stop (2026-09-13).** Traced on seed 5
after the speed floor: a car turning left claimed its junction while the rival
was about 250 m out at 122 mph, beyond the four seconds of the racer's course the
claim check looked along (217 m). The rival, reading the turning car in a straight
line, saw the conflict 21 m out and hit it at 113 mph; the circling was the
aftermath, not indecision. A waiting car now looks along a racer's course for the
longer of the time it needs to clear the junction and the time the racer needs to
stop (speed / 9 m/s² + 0.5 s), up to 8 s (`RACER_HORIZON`, "traffic-v4"). The look
also steps at most 4 m of the racer's travel: at 0.25 s a racer at 55 m/s stepped
13.75 m, over the 10 m band a junction's path is checked in. Both were found by the
test, which fails with either undone.

| Over 42 races | Time | Contact | Circling | Lost | Past 16 m | Unseen resets |
|---|---|---|---|---|---|---|
| Flat 4 s | 4,182.3 s | 261 | 64.0 s | 19.5 s | 3 | 27 |
| **Racer's stopping time** | 4,069.0 s | 151 | 16.8 s | 8.0 s | 3 (same seeds, 18.6 m) | 6 |

Faster in 22 races, slower in 4 (2.6 s at most); clear streets unchanged; the
pinned seeds all within 3.3 m (Freight Cut's from 12.4). Uptown in traffic, the
rival alone: 6 ticks of contact, 6.6 m worst.
