import assert from "node:assert/strict";
import test from "node:test";
import { createAlderWorld, ALDER_SOLIDS, alderGround } from "../src/sim/alder.ts";
import { DRIFT_YARD, SITE_PAVING, YARD_GATE } from "../src/sim/drift-yard.ts";
import type { BuildingBlock } from "../src/sim/building-footprint.ts";
import { yardCells, yardCellAt, yardCellCentre, yardCol, yardRow, inYardSite,
  YARD_CELL, YARD_COLUMNS, YARD_SITE, type YardCell } from "../src/sim/yard-grid.ts";

const world = createAlderWorld();
const cells = yardCells({ road: (x, z) => world.project(x, z), ground: alderGround, solids: ALDER_SOLIDS });

// An independent oracle for "a solid stands here": the grid asks
// blockPenetration, a separating-axis test between two rectangles. This asks
// whether points inside the cell land inside the solid, which is different code
// reaching the same answer.
function inside(block: BuildingBlock, x: number, z: number): boolean {
  const angle = -(block.rotation ?? 0), dx = x - block.x, dz = z - block.z;
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.abs(localX) <= block.width / 2 && Math.abs(localZ) <= block.depth / 2;
}
const samples = (cell: YardCell): { x: number; z: number }[] => {
  const out: { x: number; z: number }[] = [];
  for (const dx of [-.4, 0, .4]) for (const dz of [-.4, 0, .4])
    out.push({ x: cell.x + dx * YARD_CELL, z: cell.z + dz * YARD_CELL });
  return out;
};

// design/CHAOS.md, "The shape of the venue": the venue has no street graph, so
// the grid is how anything addresses a place in it. The lattice is anchored to
// the world rather than to the site, which is what lets the site's bounds be
// edited without every cell moving underneath the things placed in them.
test("the yard lattice tiles the site, and every position lands in its own cell", () => {
  assert.equal(cells.length, YARD_COLUMNS * (yardRow(YARD_SITE.maxZ) - yardRow(YARD_SITE.minZ)));
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.col},${cell.row}`;
    assert.ok(!seen.has(key), `${key} appears twice`);
    seen.add(key);
    // The centre is the cell's own, and the lookup is the inverse of the walk.
    assert.deepEqual(yardCellCentre(cell.col, cell.row), { x: cell.x, z: cell.z });
    assert.equal(yardCellAt(cells, cell.x, cell.z), cell, `${key} does not find itself`);
    assert.ok(inYardSite(cell.x, cell.z), `${key} centres outside its own site`);
    // Anywhere inside the cell finds the same cell, edges included.
    for (const corner of [[.49, .49], [-.49, .49], [.49, -.49], [-.49, -.49]] as const)
      assert.equal(yardCellAt(cells, cell.x + corner[0] * YARD_CELL, cell.z + corner[1] * YARD_CELL), cell,
        `a corner of ${key} finds another cell`);
  }
  // Off the site is nothing, not the nearest cell.
  assert.equal(yardCellAt(cells, YARD_SITE.maxX + 1, 900), null);
  assert.equal(yardCellAt(cells, -500, YARD_SITE.minZ - 1), null);
  assert.equal(yardCol(-620), -31);
  assert.equal(yardRow(800), 40);
});

test("a usable cell is clear of the solids and the carriageway; a blocked one is not", () => {
  for (const cell of cells) {
    if (cell.usable) {
      for (const point of samples(cell))
        for (const solid of ALDER_SOLIDS)
          assert.ok(!inside(solid, point.x, point.z),
            `usable cell ${cell.col},${cell.row} has a solid at ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`);
      const road = world.project(cell.x, cell.z);
      assert.ok(road.distance > road.width / 2,
        `usable cell ${cell.col},${cell.row} sits on a ${road.width} m carriageway`);
    }
  }
  // The gate was built to stand in the venue, so its cell is one of the blocked.
  const gate = yardCellAt(cells, YARD_GATE.x, YARD_GATE.z);
  assert.ok(gate?.blocked, "the east gate does not occupy a cell");
  assert.ok(cells.some(cell => cell.blocked), "nothing in the venue is solid, which cannot be right");
});

// A cell's surface is read from the world, never authored here, so that the
// venue describes itself rather than keeping a second copy that drifts. The
// site was fenced and paved wall to wall on 2026-09-21, and this followed it
// without being told: what was open dirt east of the apron now reads paved.
test("a cell's surface is whatever the world paved, not a copy of it", () => {
  const paved = (cell: YardCell) => SITE_PAVING.some(area =>
    cell.x >= area.minX && cell.x <= area.maxX && cell.z >= area.minZ && cell.z <= area.maxZ);
  for (const cell of cells)
    assert.equal(cell.surface, paved(cell) ? "apron" : "ground",
      `${cell.x}, ${cell.z} reads ${cell.surface}`);

  // Sable's ground and the gate's are the same surface now; the strip of the
  // grid that falls outside the fence's south-east step is what is still dirt.
  assert.equal(yardCellAt(cells, DRIFT_YARD.start.x, DRIFT_YARD.start.z)?.surface, "apron");
  assert.equal(yardCellAt(cells, -150, 1000)?.surface, "apron");
  assert.equal(yardCellAt(cells, -150, 810)?.surface, "ground");
  assert.ok(cells.some(cell => cell.surface === "ground"), "the grid sees no unpaved ground at all");
});

// The counts are the venue's shape in one line, so they move only on purpose.
// A drop in usable cells means something was built in the yard; a move between
// apron and ground means a surface changed, which is a grip change and wants
// the yard's world token bumped with it (design/CHAOS.md, the boundaries).
test("the venue measures what it measured when this was pinned", () => {
  const count = (kind: (cell: YardCell) => boolean) => cells.filter(kind).length;
  const measured = { cells: cells.length, usable: count(c => c.usable), blocked: count(c => c.blocked),
    roadside: count(c => c.roadside), apron: count(c => c.usable && c.surface === "apron"),
    ground: count(c => c.usable && c.surface === "ground") };
  // Repinned 2026-09-23, when the gate moved onto the fence line. Every cell of
  // the difference is accounted for: the two gate rails came out, freeing two
  // unpaved cells; the gate's old cell east of the fence freed a paved one; and
  // narrowing the fence's gap from 22 m to 14 m put wall back into the cell the
  // posts stand in, which was paved. Net two fewer blocked, two more usable.
  // The subsequent street-clearance pass moves corner dressing into one ground
  // cell: one additional blocked cell, with every apron cell unchanged.
  assert.deepEqual(measured, { cells: 480, usable: 398, blocked: 82, roadside: 0, apron: 365, ground: 33 },
    `the venue changed shape: repin to ${JSON.stringify(measured)}`);
  // Just under 16 hectares of it, and the site stops at Harbor Way's kerb
  // rather than swallowing the street, which is why nothing is roadside.
  assert.equal(measured.usable * YARD_CELL * YARD_CELL, 159200);
  assert.equal(YARD_SITE.maxX, -20);
});
