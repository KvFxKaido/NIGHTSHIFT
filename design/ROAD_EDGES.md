# Port Alder street edges

Each original traffic carriageway now has a 5.6 m asphalt shoulder followed by
a 2.8 m sidewalk. Lane routing and markings retain their original widths.
Solid white lines mark the shoulder's inner boundary. Road paint clears
crossing approaches by 1.5 m, including their added shoulders. Approach ends
have a 1.5 m square cap so a T junction preserves the opposite shoulder line;
alleys remain unmarked. The clearance pass trimmed 5,338 old two-metre paint
segments across 317 street segments that extended into the widened crossings.
The asphalt, sidewalk and ground meshes come from `scripts/build-alder.py`;
`--surfaces-only` preserves road identities and all object placement data.

`src/sim/alder-clearance.json` is an authored clearance overlay keyed by the
original plot IDs. It moves 466 buildings, retires two plots that could not fit
nearby, and moves all eight corner compositions as intact groups. Buildings
and corner groups sit beyond the sidewalk, with at least 0.25 m extra setback.
The Alder Market footprint is narrowed to 10 m to preserve its rear service lane;
its architectural kit and apron follow the adjusted footprint.
The original generated map remains available for identity and history; runtime
and editor both resolve the overlay before creating geometry or colliders.
The overlay participates in world and editor compatibility fingerprints.

Street lamps and bins use the new curb offset and check every crossing street,
solid and reserved site approach. Candidates without room are omitted. The
Signal House parking sign sits beside the lot instead of beside the old curb.

All 193 surviving facade plans retain their modules with refitted access.
Of the 66 previous site-detail layouts, 28 fit unchanged, 19 were refitted,
and 19 were removed because parking, loading space or furniture no longer fit.
Those buildings retain their connected entrance paving.

Validation: `tests/shoulder-clearance.test.ts` checks collision footprints and
street props against shoulders, sidewalk clearance for buildings and corner
groups, building overlaps after relocation, and frontage/site validation.
The existing corner-driving tests cover shallow cuts and rival passage.
Measured bend/passing regressions use fixed course paths so changes to route
prices cannot silently replace their driving scenarios. Newly exposed sharp
corner lines that swing outward during braking are rejected by the line planner.
`node scripts/test-sidewalks.mjs` captures Pike / 2nd from overhead and chase
cameras, in both lighting modes and at desktop/mobile sizes.

Sidewalks rise 0.15 m with a 0.25 m mountable bevel. Concave asphalt junction
corners have a 4 m fillet, cutting back the sidewalk rather than narrowing the
driving lanes. Reserved garage, yard, parking and site approaches remain level;
the sidewalk tapers over a metre beside these openings. Alleys join the road
asphalt continuously. `scripts/export-curb-access.ts` feeds the surface builder
the live access footprints; rerun `python scripts/build-alder.py --surfaces-only`
after changing them.

Generated `pavementLifts` are shared by rendering and the indexed driving surface.
Climbing a full curb costs approximately 0.45 m/s; cruising on the sidewalk or
descending it has no added curb drag. The same rule applies to CPU cars and all
drivetrains. There are no solid curb walls.

The sidewalk uses a two-metre repeating concrete grain with subtle pores,
weathering and a shallow bump map. Its world-space UVs continue through the
rounded corners and dropped entrances; the material is matte and nonmetallic.


## Shared paint geometry — 2026-09-23

Paint offsets are built as complete polylines before tessellation and dashing.
Outside bends use round joins matching the road envelope; inside bends meet
at their offset-rail intersection. Folded inner edge pieces are omitted.
Four-metre divider dashes and eight-metre gaps are measured along each rail,
including bends. Closed solid rails no longer have an artificial endpoint gap.
The old segment-normal sampling stretched 99 nominal two-metre paint strips
into corner diagonals (up to 19.9 m), across 43 roads; none now exceed two metres.

Crossing clearance uses the actual approach extent. The former circular
endpoint mask unnecessarily removed the opposite side of T junctions.
The bounded approach restores 1,911 m of edge paint across 145 roads while
retaining real crossing clearance. Together these fixes affect 160 of 318
painted street records, measured on the current Alder map. Lane widths,
traffic paths, physics, road surfaces and world identity are unchanged.

Validation: 30 road-marking, lane, night-render and city-chunk tests pass,
along with the production build. Five matching aerial views cover Wharf,
Harbor Way, Pike and SoDo; a normal-lighting driver view checks the garage bend.
`node scripts/check-road-paint.mjs after` captures these views. Evidence lives
under ignored `artifacts/road-paint/`. The full simulation suite was not rerun
for this render-only change.
