import { blockCorners, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import type { Street } from "./street-path.ts";
import landmarks from "./alder-landmarks.json" with { type: "json" };

export interface Evergreen {
  id: string;
  grove: string;
  trunk: BuildingBlock;
  height: number;
  radius: number;
  oldGrowth: boolean;
}

// Authored planting regions, not new boundaries. Roads, buildings and service
// passages take priority; irregular clusters leave room to pick a slower line.
export const EVERGREEN_GROVES = [
  { id: "queen-anne-slopes", x: -740, z: -2470, rx: 400, rz: 590 },
  { id: "union-commons", x: -30, z: -2050, rx: 325, rz: 365 },
  { id: "capitol-greenbelt", x: 1100, z: -2390, rx: 690, rz: 620 },
  { id: "madrona-woods", x: 2110, z: -1450, rx: 530, rz: 1350 },
  { id: "central-greenway", x: 1410, z: -80, rx: 650, rz: 770 },
  { id: "freight-edge", x: 710, z: 770, rx: 480, rz: 260 },
  { id: "broadcast-campus", x: -780, z: -1300, rx: 200, rz: 145 },
] as const;

export function evergreenPassage(x: number, z: number, clearance = 0): boolean {
  // Both passages have slopes below .3. Widen conservatively for a crown,
  // including the endpoints, while preserving the original centre-only rule.
  return (x > -380-clearance && x < 320+clearance && Math.abs(z - (-2050 + 32 * Math.sin(x / 110))) < 12+clearance*1.1)
    || (x > 1540-clearance && x < 2680+clearance && Math.abs(z - (-1460 + (x - 2100) * .28)) < 12+clearance*1.1);
}

const hash = (x: number, z: number, salt: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function patchDensity(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz, 53) * (1 - u) + hash(ix + 1, iz, 53) * u;
  const b = hash(ix, iz + 1, 53) * (1 - u) + hash(ix + 1, iz + 1, 53) * u;
  return a * (1 - v) + b * v;
}
export function createEvergreens(streets: readonly Pick<Street, "points">[], buildings: readonly BuildingBlock[],
  heightAt: (x: number, z: number) => number, options: { oldGrowth?: boolean } = {}): Evergreen[] {
  const segments = streets.flatMap(street => street.points.slice(1).map((b, i) => ({ a: street.points[i]!, b })));
  // The largest grown crown is 7.8 m: include its five-metre road buffer
  // and two-metre building buffer in the broad-phase lookup as well.
  const nearbyRoads = spatialIndex(segments, ({ a, b }) => {
    const reach = Math.max(a.width, b.width) / 2 + 13;
    return { minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
      minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
  });
  const nearbyBuildings = spatialIndex(buildings, block => {
    const corners = blockCorners(block);
    return { minX: Math.min(...corners.map(p => p.x)) - 10, maxX: Math.max(...corners.map(p => p.x)) + 10,
      minZ: Math.min(...corners.map(p => p.z)) - 10, maxZ: Math.max(...corners.map(p => p.z)) + 10 };
  });
  const trees: Evergreen[] = [], occupied = new Set<string>();
  for (const grove of EVERGREEN_GROVES) {
    for (let ix = Math.ceil((grove.x - grove.rx) / 12); ix <= Math.floor((grove.x + grove.rx) / 12); ix++) {
      for (let iz = Math.ceil((grove.z - grove.rz) / 12); iz <= Math.floor((grove.z + grove.rz) / 12); iz++) {
        const id = `${ix}:${iz}`;
        if (occupied.has(id)) continue;
        const x = ix * 12 + (hash(ix, iz, 7) - .5) * 6;
        const z = iz * 12 + (hash(ix, iz, 19) - .5) * 6;
        const r2 = ((x - grove.x) / grove.rx) ** 2 + ((z - grove.z) / grove.rz) ** 2;
        const patch = patchDensity(ix / 8, iz / 8);
        const density = grove.id === "union-commons" ? .43 : grove.id === "broadcast-campus" ? .57 : .7;
        const spacing = grove.id === "broadcast-campus" ? .38 : .72;
        if (r2 > 1 || patch < density
          || hash(ix, iz, 31) > spacing * Math.min(1, (1 - r2) * 5)) continue;
        if (evergreenPassage(x, z)) continue;
        let radius = 3.4 + hash(ix, iz, 89) * 1.8;
        const clear = (radius: number) => {
          if (grove.id === "broadcast-campus") {
            const dx = x - landmarks.broadcastTower.x, dz = z - landmarks.broadcastTower.z;
            // Open circular plaza plus four entrance/view corridors. Test the
            // grown crown too, so landmark trees never swallow the marquee.
            if (Math.hypot(dx, dz) < 32 + radius
              || (Math.hypot(dx, dz) < 85 && Math.min(Math.abs(dx), Math.abs(dz)) < 6 + radius)) return false;
          }
          return !nearbyRoads(x, z).some(({ a, b }) => {
            const dx = b.x - a.x, dz = b.z - a.z;
            const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
            return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < Math.max(a.width, b.width) / 2 + radius + 5;
          }) && !nearbyBuildings(x, z).some(b => {
            const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
            return Math.hypot(Math.max(0, Math.abs(dx * c + dz * s) - b.width / 2),
              Math.max(0, Math.abs(-dx * s + dz * c) - b.depth / 2)) < radius + 2;
          });
        };
        if (!clear(radius)) continue;
        // Enlarge existing trees only where the full new crown fits. A failed
        // candidate stays ordinary: no trees disappear or move to make room.
        const oldGrowth = options.oldGrowth !== false && grove.id !== "freight-edge" && r2 < .85
          && hash(ix, iz, 991) < .09 && !evergreenPassage(x,z,radius*1.5) && clear(radius*1.5);
        const scale = oldGrowth ? 1.5 : 1;
        radius *= scale;
        const height = (14 + hash(ix, iz, 107) * 10) * scale;
        const trunk = { x, z, base: heightAt(x, z), width: 1.25*scale, depth: 1.25*scale, height: height * .6, rotation: 0 };
        // Sink the foot to the lowest corner so sloping ground never exposes air.
        trunk.base = Math.min(trunk.base, ...blockCorners(trunk).map(p => heightAt(p.x, p.z)));
        occupied.add(id);
        trees.push({ id: `evergreen-${id}`, grove: grove.id, height, radius, trunk, oldGrowth });
      }
    }
  }
  return trees;
}
