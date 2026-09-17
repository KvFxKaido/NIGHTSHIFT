import { pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import type { Street } from "./street-path.ts";

/**
 * Frontage: how far each wall of a building looks before it reaches a street.
 *
 * The night dressing puts signs and shopfronts only on walls a driver can read
 * (design/LOOK.md, "Neon is where something is still open"). Blackglass asked
 * how far the nearest centreline was from each wall's midpoint, which works on
 * boulevards lined with buildings. Port Alder sets its buildings back (the
 * median wall that faces a street stands 22 m from its carriageway), so the
 * same question passed 6,695 of 6,912 walls, back walls and courtyards included. This asks
 * along the wall's own outward normal instead, and a ray that enters another
 * building first sees no street at all.
 *
 * Geometry only: nothing here draws. The renderer decides what to hang on a
 * wall with a given frontage.
 */

/** Metres from each wall's midpoint to the carriageway it faces, in the
 *  building's own frame and night.ts's order: +Z, -Z, +X, -X. Infinity where
 *  the wall faces no street within reach. */
export type Frontage = readonly [number, number, number, number];

/** Metres along the ray between samples; a wall's frontage is accurate to this. */
const STEP = 1;

interface Segment { ax: number; az: number; bx: number; bz: number; half: number }

export function buildingFrontage(blocks: readonly BuildingBlock[], streets: readonly Street[],
  reach: number): Frontage[] {
  const segments: Segment[] = streets.flatMap(street => street.points.slice(1).map((b, i) => {
    const a = street.points[i]!;
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: Math.max(a.width, b.width) / 2 };
  }));
  const nearSegments = spatialIndex(segments, s => ({
    minX: Math.min(s.ax, s.bx) - s.half, maxX: Math.max(s.ax, s.bx) + s.half,
    minZ: Math.min(s.az, s.bz) - s.half, maxZ: Math.max(s.az, s.bz) + s.half,
  }));
  const onCarriageway = (x: number, z: number) => nearSegments(x, z).some(s => {
    const dx = s.bx - s.ax, dz = s.bz - s.az, length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / length2)) : 0;
    return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) <= s.half;
  });
  const nearBlocks = spatialIndex(blocks, block => {
    const r = Math.hypot(block.width, block.depth) / 2;
    return { minX: block.x - r, maxX: block.x + r, minZ: block.z - r, maxZ: block.z + r };
  });

  return blocks.map(block => {
    const cos = Math.cos(block.rotation), sin = Math.sin(block.rotation);
    const wall = (localX: number, localZ: number, normalX: number, normalZ: number) => {
      const x0 = block.x + localX * cos - localZ * sin, z0 = block.z + localX * sin + localZ * cos;
      const nx = normalX * cos - normalZ * sin, nz = normalX * sin + normalZ * cos;
      for (let s = STEP / 2; s <= reach; s += STEP) {
        const x = x0 + nx * s, z = z0 + nz * s;
        if (onCarriageway(x, z)) return s;
        if (nearBlocks(x, z).some(other => other !== block && pointFootprintDistance(other, x, z) <= 0)) return Infinity;
      }
      return Infinity;
    };
    return [
      wall(0, block.depth / 2, 0, 1), wall(0, -block.depth / 2, 0, -1),
      wall(block.width / 2, 0, 1, 0), wall(-block.width / 2, 0, -1, 0),
    ] as const;
  });
}
