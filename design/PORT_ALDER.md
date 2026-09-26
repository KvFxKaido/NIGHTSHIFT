# Port Alder demo

Port Alder is the demo's only playable map, authorized September 10, 2026 after the separate-map study. **It was Seattle until September 11, 2026.** The map is built from adapted Seattle centerlines and keeps its borrowed street names, but Shawn let go of Seattle as the city's identity once it was clear the work to make it feel like Seattle was never going to be done; the city is its own place now. The code handle is `alder` (`src/sim/alder.ts`, `alder-data.json`, `alder-slice-v4`, `?world=alder`), the display name Port Alder; `seattle.html` and `?world=seattle` still resolve here for old links, and the sentences below that say Seattle mean the real city the data came from. The base URL and old Blackglass world bookmarks enter Port Alder. `district.html` redirects to `alder.html`. Handling and car customization are shared unchanged.

Free roam starts outside **Wharf Garage**, beside First Avenue in SoDo. Stop at the cyan shutter and use **E / Enter** or **Cross / A** to enter. The garage uses the existing fixed camera and rotating car platform. Drive out returns to its forecourt. Races retain the clear northbound street grid and disable garage entry. The minimap and route board mark the garage.

The upgraded workshop exterior uses the same warehouse and paved apron bounds.
`src/sim/garage-site.ts` places two low concrete planters beside the end bays;
their shared poses feed rendering, Rapier, grass exclusions and placement
validation. All three bay approaches and the street-facing departure stay clear.
The two new solids append `-garage-v2` to the world version, so older saved world
positions and generated courses follow the normal stale-world handling. Menu
controls remain the existing DOM buttons, projected in front of the canopy.
Run `pnpm test:facade` and `pnpm test:garage-shots` for input, mobile and departure
regressions; `GARAGE_TEST_URL` reuses a running Vite server and
`GARAGE_TEST_ANGLE=d3d11` selects the local Windows GPU instead of SwiftShader.

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

The title centers on Continue / Load game / New drive, with Race list, Garage and Options.
Continue loads the most recently saved of three named slots. Empty slots cannot
be loaded. Pause → Save game records the current build and free-roam position;
a second, explicitly labeled Replace save action is required for an occupied slot.
A new drive never erases slots. Saves are manual and local to this browser.

Slot data lives in `nightshift.saves` (schema 1), separate from global audio,
controls, and last-used garage preferences. Load restores the selected build and
clears conflicting preview URL fields. It starts stationary; race saves, old map
versions, and obstructed/out-of-bounds locations return to the garage. This does
not save in-progress races. Career data autosaves separately in `nightshift.progress`
(schema 3), across all three drive slots: Moth's stage count and accepted race
descriptors, cash, purchased Bulwark ownership, and the Kestrel pink-slip reward.
Flash Moth to accept a sprint, then a circuit rematch, then an unordered pink slip.
Losses retry the saved course/start. Each stage pays once ($750/$750/$1,500);
only the third awards Kestrel and removes Moth from free roam. Other race links,
old wins and other rivals do not pay or advance this first career slice.
Fresh profiles start in Cinder; the garage sells Bulwark for $1,500. Purchases
save cash and ownership together. Older one-win profiles retain their cars, and
an existing selected Bulwark is durably granted when no career record exists.
If that migration cannot be saved, car changes wait for a successful retry.
Loading an older build never revokes ownership. Stray's challenge is still
unavailable; Moth's won races are in the race list (below). Race descriptors carry generator and world identity.
Mismatched or unversioned courses are rejected. The garage can explicitly
replace only the incompatible unfinished stage, preserving wins, money, cars
and completed history. New challenge links carry the same version identity.
Failed result writes offer a retry and grant no cash or progress until saved.
A stage is accepted, and handed back on a later flash, only if its course draws
the way a load draws it (`src/sim/alder-course.ts`, 2026-09-15). Heading south
on Moth's loop near (212, 897), toward a junction at the map's southern edge, no
seed draws any race, turf or not, and some circuits cannot close. A stage accepted
there used to be handed back on every flash and throw on every load. Now a flash
tries eight seeds; a pending stage that no longer draws is replaced from where the
flash is, keeping wins and cash; with nothing drawable Moth's card says "No race
from here". Draw a race here tries eight seeds the same way, and a link to a course
that cannot be drawn opens the garage with the reason instead of an error screen.
Shawn then found Moth unflashable anywhere but near the garage: two of her four
corners, where you catch her, hand a flash that southbound lane. From its junction
every gate in range is back up the street you came down, which a leg may not
reuse, so 161 gates were too far and none remained. 4 of 638 lanes on the map drew
no race. A start that draws nothing from its own junction now draws from the next
junction one street on, the smallest turn first (`generateRaceFrom`), and the
rival's line drives that street. Starts that drew before take no lead street, so no
stored race moved and the per-kind pins held. All 14 flash points on Moth's loop
draw every kind; 2 of 638 lanes still draw nothing, both waterfront dead ends in
Bollard's and Deuce's turfs (Alaskan Way at -506, -640 heading north; Elliott Ave
into W Denny Way, whose only way on is a 136° turn). A rival's cruise route should
not run those two.
Invalid storage
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

Real Seattle centerlines provide the original southwest structure. The new hill districts are hand-authored Seattle-inspired layouts, not a new GIS import or a reconstruction of the actual neighborhoods. Distances, widths, elevation, buildings and connections are deliberately adapted. See `assets/maps/alder/README.md` for attribution and regeneration. The visual target remains an upscaled MC3-like city; this is playable massing, not finished architecture. Alder Broadcast Tower is a fictional broadcast skyscraper with a shared station footprint. No surveyed terrain, bridges, tunnels, or police yet.

## Shared surface

**Alder Broadcast Tower / Signal House** (2026-09-21) is the home of fictional
**KALD 88.5 FM, Port Alder Radio**, on the former Needle plaza. The concrete and
glass shaft is 28 × 28 × 182 m; raking steel supports leave an open gap below
an octagonal broadcast crown. A tapered underside, two unequal antenna shoulders
and a 280 m antenna tip make it recognizable above the surrounding roofs. The
old steel mast reached 120 m. The crown has station lettering on four sides;
PORT ALDER / RADIO 88.5 FM marquees and double doors face all four approaches.

The grounded shaft collider and shell share `alder-landmarks.json`; the wider
crown is unreachable skyline detail, without a ground-level invisible wall.
The plaza stays inside its existing 28 m radius, clear of the surrounding roads.
Repeated parts merge into eight meshes / 8,020 triangles, with no added lights,
downloaded textures or fonts. Both map views retain the Broadcast Tower label.
After dark only the street booth and southeast crown control room are warm:
three street panes (`STATION_BOOTH`) wrap the Broad St corner where the
soundtrack's DJ broadcasts (`public/assets/music/README.md`). The
`broadcast-v2` world suffix records the enlarged solid for saved-location
validation. `scripts/test-broadcast-tower.mjs` captures street, skyline, crown,
night and reverse views and checks the rendering budget.

The broadcast campus has 90 deterministically placed evergreens, including 17
larger old-growth trees, in loose clusters around its western and northern grounds.
Their canopies leave the circular plaza and four entrance/view corridors open.
They use the existing geographic instance batches and shared colliding trunks;
road, sidewalk and building clearance rules also apply here.

**Signal House parking** is the first reusable parking-lot recipe
(`src/sim/alder-parking.json`, generated by `src/sim/parking-lot.ts`). Its
70 × 21.6 m lot southwest of the station has 35 usable bays, one adjacent
striped access space, an 8 m two-way aisle, a Denny Way driveway and a 3 m
footpath ending on the tower plaza. Eight seeded parked cars, wheel stops and
two lamps make the overnight occupancy readable. All 90 campus trees remain.

The saved recipe controls position, rotation, columns, bay/aisle dimensions,
turnaround margin, entrance length, occupancy, seed, label and walkway destination.
Placement and the road connection are authored; repeated bays and decoration
are generated once at world construction and remain stable across reloads.
It currently supports two-row rectangular lots on nearly level ground.
Adding another recipe reuses the same builder; changing recipes changes the
`parking-v1` fingerprint in the world version for saved-location validation.

The generated paving drives tyre grip and grass exclusion; the same footprints
reserve tree clearance and prevent building/frontage edits from covering access.
Parked cars reuse the traffic models with shared static collision volumes;
they are scenery, not moving traffic or a new parking simulation. Wheel stops,
kerbs and lamp/sign posts also share rendered and physical dimensions. The
whole lot is never an invisible collision slab. The first lot uses 14 meshes,
5,914 rendered triangles and no new dynamic lights. Five browser captures in
`scripts/test-parking-lot.mjs` cover the entrance, aisle, overview, night and campus.

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
race seeds are reproducible within a world version and their kind's generator
revision (`GENERATOR_REVISIONS`, since 2026-09-15); v3 seeds may draw different routes on
the expanded graph.

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
  are the same length. A committed pace of 50 m/s, a 90 degree turn costing
  2.5 s (both fitted to driven laps, below; the pace was guessed at 32 m/s
  until 2026-09-15), a climb 1 + 1.5 x grade, routed on the line graph so a turn at a
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
a proposal like the other constants. It stayed 60 m when the pace was
calibrated to 50 m/s, from which the same arithmetic gives 154 m and nearly
every approach blind; nothing has measured it. It lives on the `Drive` for the
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

**Pace, calibrated (2026-09-15).** The pace model's two constants were
guesses (`design/PROCEDURAL_RACES.md`, step 3). `pnpm pace` fits them to the
recorded Uptown Circuit laps: each valid lap is cut at the midpoints between
turn gates, so a window holds one junction turn and the straights either side,
and in the model's own terms a window costs straight-equivalent metres over the
pace plus the 90-degree cost times the sum of (degrees / 90)^1.5 over its turns,
junctions and bends inside streets alike. That is least squares in two unknowns.
153 windows from 13 sessions, Cinder RWD on `four-wheel-v6`:

| | pace | 90° turn | rms per window | Uptown lap |
|---|---|---|---|---|
| The guesses | 32 m/s | 2.5 s | 3.83 s | 123.0 s |
| Fitted, clear streets (36) | 51.7 m/s | 2.51 s | 0.45 s | 84.2 s |
| Fitted, traffic (117) | 50.4 m/s | 2.46 s | 0.61 s | 85.4 s |
| Adopted | 50 m/s | 2.5 s | 0.59 s | 86.3 s |

The turn guess was right and the pace guess 36% slow, so a 90-degree turn is
worth about 125 m of street rather than 80. Exponent 1 fits a little better
than 1.5 (rms 0.53 s against 0.58 s) and 2 worse (0.67 s); most of that is the
129° hairpin at the foot of Dexter Way, which the fit prices 0.93 s slow, and
which is downhill, where the grade factor charges a descent as it charges a
climb. So 1.5 stays. What one loop cannot say: width and grade stay
proposals, since Uptown has too few streets to separate them; and it is one
driver, practised on the loop, in one car. Traffic cost that driver about a
second a lap on Uptown.

What it changed, measured with `pnpm alder:critique` and the draw over 300
seeds. Of 9,058 legs of 300–1600 m, priced 1,075 → 1,113, even 2,175 → 2,225,
free 1,526 → 1,510, twins 2,314 → 2,052, no choice 2,040 → 2,158: with turns
dearer against distance, two ways round a block with different turn counts
stop being twins. The priced corridors of the first reading held: Western
over 1st Ave keeps all 15 of its priced legs, and the legs that moved mostly
moved to priced. The draw's priced-or-even share rose from 62% to 68%, and
draws made at a dead spot fell from 59 to 50 of about 1,185. The generator's
second limits were scaled by 0.7 so races kept their distance (legs 8–28 s,
races 32–112 s; median race 3.16 km → 3.23 km, now priced at 80 s, which is
about what it takes to drive). Only 20 of 300 seeds draw the race they drew
before, so rival measurements over generated seeds from before this date,
including the 42-race tables below, describe races the seeds no longer draw.
Nothing named that change, since the world version did not move, so the draw
now has a name of its own: `GENERATOR_REVISION` ("generator-v1" is this draw; per kind as `GENERATOR_REVISIONS` since circuits were revised, below),
which a stored race carries beside `ALDER_VERSION`. `tests/race-generator.test.ts`
fingerprints the gates and rival lines of 26 races, from the grid and from two
starts as a URL carries them, and fails when they move without a new name.

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

**Spruce Cut** (2026-09-23, `sea-alley-1`, working name), 287 m from Pike Passage & Spruce Lane to Pine East & Olive
Way: Shawn's cut. Racing gen-wake-42 he left Pike Passage at 110 mph 20 m short of Spruce Lane and rejoined Pine East
37 m short of Olive Way over bare ground, 233 m of his own for 522 m of the rival's route, and asked for it to be an
official shortcut: a street, so a rival's route may take it too, with traffic one lane each way. Scored first
(`--try=940,-640,800,-890`): 6.1 s, sight 79 m and 68 m at its ends; the arrivals at both junctions gain priced and even
legs, and the draw over 300 seeds is as it was (priced-or-even 66% to 65%, dead spots 49 to 51 of about 1,180). His two
other cuts, from 12th Avenue across Thomas Street to Mercer East, leave and rejoin mid-block, 60 to 110 m from any
junction, and wait until he has driven this one.

It was added without the full builder. Since the shoulders the map's buildings are the old full build's, rebuilt
`--surfaces-only`, with `alder-clearance.json` moving 466 of them by their original plot ids; a full build now re-places
every generated plot round the wider asphalt, and the overlay no longer matches. So the alley is appended to the data's
roads as the builder writes one (`sea-alley-1`, resampled at 30 m, byte-identical otherwise), the surfaces rebuilt, the
world named `alder-slice-v8`, and the plots its paved ribbon crosses retired in the overlay: two, where the critique
counted one, because it measures the carriageway and the ribbon is carriageway, shoulder and sidewalk. The generator's
draws moved with the world (circuits and every turf kind; plain sprints and unordered races drew the same), and are
re-pinned to it.

Traffic moved with it too: it is placed by the metre of lane, and the alley is lane, so every car in the city starts
somewhere else. `pnpm golden` moved every Port Alder run (8 of 14; the Blackglass fixtures are identical), and gen-40,
the same course, now meets a car the pass planner passes cleanly where the reactive driver needed no pass, 81.6 s against
79.3: a committed pass that costs 2.4 s, left open (`tests/traffic-pass.test.ts`).

The gate is re-saved on it: the same courses meeting other traffic, and one course, gen-75, now through the alley. Against
the shoulder baseline: distinct incidents 50 and 50, resets 30 to 35, off the pavement 48 to 14, contact in a pass 17 to
34, and contact on a line 11 ticks to 278, of which 201 are gen-75 at seed 1 at the alley's own junction: coming down
Spruce Lane to turn into it, an oncoming SUV claims the junction with the rival 6 m away at 16 mph and they tangle at
walking pace for ten seconds, the line given back and taken again. That is the junction crossing parked on 2026-09-23,
met at a junction that did not exist before; the alley made the place, not the kind. Jackson East to Mercer East makes
the same turn and meets nothing there at any of the six seeds (88 to 102 s, contact at most 0.9 s, once a 0.1 s clip
with a van inside the alley at 150 mph).

## An authored sprint (2026-09-23)

Shawn: "might want to make this an official race too." The race was gen-wake-42, and it was the second gen-wake-42 of
the day: the shoulders had changed the world that morning and the seed drew another course, and Spruce Cut changes
Wake's turf draws again. A seed is only as stable as everything its draw reads.

So it is pinned as data (`src/sim/authored-sprints.json`, `authored-sprints.ts`): its race, its rival's route and
its start, as gen-wake-42 drew on `alder-slice-v7`, the route taken through Spruce Cut from Pike Passage & Spruce Lane
to the third gate, which the alley ends at. **Jackson East to Mercer East** (the generator's name, working), 4,307 m where
the drawn route was 4,557, four gates, Wake in the Reign with her launch and her 0.96. `?race=sprint-jackson-mercer`,
and in the race list after Uptown Circuit / Clear, with a solo button. It is built as a generated race is
(`recordedEvent`): the street line drawn from the pinned route when it is fielded, so it follows the city while the
course does not; traffic per attempt; recorded as one lap and compared gate by gate. Its identity is its pinned data
(`authored-sprint-v1.<fingerprint>`), so editing the course refuses the sessions driven on the old one. The game draws
its rival's car from its Blacklist name (`blacklist: "wake"`), as a generated race's id gives one.

Wake alone on it: 84.3 s clear, 101.5 s in traffic at seed 0 and 95.0 s at 271828, no resets, nothing on bare ground,
through Spruce Cut at 64 mph for the turn in and up to 152 along it. Shawn's own run on the unpinned course, cutting all
three, was 1:29.55 against her 1:37.35.

## Generated races

The flash draws a new race every time. `src/sim/race-generator.ts` takes the
same graph the critique measures, starts at the junction the race grid on
1st Ave S leads to, and draws three to five gates at junctions: each next
gate is chosen among the legs 8–28 s away whose fastest route reuses no
street already driven, weighted by the leg's class — priced 4, even 1.5,
free 0.5, twin 0.3, none 0.4, plus 1.5 for a detour in the 10–25% sweet
spot — until the race is 32–112 s long (12–40 s and 45–160 s against the
guessed pace, until 2026-09-15). The seed drives every draw through
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

**Circuits close under the flow rule (2026-09-15).** Shawn named the weird gates:
ones that turn you completely around after you pass through. Sprints and circuit
legs obeyed the rule (0.2% of next gates more than 120° off the heading through
a gate, over 1,191 races from four starts). Circuits did not where they close: a
circuit was a sprint closed afterwards by a route back to the start, and nothing
looked at where the start was, so the start lay more than 120° off at 57% of last
gates (40% past 135°), and lap two's first gate at 52% of starts; 469 of 591
circuits had one. More gates carry a race further out, which is why the 4-5 gate
ones looked worst. A circuit is now drawn as one (`generateRace`'s `circuit`,
`closeCircuit`): the draw is kept only if the start lies within 120° of the last
gate's arrival heading and the first gate within 120° of the start's, redrawing up
to `circuitAttempts` (48) times. Over 600: 8 circuits with a next gate over 120°
off, none past 135°; 598 draw where 591 did; median lap 5.10 -> 5.05 km, 4.92 ->
5.07 gates a lap, priced-or-even legs 61% -> 58%. 122 seeds keep their sprint's
gates. About one ordinary gate in ten still puts the next 105-120° off, a hard
turn back rather than a reversal, left as it is.

**Revisions per race kind.** Because only circuits moved, `GENERATOR_REVISIONS`
names each kind: circuit `generator-v2`, sprint and unordered still
`generator-v1`, and a stored course is judged by its own kind's
(`generatorRevision`, `RaceBuildFor`). Stored sprints and unordered races stay
playable; a pending circuit stage is outdated and the garage replaces it; kept and
won circuits are listed unplayable. The per-kind pins in
`tests/race-generator.test.ts` were computed on the code before and after, and
the sprint and unordered ones did not move.

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
and the race's identity is (world version, generator revision, race id,
start), the id being
the seed plus its variant (`gen-<seed>[-circuit|-unordered]`, which a flash
draws from the seed and a link may name outright). Today the rival
cruises the freight block, so a flash happens on 1st Ave S, Holgate or 4th Ave
S in either direction; the mechanism is what makes a cruise route anywhere
in the city a start anywhere in the city. `tests/race-start.test.ts` snaps,
round-trips the URL, draws from Pike St, Queen Anne Climb, Freight Cut and
4th Ave S southbound, and drives a race from the hill to the finish in traffic.
Not yet: rivals learning the player's line per street.

### Rival turf (2026-09-15)

`design/PROCEDURAL_RACES.md`, step 2. Each Blacklist name but Tally has a turf,
a centre and an 800 m radius (`TURF_RADIUS`) taken from the map so an edit
moves it (`src/sim/alder-turf.ts`): Moth's cruise loop, the downtown core for
Stray, Rivet's strip, Elliott Ave, the Broadcast Tower, Sable's yard, the
Madrona Ridge and Capitol Hill labels, and Queen Anne Climb. Tally's turf is the
whole city, which is no pull.

A turf draw multiplies each candidate leg's weight by 1 + pull x the share of its
route inside the turf (`GENERATOR.turf`, pull 10), so a race leans home and can
still leave, and it names the turf in the id: `gen-moth-15`, the grammar in
`src/sim/race-id.ts`. `gen-15` is still the plain draw, so stages accepted
before turfs keep their races, and the plain fingerprint did not move. Turf draws
have their own pin, which also takes the turfs, the pull and each sampled leg's
share by value, because a sample of races missed pull 10 -> 20.

`pnpm alder:turf` draws the same seeds from each turf's centre with and without
it. Measured (60 seeds, 2026-09-15):

