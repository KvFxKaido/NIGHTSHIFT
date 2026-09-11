# Seattle demo

Seattle is the demo's only playable map, authorized September 10, 2026 after the separate-map study. The base URL and old Blackglass world bookmarks enter Seattle. `district.html` redirects to `seattle.html`. Handling and car customization are shared unchanged.

Free roam starts outside **Wharf Garage**, beside First Avenue in SoDo. Stop at the cyan shutter and use **E / Enter** or **Cross / A** to enter. The garage uses the existing fixed camera and rotating car platform. Drive out returns to its forecourt. Races retain the clear northbound street grid and disable garage entry. The minimap and route board mark the garage.

`editor.html` now edits Seattle. Its validated placements live in `src/sim/seattle-layout.json`; the garage and forecourt stay protected. Saved building footprints feed both rendering and Rapier.

## Direction

This is the single-city MC3-inspired demo described in [GDD.md](GDD.md).
The target look is upscaled/emulated MC3, with MC3 San Diego as a reference
for eventual scale. Expand Seattle naturally from driving feedback. Keep
open route choice, understandable customization and the current handling.
PC prototyping comes first; RedMagic 10 Pro is the eventual device, with
Android packaging and testing later. Police and other selective LA features
remain optional future work.

## First slice

Approximately 13.1 km of selected streets in a 1.3 by 2.2 km land envelope: industrial south, old grid, downtown hill, and a fictional waterfront bypass. There are 63 graph edges and 160 generated building masses plus Wharf Garage. Buildings reserve clear roads and passages through larger parcels. The generated network has no disconnected islands or clipped dead ends.

Real Seattle centerlines provide the structure. Distances, widths, elevation, buildings and some connections are deliberately adapted. See `assets/maps/seattle/README.md` for attribution and regeneration. The visual target remains an upscaled MC3-like city; this is playable massing, not finished Seattle architecture. No surveyed terrain, Space Needle, bridges, tunnels, or police yet.

## Shared surface

`src/sim/seattle.ts` owns the road world and continuous analytic height function. `scripts/build-seattle.py` unions buffered road polygons before constrained triangulation; asphalt, pavement and land are disjoint. Graded triangles are refined to edges of at most 10 m. Renderer and simulation use the same height function; selecting a different nearest street cannot switch elevation profiles. The outskirts continue that surface beyond the developed blocks.

Road data also feeds the minimap and existing lane/reservation traffic builder. Traffic remains deterministic. General road projection, building footprint and traffic helpers are separate modules, so importing Seattle does not initialize the retired district.

The game and editor no longer bundle the old district/course renderers. A build guard rejects their reintroduction. The 1.35 MB Rivergate GLB moved from `public/assets/tracks` to the offline `assets/tracks` folder; it remains a developer asset regression fixture and is not copied to the demo. Other Blackglass source/handling fixtures remain for regression tests, with no playable entry. No changes to `HANDLING` or the physics version. Seattle's world identity is now `seattle-slice-v2`, with a layout fingerprint when edited.

## Regeneration caveats

