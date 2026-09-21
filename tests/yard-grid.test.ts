import assert from "node:assert/strict";
import test from "node:test";
import { createAlderWorld, ALDER_SOLIDS, alderGround } from "../src/sim/alder.ts";
import { DRIFT_YARD, YARD_GATE } from "../src/sim/drift-yard.ts";
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

test("the venue's grounds describe themselves: the apron reads paved, the land east of it dirt", () => {
  const b = DRIFT_YARD.bounds;
  const insideApron = (cell: YardCell) => cell.x > b.minX && cell.x < b.maxX && cell.z > b.minZ && cell.z < b.maxZ;
  for (const cell of cells) {
    if (insideApron(cell)) assert.equal(cell.surface, "apron", `${cell.x}, ${cell.z} is in the apron but reads ${cell.surface}`);
    if (cell.x > b.maxX) assert.equal(cell.surface, "ground", `${cell.x}, ${cell.z} is east of the apron but reads ${cell.surface}`);
  }
  // Sable's start is on the apron; the gate stands on the dirt it opens onto.
  assert.equal(yardCellAt(cells, DRIFT_YARD.start.x, DRIFT_YARD.start.z)?.surface, "apron");
  assert.equal(yardCellAt(cells, YARD_GATE.x, YARD_GATE.z)?.surface, "ground");
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
  assert.deepEqual(measured, { cells: 480, usable: 401, blocked: 79, roadside: 0, apron: 198, ground: 203 },
    `the venue changed shape: repin to ${JSON.stringify(measured)}`);
  // 16 hectares of it, and the site stops at Harbor Way's kerb rather than
  // swallowing the street, which is why nothing is roadside today.
  assert.equal(measured.usable * YARD_CELL * YARD_CELL, 160400);
  assert.equal(YARD_SITE.maxX, -20);
});