| pull | inside own turf | priced or even | no race |
|---|---|---|---|
| none | 34% | 64% | 0 |
| 3 | 40% | 63% | 0 |
| 10 | 42% | 63% | 0 |
| 30 | 44% | 62% | 0 |

At a 1,200 m radius the same pulls give 62% -> 71%. Letting a turf draw turn back
for home once outside reached 47% at pull 10 with 32 of 1,362 legs doubling back
past 135°, which is what the flow rule is for, so it was not kept. From Moth's
own loop her races go from 34% to 40% inside her turf and 18 of 40 seeds draw
another race. Only her stages draw with a turf; Draw a race here stays plain.

The map puts some turfs almost on top of each other: Rivet and Sable are 224 m
apart, Bollard and Deuce 354 m, and 69% of Bollard's turf races lie in Deuce's
turf. Rivet and Sable race drag and drift, not generated races, but Bollard and
Deuce would draw alike until their races differ some other way. The pull costs
choice where a turf has few priced legs: Rivet's priced-or-even share falls from
74% to 61%, the largest drop of the nine; the rest move by six points or less.

### The Blacklist on the map (2026-09-15)

Shawn: put the rest of the rivals on the map, all at once, ranked, each flash a
race of the nearest existing type. Phase 1 is presence. Moth keeps her freight
block and her stages; Rivet and Sable stay parked; the other seven cruise loops
in their turfs (`BLACKLIST_CRUISERS`, `src/sim/alder-cruisers.ts`) and a flash
draws `gen-<id>-<seed>[-kind]`, raced in their own car with its drivetrain. The
career chain, where only the next name's stages advance, is phase 2, below.

| | Car | Race | Loop |
|---|---|---|---|
| Stray | Latch, FWD | unordered | Pike St, 6th Ave, Yesler Way, Western Ave, Madison St, 4th Ave |
| Bollard | Breakwater, AWD | sprint | Wall St, Elliott Ave, Cedar St, 4th Ave, Pike St, 2nd Ave |
| Deuce | Wager, RWD | sprint | Broad St, 5th Ave N, Taylor Terrace, Uptown Link, Queen Anne Climb |
| Plumb | Meridian, AWD | circuit | Denny East, Ridge Scenic Way, Pine East, Valley Parkway |
| Crest | Skim, FWD | sprint | Galer Terrace, Queen Anne Climb, Crown Loop, Taylor Terrace |
| Wake | Reign, AWD | sprint | 12th Ave, Aloha St, 23rd Ave, Bellevue Court, Belmont Passage, Roy St |
| Tally | Vesper, RWD | unordered | Aloha St, Belmont Passage, Mercer East, Republic St, Valley Parkway, Madrona Drive |

The loops were found by search and pinned as street lists: closed, 1.5-2.8 km,
junction turns of 100° or less, entirely inside the turf (Tally near the map's
middle), no street segment shared with another loop or Moth's, and a race of the
rival's type draws from every 60 m of it, so no loop hands a flash a dead lane.
Bollard keeps Elliott Ave and Deuce the Broadcast Tower streets; the first search
gave both to whichever went first. Tally's turf is the whole city, which is no
pull: `gen-tally-12` draws the gates of `gen-12` under her name.

In the sim Moth stays `encounter`, which tests and three browser harnesses read
by name, and the seven are `cruisers`, created after her body so a world without
them is the world it was. Each drives `rivalInput` round its loop with every
other car as an obstacle, and resets as she does without landing on another.
Measured: all seven cruise 60 s in traffic without a reset and replay tick for
tick; a tick went from 1.64 ms with Moth alone to 3.16 ms with all eight (node,
PC), a cost to remember for the phone. In the browser a flash on Stray loaded
`gen-stray-842725-unordered` against his Latch.

### The Blacklist career (phase 2, 2026-09-15)

Every name now races for stages, one name at a time; the rules are in
`design/BLACKLIST.md`, "The chain". On the map: a flash reaches whoever is
alongside, as before, and `progress.flashName` decides what it is. The lowest
unbeaten name's flash is its next stage (a drawn course, the drag, or Sable's yard
at that stage's target); anyone higher gets the phase 1 free race; a beaten name
is not on the map to flash, since `main.ts` leaves beaten cruisers and parked
rivals out of the sim and loads no car for them. The card of the current name
offers the stage and its pay, and higher names' cards say no stakes. Sable's yard
runs at 3,000, 3,600 or 4,200 points (`SABLE_DRIFTS`), and its result is saved as a
career result like a race's. Checked in the browser: flashing Rivet at one win
loaded the drag, and a pink-slip drift won at 4,200 paid $4,000, handed over the
NS-01 and named Plumb next.

### Flash reach on a moving rival (2026-09-15)

