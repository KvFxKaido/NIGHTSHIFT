# Wharf arena

Since 2026-09-25 the arena is also a venue of its own, the stadium (`design/VENUES.md`, `src/sim/stadium.ts`): the
same yard and shell placement, with the original continuous perimeter restored before the entrance cuts.
The venue loads `closed-shell.glb`; city gate markers load that separate world.
Sable's drift runs there. The city's copy described below is still open until the city side of that change lands.

September 23, 2026 — the approved 1,080 by 380 metre shell now ships in normal
Port Alder drives. Its position and silhouette are the approved whole-site
preview: centred on (-600, 997.5), approximately 26.5 metres tall around the rim,
with the taller northern structural feature retained.

The main shell uses neutral concrete, with the yard's existing paving replaced
by world-scaled road asphalt. No extra floor is layered over it. The old site
fence, north container, old north sign/posts and the small interior reference
ramp are removed. Floodlights stand inside the perimeter. The interior remains
a flat driving surface; off-road terrain, jumps and upper-level driving are
future work, not implied by the shell.

## Access and drift

The north driveway passes through a 48 metre cut in the shell. Harbor Way's
existing gate still faces Wharf Garage; a 28 metre diagonal opening through the
rounded eastern end leads into the arena, with sparse yellow approach marks.
The cuts have solid end caps. These are holes in the actual geometry and physics.

Sable's established line and clipping zones move 100 metres south, along with
the warehouse, south container and her parked start. The event still uses its
original 90 second clock and score targets. The north container is removed.
The south scoring boundary stops at z1190 inside the paved site. The existing
yard placement lattice retains its original eastern bounds; expanding that
authoring grid and restricting it to the irregular arena interior is separate.

## Asset and collision contract

Source: **Tron Light cycle Arena**, ImWillows / jcreadingtutor, CC BY 4.0.
The shipped [attribution](../public/assets/wharf-arena/ATTRIBUTION.md) records
the source, license link and modifications. Sketchfab's public model API
confirmed this license on September 23, 2026.

- `scripts/inspect-yard-shell.mjs`: local source cleanup; strips original grid
  floors, lights and outlier tail. Its intermediate GLB remains ignored.
- `scripts/build-yard-arena.mjs`: fixes the approved placement, removes the
  small ramp, clips and caps entrances, then welds/deduplicates/prunes the GLB.
- `scripts/build-yard-arena.mjs --closed`: generates the venue's uncut shell and collision into separate
  `closed-shell.glb` / `closed-collision.json` outputs. `--source=<path>` allows the ignored source
  GLB in another checkout. Neither existing city asset is overwritten.
- `public/assets/wharf-arena/shell.glb`: four meshes sharing one material,
  4,002 triangles, approximately 284 KB, no textures or added lights.
- `assets/wharf-arena/collision.json`: the exact same world-space triangles.
  Rapier receives this synchronously before the first tick. Narrow ground-level
  footprints serve occupancy/planning only, with `collision: false` so they
  cannot produce duplicate or invisible box collisions.

The renderer loads the GLB before marking world assets ready. On load failure it
draws the shared geometry bake instead, avoiding an invisible solid arena. Sim
code has no Three.js or browser dependency. Ordinary builds need no FBX or
ignored inspiration files. World identity is bumped to `drift-yard-v4`.

## Validation

`tests/wharf-arena.test.ts` compares every rendered triangle with the collision
bake, checks retained yard props for intersections, drives actual cars through
both entrances and into a closed wall. `tests/drift.test.ts` runs the full drift
event in all drivetrains with no scenery contacts and checks repeatability.
`tests/yard-grid.test.ts` pins the changed occupancy of the existing lattice.

`node scripts/test-wharf-arena.mjs` captures overview, plan, interior and night
chase views, drives on the asphalt, and verifies the arena is present without
any query flag while the normal start remains at Wharf Garage. A development
`?world=alder&scene=track&yardShell=1` link is retained solely for starting inside
the arena. Camera-study fill light and disabled fog are confined to the three
overview captures; the chase image uses normal game lighting.

Build and browser capture passed on September 23, 2026. The browser reported
four meshes / 4,002 triangles, zero page errors, asphalt driving, and the normal
Wharf Garage start with the arena present. The 15 focused arena, drift and yard
grid checks passed. Camera captures are under `artifacts/yard-shell/` (ignored).

The full suite ran 747 tests: 743 passed and four exposed the drift-start/turf
coupling. Sable's street territory now has its own established anchor rather
than following the relocated event start. All four failures and all six route
fingerprints passed the targeted seven-test rerun; fingerprints are unchanged.
The production build passed again after this fix. The entire suite was not
repeated after that isolated territory fix.
