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
rival spends 66 s of 170 braking: it plans corners at 62% of its grip and 5 m/s²
of braking. That is corner commitment, not traffic. Racing uses the player's shared 62.6 m/s
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