A flash reached a rival within 32 m, at the same height, while the player drove
under 12 m/s. Measured: every cruiser, Moth included, holds 10.5 m/s round its
whole loop, corners too, so following one left a 1.5 m/s window, and catching up
meant going over 12 and losing the card. A scripted pursuer (the rival driver on
Moth's loop, capped at 13, 16 or 20 m/s, starting 60 m behind) never got the old
prompt in 90 s. The limit is now on speed relative to the rival (`canChallenge`,
`CHALLENGE_REACH`): under 12 m/s apart, velocity against velocity. The same
pursuers are offered the flash for nearly all their time within reach, first at
12.1, 7.1 and 5.3 s. A parked rival has no velocity, so Rivet and Sable are
reached exactly as before; closing on a cruiser at 23 m/s, or meeting it head-on,
is still driving past. In the browser, closing on Plumb from 20 m back at 17.4 m/s
showed his card; at 26.4 m/s it did not.

### Race list (2026-09-15)

The playlist of `design/PROCEDURAL_RACES.md`, step 4, from the title or Pause
(`src/ui/race-list.ts` decides, `race-list-panel.ts` draws). Three groups:

- **Courses**, always listed: Sound to Sky, Ridge Circuit's three layouts, and
  Uptown Circuit in traffic and clear.
- **Moth**, her won stages read from `nightshift.progress`, so retiring her
  from the street does not lose her races. Career history is not removable here,
  and replaying a won stage pays nothing.
- **Kept races**, from the Keep button on a generated race's results, in
  `nightshift.playlist` (`src/settings/playlist.ts`). A kept race Moth's group
  already shows is not listed twice, and her won stages offer no Keep.

Every playable entry has Race (the rival) and Solo. A circuit is solo by its race
id (`-solo`); a generated race or Sound to Sky takes `?solo=1`, which keeps the
race and its gate arrows and fields nobody. The arrows come from the rival's
line, so solo runs `withExits` before the rival is dropped. A solo win is never a
career result. Entries drawn on another `ALDER_VERSION` or their kind's `GENERATOR_REVISIONS` entry
are listed, dimmed, with only Remove: never redrawn under their old name.

**Draw a race here**, at the top of the list during a free-roam drive, draws a
new generated race from the lane the car is on (a seed from the tick, the variant
from the seed, as flashes did before Moth's stages drew once), against the rival.
Off every street, in a race, or before a drive has started, it says why not.
Checked in the browser on a fresh profile (2026-09-15): draw, keep, the solo
replay with the same first gate and arrow, results for both, Remove, an
older-build entry, Moth's groups, and a 390 px layout. Finishes were forced, so
this checks the flow, not the races.


## First racing rival

Sound to Sky starts with one AI opponent in Moth's Kestrel rally hatch; the drag
event fields Rivet's Hammer instead (`raceOpponentCar` in `src/main.ts`). Both
use the existing four-wheel forces and share one Rapier world. The rival's car
comes from its own `RivalDefinition` (`car`, since 2026-09-19), independently of
whichever car the player brings, and gives it that car's tune and drivetrain
(`handlingFor`): each of Moth's names the Kestrel, Rivet's the Hammer. `main.ts`
draws the rival separately (`raceOpponentCar`), so `tests/cars.test.ts` holds
every rival's car to the body drawn: a route that names no car is not neutral,
it silently drives the shared model on FWD, which is what Moth raced a rally
hatch on until 2026-09-12.

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
  for them; if the gap shuts, that is contact. Since `driver-v10` (2026-09-26,
  "Passing the player in traffic" below) only into a lane clear of traffic for
  the pass, and not into the player's back: still in their line and not getting
  out of it, it closes no faster than it can stop, and with no lane it holds on
  their bumper.
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
Driving its own lane is the next fix.

**Traffic on a grade (2026-09-16, `full-line-v12`).** The rival skipped any car
more than 3 m above or below itself, meant for a bridge overhead. Comparing raw
heights also hid a car on the same street whenever the road climbed or fell 3 m
within the rival's look-ahead (15 m + 1.6 s): on the same street, that is 12% of
the city's street length at 20 m/s, 26% at 40 and 32% at 55, worst on Valley
Parkway, Roy Street and Galer Terrace. On Queen Anne Climb it hid an oncoming
sedan until 54 m, where 102 m was due. Heights are now compared above the road:
a car is skipped when it sits more than 3 m off the route's height where it is
(`routeHeightAt`), relative to how far the rival sits off the route itself. A
bridge is still skipped; a climb no longer hides anyone.

Found by a separate investigation the same day, which also measured and rejected
braking for traffic from the rival's actual position (worse: running wide, it
braked and slid further out) and an escape-feasibility rule (fewer rear-ends but
two regressions, one start timing). Measured here on the 82-race set (Sound to
Sky, Queen Anne seed 2, grid seeds 1-80), rival alone in traffic, player parked,
each at four start timings (0, -13, +7, +19 ticks), before and after:

| | Race time | Contact | Hard hits (oncoming / same / crossing) | Past 16 m |
|---|---|---|---|---|
| Before | 30,119 s | 3,399 ticks | 56 (23 / 32 / 1) | 29 |
| After | 30,101 s | 3,497 ticks | 45 (19 / 25 / 1) | 28 |

A hard hit is contact above 25 m/s losing more than 10 m/s. Thirteen hard hits
went and two arrived, mostly on seeds 68 and 54, which share a road (68 alone is
32 s faster across its timings). No race newly strays past 16 m. Contact rose in
14 races and fell in 21; three runs carry 467 of the 657 added ticks, seed 38
twice (all of it same-direction contact, about 1.8 s each, not traced) and Queen
Anne once.

It does not fix Queen Anne, and was not expected to. Over 25 start timings from
-60 to +60 ticks the rival meets the sedan in all 25 before and after, hard in
14 both times; it ends past 16 m in 5 before and 4 after, but individual timings
move both ways (+30 ticks: 25.0 to 11.7 m; -5: 9.3 to 18.4 m). That crash is the
rival running wide on a fast 394 m bend at 54.6 m/s and sliding into the
oncoming half; seeing the sedan sooner does not stop it. It needs a cornering
pass, which will also move Ridge Circuit and clear-street times. The racing block
that reads the player still compares raw heights (`rival.ts`, the opponent check
above the traffic loop), unmeasured and unchanged here.

Separately, even on empty streets the
rival spent 66 s of 170 braking: it planned corners at 62% of its grip and 5 m/s²
of braking. That was corner commitment, not traffic, and it was tuned from
recorded laps the same day (below: **Cornering, tuned to recorded laps**). Racing uses the player's shared 62.6 m/s
(140 mph) speed ceiling, with full throttle available on clear straights. The
corner preview extends with stopping distance instead of ending at 100 metres;
traffic, bends and recovery still lower the target speed. The 10 m/s local cruise
limit is separate. After 12 seconds without gaining another
4 metres of forward route progress, the sim can reset it at rest on nearby clear
road, where it was or behind (see **The twelve-second reset never gains ground**
below). It keeps its race clock and checkpoints, stays behind the next gate, and
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


### What a stray past 16 m actually measures (2026-09-19)

Three tests ask a racing rival to stay within 16 m of a centreline in traffic:
the Queen Anne Climb start (`race-start.test.ts`), Freight Cut (`alleys.test.ts`)
and a generated race in normal traffic (`race-generator.test.ts`). The peak they
took could not tell driving from being hit, so in traffic it was a lottery: over
Moth's `power`, where nothing about the rival's line changes, it read

| `power` | 0.64 | 0.65 | 0.66 | 0.67 | 0.68 | 0.70 |
|---|---|---|---|---|---|---|
| Peak stray | 7.2 m | 7.2 m | **23.1 m** | 7.7 m | **24.3 m** | 8.1 m |
| Peak clear of contact | 7.2 m | 7.2 m | 7.3 m | 7.7 m | 7.8 m | 7.9 m |

Both failures are one traffic car met head on, at the same place: at 0.66 the
contact is at 15.1 s, the rival is past 16 m from 16.3 s to 17.6 s peaking at
23.1 m while doing 20 mph, and it finishes the race with no resets. At 0.68 the
contact is at 15.0 s and it is wide for 1.7 s. Clear of contact the rival's own
driving never leaves 7.2-7.9 m, a spread of 0.7 m where the raw peak spreads by
3.4 times.

So the peak is split in two, in `tests/helpers/stray.ts`:

- **`clearPeak` < 16 m** is the rival's driving: the furthest it gets while no
  traffic car has touched it for three seconds. Only traffic excuses a stray; a
  building or a kerb is the rival's own doing and still counts.
- **`worstRecovery` < 4 s** is what a shunt may not do: being knocked wide is
  allowed, being left out there is not. Measured at 1.3 s and 1.7 s in the two
  cases above, and 0 s whenever nothing hits the rival -- so on a clean run this
  one asserts nothing, by design. It is the tripwire for the day a shunt stops
  being recoverable, which is what the raw peak was accidentally catching.

This does not fix the rival's weakness in traffic, and is not meant to: it stops
the suite reporting that weakness as a tune's fault. A rival that meets a car
head on at 120 mph still loses 20 seconds of race. What was wrong was the
measurement, which failed one tune and passed the next for a difference neither
tune caused.

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

### How hard the rival corners (2026-09-19)

The 0.76 above was chosen because 0.82 put the rival "grass on Full, 19.8 m wide
in the city" -- two failures, one on the racing line and one on a street -- and
the reason given was the lagging steering controller. `RIVAL_STEERING`'s
feedforward, which exists to fix exactly that, landed the same day and reached
streets with `RIVAL_STREET_CORNERS`. The corner speed was never re-swept against
it. It turns out the feedforward raises that ceiling without removing it, and
raises it on one surface only.

Re-measured with the grass read as `alderGround`, the test the v6 grip penalty
uses, rather than as distance from a centreline, which cannot tell a 20 m street
from a 12 m one:

**Streets**, the grass (eight races, clear and in traffic, the rival's own car):

| `speedFactor` | 0.76 | 0.84 | 0.86 | 0.88 | 0.92 | 1.00 |
|---|---|---|---|---|---|---|
| Sound to Sky | 145.8 s | 142.7 | 142.1 | 141.5 | 140.6 | 139.5 |
| On the grass | none | none | none | none | 1.1 s, 8.3 m past the pavement | 0.6 s |

**Ridge Circuit** (flying lap, Moth's Kestrel, which every arena race fields):

| `speedFactor` | 0.76 | 0.80 | 0.82 | 0.84 | 0.86 |
|---|---|---|---|---|---|
| Full | 75.25 s | 73.68 | 73.12 | 72.63 | 72.10 |
| Full, on the grass | **0 ticks** | 53 | 111 | 149 | 165 |

East and Ridge stay clean at every value, so it is Full's long corners that set
the ceiling there.

On a street the grass no longer bites below 0.92. What bites first is how wide
the arc runs, which `tests/rival-racing.test.ts` holds to 2 m through a 35 degree
bend taken at 52 m/s -- the bound set when the feedforward landed, which brought
that bend from 2.9 m to about 1.2:

| `speedFactor` | 0.76 | 0.78 | 0.80 | 0.82 | 0.84 | 0.86 |
|---|---|---|---|---|---|---|
| Off its line | 1.18 m | 1.37 | 1.60 | **1.86** | 2.16 | 2.49 |

So "past about 0.8 of the grip-limited speed its tracking, not its grip, is the
limit" still holds, as CLAUDE.md had it all along. What moved is the symptom,
from a wheel on the grass to a wide arc, and with it the ceiling, from 0.76 to
about 0.82. The two surfaces want different numbers, and `route.lateral` already
tells them apart for braking, so the corner speed now comes from the same plan:

- **A street rival: 0.80** (Shawn, 2026-09-19). It keeps a fifth of the tracking
  gate in hand where 0.82 would sit at 93% of it, so a later tune can widen the
  arc a little without failing the test. `speedFactor` is a share of the
  grip-limited SPEED and speed goes as the root of grip, so the grip a corner
  uses is its square: 0.76 used 58% of the car's lateral grip, 0.80 uses 64%,
  against Shawn's own 74-82% at an apex. Sound to Sky 145.8 s to 144.2, and no
  wheel on the grass in any of the eight races.
- **A racing line: 0.76**, unchanged (`RIVAL_BRAKING.speedFactor`). It has no
  room: a K1999 line already spends the track's width on itself, running 2.2-2.6 m
  from the edges, where a street rival sits half-way into its lane with metres of
  asphalt either side. Ridge Circuit is untouched to the tick -- 75.25 / 58.03 /
  48.80 and no wheel off, the same as before -- and `pnpm golden` confirms it:
  the four street races with a rival moved, Ridge Circuit full did not.

Past 1.08 the racing line stops being a line at all: Full goes 70.85 s to 83.92.
`RIVAL_REVISION` is `full-line-v24`.

Both limits were found by gates already in the suite, and both after a first pass
had concluded 0.86 was clean everywhere. The arena test's `groundTicks === 0`
caught the racing line, because that first pass measured the grass on streets but
only lap times on the circuits, and the circuits it timed drove a Cinder where
every arena race fields Moth's Kestrel. The 2 m arc bound caught the streets.
Neither would have been found by measuring harder in the same direction.

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
Lap recordings with a rival name the rival raced and replay refuses another: one
string for every race to 2026-09-21 (`RIVAL_REVISION`), and since then what that
race's own rival is made of (`src/sim/rival-revision.ts`, "A rival named by what it
is made of" below). Not built: extracting features from recordings automatically,
and the rival learning from them per street.

`tests/arena.test.ts` pins each lap's length (a moved corner makes recorded laps
incomparable), checks the site is clear of buildings, trees and street
pavements, that the drawn asphalt is the paved width the tyres feel, that every
gate lies on the rival's line, and drives the rival round all three layouts.

### Against a human, measured (2026-09-20)

Shawn: "the AI still doesn't take angles a player would." `pnpm laps:compare`
replays a raced session and records the rival through the same recorder, so both
cars have the same channels from the same race. His race on
`street-uptown-clear` (Cinder, no pedal assist; it replays exactly): 1:31.78,
1:27.53, 1:26.47 against the rival's 1:37.82, 1:35.18.

All of the margin is cornering. Per lap he gains 8.9 s within 70 m of a gate and
gives back 2.1 s everywhere else. Over the 22 corners both drove:

| | Shawn | rival |
|---|---|---|
| arriving | 78.4 mph | 78.7 mph |
| slowest point | 49.5 mph | 32.6 mph |
| leaving | 59.4 mph | 63.3 mph |
| road used either side of the centreline | 8.7 m | 5.1 m |

It is not late braking. The rival is quicker out of 14 of the 22, from an apex
17 mph slower: it never over-asks its tyres and he has no pedal assist.

**A racing line through the streets: measured, then built (below).** First measured
by replaying the same input log against other rivals. That first table was wrong,
and is kept out of here: its line was broken, which is the next paragraph, and it
said a racing line was worth 0.6 s a lap and the corner-speed plan was the whole
lever. Measured again on a sound line, with the rival alone on clear streets (the
player parked at Wharf Garage, so nothing is contact), three laps each:

| rival | lap 1 | lap 2 | lap 3 |
|---|---|---|---|
| as shipped: lane arcs in its own half, plan 0.80 | 1:37.78 | 1:35.18 | 1:35.18 |
| street racing line (`STREET_RACING_LINE`), plan 0.76 | 1:32.45 | 1:30.38 | 1:29.75 |
| the same line, plan 0.88 | 1:29.30 | 1:27.07 | 1:26.57 |
| the same line, plan 1.00 | 1:27.03 | 1:24.80 | 1:24.40 |
| Shawn, for scale | 1:31.78 | 1:27.53 | 1:26.47 |

Every lap of every row is valid, with no reset, no reverse and no tick with a
wheel off the pavement, 1.00 included.

- **The line is worth 4.8 s a lap, and the plan as much again.** About even: 0.76
  to 1.00 on the line is another 5.6 s. At 0.88 its flying laps are within half
  a second of his (1:27.07 and 1:26.57 against 1:27.53 and 1:26.47); at 1.00 it is
  two to three seconds a lap quicker.
- **The plan fraction, per corner.** On a corner whose line is sound the rival
  does 0.76 of the grip-limited speed for that radius, as planned, and Shawn about
  all of it: 65 mph allowed, 52 and 60; 53, 42 and 50; 56, 44 and 56; 68, 54 and 69.
- **It held the road at 1.00.** That does not fit "past about 0.8 its tracking,
  not its grip, is the limit" above, which was measured on Ridge Circuit's width
  and on streets in traffic. On clear streets, on a racing line with steering
  feedforward, it has not been shown to hold.
- **Margins are not a lever.** Edge and outside margins of 1.2 and 0.5 m, against
  2.6 and 2.5, lap in 1:30.85 at 0.76: no quicker.
- **The tightest corner left is a real one**: Harrison Terrace onto Broadway, 98
  degrees, a 15 m line. The hairpin's is 16 m, from 4.

**"Lap 1 is broken" was the solver, on any lap.** The first measurement found a
racing-line rival 7 to 16 s slower on lap 1, and on tighter margins INVALID,
"went backwards", and guessed it was reversing out of something. It was not
reversing and it was not lap 1. `withRacingLine` had only ever drawn Ridge
Circuit, whose tightest bend is a 16 m arc; a street corner is one vertex. The
line through the same corner came out as a 23 m arc on one lap and a 4 m spike on
the next, by where the solver's coarse nodes, 64 m apart, fell on it, and a lap is
not a multiple of 64 m. The rival orbited each spike at full lock at 15 mph, and
at the hairpin its place on the route ran backwards, which is what the recorder
calls going backwards. Laps 1 and 3 had the spikes; lap 2, the one measured, had
two of its own (gate 4 and the hairpin), so even the "good" lap was slow. Three
faults, all in `src/sim/racing-line.ts` (`STREET_RACING_LINE`, `HAIRPIN`):

1. The circle through three points is smallest at a right angle and grows again
   past it, so a sample thrown to the outside of a corner read as a GENTLER bend
   and was pushed further out. The curvature now keeps rising. This alone mended
   every right-angle corner on every lap.
2. Offsets to the inside of a corner fold where the normals meet, and at a hairpin
   where they cross the other leg; the inside is bounded by both.
3. Offsets from a 129 degree vertex zigzag whatever bounds them, so a hairpin's
   samples are put on an arc first, and the room either side of the arc is the
   asphalt the two legs share.

Ridge Circuit takes none of it and its three lines are bit for bit what they were
(the first fix moves Full's and East's, and a moved line is a `RIVAL_REVISION`
bump that would refuse the one raced recording that still replays). With the
fixes switched off, both new tests in `tests/racing-line.test.ts` fail on the
original symptoms: a 118 degree kink 1,748 m along, and lap 1 at 102.12 s against
lap 2's 94.62.

**Built at 0.88 (Shawn, 2026-09-20), for Uptown Circuit / Clear** (0.80 since the
corners were cut, the same day: below). That is the
one street race with no traffic, so it is the whole of "clear street races": its
rival drives `STREET_RACING_LINE` and plans corners at `RIVAL_STREET_LINE`'s 0.88
(`RivalDefinition.cornering`, which a route carries only where it differs from its
surface's own). Every race with traffic, Uptown in traffic included, drives as it
did: the centreline, lane arcs in its own half, 0.80. `RIVAL_REVISION` is
`full-line-v25`.

- **Why only there.** A racing line ignores lanes, which is why streets never had
  one (the header of `racing-line.ts`: the rival "sat in the traffic's own lane and
  ran into it"). That holds until the rival reads traffic's forecast.
- **The same race otherwise.** The four Uptown races keep the same gates, grid and
  arrows, which are read from the centreline for all of them, so solo recordings
  and the circuit's identity (`uptown-v1`) are untouched.
- **Nothing about the car.** Same Kestrel, same tyres, same clamp, no reading of
  race position. 0.88 is a driver using more of the grip the car always had, which
  Shawn uses about all of.
- **Raced, by a machine.** The same planner in a second Kestrel at 0.95 and at
  1.00, from the player's grid slot: within 8 m of the rival for 37 s and 20 s, in
  contact distance for 1.6 s and 0.9 s, and past it. The rival kept every lap
  valid, with no reset, no reverse and no wheel off the pavement, and lost 0.2 to
  0.4 s on the lap it was passed. In the browser build its first lap is 89.28 s,
  the same as under Node.
- **Raced by Shawn the same day** (RWD Cinder, no pedal assist; the session
  replays exactly). 1:30.40, 1:25.63, 1:25.92 against its 1:29.47 and 1:27.27: he
  won, 3.4 s ahead at the last gate the rival reached, where the race before was
  won by twenty.
  He was behind at the line after lap 1 (0.93 s) and at 14 of the first two laps' 22
  gates, the lead changed hands seven times between gates, the cars were
  within 10 m of each other for 50 s (closest 1.9 m), and the rival was off its
  line passing or blocking for 33 s, with no reset and no reverse. He led from
  gate 8 of lap 2 to the flag.
  Where the time goes now: over the two laps both finished he gained 4.78 s within
  70 m of a gate and gave back 4.08 s everywhere else. The rival arrives faster
  (it brakes later) and leaves faster at nearly every gate, AWD on the clamp
  against rear drive on a bare pedal. His margin is the three fast bends, gates 1,
  5 and 9 (58, 67 and 52 degrees): 65 to 82 mph at the slowest point against its 45
  to 54, from 8 to 13 m off the centreline where the line's margins hold it within
  6 or 7. At the tight corners it is level or quicker. So if it is to be harder,
  the road it may use at a fast bend is the lever that is left, not the fraction.
  The yardstick race before it was against `full-line-v24` and is refused by name.

**Cutting corners that are not grass (Shawn, 2026-09-20, after that race: "way
more competitive for sure, I think what could help is letting the cpu cut corners
that aren't grass").** Built the same day; `RIVAL_REVISION` `full-line-v28`. v26 and
v27 were never committed: the cut at 0.80 on the dev server, before and after the
"lost" fix below. He raced them five times in forty minutes, so those sessions are
refused by name, and their numbers are here.

- **What it does.** Every corner of the line is rounded before the line is drawn,
  as the hairpin already was (`roundFrom` 45 degrees, `CORNER_ARC`), and on the
  INSIDE of each the line may go wherever a car may be instead of stopping 2.6 m
  short of the kerb. "May be" is `alderDrivable`: paved as the tyres and the lap
  recorder judge it (`alderGround`: the carriageway, 2.8 m of pavement and the
  corner two streets share) and 1.8 m clear of every building, tree and trunk. A
  corner of grass, or with a building on it, is not cut. The outside of a bend
  and every straight keep to the carriageway: it cuts corners, it does not drive
  down pavements. Kerb props do not collide and are kept 15 to 20 m from a
  junction, so there is nothing on a cut corner to drive through.
- **What it is worth.** At 0.88: 1:27.07 as raced, 1:24.97 with every corner
  rounded (an arc's room is both legs' asphalt, a vertex's only one), 1:23.12 cut.
  Uptown Link & Broadway went from a 43 to 48 m arc to 50 to 82, Highland & Dexter
  from 45 to 47 m to 87 to 99, and the two tightest corners from 15 and 20 m to 30
  and 31 to 35. It passes 8 to 13 m from a vertex where it passed 3 to 7.
- **The fraction: 0.88, by way of 0.80** (`RIVAL_STREET_LINE`). The cut was worth
  too much to leave his 0.88 alone unasked, so Claude took it down to 0.80, level
  with the race above, and said so. He raced that five times, was past it by the
  second, and set it back: "set it to 0.88". Three laps alone, cut, every row clean:

  | plan | lap 1 | lap 2 | lap 3 |
  |---|---|---|---|
  | 0.76 | 1:29.10 | 1:26.82 | 1:25.88 |
  | 0.80 | 1:27.70 | 1:25.30 | 1:24.47 |
  | 0.84 | 1:26.55 | 1:24.13 | 1:23.32 |
  | 0.88 | 1:25.47 | 1:23.02 | 1:22.23 |
  | 0.92 | 1:24.48 | 1:21.98 | 1:21.30 |
  | Shawn, the race above, no assist | 1:30.40 | 1:25.63 | 1:25.92 |
  | Shawn, 16:08 and 16:12, no assist | 1:29.05 | 1:23.92 | 1:23.38 (invalid) |
  | Shawn, 16:19, pedal assist on | 1:25.62 | 1:22.18 | 1:21.30 |

  At 0.88 it is about a second a lap quicker than his best valid lap with no
  assist, which is how the game is played, and nearly two slower than his laps
  with it.
- **The margin where it cuts is 4 m, not 2.6** (`cutMargin`). Aiming ahead, the
  rival runs 1.6 to 1.9 m inside its own line at a tight apex, as any driver
  does. At 2.6 that put one tyre on the grass for 2 to 6 ticks at 23rd & Harrison
  and Harrison & Broadway; at 3.2 for 2 ticks; at 3.6 and 4.0 for none, from 0.76
  to 0.88.
- **Raced, by a machine.** A second Kestrel on the same line at 0.84 and at 0.90
  from the player's slot: within 8 m for 46 s and 20 s, in contact distance for
  8.9 s and 0.8 s, and past it. Every rival lap valid, no reset, no reverse; a
  tyre off the pavement for 6 to 8 ticks while it was being fought, none alone.
  In the browser build its first lap is 87.87 s, as under Node.
- **One thing fixed on the way.** `rivalInput` keeps the aim on the road by
  clamping how far a pass or a block may move it, measured from the road's centre
  (`lateral`). A line that cuts a corner is further from the centre than the road
  is wide, so the clamp would have pushed the aim off the line, back to the road,
  at every apex. It may no longer push past the line itself. Nothing else moves:
  no other line is that far from its centre (golden master 14 of 14).
- **Not lost at a cut apex.** Shawn's race with the assists on (below) showed the
  rival at 30 mph through Harrison & Broadway on every lap. It wanted 22: "lost",
  the 10 m/s cap for a car off the carriageway, is read from the road's centre,
  and the line there is 8.5 m from a 14 m street's centre by design. A car within
  the line's own `clearance` (the 4 m it checked all round) of its line is no
  longer lost. 38.5 mph there now, 0.15 s a lap; the table above is after it.
- **Known, and left.** 100 sweeps do not settle a street's fast bends: Uptown
  Link & Broadway is a 70, 50 and 82 m arc over the three laps. At 1,000 sweeps
  the laps agree within 3% and the arcs are larger (85, 72, 88), for 3 s at the
  grid instead of 0.4; repeating the coarse-to-fine cycle does nothing, since
  going back to a coarse level throws the fine one away. Every lap is sound.
- **Raced once, in part** (Shawn, 16:12 the same day, while it was still being
  checked; the session replays exactly). 1:29.08 to its 1:28.03 on lap 1, behind
  by a second at the line; then a 1:23.38 that took the lead, INVALID (off the track
  too long), and the race left on lap 3. Through a corner he was at 52 mph at his
  slowest against its 46 (50 against 43 in the race before), and it now uses as
  much road as he does: 8.5 m against 9.1, 6.7 m from the centreline at the apex
  against his 4.1.
- **Like for like: both on the clamp** (Shawn, 16:19, `?assist=1`, since the rival
  always drives with the pedals' assist and he, by default, does not). 1:25.62,
  1:22.18, 1:21.30, all valid, against its 1:28.00 and 1:25.45: he won each lap by
  2.4 and 3.3 s. Over two laps, 4.40 s of it within 70 m of a gate and 1.25 s
  elsewhere. At his slowest in a corner he averaged 52 mph to its 45, on LESS road
  than it used (7.8 m against 8.5, 3.5 m from the centreline at the apex against
  6.6): with the line no longer the difference, what is left is the fraction, and
  by the table he drives about 0.92 of what this arithmetic calls the limit. On
  the long straights he arrives 8 to 16 mph faster (123 against 107 into Highland &
  Dexter), which is the cars: the Cinder does 60 to 100 in 2.97 s and 140, the
  Kestrel 3.75 s and 130. It still leaves nearly every corner faster, on four
  driven wheels. The assist is worth about 1.5 to 2 s a flying lap to him here,
  and 3.4 s from a standing start (one evening, his laps still getting quicker
  race over race: an indication, not a measurement).
- **And again, 16:29, assists on:** 1:26.38, 1:20.80, 1:20.57 to its 1:27.68 and
  1:25.28 (after the fix). 5.42 s of it within 70 m of a gate over two laps and
  0.37 s elsewhere; 52 mph to 46 at the slowest, on the same road (8.4 m to 8.5).
  Past the sweep's 0.92.
- **16:38, assists on, the first against `full-line-v27`** (replays exactly):
  1:25.93, 1:20.60, 1:22.67 to its 1:27.60 and 1:25.30. The same picture, 52 mph to
  46 and 5.57 s of it in the corners over two laps. The fix shows: 38 and 39 mph
  through Harrison & Broadway to his 40 and 41, where it had done 30. And the
  unsettled line shows too: Uptown Link & Broadway at 58 mph on lap 1 and 50 on
  lap 2, its 70 m and 50 m arcs, where he did 64 and 73.
- **So 0.80 was already behind him.** It was picked level with his 15:52 laps; by
  16:12 he was two seconds a lap quicker with no assist. 0.84 is level with those
  laps, 0.88 (his own number, before the cut) about a second quicker than his best
  valid one, 0.92 level with him on the same assists. He chose 0.88.
- **Raced at 0.88, 16:55, no pedal assist: he lost, by 0.62 s** (`full-line-v28`;
  replays exactly). 1:26.92, 1:22.43 (invalid: left the track), 1:22.07, his
  quickest laps without the assist, to its 1:25.45, 1:22.98, 1:22.37. He was
  quicker on laps 2 and 3 and never led at a gate: 1.48 s behind at the first,
  0.05 s and 1.9 m behind at the hairpin on lap 2, 0.62 s at the flag. Within 10 m
  for 34 s; the rival off its line for him for 17 s, no reset. Over the race he
  gained 3.97 s within 70 m of a gate and gave back 4.58 s elsewhere, and
  "elsewhere" is two places. The start: the launch hold, let go 0.32 s after the
  flag, and the throttle flat for the first 11 s, which with no assist is
  wheelspin (design/HANDLING.md: a floored start gives away about four car
  lengths). And the hairpin to the line, every lap: 0.05 s behind became 0.92 s
  in 120 m on lap 2, leaving the hairpin at 47 mph to its 58 on four driven wheels
  and the clamp. At the slowest point of a corner he averaged 54 mph to its 50.
- **Pad verdict (Shawn, 2026-09-20, after that loss):** "That felt great btw, the
  loss felt like it was my fault and I felt exactly where I was pressing, feels
  good enough to start talking slip stream now but I haven't tested it in traffic
  yet." On 2026-09-13 slipstream was put off because it "needs the rival within
  reach and it never was" (below, "Street pace"): within 20 m for 9.2 s of a race
  then, within 10 m for 34 s of this one. In traffic there is nothing to test yet:
  every race with traffic still fields the lane-arc rival, ten seconds a lap off
  him, because a racing line ignores lanes.

**Raced in traffic by Shawn (2026-09-20, `full-line-v30`; the session replays exactly).**
Uptown Circuit with traffic, in the Bulwark, no pedal assist: 1:27.42, 1:25.52,
1:24.17 to the rival's 1:28.92 and 1:28.45. "Way better than it was but I wasn't
worried about losing." Over the two laps both finished he gained 3.72 s within 70 m
of a gate and 0.72 s elsewhere; 51 mph to 44 at the slowest point of a corner. That
morning the same rival lapped this race in about 1:38.

What is left, measured the same evening with the rival alone on the same race:

| rival | lap 1 | lap 2 | lap 3 | contact |
|---|---|---|---|---|
| Moth's Kestrel, 0.88 (what he raced) | 1:29.10 | 1:28.48 | 1:31.95 | 0 ticks |
| Kestrel, 0.95 | 1:27.33 | 1:26.28 | 1:25.05 | 0 |
| Wake's Reign, 0.88 | 1:26.98 | 1:27.45 | 1:23.13 | 143 |
| Reign, 0.95 | 1:25.98 | 1:23.60 | 1:28.05 | 55 |
| Tally's Vesper, 0.88 | 1:26.62 | 1:33.98 (invalid) | 1:21.42 | 120 |
| Vesper, 0.95 | 1:25.95 | 1:23.82 | 1:26.62 | 111 |

- He raced the slowest car on the list. Every circuit fields Moth's Kestrel, #10,
  and the Blacklist's pace is in its cars: the same driver in #1's and #2's laps
  Uptown in traffic in 1:21 to 1:24 when a lap goes clean, which is his pace.
- The rival's skill is one number for every name (`RIVAL_STREET_LINE`, 0.88). At
  0.95 the Kestrel is 2 to 3 s a lap quicker and still touches nothing.
- What the faster cars lack is a clean race, not pace: one lap in three is 4 to 12 s
  slow, with contact, where the Kestrel had none. Arriving faster, they meet the
  traffic the lane rival's speed kept them clear of. That, not corner speed, is
  what traffic still costs.
- Undecided, nothing built. Shawn raised two levers: catch-up, or races with no
  traffic as NFSU has them. Claude's argument against the first: the rule here is
  no rubber-banding, and the race he lost that afternoon "felt like my fault",
  which is the thing catch-up spends. Against the second as a blanket: threading
  traffic is what this game is after, and `traffic` is already a property of an
  event, so it can be a choice per race rather than a structure. Levers that
  change no car and read no race position, in the order Claude would try them:
  a cornering fraction per Blacklist name instead of one for all; racing him
  against a name near the top in its own car (`gen-wake-42`, `gen-tally-7`)
  before judging the ladder by its bottom rung; slipstream, the same for both
  cars; and then what the faster cars' bad laps in traffic are made of.

**Traffic per attempt (2026-09-22).** "The traffic spawns the same exact way every time
when restarting a race" (Shawn). It did: the sim starts at tick 0 and traffic had no
seed, so a race from the grid met the same cars in the same places, every attempt. Each
attempt at a race now draws a traffic seed in `main.ts` (outside the sim; the recording
carries it, as it carries the pedal assist, so replay meets the same cars) and a restart
draws another. `createTraffic` takes it two ways: every vehicle starts a phase of up to
one spacing further along the one ruler it is laid on, and which way it turns is the
integer hash salted by the seed. The count and each id's kind do not move, because the
renderer sized its instanced meshes by them once, at load; checked in the browser after
a restart onto a fresh seed, all 261 cars drawn where the sim has them. Seed 0 is the old
traffic to the byte (the golden master is identical, 14 of 14), and free roam, the tests,
the batch and the golden master keep it. `?trafficSeed=` fixes one for a session and the
HUD's mode line names it.

What the seed found is bigger than the seed:

- **Seed 0 was the layout everything was fitted to.** Every traffic fix was soaked on it
  and every rival gate was measured on it, and of twelve seeds it is the cleanest. Traffic
  alone for ten minutes (`pnpm traffic:soak`): at seed 0 the longest stand is 88 s and
  three cars stand over a minute; across the other eleven the longest is 78 to 396 s and
  2 to 25 cars stand over a minute, some still standing at the end.
- **Those stands are starvation, not locks.** Tallied tick by tick for the four worst, a
  car at its line needing a chain of three to five movements through short connector
  lanes is refused for "a crossing is held" on nearly every tick, by 27 to 33 different
  cars in turn: something always holds one of its crossings. A car later in the grant
  order is granted whenever its own chain is free, even while one ahead of it is
  refused. Letting a car refused only for held movements keep its turn against later
  cars was built and measured, and made it worse on balance: seed 271828 went from 396
  to 345 s, seed 7 from 104 to 175, seed 99 from 91 to 165, and seed 0 from 3 cars over a
  minute to 7. It helped the car that kept its turn and cost everyone behind the cars it
  blocked, and it could only apply when the lanes a long chain runs through are empty,
  which they seldom are. Reverted; traffic stays `traffic-v7`. Starvation at junction
  clusters is open, and it is a property of reserving whole chains, not a missing rule.
- **The rival is fitted to seed 0 too.** The 83-race batch under two of the worst seeds,
  player parked (`design/measurements/traffic-seeds.json`): distinct incidents go from 4
  at seed 0 to 8 at seed 1000 and 9 at seed 271828, and at seed 271828 the first contact
  on a line (gen-63, gen-71) and in a pass (gen-37) since those gates existed, with
  +1.0% and +2.8% on time. Races with contact go from 3 to 11 and 37, but 26 of seed
  271828's are one incident at 275 m, 9 s from the shared grid. "Zero contact on a line
  or in a pass" was true of one traffic.
- **And one test was fitted to it.** The indicator test measured a car's turn from its
  heading 45 m before the line, and lane 29 bends 64 degrees on its way to a straight-on
  junction: under seed 271828 that read as a right turn with no indicator. The indicator
  was right; the test now measures from where the indicator reads (`APPROACH_READ`). Seed
  0's two minutes had never sampled that approach. It and the forecast test now run under
  a seed as well as seed 0.

**Six layouts, and whose crash it was (2026-09-22, `traffic-v8`).** The batch at six
traffic seeds (0, 1000, 271828 and three more soaked the day before, 1, 42, 314159)
met 50 distinct incidents where seed 0 alone had met 4, and every one of the 21 at the
first three seeds was dissected: what the traffic car was doing, when it had claimed
its junction and where the rival was then, when the rival began to brake. Five kinds:
traffic turning across the rival (9, the shared 275 m one among them), traffic turning
into its road just ahead (3), an oncoming car with no junction in it (3), a same-way car
the rival read too late (2), and grazes at walking pace (4). The first two were traffic's.

A car claims its junction only if no racer on the move will cross it before the car is
clear (the 09-13 rule above), and it reckoned how long it would be in it as
(metres to its line + 30) / the speed it had. It then slows for its corner. At seed
271828 a taxi at 38 mph claimed a left turn with the rival 217 m off at 67 mph,
reckoned itself clear in 3.8 s, took the turn at 16 mph and held it 7.1; the rival
braked from 109 mph at 47 m and met it at 60, in 26 of the batch's races, which share
that grid. Of eleven claims the rival later ran into, projecting the rival over the
hold the car actually drove found four of them (0.2 to 4.4 m, inside the 5 m band): the
reckoning was the whole fault there. Of the rest, three came round a bend (the look is
straight along the racer's heading, and traffic cannot see a bend without the racer's
route; given the rival's alone it would help the rival and not the player), two were
marginal on the band, and two were cars stuck in the junction for 20 s and more.

A claim now reckons its hold as the car will drive it (`clearingTime`): braking to the
tightest corner of its chain by the line, the way `cornerLimit` plans the approach, and
through every movement to where it is clear at that corner's speed. Traffic alone,
over 5,300 claims at three seeds, held / reckoned went from a median of 1.36 to 1.40 by
seed (p10 to p90 0.63 to 1.74, a third of claims held 2 s past it) to 0.94 to 0.95 (0.85
to 1.00, none). The
look along a racer is unchanged, and traffic alone is unchanged, so neither the soak
nor the starvation moves. `pnpm golden`: 13 of 14 identical, free roam moved (the one
run where racers meet traffic at junctions). Both tests fail on the old reckoning.

| Six seeds, 498 races, the rival alone | Time | Contact ticks | Races with contact | Distinct incidents | On a line | In a pass | Off the pavement |
|---|---|---|---|---|---|---|---|
| `traffic-v7` | 47,513 s | 1,197 | 89 | 50 | 31 | 27 | 849 |
| **`traffic-v8`** | 47,364 s | 640 | 66 | 53 | 11 | 27 | 824 |

Not a clean win, and read as one it would mislead. Contact ticks and races with contact
fall mostly because the 26-race incident is gone. Distinct incidents are flat: matched
by place rather than the tick, seven went and eight came, because once one junction goes
differently a race meets other traffic from there on. None of the eight is a car held
for the rival and then let go into it. What v8 removes is one way traffic was wrong; what
the rival meets after that is mostly the rival. Four of the eight, and three of the old
ones, are the next thing: an oncoming car with no junction in it, which is the rival
pulling out to pass a slow or stopped car in its lane into a car coming the other way,
and braking in that lane rather than leaving it (gen-70 at 125 mph). Its three looks at a
side (now beside it, now beside the car, and alongside) miss a car that meets it between
them. A rule for that was built and measured (`driver-v3`, not shipped): it removed those
contacts and let the rival take the right on a 12 m street instead, from where it steered
back through the car beside it once the left reopened, four seconds of contact. The
reactive dodge picks its side afresh every tick; that is the next thing to fix.

The six-seed batch is now a command, `pnpm rival:gate`: every seed and quarter of the races
in its own process (about 20 minutes on 24 processes), compared race by race with
`design/measurements/rival-gate.json`, which the change that moves it re-saves (`--save`).
A distinct incident is one (time, route metres) pair; it over-counts a contact broken in
two and one that shifts a tenth of a second, so read the list, not only the count.

What came next was not the fix (2026-09-22 to 09-23). The side commitment was built, and
with it everything the rival and traffic had ruled out on 09-13 was re-examined on the
gate: most of those rules were made on a rival that rode the centreline among traffic that
could not see it. Deciding an oncoming car by where the rival is going changed nothing;
letting a pass use the rival's own half to the kerb was clearly worse; a claim given back
while the car can still stop had the best incident counts and more standoffs. driver-v3
itself traded one kind of incident for another in three forms, the first two each failing
on a bug in its new rules. None of it shipped (`design/COUPLINGS.md`, "What was ruled out";
`design/measurements/driver-v3.patch` and `driver-v3-gates.json`). Shawn called the rival in
traffic good enough for Phase 1 at `traffic-v8` / `driver-v2` (`design/HANDLING.md`).
`pnpm rival:scene <race> --seed=` replays any race of the gate as a scene: every contact
dissected, or the rival tick by tick through a stretch (`--from= --to=`).

**Three races against Wake, and the rear-end under "traffic slows her down" (2026-09-22,
`driver-v2`).** Shawn raced `gen-wake-42` three times from the grid in the Cinder, no
pedal assist, all three recorded and all three replaying exactly:

- **Through the open ground first**, 1:10.68 against her 1:21.25, "I cheated because
  any player picking this game up for the first time would probably do exactly what
  I did". Two cuts across grass: 235 m of route done in 152 m before gate 2 (+3.2 s)
  and 729 m done in 457 m on the last leg (+6.3 s net), at 78 to 110 mph, 89% of it
  on ground a line may not go. The recorder calls the lap invalid; the GDD calls it
  open racing. The Reign is AWD and grass costs it nothing, so the cut is a better
  deal for her car than for his, and she cannot take it: she lives on the street
  graph. Shawn wants both of the answers below; neither is built.
- **Then twice on the streets**, 1:17.45 and 1:17.07. He held the launch each time
  (the handbrake let go 5 and 16 ticks after the flag) and was still 1.8 s down at
  the 100 m mark: the Cinder off the line against an AWD car launching at 0.9. He
  loses 1.7 s in the corner complex before gate 2, where she is on her line at 50
  mph and he is not, and takes 3.4 to 4.3 s out of her at the 26 degree bend at
  2400 m, where she brakes to 77 mph and he does 130 (the bend the window redraw is
  for). Alone she runs this race in 81.3 s; against him on the streets he is about
  4 s quicker, not the "about a second" the cheat race's replay had suggested.
- **What he saw as "traffic that slows the rival down"** was her hitting it. In the
  second race she ran 86.83 s: he passed her into the bend, she moved back right
  behind him (`RIVAL_RACING`, covering his side), and 24 m ahead of her at 2435 m was
  a sedan doing 31 mph in her lane. She chose to go round it on the left. That moves
  `intent` 3 m across at 4 m/s; the car under it moved 0.4 m in the 0.75 s that took,
  because at 85 mph the heading controller asks for a fifth of the lock. The hazard
  loop judged the sedan against `intent`, found it 3.2 m out of the path, never
  lifted, and hit it at 85 mph: a spin, full lock for five seconds, 15 mph. In the
  third race she was already left of the same sedan and the planner committed a pass
  at 39 mph instead. The pass planner had declined in the second race because the
  reactive driver had already chosen the same corridor (`traffic-pass.ts`, "left
  alone"), and the reactive driver's timing was wrong.
- **The fix** is in the hazard loop: a slower car following this road is also
  judged against where this car WILL be when it gets there (`willBe`), from where
  it is, at the rate it is moving across the road and credited with the lateral
  acceleration it has (`followAcross`, 2 m/s²: what the controller delivers once it
  is steering), towards the side it is choosing and never past it. It is in the
  path if that is within the cars' own width (`followCorridor`, 2 m) plus a margin
  that grows to 0.3 m with a second to react (`followMargin`), and never under
  4 m/s of closing speed (`followClosing`), where an impact is a nudge and the old
  bumper rule holds. Alone on a straight, 2 m right at 85 mph with the sedan 24 m
  ahead: driver-v1 overlaps it by 1.5 m; driver-v2 brakes to 49 mph while it moves
  out and goes round touching, box to box, with nothing to spare. At 40 m it passes
  at 77 mph with 0.5 m, at 60 m at 95 as before, at 90 m nothing changes. Replaying
  his inputs against her: the second race's 86.83 s becomes 80.33, and the other two
  are identical to driver-v1 to the tick. The golden master is bit-identical, 14 of
  14: nothing in it meets this. The 83-race batch, player parked, against v32
  (`design/measurements/driver-v2.json`): 65 races identical to the tick; 7,804 to
  7,827 s (+0.3%); contact 12 to 40 ticks, all 28 new ones in one race; resets 3 to
  4, no reversals, nothing off the pavement. Where it costs, it is the rule doing
  what it says: gen-35 brakes 3.9 s for a taxi merging across its line at 96 mph
  that driver-v1 passed because the taxi straightened; gen-67 slows 2.8 s beside a
  stopped car 2.5 m off its line; gen-57 and gen-81 lose 1.5 s to a stopped taxi
  2.2 m off theirs, and gen-81 then 8 s more to a queue behind a crawling sedan
  with a truck oncoming, which it reaches 1.5 s earlier than driver-v1 did and
  driver-v1 missed. The fault it fixes cannot happen in the batch and happens in a
  race whenever the player passes her, so that is the trade.
- **Six versions of that rule were measured on the batch before this one**, and
  every one traded a case for a case: her offset at the aim point 17 m on carried to
  the car's station 60 m on (0.65 m apart through a bend: gen-54 braked from 100 mph
  to 35 for a truck 4.6 m beside its line); `nearestSide`, across the polyline leg,
  for where she is (1.6 m from the driving path through a corner arc: she matched a
  sedan's speed beside it into a junction); no credit for lateral motion not yet
  begun (a car 30 m ahead in the lane read as unavoidable); the loop's 2.6 m corridor
  on a prediction good to 0.2 m (brakes for gaps of 2.2 to 2.5 m that driver-v1 drove
  through); a margin that shrank with the closing speed (released 0.3 m early, mid
  manoeuvre); and a margin held from engagement (gen-67 engaged far out, held the
  full margin, and stopped beside a stopped car until the unseen reset). Every
  offset in the rule as shipped is across the road at its own station, and the
  numbers came from a hook printing what the check saw, not from reasoning about
  it. What it still costs is at the borderline of that 0.3 m, and there is no value
  of it that separates a 2.2 m pass from a 2.3 m one: the rule is honest to about
  0.2 m and no more.
- **The batch could not see this either.** It needs the player to push her off her
  lane, which is what racing him does. Four of the last five rival faults were found
  in his recordings and not in 83 races alone.

Two things he raised are open, not decided:

- **Shortcuts.** Open racing says the cut is legal; the rival cannot take it. The two
  answers he likes: let her take it (an off-road leg between gates where the ground is
  open, planned at the ground's pace), and draw courses that measure how much a cut
  is worth (cut 2 is 0.63 of the street distance) so a course does not hinge on one.
  Neither replaces the other.
- **Traffic is the same on every restart.** `createTraffic` lays vehicles along a
  fixed ruler with no seed, and their turns are the integer hash of the vehicle and
  its junction count, so a race from the grid starts the sim at tick 0 and meets the
  same cars in the same places every time; only a flash, which starts the sim at
  another moment, meets other traffic. Law 2 makes this correct; whether a retried
  stage should be the same race with the same traffic is a design choice. A seed per
  attempt would have to be recorded, as `startCode` is, so the recording still
  replays; the batch would keep seed 0. Built the same day: "Traffic per attempt" above.

**A rival named by what it is made of (2026-09-21).** A raced recording replays only
against the rival it raced, and "the rival" was one hand-bumped string,
`RIVAL_REVISION`: 32 values in eight days, eleven of them one name's car being
tuned and four of them one race's line, and every bump refused every raced
recording in the library, Ridge Circuit's for a street line in traffic included.
The next piece of work (a bend's window) is a street line's drawing and nothing
else, which is what made it worth fixing first. A session's `rival` is now composed
by `rivalRevision(route)` (`src/sim/rival-revision.ts`) from what that race uses:

- **What the route is told to be names itself**: its car and that car's tune
  revision, its launch and share of the grip, and a fingerprint of the line it
  drives, the drawn numbers. Redrawing a line refuses the races whose lines moved,
  by exactly that, and no one has to remember anything.
- **How it drives is code**, which cannot describe itself, so three layers keep a
  token bumped by hand: `driver` (every raced session), `streetLine` and `pass`
  (only a route that has them). Each layer's tables are fingerprinted beside its
  token, so a number changed without the bump is still another rival.
- **The line is named to the millimetre, not the bit**, and that was found the hard
  way. Hashed exactly, Ridge Circuit's line was `44e03770` in Node and `7d0eedc2` in
  the game: Chrome 152 and Node 24 differ in the last bit of `Math.atan2(0.3, 1.7)`
  and `Math.tanh(0.7)`, so the two draw lines that part company in the sixteenth
  digit, and every recording made in the game would have been refused by `pnpm laps
  --verify`. Every test passed, because every test runs in Node. Replay compares
  positions at a centimetre, so a millimetre is finer than anything it can see. The
  tyres use `tanh` too: a lap from the game replays in Node to the recorder's
  rounding and not to the bit, which law 2 already says of other browsers and is
  now measured between the game and its own test runner. All five races checked
  name the same rival in both.
- Wake's race reads `driver-v1.<tables> reign-r2 launch-… street-line-v1.<tables>.<line>
  skill-0.96 pass-v1.<tables>`, Ridge Circuit's `driver-v1.<tables> kestrel-r3
  line-<line>`, and a refusal says which part differs (`raced another rival:
  skill-0.96 -> skill-0.9`). A solo session names none.

Nothing replayable was lost to it: the three raced sessions that named
`full-line-v32` were on worlds from before the night's city work and were refused
by world already. The history of the single string stays above `RIVAL_TABLES` in
`rival.ts`. The world's own id is the same kind of chain and has the same gap this
closes (a system is versioned as often as its author remembers, `design/CHAOS.md`);
that one is not touched here.

**What one recorded race found (2026-09-20, `full-line-v32`).** Shawn raced Wake
(`gen-wake-42`, Bulwark, no pedal assist) and won, 1:19.12 to her 1:24.33, "wasn't
worried". It was the first sprint with a recording, and `pnpm laps:compare` put
4.6 of her 5.2 s somewhere other than the gates. What came out of it, the
first two from the race and the rest from the batch run to check them
(`design/measurements/rival-v32.json`):

- **A pass held to its lead's speed.** The two were level to 2400 m, where she lost
  5.4 s in 300 m beside a sedan doing 44 mph. The planner read her pass as unclear
  at the point it came back in, where the only thing in the way was the sedan
  itself, and an unclear pass is capped at a braking speed, which works out at
  about the lead's own: never ahead because held to its speed, held to its speed
  because not ahead. It now stays out further instead, as far as clears
  (`TRAFFIC_PASS.holdOut`); anything else in the corridor still slows it. On his
  inputs the 5.4 s became 2.7. The 83-race batch came out identical to the tick
  with and without it: the batch parks the player, and this needs a race.
- **Gentle bends had no line.** She braked to 77 mph for a 26 degree bend he took
  at 116: only a corner sharp enough to be rounded (45 degrees) got a window, so a
  bend was driven round the lane's arc in its own half of the road. A bend of
  `STREET_LINE.bendFrom` (12) degrees is a corner now. A line through EVERY bend
  was slower, 2.7 s on a clear `gen-tally-7`: at 150 mph a line a touch less
  straight than the lane is planned slower than the lane, and between bends the
  lane is perfectly straight. So a window is kept only where its line is quicker
  than the lane through it, both timed the same way (`STREET_LINE.worth`). On clear
  streets the kept set is never slower than none and is worth 5.9 s on
  `gen-crest-23`. **It does not yet fix the bend it came from:** a window reaches
  60 m either side of a corner, sized for 40 mph, and at 115 mph that is half a
  second to leave the lane and come back, so her 26 degree bend's line comes out
  tighter than the lane and is dropped. At 120 m (`bendReach`, in place, unused)
  A bend just before a sharp corner the other way must not make its own inside the
  way in: two 13 degree right-handers ahead of a 102 degree left (`gen-39`, 2030 m)
  had the line swinging 4 m out for the left, the swing `entryInLane` exists to
  stop, until a sharp corner's entry was written over a bend's. At 120 m
  that bend draws at 121 mph and her race in traffic goes 81.9 to 76.4 s, Tally's
  87.4 to 82.5, and Crest's gets 2 s slower: his last window becomes a run of five
  corners and the solver leaves a 40 m kink in it that still beats the lane. That
  is the next lever, and it is a line-drawing problem, not a driving one.
- **It steered for a turn's geometry, and at speed that is a third of the wheel.**
  The one regression in the bends batch, `gen-78` off the pavement for 114 ticks,
  was an old crash ending differently: at 130 mph through a 21 degree bend it ran
  5 m wide into an oncoming van, in v30 too. The bend was 56% of the grip and
  planned flat, correctly. The fronts are softer than the rears (12 against 15) and
  lighter under power, so the car understeers and a steady turn takes more wheel
  than its geometry: 1.5 degrees against 0.41 there, of a lock of 1.7. At 30 mph the
  difference is 3% of the lock; the lock shrinks with the square of the speed. The
  feedforward now asks for what the tyres take (`steadyWheelAngleFor`, held to the
  car on every drivetrain by a test; `RIVAL_STEERING.slip`). Flat out through a
  synthetic 21 degree bend: 8.0 m wide before, 1.7 m now. Planning a lane's bends
  no faster than the lock could hold with a fifth in hand was tried on top: 0.06%
  slower over the batch and no cleaner, so it was taken out again.
- **Round a bend, a car keeping to its lane read as crossing.** What began that
  crash was a full-brake stab at 123 mph mid-bend. The van was 2.7 m the other side
  of the centreline and stayed there, but it was measured from the aim point,
  whose frame is turned from the road under a car 100 m on by the bend between
  them. A car that follows this road is now read in the road's frame where it is
  (`RIVAL_TRAFFIC_FRAME`); anything else is read as before. This is what removed
  the contact: with the steering alone the batch had 72 ticks, with both 13.
- **A pass's path is clear of a car that is on it.** One crash was left, inside a
  pass, where the gate is zero (`gen-46`): pulling out at 105 mph round a sedan that
  had all but stopped, still drifting the other way from the bend before, 2.2 m
  short of its path where it should have been clear, and looking 26 m ahead because
  a committed pass owns the forecast. More than `PASS_ASTRAY` (1 m) off its pass's
  path it now looks as far as it would with none. A pass it tracks is unchanged to
  the tick.
- **What a planned pass is worth now.** The pass test's fixture, `gen-20` and its
  merging car, met nothing at v32: the rival is eight seconds up the road by then.
  Over the 17 batch races that commit a pass, planned against reactive passing is
  4.3 s in total and 6 ticks of contact to none, and `gen-37` is 3 s slower for it.
  Much of what it bought at v30 was cover for steering that ran wide and a frame
  that misread bends. It stays: it is what keeps a pass to one side, and the player
  is not in those 17 races.

| 83 races, player parked | v30 | v32 |
|---|---|---|
| total | 7,883 s | 7,804 s (-1.0%) |
| contact, ticks (races) | 149 (11) | 12 (2, both under 20 mph) |
| on a line / in a pass | 0 / 0 | 0 / 0 |
| ticks off the pavement | 24 | 0 |
| resets, reversals | 4, 1 | 3, 0 |

On his own inputs from that race, against the rival as she now drives, she leads
from 1000 m to 2400 m by up to 1.3 s, he leads from 2500 m, and he is 0.75 s ahead
at 3400 m of 3516: a race decided by under a second where it had been 5.2. What she
still gives away is the 26 degree bend (1.3 s across 2400 and 2500 m) and the last
corner, whose line she does not take in traffic (0.8 s). That is a replay, not a
race: he would not have driven the same against a car beside him. His recording
names `full-line-v31` and is refused by name from here.

**Generated races are recorded (2026-09-20).** Shawn raced Tally's `gen-tally-7` and
the only trace of it was a finished race in a browser tab: laps were recorded on
the circuits, and the career is sprints. A generated race now records as one lap,
replays exactly and compares gate by gate (`src/sim/recorded-event.ts`,
`recordings/README.md`); the game, the replay check and `pnpm laps:compare` draw the
race from the same place. `laps:compare --line` is gone: it was the experiment that
became the rival in traffic.

**A share per name (2026-09-20, `full-line-v31`).** Built from the argument above:
each Blacklist name takes a street line's corners at its own share of the
grip-limited speed, 0.84 for Moth to 0.975 for Tally (`BLACKLIST_CORNERING`;
the table, what each car holds and what it is worth in traffic are in
`design/BLACKLIST.md`, "How hard each name drives"). Races with no name on them,
the circuits included, keep 0.88.

**Committed traffic passes (2026-09-20, `full-line-v30`).**
Generated street rivals and Uptown with traffic can now plan a complete pass in
`src/sim/traffic-pass.ts`: pull out, clear the lead, return to the lane, and check
the road immediately after the return. The chosen side persists until the pass
ends. Geometry, corner speed, pavement under the car's footprint, and predicted
traffic occupancy are evaluated together. An active corner cut keeps ownership;
an accepted pass temporarily owns steering and speed instead.
Admission is limited to straights and gentle bends (under 0.15 radians of road
direction change through the maneuver). On larger bends the real car can drift
outside the geometric prediction: gen-26 clipped its lead and gen-35 needed a
reset. Both now retain the existing driver through those bends.

Planning runs every 12 ticks. Candidates must finish within a six-second
forecast, with another two seconds checked after the exit. Traffic is forecast
both holding speed and accelerating toward its ordinary cruise speed after a
turn, respecting corner limits and held junctions. The player is included with a
constant-velocity forecast. A pass is refused if either traffic forecast occupies
it; the lead must be clear before the return, including when it accelerates.
While committed, the plan is checked again, can slow down, extends its hold if
the lead is still alongside, and can return behind a lead that pulled away.
Recovery discards the maneuver. The ordinary driver remains the fallback when
there is no admitted pass, and keeps a pass already taking essentially the same
corridor. No vehicle power, grip, traffic behavior, or recovery advantage changes.
A rejected candidate changes no steering, braking, or corner-line decision: an
early version still applied following speed after rejection, and that delayed
gen-54 into a later collision despite never committing a pass.

Two integration failures mattered more than tuning the desired offset. First,
the old linear hazard prediction braked during a pass its curved forecast had
cleared; gen-7 lost nine seconds. The committed path now owns that prediction,
with a short body-relative emergency check. Second, taking over an already-clear
pass delayed the rejoin into later oncoming traffic on gen-40. It now retains the
existing maneuver, and the real-simulation regression test catches that failure.
Gen-20's accelerating merger is a separate regression fixture: the old driver
changes sides while alongside; the committed pass clears it without contact.

These are forecasts of observable motion and planned turns, not guarantees about
later junction grants, queues, or a player changing direction. The batch's player
is parked at Wharf Garage; it does not establish pace against a human racing in
traffic. Traffic contact counts are the same approximate overlap probe used for
v29, not physics collision events. Reproduce the comparison with
`node --experimental-strip-types scripts/street-line-batch.ts --all --line --trace`
and add `--legacy-pass` for v29 passing. `--output=path.jsonl` streams rows to disk.
Browser coverage is `node scripts/test-street-line-browser.mjs --passes`.

The final 83-race run is saved in
[`measurements/traffic-pass-v30.json`](measurements/traffic-pass-v30.json), with
source hashes, every race row, and the v29 baseline source. All 83 finished;
25 admitted a planned pass. Eight races improved, ten slowed, and 65 retained
their reported time. The largest loss was 0.55 s; gen-20 improved from 104.67 s
to 103.50 s and its 113 overlap ticks fell to zero.

| Measure | v29 passing | Committed passing |
| --- | ---: | ---: |
| Total time | 7,884.90 s | 7,883.24 s |
| Approximate traffic-overlap ticks | 266 | 149 (-44%) |
| Overlap during a committed pass | n/a | 0 |
| Wheels-off-pavement ticks | 24 | 24 |
| Unseen resets | 4 | 4 |
| Ordinary resets | 0 | 0 |
| Progress jumps | 5 | 5 |

There were no per-race increases in off-pavement ticks or resets. Overall pace
is effectively unchanged: this is a measured reliability improvement, not
evidence that the rival now matches its clear-road pace in traffic.

Validation: 641 tests passed in the full suite before the final admission and
fallback fixes; the final ten planner tests passed afterward, including real
gen-20, gen-35 and gen-40 runs. Build and diff checks passed. Browser probes
captured active passes in gen-7 and gen-20 with no page errors, and verified
Uptown / Clear retains its original mode. The golden harness retained eleven
hashes; its three generated-rival runs differ from the older pre-v29 baseline.

**Corner lines in traffic, enabled by default (2026-09-20, `full-line-v29`).**
Generated street races and Uptown with traffic now carry a conditional racing line.
The centreline route, gates, distance and reset path stay intact. Outside corner
windows the rival drives its existing lane path; inside them it can take the cut
line at 0.88 of the grip-limited speed. Free-roam drivers, Sound to Sky, drag,
drift, arena circuits and Uptown / Clear retain their existing behavior.

The solver holds the line in its lane outside windows extending 60 m either side
of corner arcs. It stays in or inside its lane on entry, cuts the apex, and may
run wide on exit. The overlay stores **positions matched by arc length**, not
normal offsets from a tight lane arc: those normals can fold, as they did in
`gen-82`. Any window with a shift beyond 18 m or an unpaved shifted station is
rejected in full. Route progress follows the overlay while it is being driven,
so crossing an apex does not jump between the centreline's legs.

`readStreetLine` starts planning up to 150 m before the window, rereads traffic
every six ticks, and checks arrival times with 0.75 s of slack either side. A
stopped car within 9 m of the shifted line also refuses the corner. A refusal
lasts 90 ticks; steering blends back toward the lane over 48 ticks. The forecast
uses one ghost integration per car across all requested times. It remains a
forecast of the current plan, not a guarantee about later junction grants or
acceleration. A route whose line is never authorized drives identically to the
same route without the overlay.

Claude's completed handoff batch is preserved in
[`measurements/street-line-v29.json`](measurements/street-line-v29.json). It ran
Uptown's three laps and `gen-1` through `gen-82`, both ways, with the rival in its
real simulation slot and the player parked at Wharf Garage:

| Measure | Lane baseline | Conditional line |
| --- | ---: | ---: |
| Finished | 83/83 | 83/83 |
| Total time | 8,281.6 s | 7,884.9 s (-4.8%) |
| Uptown, three laps | 296.80 s | 269.42 s |
| Approximate traffic-overlap ticks | 141 | 266 |
| Overlap while blend > 0.05 | n/a | 0 |
| Wheels-off-pavement ticks | 105 | 24 |
| Unseen resets | 11 | 4 |
| 12-second resets | 0 | 0 |
| Recovery reversals | 0 | 1 |
| Route-progress jumps over 6 m | 5 | 5 |
| Races over 16 m from centreline | 0 | 9 |

The last measure includes intentional paved corner cuts and is not itself an
off-road count. The harness's contact metric is an approximate box-overlap probe,
not physics contact events. Its largest added incident is `gen-20`: 113 ticks,
starting at 97.5 s, with blend zero. That locates the incident in lane driving;
it does **not** prove that earlier line use had no causal effect on arrival time,
speed or traffic interaction. Total contact increased, so the prior gate of
"no contact the lane-arc rival does not have" was not met. Shawn explicitly chose
to enable the feature by default with this regression documented. Zero measured
on-line overlap is evidence from this batch, not a general no-contact guarantee.
A moving player contesting the corner and broader traffic/start variations remain
outside this batch's coverage.

Reproduce individual races or the full comparison:

```powershell
node --experimental-strip-types scripts/street-line-batch.ts --all --trace > artifacts/street-line-base.jsonl
node --experimental-strip-types scripts/street-line-batch.ts --all --line --trace > artifacts/street-line-line.jsonl
node --experimental-strip-types scripts/street-line-batch.ts gen-20 gen-82 --line --trace
```

Regression coverage includes blocked-corner withdrawal and cooldown, `gen-82`
geometry rejection, unchanged driving when permission is never given, deterministic
Uptown laps, forecast immutability and batched/single forecast agreement. The
clear-street and arena racing-line geometry hashes match the pre-overlay baseline.
`RIVAL_REVISION` changes so recordings distinguish these rivals; traffic's driven
behavior, physics and course generation are not revised by the forecast refactor.

Continuation validation reproduced the saved `gen-20` and `gen-82` results.
The 14-run golden comparison leaves 11 runs bit-identical (handling and resets,
Sound to Sky, arena, drag, drift, and free roam); only the three generated-rival
runs move. Browser smoke checks load and exercise `gen-7` and Uptown with their
conditional lines and confirm Uptown / Clear keeps its existing line, with no
page errors. `scripts/test-street-line-browser.mjs` reproduces those captures.
The production build passes. The full suite passed 631 of 632 tests; its remaining
failure was an unfinished test's assumption that lane offset always increases
with road width. After correcting that assertion for the one-/two-lane class
boundary, the complete five-test street-line file passed on rerun. No runtime
change was needed for that correction.


**Could the line be taken corner by corner in traffic? Measured, nothing built
(2026-09-20).** The idea from 2026-09-13 again ("the whole road when a corner is
clear", below), now that there are two whole paths to choose between, the lane
arcs and the cut line, and a forecast that is exact. One number first: how often
is the line through a corner clear of forecast traffic when the rival gets there?

Method. The 82 sprints `gen-1` to `gen-82` and Uptown in traffic, the shipped
rival driving its lane arcs, unchanged. `STREET_CIRCUIT_LINE` drawn through each
route; a corner is where the line bends tighter than 150 m, 40 m either side.
About 30 m before each, one verdict: for every traffic car within 260 m,
`forecastTraffic` to the moment the line would have the rival at each sample (its
speed now, the line's corner speeds at 0.88, 4 m/s² on and 10 off), 0.75 s either
side, and a hit is that sample inside the car's own box plus half a Kestrel and
0.6 m. The same for the lane path. Then the truth: where traffic really was at
those moments.

- **The line generalises.** 83 of 83 routes took one, none with a turn past 17
  degrees at a sample. Uptown was the only street route it had ever drawn.
- **80.1% of 700 corners are clear** (8.4 a race). Median race 83%, worst 40%,
  every corner clear in 14 of 83. Tighter than 30 m, 87%; 30 to 60 m, 73%; wider,
  85%. Uptown itself, 17 of 28.
- **What blocks it is oncoming traffic**: 95 of the 139, 39 going its way, 5
  crossing. In 102 of the 139 the lane is clear and only the line is blocked; in
  37 the lane is blocked too, which is traffic in the way of any driver.
- **The forecast was right at 681 of 700.** Nine called blocked were clear, which
  is pace left behind. **Ten called clear were not (1.8% of the clear ones, one
  in eight races)**, and traffic cannot be pushed, so that is the number that
  decides it. Each was a car the forecast had seen and put somewhere else:
  - three oncoming taxis at full speed, 7 to 9 s after the verdict, at the far
    end of a 200 to 300 m window: cars that were waiting at a line with no claim,
    which a forecast holds there and the junction then let go (its header says as
    much: "a forecast, not a promise");
  - three going the rival's way through the junction at 19 to 20 mph, 6 to 14 m
    from the real rival: traffic answering a racer the forecast does not know
    about, and cars its ordinary traffic loop already sees;
  - four slow cars, 1.5 to 3.4 s out, picking up speed the forecast does not give
    them back after a corner or a stop.
- **So: viable, and not as one verdict.** Every miss is a long look or a car
  changing speed. A rival that decides once, 30 m out, for the next 10 s would hit
  something about every eighth race, which is the 2026-09-13 result again. One that
  re-reads every tick, commits only as far ahead as the forecast is exact (2 to 3
  s), treats a car waiting at a line that feeds the corner as about to pull out,
  and can fall back to its lane mid-corner, has not been measured. That is the
  build, and its gate is this batch: no contact the lane-arc rival does not have.
- **Not measured: what it is worth.** On clear streets the line and 0.88 are 12 s
  a lap on Uptown. Four corners in five of that is a guess, not a number.
- **What it cost the instruments.** `pnpm cars --laps` drove this race's rival
  route for its Uptown column; it now names the in-traffic race's route, on clear
  streets as before, so that column still measures what every tune was judged on
  (Cinder 96.33 s, Kestrel 95.17 s, before and after).
- **Open.** It is one circuit and one driver. 0.88 came from one race against one
  rival, so expect to move it; the test pins the flying lap between 86 and 88.5 s
  so that moving it is a decision.


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
streets, `-solo` for no rival (`street-uptown-clear-solo`). On empty streets the
rival drives a racing line that cuts the corners that are not grass, at 0.88
(2026-09-20; "Against a human, measured", above); in traffic, the centreline and
its lane arcs. The grid is 12 m
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

**The twelve-second reset never gains ground (2026-09-13).** With recovery out of
sight in, the twelve-second reset is the one the player can watch: a stuck rival
within 120 m of them. It tried 8 m further along first and could land 24 m ahead,
so the reset in view was the only one that could gain ground. By Shawn's call it
now keeps the rule the unseen one has, where it was or behind (`RIVAL_RESET_TICKS`
in `sim.ts`, "full-line-v8"), and the timer stays at twelve seconds: before then
the rival is visibly reversing out of trouble, which reads as a driver, and a
shorter timer would only mean more resets in front of the player.

One exception keeps it from looping. A route blocked for good puts a rival reset
behind the blockage straight back against it, so a second reset within 30 m of
where the last one put it may go past, 8 m at a time; it has lost 24 s by then.
`tests/rival.test.ts` boxes the rival in on its route: the first reset puts it
behind the box, the next past the back wall, the third out, and the test fails
with either rule removed. The 82 generated races cannot measure this: their player
stays parked on the grid, the rival is out of sight, and the twelve-second reset
fired in none of them.

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

**Slowing traffic for turns: tried, not shipped (2026-09-13).** Traffic takes
junctions at its cruise, and its turns look wide because a car does not drive an
arc: it jumps to its next lane and slides onto it over up to 48 m. Slowing for
turns was tried (18 mph through 80° or more, eased at 2.5 m/s²) and came out:

- **Traffic overlapped itself.** Junction conflicts are computed offline on the
  lanes' own paths, and a car physically follows its slide. At cruise two cars on
  non-conflicting movements never meet in the slide; turning slowly, they did (a
  box truck and a sedan 1.42 m into each other, 5 times in six minutes, which
  `tests/alder.test.ts` catches). Slowing only on the approach still overlapped
  once. Slowing on the approach and closing the slide over the offset rather than
  twice it did not, and made turns visibly tighter.
- **Queues exposed the rival.** Slow turns queue traffic at sharp junctions. Over
  the 42 races that version was the best yet (98 ticks of contact, nothing past
  16 m), but on Uptown the rival pulled out round a queue at the hairpin into an
  oncoming car, and after another turn stopped in an oncoming car's path while
  moving over to pass: it rides the street's centreline, and on streets it has no
  lane discipline.

The first of those is fixed and kept (`rivalInput`, "full-line-v6"): a side to
pass on is checked for other cars where they will be when the rival is alongside
the car it passes, not only where they are, so an oncoming car closing on that
side rules it out. On today's traffic it changes nothing measurable over the 42
races; `tests/rival-racing.test.ts` holds it and fails without it. The second is
the street rival's clearest remaining problem. Turn slowing needs the junction
conflicts to include the slide, and a rival that keeps its side of the street,
before it is worth trying again.

**Lane discipline on streets (2026-09-13).** A street route is the street's
centreline, and the rival rested on it: straddling the centre line, half in every
oncoming car's lane. It now rests half-way from the centreline to the middle of
the inner lane going its way (`RIVAL_LANE`, `laneOffset`, the lane traffic
drives): 1.4 m right on a 12 m street, 1.1 m on 16 m, 1.6 m on 24 m. Passing,
dodging and blocking work from there, and racing lines are untouched
("full-line-v7").

Measuring it turned up a second frame error in the traffic loop. The car's own
offset was taken across the nearest segment of the route (`nearestSide`), while
every other offset there is across the route at the aim point. Through a corner
the nearest segment is still the street being left, so on seed 17 a truck stopped
just round a right turn, dead in the rival's path, read as 5 m to one side, and
the rival drove into it. It is now taken at the aim point (`carOffset`).

Measured, rival alone in traffic, over 82 generated races (seeds 1-40, Sound to
Sky and the qa2 fixture, then seeds 41-80 for a bigger sample):

| Rival | Time | Contact | Past 16 m | Lost | Circling | Uptown, 3 laps in traffic |
|---|---|---|---|---|---|---|
| Before | 8,135.5 s | 428 | 5 (18.6 m) | 19.1 s | 38.8 s | 101.1 / 107.6 / 102.6, 6 contact |
| Frame fix, centreline | 8,135.8 s | 322 | 9 (20.7 m) | 20.5 s | 41.1 s | 101.1 / 107.8 / 104.7, 6 contact |
| **Frame fix, half-way (shipped)** | **8,046.3 s** | **1,218** | **0 (14.9 m)** | **12.3 s** | 44.4 s | **100.4 / 99.3 / 99.4**, 26 contact |
| Frame fix, whole inner lane | first 42: 4,052.5 s | first 42: 1,346 | 0 | 27.9 s | 42.3 s | 106.2 / 99.2 / 108.2, 193 contact |

On its own the frame fix strays more than before: nine races past 16 m, seed 2
by 20.7 m. Half-way is 89 s faster than before over the 82
races and nothing strays past 16 m. On clear streets it costs 7.1 s over the 42
(3,960.1 s to 3,967.2 s), and on Uptown clear its laps are 100.4 / 98.3 / 98.3
against 101.1 / 99.0 / 99.0.

Contact nearly triples, and at least 810 of the 1,218 ticks are one corner. Races
from the default start whose first gates are S Main St & 4th Ave S, then 6th Ave
& James St, turn right from 4th Ave onto James St about 44 s in (seeds 16, 17,
18, 20, 53, 56, 59, 63, 65, 66 and 70). The rival runs wide out of it into the oncoming lane,
where a box truck waits at the junction, and noses into it. When the rival slows
under 3 m/s the truck is no longer held for it and drives on into the rival:
traffic follows only racers going its way. On the centreline the rival runs as
wide and misses the same truck, arriving half a second earlier. The wide exit is
the problem, not the lane: at that corner the rival arrives 1 to 3.5 m/s over its
planned 7 m/s and, on full lock, still runs wide. Rounding street corners fixed it
(below, **Street corners, rounded**).

Tried and not shipped:

- **Slowing for a car it cannot step round.** A car in the lane the rival is in,
  with no room to reach a clear side before it gets there, is slowed for. Timed
  (lateral 4 m/s²), it took Uptown contact from 26 to 0, but at the corner it
  crawled to a stop in front of the truck, which then drove into it: a car moves
  sideways per metre travelled, not per second, so slowing never made room.
  Distance-based (two arcs at the tighter of full lock and grip), it cost 48 s over
  seeds 41-80 and added contact.
- **Holding speed until the turn is done.** No accelerating while more than 20°
  off the street ahead: 75 s slower on clear streets over the 42, and the rival
  still ran wide into the truck at 8.5 m/s on full lock.
- **The whole inner lane, faded near corners** (no offset within 30 m of a bend
  tighter than 35 m): 936 ticks of contact on the first 42.

`tests/rival-racing.test.ts` holds both parts: the rival rests on its own side on
12, 16 and 24 m streets, and slows for a truck stopped 9 m round a right turn
(since reworked for rounded corners, below).
Each fails with its part removed. The racing test that has the rival hold its
line alongside the player now measures from that line.

**Street corners, rounded (2026-09-13).** The wide exit above was the corner, not
the lane. A street route is its centreline, and its junctions are sharp polyline
corners. The rival planned every one from that corner, reading a 5.7 m radius
across 8 m either side, so every right angle was planned at the 7 m/s (16 mph)
floor. It steered for the corner itself, arrived over that plan, and ran wide out
of it. Shawn, racing, found it braking more than he'd like.

It now drives an arc at each corner (`RIVAL_STREET_CORNERS`, `sampleDrivingPath`,
"full-line-v9"), as large as the pavement allows less a 1.5 m kerb margin, and
kept to its own side of the street:

- **A right turn** cuts in towards the kerb from its own side and keeps the
  margin at the apex.
- **A left turn** is back on its own side, the half-way-into-the-lane offset
  above, by the edge of the junction.
- **An arc** uses at most 45% of the shorter leg either side, so neighbouring arcs
  never meet.

On a 16 m street that is an 18.5 m arc for a right turn and about 13 m for a left.
The route, its distances and its gates stay on the centreline: only the path it
aims along and plans from is rounded. Its progress through a corner is read round
the arc, and the lost-car 5 m is counted from the arc.

Measured, rival alone, against the lane-discipline rival above:

| | Before | Rounded |
|---|---|---|
| 82 races in traffic | 8,046.3 s, 1,218 contact, 12.3 s lost | **7,559.8 s, 292 contact, 3.6 s lost** |
| Races past 16 m | 0 (14.9 m) | 0 (12.5 m) |
| 42 races clear | 3,967.2 s | **3,757.3 s** |
| Slowest point of a junction turn, clear | 18.7 mph average | **24.6 mph** |
| Exits more than 1 m into the oncoming half, clear | 118 of 255 turns | 116 |
| Uptown clear | 100.4 / 98.3 / 98.3 | **95.7 / 93.6 / 93.6** |
| Uptown in traffic | 100.4 / 99.3 / 99.4, 26 contact | **95.8 / 93.7 / 98.2**, 24 contact |

It is 6% faster in traffic and 5% on clear streets, with a quarter of the contact.
The 4th Ave onto James St corner is clean on all eleven races that share it: 0
ticks on nine of them, 10 and 8 on the other two, against 81 to 154 before. Sound
to Sky picks up 63 ticks of oncoming contact (140.6 s against 139.6). Uptown's
third lap in traffic loses 4.5 s to one incident with 4 ticks off the pavement:
the rival stopped in a junction for a crossing car and, under 3 m/s, was no longer
held for, and the crossing car hit it side on, which is the one-way yielding above.
"Worst off" now reads about 7 m where it read 3.7: that is an arc's apex, measured
from the centreline it cuts.

Tried and not shipped:

- **Arcs as large as the kerb allows, ignoring lanes.** 6% faster on two races,
  but a left turn cut across the oncoming half, 11 m of exit into it on one race.
- **Getting there without reading progress round the arc.** Progress was still
  the nearer leg of the centreline, and a car cutting the corner jumped 11 m from
  one leg to the other halfway round. Its aim and speed plan jumped with it: on
  Uptown's third lap it accelerated while still turning right, swung into the
  oncoming lane and clipped a waiting box truck (102 ticks of contact). Over 82
  races it had 346 ticks against 292 with progress round the arc.
- **Steering feedforward on streets**, now that a street's curvature is real: a
  little faster, but exits into the oncoming half went from 291 m to 427 m, and on
  Uptown in traffic it left the road on lap 3.
- **Planning straight from the arc's radius** instead of reading it off the path:
  slower (3,878 s clear), and it left the road on Uptown.
- **Left turns back on its own side 1 m sooner:** two races past 16 m, one 28.7 m.
- **Sensitivity.** 80% arcs made almost no difference (lanes limit most corners
  first). A 2.5 m kerb margin was 9 s slower on clear streets and lost more time off
  course. An arc limit of 38% or 45% of the leg was clean; 30% put a race 38.6 m off
  the street, and 50% put one past 16 m and 36 ticks off the pavement on Uptown.

`tests/rival-racing.test.ts` holds it:

- **The arc stays on its own side.** A right turn keeps the kerb margin at its
  apex, a left turn is back on its own side by the junction edge, and the path is
  continuous.
- **Planning and progress.** Mid-corner it plans above the old floor, and its
  progress through the corner follows the arc.
- **Trucks at the corner.** A truck stopped on the arc is slowed for, and one
  beside it is not.

Each fails with its part removed. The last replaces the frame test above: on a
rounded corner the old frame mistake shows as braking for a truck beside the arc.

**Street pace: where the rival loses to Shawn (2026-09-13).** Shawn raced Uptown
at 86.3 / 83.7 / 84.3 s and wanted to know how rivals should keep pace, NOS and
slipstream for everyone among the ideas. Replayed tick for tick, the rival ran
95.8 / 93.6 and was 28.2 s down at the last gate it reached before he finished. It led until 19 s; after that it was
within 20 m of him for 9.2 s in all, never in his draft, and he was in its draft
for 4.8 s. On lap 2 it lost 10.0 s where the slower car dips under 45 mph, -0.3 s
between 45 and 90 mph and 0.1 s above 90, and top speeds were 133 and 132 mph. It
takes a corner at about half his minimum speed (24 against 57 mph, 28 against
59). So the gap is corners. Slipstream needs the rival within reach and it never
was; nitrous would add straight-line speed it already has. By Shawn's call the
corners come first: read traffic's indicators, then larger arcs, then the whole
road when a corner is clear.

Shipped ("full-line-v10"), three changes that are safe only together:

- **Legs are straight runs.** An arc may use 45% of the straight run either side
  of its corner, not of the segment beside it. Routes are resampled about every
  29 m, which held every right angle on Uptown to a 12.6 m arc where its side of
  the street allowed 18.5 m.
- **Steering feedforward on streets.** Rounded corners have real curvature, so
  the racing line's feedforward (`RIVAL_STEERING`) now steers streets too. On a
  35 degree bend at up to 52 m/s it runs 1.2 m off its line against 2.9 m
  without, and on a 20 degree bend at 62 m/s 5.5 m against 7.8 m. On a slow right
  angle it is 1 m worse (2.1 m against 1.1 m).
- **Lost means off the carriageway,** on streets as on racing lines. More than
  5 m from the centreline braked the rival from 95 mph to the 22 mph lost cap
  mid-bend, 5.5 m wide of a larger arc on an empty street.

| | v9 | v10 |
|---|---|---|
| 82 races in traffic | 7,559.8 s, 292 contact, 0 past 16 m | **7,294.4 s**, 411 contact, 2 at 16.1 m |
| 42 races clear | 3,757.3 s | **3,603.1 s** |
| Slowest point of a junction turn, clear | 24.6 mph | 25.8 mph |
| Exits more than 1 m into the oncoming half, clear | 116 turns, 220 m | 123 turns, 344 m |
| Uptown clear | 95.7 / 93.6 / 93.6 | **92.0 / 89.9 / 89.9** |
| Uptown in traffic | 95.8 / 93.7 / 98.2, 24 contact | **92.0 / 90.6 / 90.5**, 8 contact |

It is 3.5% faster in traffic and 4.1% clear, and 3.7 s a lap on Uptown. The cost
is 41% more contact and exits wider into the oncoming half. Both 16.1 m strays
are crossing cars at junctions it now reaches faster: on Sound to Sky it braked
for a car crossing at 17 m/s, stopped short of the line and was hit. Shawn's lap
is still 6 s quicker.

Tried and not shipped:

- **Reading the indicators** (`forecastTraffic` where the rival will reach each
  car, instead of straight on): 7,576.8 s over the 82, 215 contact, one race 16.4 m
  off. It fixed the stray on seed 24 and not the one on 14. The plan it reads is
  the one the indicators show, but it did not make faster cornering safe.
- **Straight-run legs alone:** 7,440.1 s, but nine races past 16 m and 95.8 s held
  at the lost cap. With the carriageway lost rule and no feedforward: four races
  past 16 m on the first 42, one 34 m. With the forecast instead: eight over the 82.
- **Straight-run legs only at corners of 45 degrees or more:** four strays on seeds
  41-80, and Uptown lost its gain (95.2 / 93.8 in traffic), because the resampled route
  splits some right angles across two 45 degree vertices.
- **Feedforward alone:** five races past 16 m over the 82.
- **The whole road when a corner is clear.** Where no traffic and not the player
  will be on its racing line when it gets there, the rival blends over about a
  second to an arc that swings out, clips the inside and exits wide (44 m on a 16 m
  street right angle against 18.5 m in its lane), and back if something appears.
  On Uptown clear, on straight-run legs, 89.5 / 87.5 / 87.5, within 4 s of Shawn.
  On gentle kinks it sat at the outside edge for hundreds of metres, so it was
  limited to corners of 45 degrees or more; on top of v10 that is 3,572.2 s on the
  42 clear, but in traffic two and one races past 16 m (one 30.2 m) and on Uptown
  89.4 / 105.7 / 100.3 with 937 ticks of contact and a lap off the track. The next
  step, not this one.

`tests/rival-racing.test.ts` holds each part, failing with it removed: a right
angle resampled every 29 m gets the arc its straight runs allow, the rival holds a
35 degree bend at over 40 m/s within 2 m of its line, and 5.5 m off a street
centreline, still on the road, is not lost.

## Traffic bodies (2026-09-18)

The traffic fleet has sedan, SUV, panel van and box truck bodies, plus the
existing yellow taxi as a sedan variant. `src/render/traffic-body.ts` builds
shared low-poly geometry with glass, tyres, steel hubs, trim and distinct cargo
shapes. Traffic keeps ordinary city lighting; the drawn-car shader is for racers.
Paint, fixed-colour details, running lamps, two indicators and brake lamps use
six instanced sets per kind, independent of vehicle count. Dimensions derive
from `TRAFFIC_KINDS`, also used by the colliders; shallow trim and the taxi sign
are the only allowances outside that envelope. Wheels are static geometry.

**What the fleet costs to draw (measured 2026-09-20, free roam by the garage).**
The frame is 423,154 triangles in 555 draw calls. Traffic is 168,648 of those
triangles, 40% of the frame, in 30 calls: every instanced set has
`frustumCulled = false`, and an instanced mesh does not cull per instance anyway,
so all 261 vehicles are submitted from everywhere on the map. About 100,000 of
them are wheels: eight 12-sided cylinders a vehicle, mostly on cars a kilometre
away. A named car is about 125 meshes, doubled by its ink, so the player's alone
is 250 of the 555 draw calls, and each rival and cruiser adds its own. None of it
matters on the PC. On the RedMagic these are the first two places to look, and
draw calls usually run out before triangles: merge a car's static meshes, and
drop distant traffic's wheels or cull traffic by distance.

`traffic-v5` adds the SUV to the deterministic spawn mix, replacing one of three
sedan weights: sedan 2, taxi 1, SUV 1, van 1, truck 1. Its cruise is 17 m/s.
Vehicle count, routing and yielding rules are unchanged. Hatchback and bus are
possible later additions, not part of this slice. The presentation harness is
`scripts/check-traffic-roster-browser.js`; it captures a live street and a
separate front/rear inspection lineup, with the rear brakes lit.

## How traffic takes a corner (2026-09-20, `traffic-v6`)

Traffic drove to the end of its lane, was put on the next one, and had the step
between the two and the change of heading interpolated away over the next few
metres, each on its own schedule. Lanes are offset polylines that do not meet: a
right turn's lane runs past the one it turns into and the next begins that far
back, so a right turn was a zigzag. Measured over 1,136 turns, every tick: the
body pointed a median 140 degrees from the way it was moving in a right turn and
70 in a left, it turned at 180 degrees a second, and it took the corner at
cruise, 36 to 38 mph, which is 5.6 g. The same happened mid-street: a lane's
heading is piecewise constant, so a street with a bend in it snapped a vehicle
round by the whole angle in one tick, 90 degrees where a street turns a corner.

Now a movement is driven as a curve from the lane it arrives on to the lane it
leaves by, tangent to both (`Corner` in `src/sim/traffic.ts`), and so is every
vertex of a lane's own polyline that turns more than two degrees. The body's
heading is the curve's tangent, so it points where it is going.

- **How wide.** As wide as a square kerb allows. The road is a mitred ribbon and
  a junction's pavements meet in a point, which stands `kerb / cos(turn / 2)` from
  where the lane lines meet; an arc of radius r reaches `r (1 / cos(turn / 2) - 1)`
  towards it. Keeping 1.3 m of body clear gives the radius, from each lane's own
  distance to its kerb (`TrafficNetwork.kerb`): wide on a wide street, tight at a
  right angle on a narrow one, tighter past a right angle. A fixed 4.5 m put an
  SUV's corner on the point of an acute junction. A left turn is the same arc a
  lane further out, and at a junction at least 8 m: it sweeps the middle.
- **How fast.** Whatever 6 m/s² sideways allows at the curve's tightest point,
  never under 2 m/s, braked for at 3.5 m/s² on the way in. Right turns come out
  at about 14 mph and lefts at about 17, and the brake lights come on before the
  corner, beside the indicator that was already flashing. Brisk on purpose: see
  what it costs, below.
- **What did not change.** A vehicle is still on a lane at a distance, which is
  what every reservation, conflict span, gap and entry line is measured in, and
  the conflict pass still reads the lanes as drawn. A curve is shorter than the
  lane ends it stands in for, so the ground is covered along the curve's own
  length and the lane distance read back from it: the vehicle moves at exactly
  its speed, and its distance runs faster while it is on a curve.
- **The forecast** drives the same curves and brakes for them the same way. A
  vehicle that has slowed for a corner is forecast still slow after it.

Over five minutes of the whole fleet, every tick: ticks turning a vehicle more
than 4 degrees went from 9,892 in 704 places to 60 in 18, and steps more than
1 cm off the vehicle's speed from 115,160 to 20. In a right turn the body is a
median 0.4 degrees from the way it is moving, where it was 137; it turns at 50
degrees a second, where it was 196; it pulls 0.6 g, where it was 5.6. What is
left: a few vertices too close to a junction for the movement's curve to
swallow, and what looked like one street near (-642, -1137) doubling back on
itself through 177 degrees, which was a lane and is fixed (below).
Seen from above in `?lighting=blockout`, six right turns in a row, box trucks
among them, cleared their kerb points.

**What it costs, and two holes it found.** A turning vehicle holds its junction
for as long as the turn takes. At a cautious 3.5 m/s² the fleet crossed a fifth
fewer junctions in five minutes and 13 of 261 stood waiting where 5 had; at 6 it
is a ninth fewer (14.8 junctions a vehicle against 16.6) and 8 waiting. Vehicles
waiting at their lines became the usual case instead of the rare one, and that
turned two holes in the reservation rules, both already there, into locks within
minutes:

- A movement onto a lane "conflicts" with every movement off its far end, because
  their swept paths overlap along the lane. So a car at its line was refused
  because of the car queued *behind* it, which could not release what it held
  until it was clear, which it could not be with the first car in its way. Lane
  429, 73 m long, stopped 16 vehicles in ten minutes. A holder that arrives on
  your own lane behind you is a queue, as the conflict pass already says of a
  merge, and `crossingBusy` now treats it as one.
- A chain claims the movements off the far end of every short lane it runs
  through, but only its own approach was checked for being at the head of the
  queue. A box truck was granted a chain through a lane with a sedan waiting at
  its line, then held the movement the sedan was first for and stopped behind it.
  A chain now waits until the lanes it runs through are empty.

**What is not fixed.** The short blocks around (-750, -1100) back up in every
build after about twenty minutes of traffic left to itself, this one and the one
before it: over thirty minutes `traffic-v5` had 43 standstills of over a minute,
the longest 187 s, and `traffic-v6` had 64, the longest 300 s. Those figures are
chaotic, and run to run they say "both degrade", not which is worse. It is a
capacity problem in a grid of 100 m lanes, not one of the holes above.

No test soaks Port Alder's traffic. "Traffic keeps moving: no vehicle is
stranded" runs the retired district, for two minutes; Port Alder's own test
checks overlap, height and finite numbers. Both locks above passed the whole
suite. A soak test is ten simulated minutes of 261 vehicles, about a minute of
wall clock, and what it should assert is not obvious while the short blocks
still back up on their own.

**The lane that ran backwards (fixed the same day, `traffic-v7`).** It was not
a street. 4th Ave (`sea-north-13`) has two centreline points 1.4 m apart,
(-647, -1132) and (-648, -1133), followed by a 36 degree bend: legal, if
redundant. A mitred offset pulls back along the segments either side of a bend
by `offset * tan(turn / 2)` on its inside, and the outer lane, 7.09 m out, pulls
back 2.3 m along a segment 1.4 m long. Its vertex at the far end landed behind
the one at the near end, so the lane ran that segment backwards: traffic turned
through 177 degrees, drove 0.7 m the wrong way, and turned through 177 degrees
again. It was the only such place in 9,310 lane segments. `unfold` in
`src/sim/lanes.ts` puts both ends of such a segment where its neighbours' lane
lines meet, the mitre the lane would have had without the short segment, and
leaves the segment with no length so that a lane still has a vertex for every
street point. The street data is untouched, which matters: its lengths are what
route choice and every stored course are drawn from.

What is left there is the street's own 36 degree bend, taken as one 32 degree
tick: it is 12 m short of a junction on a 55 m lane, inside the stretch kept for
the junction's curves. Letting a junction's curve start early enough to swallow
such a bend was tried and reverted: it fixed this one, bunched a compound curve
elsewhere into 31 degrees a tick, and by widening the kept stretch un-rounded two
bends that had been fine (68 ticks over 4 degrees in five minutes, from 59).
The stretch kept for junction curves is one figure for the whole lane, the
longest any of its movements needs, so a bend is either rounded for every
vehicle or for none. A real fix decides per movement: which bends that
vehicle's own curve swallows and which it rounds first. That is a redesign of
`bendsOf` and `cornerAt`, not a constant.

**Parked rivals (fixed the same day).** A parked rival is a racer traffic yields
to, and one that never moves. Rivet stood in the road, 0.41 m off the line of
Harbor Way's outer northbound lane and facing up it: two taxis, an SUV and a box
truck stopped behind her inside the first minute and stayed for good, in the
headless soak and in the running game alike. No spot inside that carriageway
clears, since the lane's line is 3.41 m from its kerb, a metre of that is her own
car and traffic counts anything within 2.6 m of its line as in its lane
(`RACER_IN_LANE`). She now stands on the pavement strip beside the kerb, 4.7 m
off the line, and nothing queues. Sable was never in a lane. Rivet's turf keeps
the centre it had (`RIVET_TURF`), so no seed redrew: the golden master's
generated races are bit-identical and only the free-roam run, which has her in
it, moved. `tests/traffic-intent.test.ts` holds every parked rival out of every
lane.

No recording that replayed is lost to `traffic-v6`. Of thirteen sessions two
replay in this build at all, both clear of traffic, and both still replay
exactly; the six recorded in traffic were already refused, one for predating
traffic revisions and five for the rival's. The golden master agrees: nine runs
with no traffic in them are bit-identical, the five with traffic moved.

## Traffic a racer can knock (2026-09-23, `traffic-v9`)

"What should happen when a player or AI crashes into traffic? Currently traffic wins full
stop." (Shawn.) It did: traffic was kinematic, a wall of infinite mass that drove on, so
clipping a sedan stopped a car as hard as a bus, and any contact ended a rival's race. Shawn
chose the MC3 feel, "that cost me a second", to be adjusted if it proves too easy.

**How it works.** Bodies are never added or removed (a replay has to make the same solver
the same way), so a traffic car changes type:

- **Near a racer**, within `TRAFFIC_KNOCK.reach` (9 m) plus `lead` (0.15 s) of both cars'
  speed, it is a physics body for the tick, of its kind's mass (`TRAFFIC_KINDS`: sedan 900 kg,
  taxi 950, SUV 1,200, van 1,500), driven to where its lane puts it by velocity. Unhit it
  lands exactly where kinematic traffic would, and a racer's state the tick before contact
  is the wall's to the bit (`tests/traffic-knock.test.ts`). A contact is resolved with both
  masses. The box truck has no mass and is never a body: still a wall.
- **Knocked** off its lane's motion by more than 1.2 m/s or 0.35 rad/s, it is a wreck
  (`knockTraffic`): it gives up its junctions, rolls on braking at 4 m/s² while its slide
  across its heading and its spin die away, is an obstacle traffic queues behind whichever
  way it points and keeps out of a junction it sits in (`TrafficRacer.obstacle`), and is
  forecast still. Its pose is its state, so the renderer and the rival read it.
- **Put back** (`restoreTraffic`) once still for 2 s and more than 120 m from the player
  (`UNSEEN_RECOVERY.sight`): on its lane where it came to rest, short of its line, or further
  along if a car or a racer would overlap that spot.

Traffic alone never meets a racer and is unchanged. The masses are the MC3 feel, not kerb
weights: the Cinder, 12 m/s faster than the car it hits, loses at the hit

| It hits | Mass | Speed lost | As a wall |
|---|---|---|---|
| sedan | 900 kg | 4.1 m/s | 9.4 |
| taxi | 950 kg | 4.3 m/s | 9.6 |
| SUV | 1,200 kg | 4.9 m/s | 9.7 |
| van | 1,500 kg | 5.6 m/s | 9.9 |
| box truck | a wall | 10.3 m/s | |

and the Breakwater's weight, "felt only in contact", now counts against traffic too. In the
game, on the throttle at 33.6 m/s into a sedan, the Cinder came out at 26.5, and momentum
says 26.8. A glancing hit turns both cars: the sedan 29 degrees, and the Cinder spun in its
own smoke, which is the feel to judge at the pad.

**What building it found.** Rapier's damping is the same every way, and a wreck damped by it
stopped as if its wheels had locked: the car behind lost more than the wall had cost it. A
clipped sedan did not turn (0.01 rad/s against the striking car's 1.5), in bare Rapier as
well; the collider's friction, 0.35 from when traffic was a wall, was cancelling the push on
its rear face, and at a car's 0.15 it turns. And a wreck put back where it was hit, with
15 m kept clear of racers, deadlocked gen-39 at seed 314159 (the wreck waited for the rival
beside it, the rival for a car whose forecast crossed its path, that car for the wreck: 61
resets, no finish). It now goes back where it rests, clear of overlap only.

| Six seeds, 498 races, the rival alone | Time | Did not finish | Resets | Off the pavement | Contact ticks | Races with contact | Distinct incidents |
|---|---|---|---|---|---|---|---|
| `traffic-v8` | 47,364 s | 0 | 55 | 824 | 640 | 66 | 53 |
| **`traffic-v9`** | 47,365 s | 0 | 29 | 2 | 2,036 | 79 | 58 |

Contact no longer ends anything, and it shows. Resets fall by half and the rival all but stops
being thrown off the road, for the same time. Contact is up because it continues: the longest
cases read as a rival grazing a turning van at 25 mph and carrying on, and shoving a heavier van
aside at walking pace after braking to 2 mph for it, where the wall would have driven its turn
through it (`pnpm rival:scene street-uptown --seed=314159`, `gen-82 --seed=1`). The gate's
contact counts were built for a world where contact was failure; read its outcomes now.
Shawn drove it the same day: "This feels great." The glancing hit that spins the Cinder is fine; a
head-on clip could be stiffer, left for now. That would be a head-on hit costing more than the
masses alone say (the closing speeds add, and a knock shares them out), not heavier traffic.
`pnpm golden`: the five runs where racers drive among traffic moved, nine bit-identical.

## The road out of sight (2026-09-23, `driver-v4`)

Shawn's call, and the second place the rival may be helped, both out of the player's sight
(`CLAUDE.md`). MC3's racers felt ruthless because they could not be shaken: lose one and it was
in the mirror again. This rival stuck behind a van where nobody could see it and never came back.

**The rule** (`UNSEEN_ROAD` in `sim.ts`). Behind the player in the race (`racePosition`, what the
HUD shows) and more than 140 m from them, the rival is a ghost: its collider meets no traffic,
its driver reads none, and traffic neither yields to it nor turns body for it. It still meets
the world and the player. Within 120 m, or ahead of the player, it is solid again, but only where
no traffic car is within 6 m of it, so it never appears inside one. Behind only: a rival that
escaped through traffic the player is stuck in would be the part of MC3 that felt unfair.

**The bound holds by construction and by measurement.** A ghost drives the same car on the same
tyres with the same driver as it does on an empty street, so it can never be faster than that.
Measured: the same race with the player parked at the first gate, in traffic and with none, and the
rival is its clear-road self to the bit for the whole time it is a ghost (2,037 ticks on gen-7,
1,276 on gen-28, at traffic seeds 0 and 271828; `tests/rival-unseen.test.ts` holds it).

**What it does, on Shawn's three recorded races against Wake**, his inputs replayed (his times
reproduce to the hundredth):

| Race | Shawn | Wake without | Wake with | Wake a ghost for |
|---|---|---|---|---|
| Through the open ground | 70.68 s | 81.27 s (362 m back at worst) | 78.97 s | 20.0 s |
| Streets | 77.45 s | 80.33 s | 80.40 s | 11.7 s |
| Streets | 77.07 s | 81.37 s | 81.37 s | 18.1 s |

It does what it is for and no more. Get away from her and she comes back: 2.3 s closer when he
cut through the open ground. In a close race it changes nothing, because what traffic costs her
there it costs her within 120 m of him, in sight, where the rule stops. Her street deficit is about
1.6 s of pace and 2.4 s of traffic, both decided in sight; this is the rival that cannot be shaken,
not the rival that wins.

**What building it found.** Giving traffic's colliders their own collision group, every filter
still admitting them, moved five of the golden master's fourteen runs, the free roam one among them
where no rival exists. Rapier's results depend on the groups themselves, not only on which pairs
they allow. Traffic's group is now set only while the rival is a ghost, and cleared after: `pnpm
golden` is 14 of 14 bit-identical, and the gate, whose player is parked behind the rival from the
flag, never makes one.

## A player catching her in a pass (2026-09-23, `pass-v2`)

Shawn, racing Wake (gen-wake-42, traffic seed 715877619): "The AI slows down when passing huh?"
He had been restarting for a fair race and saw it more than once.

**What it was.** At 1,690 m she pulled out round a sedan doing 6 mph and braked from 98 mph to 45
doing it, and he went by. The pass planner (`traffic-pass.ts`) reads the player as well as traffic,
forecast as a straight line at the player's speed, so as not to commit a pass through a player in
its corridor. He was 60 m behind her at 120 mph, on her line. His straight line ran through her
corridor, the planner read that as occupied, and it capped her speed to stop short of where he would
hit her: from 136 mph to 54, 31, 18 and 0 over a second. The contact it braked to avoid was his,
from behind, and braking brought it sooner. The planner's test put the player parked ahead, and the
gate parks the player across town, so a player catching her had never been run.

**The rule.** The player is in a pass's way only while ahead of her, judged now: the boundary
`RIVAL_RACING` already draws, which blocks a player catching her, holds its line alongside, and
yields to nothing but a player in front. The first version judged it where the forecast first met her
path, and that failed on the same race: each sample carries a quarter-second of slack, which put
a player closing at 118 mph 13 m further on, ahead of her where they met, and she braked from 104 to
83 as he drew level. The flip side is deliberate: she now pulls out in front of a player who is
catching her, which is a block, as she did already on an open road.

**What it is worth.** On his race, his inputs replayed: through 1,700 to 1,900 m she was 49 m behind
him and is now 24 m ahead, about 1.5 s. After 55.75 s the replay is no longer his race, since he is
catching her at 130 mph on inputs that do not know she is there, so the finish cannot be measured.
`tests/traffic-pass.test.ts` holds it: without the rule, the side of the pass moves and a committed
pass is capped at 0.4 m/s with a player closing behind.

**What is left of the brake, and why it stays.** She still slows from 99 to 73 there, because she
is more than 1 m off the pass's path (`PASS_ASTRAY`) and so looks 85 m ahead for the car being passed:
the pass began from where she was headed, not where she was, and she drifted the other way first.
That look-ahead is what stops the gen-46 crash (91 mph into a sedan from 2.2 m off the path).
Relaxing it for the car being passed was the first fix tried here, on the diagnosis that it was the
whole brake; the race still braked to 53, because most of it was the player. It stays.

**The hand-off that looked like a cause.** Later in the same race she turned solid 119 m behind him at
109 mph with a 40 mph sedan 46 m ahead and lost 6 s. Measured three ways, it is not the hand-off:
blind as raced, 149 mph down to 37 through 2,888 to 3,160 m; a ghost that read traffic from 200 m,
down to 29; and solid throughout (with this rule she stays ahead of him and never ghosts), 121 down
to 29. That stretch stops her however she arrives. It is the rival in traffic, which is good enough
for Phase 1 (`design/HANDLING.md`), and the ghost is unchanged.

## A gentle bend's arc (2026-09-23, `street-line-v2`)

Shawn, after two more races against Wake: "the ai seems to slow down on slight turns. I drive it like a straight
road where she looks like she has to process the transition."

**What it was.** Where he was faster at the same place on the road and no traffic was near her, four bends of 16 to 26
degrees on 20 m streets: she planned 77 to 120 mph through them and he held 105 to 139, 3 to 6 m across the road. None
of them carried a line. Bend windows existed (`bendFrom`, 2026-09-20), but the solver drew each inside 60 m either side,
held to her lane at both ends, and a line that short swings out and back and bends harder than the road: 81 m against
the lane's 168, 101 against 294. Every one was slower than the lane and dropped, so she drove her lane arc at the lane's
0.80. A longer reach merged windows and the solver kinked in them (`bendReach` 120: 5.5 s to Wake, 2 s from Crest).

**The lane's 0.80 is not the lever.** Raising it was measured first: on his newest race, 0.96 in the lane is 3.1 s. But
in the names' own cars a fast gentle bend at top speed is where the lane arc runs wide, and there the steering is at
full lock: `steeringAngleFor` allows about 1.5 degrees at 150 mph, and the Reign held 8.0 to 8.6 degrees a second of turn
where the arc asked 8.8, drifting out at 0.4 m/s with its tyres at 93% of their envelope. Two 21 degree bends after a
long run (the lane-holding test's own scene): the Reign 1.45 m wide at 0.80, 3.25 at 0.84, 6.10 at 0.86; the Vesper 2.33
at 0.80 already. So 0.80 stays (`RIVAL_CORNERING`'s note has the numbers). A player takes such a bend faster the only
way there is at that lock, on a bigger radius, which is the line's job.

**The arc** (`bendArcs` in `street-line.ts`). A bend, the run of vertices turning its way, gets one arc tangent to her
lane on the straight either side, as large as the road allows with `edgeMargin` to the edge at every point, clear of
any corner's window and halfway to the next bend. It only ever cuts inside the lane. Where the bend turns towards her
own kerb she has 6 m to cut, which her lane arc (allowed closer to the kerb) already uses, so no arc is tangent to the
lane there and none is drawn. The solver's bend windows stay as candidates too, since on gen-crest-23 its one long
window through a run of bends beats separate arcs by 3.5 s: where a bend has both, the one that saves more is kept,
and each must still be quicker than the lane (`worth`). A corner's window, and a bend inside one, is the solver's as
it always was: the golden master's other generated races and every authored one are identical to the bit.

**What it is worth.** Clear streets, the rival alone: gen-wake-42 79.37 s with no bend lines, 78.87 before, 74.67 now;
gen-tally-7 81.62, 81.25, 78.65; gen-crest-23 64.20, 58.35, 58.35 (the solver's windows kept). On Shawn's newest race,
his inputs replayed and his 1:19.10 holding to the finish: Wake 1:23.52 to 1:20.78, all of it the 26 degree bend at
gate 3 (75 mph to 135), since a taxi on the 21 degree bend refused her its arc. On the two earlier races she now catches
him about 1,700 m in, and his replay stops being his race, so those finishes cannot be measured. On the arcs she runs at
most 2.2 m off the line; at gate 3 she spends one to two seconds at full lock, and running wide of an arc that
cuts across the centre line takes her back towards her own lane.

**Joined where it leaves the lane, read to where it rejoins it.** The first gate run found two contacts on a line, both
the arcs': on gen-61 at seed 0 the reader, refusing the arc for an oncoming taxi, gave it go 35 m in, and blending onto
a line already 2 to 4 m across in 15 m of road at full lock she ran 3.7 m wide of it and came out over the centre line
into an oncoming box truck; on gen-31 at seed 42 she came off an arc at 130 mph onto a sedan doing 33 in her lane. So
a bend (`corners[].bend`) is taken only while the shift where the blend would be complete is still the lane's, and its
reading runs over the whole window, its tails included, and `bendRejoin` (40 m) of lane past it. Held to the first
rule too, corners gave up lines they had been taking cleanly: 287 ticks off the pavement where there had been 2, and 25
resets to 15, on three seeds. A corner's window is slow and eased; it keeps the old reading.

**Not done.** A bend towards her own kerb, where he takes the middle of the road at 126 to 139 and her lane arc allows
116 to 120: a line would have to enter from the oncoming half, which the entry rule (into a corner never outside its
lane) exists to stop. Whether a gentle bend is worth an exception is a separate call.

**The gate** (`pnpm rival:gate`, re-saved): 161 s quicker over the 498 races, every seed; distinct incidents 58 to 57;
contact on a line 30 ticks to 21, in a pass 27 to 14; resets 29 to 19, reversals 10 to 4. What came is two kinds that
were there already, met because the races now reach places at other times, neither on a line: gen-36 at seed 314159 in
a committed pass into the back of the box truck it was passing, doing 3 mph (the gen-46 kind), and gen-33 at seed 1,
in its lane, braking from 97 mph for a sedan turning across it at a junction it had claimed, off the pavement for 127
ticks at 35 mph (the junction crossing parked on 2026-09-23). `pnpm golden` moves gen-stray-5 alone, whose race has a
bend that now draws an arc; its other thirteen runs, the authored races and two generated ones, are identical to the bit.

## The shoulder is road (2026-09-23, `driver-v5`, `pass-v3`, `street-line-v3`)

Every carriageway gained 5.6 m of asphalt shoulder each side that day, then a raised sidewalk (`design/ROAD_EDGES.md`):
room no traffic drives, which Shawn called "essentially a free passing lane". The player had it at once. The rival did
not: a route's `width` is still the carriageway traffic drives, and four things in the driver bounded it by that width.
Past the carriageway by `OFF_ROAD_MARGIN` it was lost and held to 22 mph; off the carriageway it made no progress, so a
stretch on the shoulder ran toward a reset; `edge` clamped every aim, a committed pass's path included, back inside the
carriageway; and the pass planner and a bend's arc (`bendArcs`) were rejected past it.

`RivalDefinition.shoulder` (5.6, `ALDER_SHOULDER`) is set on every generated race's rival where it is drawn
(`drawAlderCourse`, so the game, the gate's batch and the tests see the same road) and on Uptown's rival in traffic,
and each of the four adds it. It is part of the rival's name (`shoulder-5.6`). Sound to Sky, the cruisers, Ridge Circuit
and Uptown / Clear have none and are as they were.

**First, the baseline.** The shoulders changed the world (`alder-slice-v7`) and with it what every seed draws, so the
gate's races were different courses (gen-wake-42 is now 4.6 km and four gates). The gate was re-saved on the new world
before this change, and its totals against the old baseline compare two sets of races, not the shoulders (resets 19
to 66, for one, is ten races sharing one start at seed 1).

**The gate, against that baseline:** 316 s quicker over the 498 races; races with contact 82 to 64; distinct incidents
61 to 50; resets 66 to 30 (seed 1 alone 36 to 5); contact in a pass 19 to 17. It passes a little more (138 passes to 144).
Contact ticks rose, 4,907 to 7,440, in fewer races: two incidents shared by the races that start alike, at seed 1 (eleven
races, 181 ticks each at 13 mph, and 2 to 17 s quicker) and seed 271828 (five, 403 ticks, 4 to 8 s slower), each a
junction's crossing car the rival now works its way past at walking pace where before it was reset out of sight. What
else came is the same kind: gen-38 at seed 1 spun onto the verge by an oncoming box truck turning across it (off the
pavement 23 ticks, its aim never left the lane), and a 5 to 9 mph nudge on gen-66 counted as on a line for 7 ticks.
The junction's crossing car is the problem parked on 2026-09-23; this change neither caused it nor fixes it.

## What a committed pass costs (2026-09-25, `pass-v4`, `pass-v5`, `traffic-v12`)

At `traffic-v11` the pass planner came out 9.7 s behind the reactive driver over the 12 seed-0 races that commit a pass,
where at v10 it had been 9.7 s ahead over 17. Read pass by pass (each race's time over its own pass, planned against
reactive), most of that is not the planner: over 11 distinct passes it lost 4.8 s and gained 3.2. v10's lead was mostly
two races where the reactive driver was unlucky afterwards (gen-68 hit and was reset; gen-37 met traffic later on), and
v11's timing took those away. What the passes themselves showed:

- gen-24 and gen-51 share one pass, and it cost 2.5 s each: it read a taxi turning across the road 224 m on as in its
  way and slowed the rival from 106 mph to stop short of it; the reactive driver kept its speed and slipped past the
  taxi at 70 mph with 4 m in it. The read was right. The taxi had claimed three junctions at once from a v11 bar with
  the rival 450 m off, which `traffic-v12` now judges movement by movement (`design/INTERSECTIONS.md`); it still claims,
  because its junction was round a bend from the rival.
- gen-81 (1.2 s): a pass past its lead early came back in over the rejoin it had chosen at the start, 25 m at 41 mph,
  now at 64, and the curve capped it. `pass-v4` rejoins over as long a length as the speed then asks for (the pull-out's
  own 1.4 s), never shorter (`tests/traffic-pass.test.ts`). Most of gen-81's loss is something else, still open: the
  plan's speed at the moment it is made came out 35 mph, braking the car from 46, when every re-read of the same path
  from 0.2 s later allows 86 and more.

  Probed the same day (`pass-v4`, seed 0; neither cause is the pass's own path, which moves 0.63 m across and is
  all but straight). The pass is committed at 3399 m, 46 mph, coming out of a corner behind and beside a van (#29)
  accelerating out of it at 28 mph. `evaluatePass` reads each sample's radius through points 6 m either side, and
  the first sample is the car itself: its point behind lies on the lane's corner arc, where the road turns 18.6
  degrees in those 6 m, so it reads a 27 m radius and caps the plan at 35 mph for a corner already driven. The next
  sample reads 177 m, and the re-reads from 4 m on give 78 mph, then 90. The rival's own speed plan in `rival.ts`
  reads 8 m behind at its first samples too, but brakes on the sample 8 m ahead, which does not see them (about 100
  mph throughout). Then the in-pass emergency check (the body-relative one inside `if (pass)` in `rivalInput`) held
  it at the van's speed plus its margin, 34 to 35 mph, for 0.6 s more: in the road's frame the van was 4.0 to 2.9 m
  across, the gap the pass was planned with, but the car was still yawed from the corner, and in its body frame the
  van was 2.0 to 2.6 m across, inside the check's 2.6. It let go at the tick that read 2.64. The first is fixed in
  `pass-v5` (below). The second was not a misreading, as it turned out, and a change of frame for it was built,
  measured and not shipped (below).

`pass-v4` on the six-seed gate against `traffic-v12`: 449 of 498 races identical, time level (46,457 to 46,458 s),
distinct incidents 55 to 55, contact in a pass still none, off the pavement 293 to 206 ticks, resets 34 to 32. Two races
moved much: gen-75 at seed 1000 10.9 s quicker and back on the pavement, and gen-15 at seed 271828 17.8 s slower,
hit by an oncoming taxi 390 m after its pass while it sat 1.3 m left of centre going round a van standing at a bar. That
last is the driver's, not the pass's: a car standing at a bar just off its line, which it reads as clear, as it read the
SUV at 110 mph in the v11 gate.

`pass-v5` (the same day): a pass's speed plan reads no road behind the car. The point behind each sample stops at the
car (`evaluatePass`); three points on a path give its circle at any spacing, so the first sample has no limit of its own
and the rest read only road ahead. On the six-seed gate against `pass-v4`: 455 of 498 races identical, 17 s quicker
(46,458 to 46,441), distinct incidents 55 to 56, contact in a pass still none, off the pavement 206 to 153 ticks, resets
32 to 32. gen-81 itself is only 0.2 s quicker: the cap at the commit cost it one re-read of hard braking, and its 0.6 s
at the van's speed is the emergency check's, the second cause above. The two races that moved much went back to what
they did at `traffic-v12`, before `pass-v4`: gen-15 at seed 271828 18.0 s quicker and back on the pavement, with v12's
contact again (the oncoming taxi at 3889 m, 106 mph, braking from 128); gen-51 at seed 314159 6.5 s slower, with v12's
two recoveries out of sight. In all three versions each race's pass is the same pass, at the same tick with the same
stations; what follows it is the gate's noise band. The one new incident is gen-15's, which v12 had.

The emergency check's frame, tried and not shipped (the same day). Two readings of another car were built in place of
the nose for a car on its pass path. Against the path alone: a car lagging its rejoin by up to 0.9 m on an oncoming
taxi's side read the taxi 3.2 m across when it was 2.3 from where the car would be, and met it at 115 mph (gen-71, seed
42, the gate's only contact in a pass). Against the path plus the car's present error from it: no contact in a pass,
but the gate went the wrong way (35 s slower, distinct incidents 56 to 59, all of them outside passes), and measured
pass by pass, each race run with both checks, over the 64 passes that began identically at seeds 0 and 1 it held the
car below its speed for 2,142 ticks against the nose's 1,868 and took 265.6 s to the passes' ends against 260.8. Of the
25 that differ, 24 were slower, gen-81 among them. The nose had not misread gen-81: coming out of the corner the car was
closing on its path, towards the van, at 2.2 m/s across, and it went by 2.56 m from the van's centre, inside the check's
2.6. A car lags a path that swings, so reading it where it will be if it keeps its error puts it on the passed car's
side through every pull-out, where the nose already points out. What gen-81 shows instead is a pass planned 2.9 m from
the car it passes, a check that lets it alone only past 2.6, and a van drifting 0.3 m into that accelerating out of a
corner.

## A car beside its line (2026-09-25, `driver-v6`, `driver-v7`)

The car standing at a bar just off the rival's line, which the v11 gate met at 110 mph (gen-19, seed 1000,
`design/INTERSECTIONS.md`), was not misread. An SUV stood at a bar in the outer lane, 5.6 m across the road, and the
rival rested at 1.1, 4.5 m clear of it. The traffic loop's same-direction branch gives any car going its way within 5 m
of the rival two sides to be passed on, 3.2 m (`PASS.gap`) either side of it, and set the aim to the one nearer the
rival's line: here 2.4 m, the other clamped off the road. So it moved the rival 1.3 m TOWARDS a car it was already clear
of, to pass it at 3.2. At 105 mph it ran 1.25 m past that aim, and the will-be check (`willBe`) read it as clear: it
never credits a car past where it means to be with moving further out. It hit the SUV at 110 mph.

`driver-v6`: a car going its way is dodged only when it is nearer where the rival means to be than the gap; further off
it is left alone, and the will-be check reads the rival as meaning to be where it was (`dodge` in `rivalInput`). gen-19
now goes by the SUV with no contact. On the six-seed gate against `pass-v5`: 298 of 498 races moved (the rival had
been drawn towards cars in the next lane all over the map), distinct incidents 56 to 41, races with contact 76 to 63,
contact 1,453 to 1,083 ticks, 123 s quicker, resets 32 to 28, contact in a pass none, contact on a line 27 to 43 ticks,
off the pavement 153 to 328 ticks. The off-pavement rise is four events in seven rows (one course shared by four races
at seed 1000), each a swerve round an oncoming box truck turning across a junction, ending off the shoulder at walking
pace and put back out of sight: arrival times the change moved, into a kind it does not touch. Codex reviewed the
change: a traffic car 3.2 to 5 m off no longer cancels a block of the player (`blocking`), which the gate, with the
player parked, cannot see; a race against the player can.

What the same race shows after the fix, not fixed: the rival still runs 1.8 m wide of its aim there at 100 to 112 mph,
and clears the SUV by 2.6 m centre to centre, where the will-be check credits a car past its aim with moving back to
it. Carrying its outward motion on with `followAcross`'s 2 m/s^2 (Codex's proposal) brakes it for 0.2 s at 100 mph there:
it reads the car 3.40 m across where it stopped at 2.95, since the car took the drift out at about 3 m/s^2. So it is
0.45 m pessimistic, against a rule honest to 0.2, on a pass that cleared; not shipped.

Uptown Circuit at seed 1000, the new 117 mph contact, is not the rival running wide (a first reading of it said so): the
rival drifted 0.35 m, and a box truck in the left lane came 1.2 m across the road towards it in the last second, most
likely still finishing its turn onto the road (traffic changes no lanes). When the dodge judged it, the truck was 3.8 m
from where the rival meant to be, past the gap, and it was left alone; at arrival it would be 2.5 m, inside it. The
dodge reads a car where it IS, `offRoute`, for whether it is in the way and for which sides it offers, where the
will-be check reads it where it will be, `sideAtArrival`. The same reading chose sides before `driver-v6` too: the one
it offered here, 3.2 m right of where the truck was, was 1.9 m from where it would be.

`driver-v7` (the same day): the dodge reads a car going its way where it will be when the rival is alongside (`there`,
as far on as `alongside`'s 4 s), for whether it is in the way, the sides it offers and whether there is none, as the
crossing branch always has. Uptown at seed 1000 goes clean. On the gate against `driver-v6`: 164 of 498 races moved,
42 s quicker, distinct incidents 41 to 40, resets 28 to 26, contact on a line 43 to 31 ticks, none in a pass; contact
1,083 to 1,497 ticks, most of it one pile-up on the grid at seed 271828 at 9 mph, shared by 16 races, that moved by a
second; off the pavement 328 to 391 (gen-78 at seed 42, which already had its reset). Gone at speed: Uptown's 117 and
105 mph, gen-51 at 89, gen-70 at 90, gen-75 at 89. New at speed: three oncoming vans and box trucks at 70 to 90 mph, a
branch this does not touch, and gen-1 at seed 1000, clipped at 128 mph by an SUV merging across at 37 mph. The reading
put that SUV within 0.1 m of where it came, the dodge aimed 3.2 m clear of it, and the car was still 0.9 m short of its
aim when it drew level, with the SUV's nose turned 7 degrees into its flank. That and gen-19 running 1.8 m wide are the
rival not reaching its own line above 120 mph, which no reading of traffic mends. The gate also dithers at its own
edge: at exactly 3.2 m it lets the line go and takes it back the next tick, which holds it to 0.07 m.

Slowing for the reach, tried and not shipped (the same day). How fast the rival gets across when its dodge steps the
aim was measured: the Cinder on its own controller, a straight 22 m road, the aim stepped 2.2 m, a car in its way at
its own speed. It does not move at all for a while, then goes at a steady rate, both slower the faster it is going:
0.5, 1, 1.5 and 2 m across in 0.77, 0.98, 1.18 and 1.38 s at 54 mph; 1.03, 1.33, 1.62 and 1.88 s at 125; 1.07, 1.38,
1.67 and 1.93 s at 136. Fitted, in m/s of speed: a wait of 0.42 + 0.0059 v seconds, then 0.30 + 0.0045 v seconds a
metre, within 0.02 s of every point. The will-be check's credit of 2 m/s^2 is optimistic at speed by that much.
`driver-v8` slowed the rival, going round a car in its way, to arrive no sooner than that reach took it clear (both
half-widths, the other car's nose turned across it, 0.4 m). gen-1 at seed 1000 went round the merging SUV without
contact, braking from 120 mph to 65 and then passing, and the gate against `driver-v7` lost: distinct incidents 40 to
49, 57 s slower, resets 26 to 28, and a contact in a pass (gen-75 at seed 271828, a race whose timing moved; the rule
does not run in a pass). The new incidents are slow ones among traffic: creeping into a standing SUV at 3 mph after
braking from 100 (gen-15, seed 1000), into the back of a box truck at 3 mph (gen-58, seed 314159), side-swiped by a box
truck at 52 mph (gen-46, seed 1). As the gap closes the cap falls towards the other car's speed, and a rival held there
spends longer among traffic than one that went by. The reach is measured and right; speed is not the lever for it.

## Where the rival slows (2026-09-25, `pnpm rival:census`)

Shawn, having raced it: really good, "with a few random slowdowns in random places". The census names them. Every
rule in `rivalInput` that lowers the rival's target now does it through one helper that records the rule that got it
lowest, and the traffic car where one did (`RivalSpeedWhy`, filled into an object the sim keeps outside its state, so
the golden master is identical to the bit). `street-line-batch.ts --census` groups the ticks the target sits more than
2 m/s under the rival's own corner plan, for a reason that is not a corner, into episodes (`scripts/rival-slowdowns.ts`):
one car, or one rule with no car, joined across flickers under 0.25 s, and costed as the time the car spends behind its
plan, (1 - speed / plan) a tick, while held and for up to 3 s after. `pnpm rival:census` runs it over the gate's races
and ranks them; `rival-scene` now says what held it on every line of a trace.

At `driver-v7` over the gate's 498 races (12.9 h raced): 1,144 episodes, 1,137 s, 2.46% of the time. By rule: crossing
traffic 34%, following a car 27%, oncoming 10%, recovering after a knock (`aim`) 9%, a pass's own plan 7%, no side to
pass on 6%, the pass's emergency check 4%. The one that reads as random is inside `follow`: 142 of its 254 episodes and
235 s of its 313 are for a car STANDING still, with the rival a median 2.4 m left of where it meant to be. Traced (gen-13,
seed 314159): through a 73 degree left turn at 30 mph it turned in 11.6 degrees early and cut 2.7 m inside, across the
middle into the oncoming lane of the street it was entering, where a sedan stood at its bar. A standing car has no
direction, so the same-direction check read it, and the rival stuttered past at 9 mph for 3 s, brake and throttle
turn about. With the rival more than 0.8 m left of its aim and the car standing or oncoming, 131 episodes, 231 s: 20% of
all the time it is held. Since `traffic-v10` cars stand at their bars, and a bar on the far side of a left turn is
where that cut goes.

Why it cuts: it steers for an aim 8 m plus 0.35 s of its speed along its path, and round an arc that aim sits inside
the tangent by half the arc between them (18 degrees at 12 m on a 20 m radius), on top of a feedforward that already
gives the wheel the arc takes. `driver-v9` (shipped 2026-09-26, on the turn-by-turn measure below, against the gate):
steer against the angle a car exactly on its path would see the same aim at, so a car on its path steers by the
feedforward alone (`RIVAL_STEERING.chord`). Taken everywhere on streets it
cost 1.1% of the rival's pace on a clear road over 14 races (the cut is quick) and broke the two pass fixtures on timing;
taken only in its lane round bends towards the oncoming side, not on a corner line, it cost 0.04%, kept gen-13 on its
own side at 31 mph through the turn (0.5 m off its aim at most, from 2.7), and a 90 degree left turn on its own
controller crossed the middle by 2.01 m without it and not at all with it. The gate against `driver-v7` failed it:
422 of 498 races moved, distinct incidents 40 to 49 (seed 0, the cleanest layout, 3 to 11), contact on a line 31 to 304
ticks, contact 1,497 to 2,139, 72 s slower; resets 26 to 15, off the pavement 391 to 235, reversals 4 to 0. The new
incidents read are not at its left turns (a van crossing at 97 mph, an oncoming sedan at 93, a rear-end at 65, a right
turn behind a sedan turning the same way): every left turn a lane drives moves the timing of all that follows, and the
gate cannot tell that from the change.

Turn by turn, then. The sim cannot snapshot but is deterministic, so a fork is a re-run: each gate race driven on v7
(`chord` 0, v7 to the bit) gives every left turn of 30 degrees or more its v7 outcome, and for each turn the race is
run again on v7 to 50 m before the turn and on v9 from there, through 50 m after it and back to its plan, so both
steerings take the same turn from the same state among the same traffic. Over the six seeds, one row per turn a
course's races share: 1,183 left turns, 500 where the correction acted (most of the rest were on a corner line). Over
those 500: deepest inside median 3.02 m to 1.01, time over the middle 798 s to 207, held below its plan 167 s to 123
and for a standing car 63 s to 16, contact at 13 turns (166 ticks) to 6 (121), gone at 11 and new at 4, exit speed
55.9 mph to 56.5, and 0.041 s a turn slower. The four new: a stop nose-to-bumper at 0 mph against a sedan standing beside it, waiting on a crossing
car (gen-11, seed 1, where the correction steered it back to its lane at a crawl); 2 and 5 ticks elsewhere; and a turn
on the grid at seed 271828 that has contact under both (14 ticks to 28). Shipped on that: at its turns it is cleaner
and hardly slower, and the gate's worse totals are races meeting other traffic after them. Not measured: the
correction at a crawl, where the cut does not matter and the lane aim can fight a dodge; a floor of about 20 mph for
it is the obvious refinement, turn by turn again.

## Passing the player in traffic (2026-09-26, `driver-v10`)

Shawn raced gen-crest-223734 (Crest, the Skim) and the rival's move on him went wrong three ways. In the first race it
took the side he was not covering, which was the oncoming lane with an SUV in it, and sat there behind it; in the second
(driver-v9) it braked from 115 mph to 74 in the same kind of move. `RIVAL_RACING` had never looked at traffic: behind a
racing player it took the uncovered side, whatever was in it. So the pass now goes only into a lane it can use until it
is by: nothing in that lane (within `passLane`, 2.2 m across, where that car is on this road; 2.6 took a car in the
next lane over) that it would meet, coming or going, in the time the pass takes (`passBy` 8 m past the player at the
closing speed, at most `passLook` 5 s, plus 1). The uncovered side first, then the player's own where they leave room,
and with neither it holds on their bumper, no faster than them by 2 m/s and half a m/s a metre further back than 8 m
(`no-lane`).

The third race was that first version hitting him from behind at 101 mph to his 77, at 42 s. Traced, it never got out
of his line: it chose its side from its own car (`side`, the player across from the rival), and directly behind him
that flips each time either car twitches, so its aim went right, left, right, left while it closed at 11 m/s with a lane
clear and nothing holding it; the bumper hold came 6 m back, too late to shed it. Two changes. It keeps the side its aim
has taken once that is a metre off the player's, reading the player across the ROUTE (`theirs`), and chooses the
uncovered side of the road until then. And still in their line (centres within 2.2 m, its nose behind their tail) and
not getting out of it faster than it closes, it closes no faster than it could shed at 5 m/s^2 before it is 6 m behind
them, centre to centre (`in-line`). A rival already sliding out past them is not held: on a 9 m street held that way it
braked for a blocker it was squeezing past, which "pressure, not patience" (2026-09-13) exists to stop, so the rule is
against running into them and not against pressing.

Measured on every raced recording (42, the player's inputs replayed, contact counted while the log is theirs): contact
between the player and the rival 31 to 24, none added in any recording; the rival 9.9 s quicker in total, 9.3 of it the
first race above (83.00 s to 73.73, no SUV), nothing else by more than 0.23 s. His second-race attempt that it hit
(053106): no contact. The golden master is identical to the bit, and the gate cannot see any of it: its player is
parked, and a player under `racingSpeed` is traffic to the rival, not raced (Inference from that guard; the gate was not
re-run). `tests/rival-racing.test.ts` holds the lane check, the hold, the kept side and the in-line limit.

## Corner dressing trial (2026-09-21)

Shawn asked for more physical scenery around corners to discourage free cuts.
The first eight authored sites occupy the inside parcel of these turns:

| Site | Treatment |
|---|---|
| Harbor Way / 1st Ave S | Concrete yard blocks and a timber storage crate |
| Holgate / 4th Ave S | Concrete yard blocks and a timber storage crate |
| Pike / 2nd | Concrete planting beds |
| Union / 4th | Concrete planting beds |
| Madison / 1st | Concrete planting beds |
| Highland / Taylor Terrace | Stepped masonry planting beds |
| Broadway / Highland | Stepped masonry planting beds |
| Olive / Denny East | Stepped masonry planting beds |

`sim/corner-dressing.ts` owns the authored locations and 42 grounded solids;
`render/corner-dressing.ts` draws their matching masses, coping, planting and
reflectors. `ALDER_SOLIDS` is now the shared list for collision and the rival's
`alderDrivable` query. Grass excludes the same footprints. Tree and bin placement
respect the new solids; building layout validation rejects overlapping edits.

All footprints clear every road by at least 3.8 m, outside its 2.8 m pavement.
The frontage leaves shallow apex clips open while occupying the deeper cut.
No road, alley, garage entrance, drift-yard access or reserved park passage is
closed. Solid props have no distance fade, so approaching drivers can read them
before committing. The style and capture command are in `design/LOOK.md`.

World identity gains `-corners-v1` because collision changed. Road graph and
generator revisions stay the same; their existing fingerprints are checked
against the new world identity. Older world recordings retain their old stamp.

The focused regression drives all eight deep cuts with and without the new
solids, plus their shallow alternatives, using AWD so the grass penalty cannot
explain the difference. The rival then drives each turn in both directions with
and without traffic: 32 completed runs, no dressing contacts and no resets.
This validates the trial corners, not every possible shortcut across the city.

## Ridge approach grass streaming (2026-09-21)

The reported hitch on Ridge Scenic Way south of Pine East came with new grass
tiles, despite the trees being the obvious visual suspect. The ground query
projected every candidate grass root onto the complete circuit paths whenever
it was inside the circuit/access bounds. In a 270 m northbound probe at 1.5 m
per update, grass generation alone reached 163.7 ms p95 and 195.3 ms maximum.
Removing trees from a parked render saved about 0.6–1.4 ms in separate runs.

`alderGround` now indexes street bounds and the circuit's paved segment
footprints. Each circuit path has constant width (the access road has its own),
so the union of nearby segment capsules answers the same paving question as
the full nearest-path scan. Yard and forecourt treatment and the original arena
bounds guard remain. This changes lookup cost, not vegetation, road boundaries,
grip, physics or recording identity.

`tests/ground-index.test.ts` compares against complete-path queries at road and
circuit shoulders, junctions, open ground and 64 m bucket boundaries. The browser
probe is `node scripts/profile-forest.mjs <label>` with Vite running; it writes
JSON and screenshots under `artifacts/forest/`. On Windows it explicitly selects
D3D11 so headless Chromium uses the Radeon RX 6800 XT rather than silently timing
SwiftShader. `FOREST_ANGLE` overrides that backend; `FOREST_SITE=ridge` limits the
probe to the reported area. These are isolated render/grass/step measurements,
not claims about whole-game FPS. Tree count remains 4,439.

Final repeat on the same Ridge probe: grass updates fell to 6.6 ms p95 and
12.4 ms maximum, with zero updates over 16 ms (previously 53 of 180). All 660
tests and the production build passed. Captures retain the same tree geometry,
density and shadows; the runtime change is entirely in the ground query.


## Building grounds pilots (2026-09-21)

The original three saved recipes in `src/sim/alder-site-grounds.json` establish the templates:

- **North Star / Low Tide**, plot `-511,-1108`: a continuous shop landing, street
  path, three short-stay spaces, a planted bed and a bench.
- **Pine Court**, plot `-397,-1234`: an entrance court, two planted beds and
  benches, retained garden grass and two visitor spaces.
- **Alder Industrial Parts**, plot `-146,713`: two clear 18 m loading approaches,
  a separate personnel path and two staff spaces.

Each recipe uses coordinates across/outward from its saved frontage, so doors,
parking and service access share a frame. `site-grounds.ts` surveys the actual
sidewalk edge, including oblique streets. It rejects obstructed/steep approaches,
overlapping props, blocked pedestrian/loading routes, insufficient maneuvering
space and changed/missing owners. It never picks another building or rerolls.
The district expansion below is baked authoring data. Tune the JSON and inspect
the result before choosing more buildings; loading the game never rerolls it.

The same plans feed paving/grip, grass exclusion, tree reservations, collision
and rendering. Only furniture, wheel stops and parked vehicles are solid;
reserved approaches are not invisible walls. Original frontage paving is
replaced at these three sites, preserving grass inside Pine Court's garden.
Other frontages cannot claim the reserved approaches. The frontage editor
rebuilds the grounds preview and reports incompatible edits before saving;
site recipe editing itself remains in JSON. Moving/removing an owner requires
reviewing its grounds recipe as well.

The original pilot budget was 29 mesh batches and 7,744 triangles before
short paint strips were retessellated. No dynamic lights are added. Parked bodies reuse the parking-lot renderer. These are asset
counts, not a whole-game FPS measurement. `tests/site-grounds.test.ts` checks
access, occupancy, withholding, rotations, surface containment, editor ownership
and render/collision agreement. `node scripts/test-site-grounds.mjs` captures
overview, driver-height and night views under `artifacts/site-grounds/`.
World identity adds a `grounds-v1` recipe fingerprint because paving and solids
change; the road graph and race-generator revision are unchanged.

Validation: the 698-test suite passed 697 tests; the remaining ground-index
oracle still included the replaced apron. Its independent polygon reference now
includes grounds patches and passes on rerun. The final focused checks, production
build, nine game captures and `node scripts/test-frontage-editor.mjs --grounds`
cover the finished slice. The editor check exercises non-destructive preview,
undo/redo, real save/reload and moving/restoring the shop owner, then restores the
frontage file.


### Baked grounds expansion

`pnpm grounds:generate` previews a deterministic missing-only pass;
`pnpm grounds:generate --write` saves accepted recipes. Existing recipes, including
manual changes and the three pilots, are preserved exactly. Generation sorts by
stable frontage identity, uses a stable seed for parking side/occupancy, and
fits templates to the real setback and loading-door positions. It is an offline
authoring step, not something that runs during gameplay. The editable JSON is
the source of truth. Preview counts and skipped-site reasons go to ignored
`artifacts/site-grounds/generation.json`.

The first expansion adds 63 sites for **66 total**: 35 shops, 19 apartments and
12 industrial yards across the fitted Belltown and SODO frontages. There are
86 parking spaces, 22 stationary vehicles and 32 compact planted courts. Courts
have a door landing and street path but keep garden ground between them; their
recipes explicitly use `surface: "court"`. They do not invent parking on shallow
plots. Industrial loading approaches keep the existing personnel entrance clear
and only acquire staff spaces where room remains beside the loading corridors.

Another 106 candidate shop/apartment/industrial frontages remain unchanged:
insufficient setback, inadequate loading/maneuvering space, or no useful furniture
fit. Offices are outside these three templates. Proposals cannot overlap accepted
grounds or obstruct any other saved frontage's access. All 194 saved frontages
still validate; all 4,529 evergreens remain. Sidewalk bins and posts yield the
new approaches, while hard props use the same collision definitions as rendering.

District rendering batches nearby sites by material in 256 m cells and instances
parked bodies per vehicle kind/cell. The complete grounds layer is **145 meshes,
65,566 triangles and zero lights**. Standalone views retain per-site grouping for
inspection. Paint is subdivided by its actual extent rather than its distance
from the building. These asset counts do not claim a measured frame rate.

`node scripts/test-site-grounds.mjs --expanded` captures six added sites from
overview, street height and night, including shallow courts, oblique streets and
both industrial clusters. Generator tests check stable order, repeat runs,
manual-edit preservation, obstruction rejection, unchanged triangles after
batching, bounded spatial batches, and all cars surviving instancing.


Expansion validation: all **703 tests pass**, production build passes, and all
18 expanded browser captures are free of console/page errors. The expanded
editor preview and undo were checked on Alder Rooms without writing saved data.
`git diff --check` is clean. The build retains its existing large-chunk warning.
