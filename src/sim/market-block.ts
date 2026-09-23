import type { BuildingBlock } from "./building-footprint.ts";
import clearance from "./alder-clearance.json" with { type: "json" };
import { buildingId } from "./building-layout.ts";

/** A small authored block; approved clearance adjustments retain its identities. */
const ORIGINAL_MARKET_BUILDINGS = [
  { x: 799, z: -945, width: 18, depth: 18, height: 10, name: "ALDER MARKET", wood: 0x303c40, brick: 0xffffff, bayWidth: 3.2, crown: false },
  { x: 799, z: -977, width: 18, depth: 18, height: 25, name: "PINE ROOMS", wood: 0x383d41, brick: 0xd0d4d7, bayWidth: 4, crown: true },
  { x: 765, z: -913, width: 18, depth: 18, height: 20, name: "PAPER AND INK", wood: 0x344754, brick: 0xe4e8eb, bayWidth: 3.5, crown: false },
] as const;
export const MARKET_BUILDINGS = ORIGINAL_MARKET_BUILDINGS.map(site=>({...site,plotId:buildingId(site),
  ...(clearance.buildings as Record<string,{x:number;z:number;width?:number;depth?:number}>)[buildingId(site)]}));

export function marketBuilding(block: BuildingBlock) {
  return MARKET_BUILDINGS.find(site => site.x === block.x && site.z === block.z
    && site.width === block.width && site.depth === block.depth && site.height === block.height && block.rotation === 0);
}

export type PavingPoint = { readonly x: number; readonly z: number };
const rect = (minX: number, minZ: number, maxX: number, maxZ: number): readonly PavingPoint[] =>
  [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }];
// Olive's west pavement edge, with a 5 cm seam overlap. This stretch is straight.
const oliveEdge = (z: number) => 800 + (-890 - z) * 15 / 31 - 16.4 * Math.hypot(1, 15 / 31) + .05;
export const MARKET_PAVING: readonly (readonly PavingPoint[])[] = [
  // Keep the moved Market doors joined to their existing shop apron.
  ...MARKET_BUILDINGS.flatMap((site,i)=>{
    const old=ORIGINAL_MARKET_BUILDINGS[i]!;
    return site.x===old.x&&site.z===old.z?[]:[rect(
      Math.min(site.x,old.x)-site.width/2,Math.min(site.z,old.z)-site.depth/2,
      Math.max(site.x,old.x)+site.width/2,Math.max(site.z,old.z)+site.depth/2+1)];
  }),
  // Continuous shop apron, joining Olive's sidewalk without covering the road.
  [{ x: 808, z: -989 }, { x: oliveEdge(-989), z: -989 }, { x: oliveEdge(-932), z: -932 }, { x: 808, z: -932 }],
  rect(788, -936, 808, -932),
  // Eight-metre rear lane and cross-alley between Market and Pine Rooms.
  rect(782, -989, 790, -899),
  rect(790, -989, 808, -986),
  rect(790, -968, 808, -954),
  // Western storefront and the open connection to Pine East.
  rect(754, -924, 776, -922), rect(754, -922, 756, -902),
  rect(774, -922, 782, -902), rect(754, -904, 782, -900),
  [{ x: 754, z: -904 }, { x: 790, z: -904 }, { x: 790, z: -900.1 }, { x: 754, z: -888.1 }],
];

/** Dark service paving inside the concrete apron, with two-metre door landings. */
export const MARKET_ALLEYS = [rect(782, -989, 790, -899), rect(790, -966, 808, -956)];

const pavingBounds = MARKET_PAVING.map(points => ({ points,
  minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
  minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
}));

/** Cheap broad rejection matters: grass calls ground membership thousands of times per tile. */
export function onMarketPaving(x: number, z: number): boolean {
  if (x < 754 || x > 837 || z < -989 || z > -887) return false;
  return pavingBounds.some(area => {
    if (x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ) return false;
    let inside = false;
    const points = area.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j]!, b = points[i]!;
      const cross = (x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x);
      if (Math.abs(cross) < 1e-7 && x >= Math.min(a.x,b.x) && x <= Math.max(a.x,b.x)
        && z >= Math.min(a.z,b.z) && z <= Math.max(a.z,b.z)) return true;
      if ((a.z > z) !== (b.z > z) && x < (b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside = !inside;
    }
    return inside;
  });
}

/** Bins stay in the service pocket, outside the rear lane and both service doors. */
export function marketUtilities(height: (x: number, z: number) => number): BuildingBlock[] {
  return [795, 798].map(x => ({ x, z: -987.4, width: 2, depth: 1.2, height: 1.4,
    base: height(x, -987.4), rotation: 0 }));
}
