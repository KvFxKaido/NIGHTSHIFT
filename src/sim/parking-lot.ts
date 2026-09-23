import { blockCorners, pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import { TRAFFIC_KINDS } from "./traffic.ts";

/** Authored placement, generated internals. Rotation follows BuildingBlock's
 * X/Z convention. The entrance joins the +Z edge at the right-hand turnaround. */
export interface ParkingLotRecipe {
  id: string;
  label: string;
  x: number;
  z: number;
  rotation: number;
  columns: number;
  stallWidth: number;
  stallDepth: number;
  aisleWidth: number;
  endMargin: number;
  entranceLength: number;
  occupancy: number;
  seed: number;
  walkTo?: { x: number; z: number };
}
export interface ParkingSurface extends BuildingBlock { kind: "asphalt" | "walk" }
export interface ParkingBay { id: string; footprint: BuildingBlock; accessible: boolean; accessSpace: boolean }
export interface ParkedCar { id: string; kind: "sedan" | "suv"; solid: BuildingBlock; color: number }
export interface ParkingLot {
  recipe: ParkingLotRecipe;
  footprint: BuildingBlock;
  entrance: BuildingBlock;
  surfaces: ParkingSurface[];
  bays: ParkingBay[];
  cars: ParkedCar[];
  wheelStops: BuildingBlock[];
  lamps: BuildingBlock[];
  kerbs: BuildingBlock[];
  sign: BuildingBlock;
  solids: BuildingBlock[];
}

export function parkingPoint(recipe: Pick<ParkingLotRecipe, "x" | "z" | "rotation">, x: number, z: number) {
  const c = Math.cos(recipe.rotation), s = Math.sin(recipe.rotation);
  return { x: recipe.x + x * c - z * s, z: recipe.z + x * s + z * c };
}

export function createParkingLot(recipe: ParkingLotRecipe, heightAt: (x: number, z: number) => number): ParkingLot {
  const values = [recipe.x, recipe.z, recipe.rotation, recipe.columns, recipe.stallWidth, recipe.stallDepth,
    recipe.aisleWidth, recipe.endMargin, recipe.entranceLength, recipe.occupancy, recipe.seed];
  if (!recipe.id || !recipe.label?.trim() || !values.every(Number.isFinite) || !Number.isInteger(recipe.columns) || recipe.columns < 4 || recipe.columns > 40
    || recipe.stallWidth < 2.8 || recipe.stallDepth < 5.4 || recipe.aisleWidth < 7 || recipe.endMargin < 8
    || recipe.entranceLength < 1 || recipe.occupancy < 0 || recipe.occupancy > 1 || !Number.isInteger(recipe.seed)
    || (recipe.walkTo && ![recipe.walkTo.x, recipe.walkTo.z].every(Number.isFinite))) throw Error(`Invalid parking recipe: ${recipe.id}`);
  const width = recipe.columns * recipe.stallWidth + 2 * recipe.endMargin;
  const depth = 2 * recipe.stallDepth + recipe.aisleWidth + 2.4;
  function block(x: number, z: number, width: number, depth: number, height = .12, rotation = recipe.rotation): BuildingBlock {
    const p = parkingPoint(recipe, x, z);
    return { ...p, width, depth, height, rotation, base: heightAt(p.x, p.z) };
  }
  const footprint = block(0, 0, width, depth);
  const elevations = blockCorners(footprint).map(p => heightAt(p.x, p.z));
  if (!elevations.every(Number.isFinite) || Math.max(...elevations) - Math.min(...elevations) > .5)
    throw Error(`Parking lot ${recipe.id} needs a flatter site`);
  const entranceX = width / 2 - recipe.endMargin / 2;
  const entrance = block(entranceX, depth / 2 + recipe.entranceLength / 2, recipe.endMargin, recipe.entranceLength);
  const surfaces: ParkingSurface[] = [{ ...footprint, kind: "asphalt" }, { ...entrance, kind: "asphalt" }];
  if (recipe.walkTo) {
    const start = parkingPoint(recipe, width / 2, -recipe.aisleWidth / 2);
    const dx = recipe.walkTo.x - start.x, dz = recipe.walkTo.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) throw Error(`Parking lot ${recipe.id} needs a distinct walkway destination`);
    const x = (start.x + recipe.walkTo.x) / 2, z = (start.z + recipe.walkTo.z) / 2;
    surfaces.push({ x, z, width: length + 1, depth: 3, height: .12, base: heightAt(x, z), rotation: Math.atan2(dz, dx), kind: "walk" });
  }
  const bays: ParkingBay[] = [], cars: ParkedCar[] = [], wheelStops: BuildingBlock[] = [];
  // Per-bay hashing keeps parked choices stable when later columns are added.
  const random = (row: number, column: number, salt: number) => {
    let n = Math.imul(column + 1, 374761393) ^ Math.imul(row + 1, 668265263) ^ recipe.seed ^ salt;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const paints = [0x66747d, 0x303b46, 0x753c32, 0x294951, 0x929082, 0x3f5042];
  for (let row = 0; row < 2; row++) for (let column = 0; column < recipe.columns; column++) {
    const sign = row === 0 ? -1 : 1;
    const x = -width / 2 + recipe.endMargin + (column + .5) * recipe.stallWidth;
    const z = sign * (recipe.aisleWidth / 2 + recipe.stallDepth / 2);
    const id = `${recipe.id}:${row}:${column}`;
    const accessible = row === 0 && column === recipe.columns - 2;
    const accessSpace = row === 0 && column === recipe.columns - 1;
    bays.push({ id, footprint: block(x, z, recipe.stallWidth, recipe.stallDepth), accessible, accessSpace });
    if (accessSpace) continue;
    wheelStops.push(block(x, sign * (recipe.aisleWidth / 2 + recipe.stallDepth - .65), 1.8, .24, .14));
    if (accessible || random(row, column, 31) >= recipe.occupancy) continue;
    const kind = random(row, column, 73) < .25 ? "suv" : "sedan";
    const spec = TRAFFIC_KINDS[kind];
    const solid = block(x, z, spec.width, spec.length, spec.height, recipe.rotation + (row === 0 ? 0 : Math.PI));
    cars.push({ id, kind, solid, color: paints[Math.floor(random(row, column, 113) * paints.length)]! });
  }
  const lamps = [-1, 1].map(side => block(side * (width / 2 - 2), -depth / 2 + .6, .3, .3, 7.5));
  const kerbs = [-1, 1].map(side => block(-recipe.endMargin / 2, side * (depth / 2 - .12), width - recipe.endMargin, .24));
  const sign = block(width / 2 + 1.5, depth / 2 + 1.5, .16, .16, 2.9);
  return { recipe, footprint, entrance, surfaces, bays, cars, wheelStops, lamps, kerbs, sign,
    solids: [...cars.map(c => c.solid), ...wheelStops, ...lamps, ...kerbs, sign] };
}

/** Shared by grip/grass, never a whole-lot collision slab. */
export function parkingPavingQuery(lots: readonly ParkingLot[]) {
  const nearby = spatialIndex(lots.flatMap(l => l.surfaces), surface => {
    const corners = blockCorners(surface);
    return { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
      minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)) };
  });
  return (x: number, z: number) => nearby(x, z).some(s => pointFootprintDistance(s, x, z) <= 1e-6);
}
