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

## Validation and remaining work

Automated checks cover connected route choices, reachable gates, building setbacks, mesh height error below 2 cm, northbound spawn clearance, same-runtime replay, and two minutes of traffic with body-overlap checks. Browser checks cover free roam, race entry, legacy-link migration, garage entry/exit and turntable, camera startup, and both lighting modes. The editor browser check saves and restores a real placement, verifies its physics collider, round-trips Three.js JSON, and rejects road overlap.

Next authoring work should follow driving feedback: reshape repetitive blocks, add useful alleys and destinations, and make each neighborhood recognizable. Phone performance and gamepad playtesting are still separate validation steps; this implementation targets the current PC prototype.