`scripts/build-seattle.py` writes `src/sim/seattle-data.json` in full, including
its 160 generated buildings. `src/sim/seattle-layout.json` does not hold
independent buildings: it stores per-building edits from `editor.html`, each
keyed to a generated plot id derived from that building's generated
coordinates, and `resolveSeattleLayout` replaces the matching generated block
in place. The layout cannot add a net-new building, and an id it does not
recognise is an error. Its `baseline` is a fingerprint of the generated
massing, so a rebuild that moves any building changes the ids and the
baseline together and the sim refuses to load the layout ("The district
changed. Re-export its layout before importing these edits."). The failure is
loud, not a silent reshuffle. The layout file is empty today, so nothing is at
risk yet; once it holds edits, regenerating the map means re-exporting or
rebasing those edits against the new baseline before the build passes again.

The builder stamps its output `seattle-slice-v1`; the sim reports
`seattle-slice-v2` from `src/sim/seattle.ts`, where the v2 bump was made for
the vertical physics change. The two are not linked: regenerating the map
changes the world without changing its identity. Any expansion (new streets,
new bounds) must bump the version in `seattle.ts` deliberately, and a future
saved ghost must not trust the data file's own stamp.

## Validation and remaining work

Automated checks cover connected route choices, reachable gates, building setbacks, mesh height error below 2 cm, northbound spawn clearance, same-runtime replay, and two minutes of traffic with body-overlap checks. Browser checks cover free roam, race entry, legacy-link migration, garage entry/exit and turntable, camera startup, and both lighting modes. The editor browser check saves and restores a real placement, verifies its physics collider, round-trips Three.js JSON, and rejects road overlap.

Next authoring work should follow driving feedback: reshape repetitive blocks, add useful alleys and destinations, and make each neighborhood recognizable. Phone performance and gamepad playtesting are still separate validation steps; this implementation targets the current PC prototype.

**Surveyed terrain** is still open. `seattleHeight` is one analytic
smoothstep bump, 34 m over 640 m east-west and 500 m north-south: a mean
slope near 5% and a measured maximum gradient of 10%, on the north-south
face; along the streets themselves the critique reports positive grades on
41 of 63, steepest 8% on Yesler Way. Downtown Seattle's James St and
Madison St run near 18%. The critique's grade risk term is a linear ramp
that saturates at 12%, so today it is exercised but never reaches its cap;
real terrain would. The height function exists twice: `seattleHeight` in
the sim feeds physics, road meshes, traffic, routing and edited building
bases, while `height` in `scripts/build-seattle.py` bakes the generated
buildings' bases and the terrain triangles into `seattle-data.json`.
Replacing the bump with a baked heightfield sampled by a C1-continuous
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
  cited in `assets/maps/seattle/README.md`; fits the existing fetch script
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

`pnpm seattle:critique` reports whether the slice has anything to learn. The
rule it measures against is "every shortcut has a cost": between two gates,
the faster way should be the riskier way.

- **Risk per street**, from the map data, each 0..1: narrowness (24 m is 0,
  16 m is 1), bends (turn per 100 m or the sharpest corner, over 90 degrees),
  grade (steepest metre over 12%), blind corners (a bend over 25 degrees with a
  building on its inside within half the width plus 10 m). Weights 0.35 /
  0.25 / 0.2 / 0.2, a proposal.
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
Yesler / James. There are no blind corners: 16 bends over 25 degrees, and the
nearest building to any of them is 24 m away. The no-choice legs are the
waterfront: Harbor Way and 1st Ave S to Pike with nothing under +53%.

What this says to authoring: the grid has route choice but not shortcuts.
Cut-throughs — diagonals, passages through the larger parcels, an alley that
saves time and costs width — are what turn free legs into priced ones, and
the report will show the count move. Traffic is not scored yet; it is
seeded uniformly per lane length.

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
of the draw (uniform 26%, so the weighting still lifts it), 60 of 60 seeds
draw, at least 26 of 30 seeds are distinct, and every seed now draws a
different race than before. A soft falloff kept three more points of
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

Not yet: rivals biasing the draw towards their own streets, a race starting
where the flash happened rather than at the grid, saved playlists, and
rivals learning the player's line per street.


## First racing rival

Sound to Sky now starts with one AI opponent in the other garage car: NS-01
faces Bulwark, and Bulwark faces NS-01. Both use the existing four-wheel forces
and share one Rapier world; the rival uses FWD independently of the player's
handling comparison setting. In free roam, the opponent waits on First Avenue S
just north of Wharf Garage. Its red minimap dot follows its physical position;
it remains a solid car and can be pushed.

Within 32 metres, below 12 m/s and at the same elevation, **F / X–Square** flashes
the headlights and accepts a challenge. Both bindings are remappable; older
saved controls keep their mappings and receive an unused flash binding. The
nearby prompt also works by click. A double flash precedes the page transition
to Sound to Sky's grid/countdown, preserving the selected player/opponent bodies.
Pause freezes the transition. **Return to free roam** in the main/pause menus
reopens Seattle at Wharf Garage with the waiting opponent restored. This first
encounter starts the authored race; it does not generate routes or cruise the city.

`src/sim/seattle-rival.ts` defines a continuous preferred line through all four
gates. The player remains free to choose any route. `src/sim/rival.ts` controls
throttle, brake and steering with corner-speed previews, local traffic offsets,
and reversing/rejoining after a stall. After 12 seconds without gaining another
4 metres of forward route progress, the sim can reset it at rest on nearby clear
road. It keeps its race clock and checkpoints, stays behind the next gate, and
retries once per second if local placements are occupied. This recovery follows
its own route position, with no catch-up speed boost or grip change.
Start/reset reconstructs
both cars and AI state; Pause and Controls pause both racers.

The HUD shows position, a red minimap dot and opponent finish status. Position
uses checkpoint progress, then distance to the next gate; it is an approximation
between gates, not a predicted finishing order. A finished rival brakes to a stop.

Validation covers a complete race in normal traffic, a parked player and forced
spin, escaping a small unexpected barrier, physical player/rival contact,
timed fallback recovery, blocked placements, checkpoint preservation, and
identical reset state/world snapshots. Browser checks cover both car pairings,
garage changes, countdown, pause/restart, full-race completion and free-roam
isolation. This is the first driver, not general city navigation: aggressive
player blocking, repeated pileups and unusual off-route recoveries need driving
feedback. Generated races, moving encounters and rival personalities remain future work.
