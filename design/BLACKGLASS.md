# Blackglass Circuit

**Archived course reference — no longer a playable demo map (2026-09-10).**
The active world and authoring workflow are [Port Alder](PORT_ALDER.md) and its
[workshop](EDITOR.md). The course geometry remains for developer regression
tests. Its GLB is now `assets/tracks/blackglass-rivergate.glb`, outside the
shipped demo. Descriptions below record the original course.

Historical status: Blender tunnel / bridge visual slice on the reference geometry

Blackglass is NIGHTSHIFT's first proper course: a clockwise metropolitan loop
that uses believable road hierarchy and practical lighting to make simple,
box-built architecture feel prestigious at speed.

## Track thesis

The city is beautiful, established, and being used irresponsibly after
midnight. It is not a cyberpunk theme park and it is not an abandoned
industrial wasteland.

The course borrows:

- glamorous urban framing and structural rhythm from PGR3
- the intimacy and physical threat of Shift 2's city circuits
- long infrastructure runs and nighttime solitude from Tokyo Xtreme Racer
- readable braking landmarks and disciplined corner sequences from GT4/GT5

## Current layout

- Length: approximately 1.70 km
- Direction: clockwise
- Expected first laps: 75–90 seconds
- Clean prototype pace: approximately 60–70 seconds
- Road width: 15–22 metres depending on district
- Elevation range: 24 metres
- Maximum authored grade: approximately 11.4%

The route is stored as renderer-independent control points and sampled into a
closed Catmull-Rom centerline in `src/sim/track.ts`. Road surfaces, barriers,
tunnel pieces, bridge pieces, physics colliders, corner measurements, and
driving-line tests derive from that same data. The authored tunnel/bridge uses
an exported reference of it; a route stamp and alignment anchors guard against
stale scenery after a future route change.

## Blender slice

The 238 m tunnel and 330 m bridge now use an original Blender source at
`assets/tracks/blackglass/blackglass-rivergate.blend`, exported to
`assets/tracks/blackglass-rivergate.glb`. Faceted concrete, ceramic
wainscoting, ochre safety bands, service doors/vents, recessed cool fixtures and
named portals establish the tunnel. Rivergate uses deeper through-trusses,
piers, warm overhead fixtures and three distant skyline masses.

No road shape, grade, collision or handling changes accompany this visual pass.
The classic road and barriers still render once, beneath/alongside the authored
structures. The remainder of the environment is the existing massing prototype.
See `assets/tracks/blackglass/README.md` for the hand-edit/export workflow.

The first export is approximately 1.35 MB, 81 spatial/material batches and 14
shared materials, with no textures. Geometry is single-sided with tested inward
tunnel winding. Four pooled runtime point lights follow authored fixture
markers; no new shadow-casting point lights. Existing moon shadows remain, with
a small bias adjustment for the authored surfaces. This is not final baked
lighting or mobile performance certification.

## Corner envelope

These are approximate centerline radii and grip-envelope speeds, not promises
about the fastest player line.

| Corner | Radius | Grip-envelope speed |
| --- | ---: | ---: |
| Marquee Bend | 133 m | 176 km/h |
| Freight S apexes | 21–25 m | 70–76 km/h |
| Civic Switchback | 33 m | 87 km/h |
| Hotel Hairpin | 12.5 m | 54 km/h |

Normal steering requests curvature and is capped by lateral acceleration. The
handbrake adds body rotation while reducing rear grip; it does not grant extra
high-speed cornering force. A paced reference driver completes a clean lap,
while the same driver pinned at full throttle leaves the road.

## Sequence

1. **Neon Boulevard** — the launch and longest sightline. Despite the name,
   color comes mostly from storefronts, windows, and warm streetlights.
2. **Marquee Bend** — the first measurable lift/brake corner, compressing the
   skyline toward the tunnel entrance.
3. **Blackglass Tunnel** — a long concrete run with repeating white fixtures,
   mustard safety bands, and a gentle change of direction. The light cadence
   should make speed legible without becoming decorative neon.
4. **Rivergate Bridge** — the tunnel exit releases into open sky, water, steel
   frames, and the broadest skyline view on the lap.
5. **Freight S** — three genuine alternating apexes on a narrower road, with
   kerbs and barrier chevrons interrupting the long infrastructure rhythm.
6. **Civic Switchback** — compressed historic blocks in warm practical light,
   climbing out of the Freight dip before the downhill Hotel approach.
7. **Hotel Hairpin** — the slow handbrake showcase before the course opens back
   onto the starting boulevard.

## Visual rules

- Architecture uses large, deliberate masses and recognizable silhouettes.
- Practical fixtures are visible more often than they are simulated as real
  lights; this preserves the lighting rhythm without exploding GPU cost.
- Warm civic and street lighting contrasts with cold ambient sky and tunnel
  light.
- Road markings, barriers, gantries, and structural frames provide speed cues.
- Edge lines, distance boards, kerbs, and amber chevrons announce braking zones
  before the player has memorized the route.
- Building windows read as grids on all four facades, not glowing horizontal
  stripes on one face.
- The sky has a cold city-haze gradient and the waterfront carries restrained
  warm/cool reflection streaks so open sections do not collapse into black.
- Neon is an accent, not the atmosphere's entire vocabulary.
- Dense street canyons must alternate with open skyline releases.

## Elevation sequence

- The boulevard begins level, then climbs gradually through Marquee Bend.
- The tunnel rises from 9 to 15 metres, hiding the approaching bridge crown.
- Rivergate opens at 20 metres and crests at 24 metres over visible piers.
- Quayside descends to the Freight district at the lowest point of the lap.
- The Freight S climbs through its alternating apexes; the Civic Switchback
  crests before a downhill braking run into the Hotel Hairpin.

Elevation remains simulation-owned. The car is projected onto the sampled road
surface, its body pitch and camera follow that profile, barriers share the same
height and grade, and gravity adds a small deterministic uphill/downhill speed
effect.

## Prototype boundaries

- Vertical contact is an arcade road constraint, not a suspension or tyre-contact
  model yet. The car follows the road profile rather than solving four wheels
  independently.
- Roads are not banked and there are no jumps; pitch is the only current surface
  rotation.
- No shortcut is implemented yet. First prove the primary racing line, then
  open the Freight S service-road cut.
- Buildings are primitive-based massing studies, not final assets.
- The current lighting establishes hierarchy; it is not a final baked-lighting
  solution.

## Immediate playtest questions

1. Does the boulevard give the car enough time to feel fast before braking?
2. Is the tunnel long enough to establish a distinct mood without dragging?
3. Does the tunnel-to-bridge transition read as a genuine release?
4. Can the next corner be understood from road markings and structure alone?
5. Is the Hotel Hairpin satisfying with the current handbrake rotation?

## Automated geometry gates

- Lap length remains between 1.6 and 1.9 km.
- The centerline does not cross itself.
- Non-local road ribbons retain more clearance than their combined half-widths.
- The route contains meaningful turns in both directions.
- At least three named zones fall below theoretical top speed.
- A paced reference driver completes a clean lap under 90 seconds.
- That reference lap traverses essentially the full 24 metres of elevation.
- A throttle-pinned reference driver cannot complete a clean lap.
