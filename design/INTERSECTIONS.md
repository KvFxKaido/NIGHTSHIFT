# Cosmetic intersection infrastructure

The first pass dresses 113 complete road-network junctions: 236 signal heads,
170 stop signs and 136 marked crossings. These are visual infrastructure;
traffic and racers retain their existing driving behavior.

`ALDER_INTERSECTIONS` exposes stable junction and street identities, approach
directions, stop positions, pole positions and control types. Later traffic
rules can consume this inventory rather than reverse-engineering meshes.

Three or more non-alley arms qualify. Junctions with at least three approaches
16 m wide receive signals; smaller junctions receive stop signs. Signals flash
amber along the selected primary axis and red across it at 1 Hz. They never
display a green phase. Four-arm signalized junctions receive crosswalks.

Degree-two bends, alley-only junctions, acute merges and approaches that cannot
fit are omitted. The complete junction is withheld if any required pole cannot
stand on raised sidewalk clear of solids, parking/site entrances and existing
street props. Paint must fit the approach asphalt and clear crossing roads.
Existing longitudinal paint is trimmed from the stop bar through the junction.
Signal poles extend where necessary to retain 4.8 m of head clearance on hills.

Geometry is batched by material and spatially chunked. Signs use a small
Node-safe bitmap texture; signal flashing changes two shared materials and
uses simulation time, so freezing the scene also freezes the flashing.
The props introduce no new collision obstacles or route/pricing changes.

Validation: `tests/intersection-dressing.test.ts`, `tests/road-markings.test.ts`,
`tests/city-chunks.test.ts`; `pnpm build`; and
`node scripts/test-sidewalks.mjs --signals` for daylight/night overhead,
approach, stop-sign and mobile captures.
