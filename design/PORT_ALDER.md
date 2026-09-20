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

Real Seattle centerlines provide the original southwest structure. The new hill districts are hand-authored Seattle-inspired layouts, not a new GIS import or a reconstruction of the actual neighborhoods. Distances, widths, elevation, buildings and connections are deliberately adapted. See `assets/maps/alder/README.md` for attribution and regeneration. The visual target remains an upscaled MC3-like city; this is playable massing, not finished architecture. Alder Broadcast Tower is a fictional steel-mast landmark with a shared station footprint. No surveyed terrain, bridges, tunnels, or police yet.

## Shared surface

**Alder Broadcast Tower** replaces the former Needle silhouette on the same plaza.
The station is a solid 20 × 20 × 18 m concrete base; an exposed, tapering steel
mast reaches 120 m above the site, with red warning lights and PORT ALDER signs
facing all four approaches. The base collider and rendered shell share
`alder-landmarks.json`. Upper latticework is skyline detail, not an invisible
120 m collision box. Repeated beams, sign pixels and lights merge by material
into eight meshes, without downloaded fonts or textures. Both map views label
the landmark Broadcast Tower. After dark the station is lit only in its overnight
booth (2026-09-19, `STATION_BOOTH`), three panes wrapping the corner over Broad
St, the only two faces with a street in front of them: the soundtrack's DJ
broadcasts from here (`public/assets/music/README.md`), and the booth is where. The `broadcast-v1` world suffix records the
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
Lap recordings with a rival name the driver raced (`RIVAL_REVISION`) and replay
refuses another. Not built: extracting features from recordings automatically,
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

**An experiment, not built: a racing line through the streets.** First measured
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

**What stands between this and a build.** A racing line ignores lanes, which is
why streets never had one (the header of `racing-line.ts`: the rival "sat in the
traffic's own lane and ran into it"), so this is for clear races only until the
rival reads traffic's forecast. It is one circuit. Against a human it has not
been raced: `pnpm laps:compare --line` replays a recorded race against it, but the
input log is blind, and a rival this much quicker is somewhere else on the road,
so the recorded car drives into it (the tool says so, and voids its own table).
The plan fraction is a number in `rival.ts` (`RIVAL_BRAKING.speedFactor`, 0.76);
the rows above overwrote it inside a probe.


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
