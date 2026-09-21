import { blockPenetration, type BuildingBlock } from "./building-footprint.ts";
import { DRIFT_YARD } from "./drift-yard.ts";

/** The venue's coordinate system.
 *
 * Port Alder's races are drawn from the street graph: legs between junctions,
 * gates on lanes, distances along a lane's own path. The venue has none of
 * that. It is the walled apron plus 11 hectares of open ground with no lanes
 * in it at all, so nothing the generator does can address a place there.
 *
 * This is the substitute: a lattice of 20 m cells anchored to the world, not
 * to the site, so the cells never shift when the site's bounds are edited. A
 * cell is about a race gate's radius (`GENERATOR.gateRadius`, 20) and about a
 * drift zone's (17), which is the size at which "a place in the yard" means
 * something to a car.
 *
 * What a cell knows is derived, never authored: which surface it stands on,
 * whether a solid occupies it, whether the carriageway reaches into it. The
 * apron reads as paved and the ground east of it as dirt because `alderGround`
 * says so, so the venue's grounds describe themselves (design/CHAOS.md, "The
 * shape of the venue", move 2) instead of being listed twice.
 *
 * Nothing seeded happens here. When props, ramps and debris are laid out per
 * cell they must use the integer hash, never the renderer's `hash01`. */
export const YARD_CELL = 20;

/** Apron west wall to the kerb of Harbor Way, and the apron's own run. The
 *  bounds are whole cells and the maxima are exclusive, so every cell's centre
 *  lies inside the site — declaring them off the lattice left the last row's
 *  centres outside their own site and `yardCellAt` refusing them. */
export const YARD_SITE = { minX: -620, maxX: -20, minZ: 800, maxZ: 1120 } as const;

export interface YardCell {
  /** World-anchored lattice index: `Math.floor(x / YARD_CELL)`. */
  readonly col: number;
  readonly row: number;
  /** The cell's centre, which is where anything placed in it goes. */
  readonly x: number;
  readonly z: number;
  /** Paved apron, or the open ground east of it. Read from the world. */
  readonly surface: "apron" | "ground";
  /** A solid stands in this cell: a wall, a container, the gate, a tree. */
  readonly blocked: boolean;
  /** The carriageway reaches into this cell, so it belongs to the street. */
  readonly roadside: boolean;
  /** Free to place in, drive through, or score. */
  readonly usable: boolean;
}

export interface YardProbe {
  /** How far the nearest carriageway centre is, and how wide it is there. */
  road(x: number, z: number): { distance: number; width: number };
  /** True where the world reports ground rather than pavement. */
  ground(x: number, z: number): boolean;
  solids: readonly BuildingBlock[];
}

/** Metres of carriageway edge a cell keeps clear before it counts as the
 *  street's rather than the yard's. A car is 1.84 wide; this is room to be
 *  beside the road without being on it. */
const ROAD_MARGIN = 4;

export const yardCol = (x: number): number => Math.floor(x / YARD_CELL);
export const yardRow = (z: number): number => Math.floor(z / YARD_CELL);
export const yardCellCentre = (col: number, row: number): { x: number; z: number } =>
  ({ x: col * YARD_CELL + YARD_CELL / 2, z: row * YARD_CELL + YARD_CELL / 2 });

export function inYardSite(x: number, z: number): boolean {
  return x >= YARD_SITE.minX && x < YARD_SITE.maxX && z >= YARD_SITE.minZ && z < YARD_SITE.maxZ;
}

/** Every cell of the site, in row-major order from the south-west corner. The
 *  order is fixed so a seeded draw over the cells is reproducible. */
export function yardCells(probe: YardProbe): readonly YardCell[] {
  // The city's solid list is thousands long and almost none of it is here, so
  // the site's own box narrows it once rather than per cell.
  const reach = YARD_CELL;
  const near = probe.solids.filter(solid => {
    const half = Math.max(solid.width, solid.depth) / 2 + reach;
    return solid.x + half >= YARD_SITE.minX && solid.x - half <= YARD_SITE.maxX
      && solid.z + half >= YARD_SITE.minZ && solid.z - half <= YARD_SITE.maxZ;
  });
  const cells: YardCell[] = [];
  for (let row = yardRow(YARD_SITE.minZ); row < yardRow(YARD_SITE.maxZ); row++) {
    for (let col = yardCol(YARD_SITE.minX); col < yardCol(YARD_SITE.maxX); col++) {
      const { x, z } = yardCellCentre(col, row);
      const road = probe.road(x, z);
      const roadside = road.distance < road.width / 2 + ROAD_MARGIN;
      const footprint: BuildingBlock = { x, z, width: YARD_CELL, depth: YARD_CELL, height: 1, base: DRIFT_YARD.base, rotation: 0 };
      const blocked = near.some(solid => blockPenetration(footprint, solid) > 0);
      cells.push({ col, row, x, z, surface: probe.ground(x, z) ? "ground" : "apron",
        blocked, roadside, usable: !blocked && !roadside });
    }
  }
  return cells;
}

/** How many cells a row holds, which is what makes the lookup arithmetic. */
export const YARD_COLUMNS = yardCol(YARD_SITE.maxX) - yardCol(YARD_SITE.minX);

/** The cell a position stands in, or null outside the site. Scoring asks this
 *  every tick, so it indexes rather than searches. */
export function yardCellAt(cells: readonly YardCell[], x: number, z: number): YardCell | null {
  if (!inYardSite(x, z)) return null;
  const index = (yardRow(z) - yardRow(YARD_SITE.minZ)) * YARD_COLUMNS + (yardCol(x) - yardCol(YARD_SITE.minX));
  return cells[index] ?? null;
}
