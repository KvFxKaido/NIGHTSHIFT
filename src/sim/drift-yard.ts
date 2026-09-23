import { WHARF_ARENA_PROXIES } from "./wharf-arena.ts";
import type { BuildingBlock } from "./building-footprint.ts";

/** Flat freight apron, connected to the southern leg of Harbor Way. */
export const DRIFT_YARD = {
  name: "South Wharf Yard", base: 2,
  bounds: { minX: -620, maxX: -300, minZ: 910, maxZ: 1190 },
  entrance: { x: -560, z: 810 },
  /** Established street-race territory anchor. Moving the event grid within
   * the arena must not redraw the rival's surrounding street courses. */
  streetTurf: { x: -575, z: 860 },
  driveway: { minX: -580, maxX: -540, minZ: 738, maxZ: 825 },
  start: { x: -575, z: 960, y: 2, heading: Math.PI, pitch: 0 },
} as const;

export const YARD_RESERVE: BuildingBlock = {
  x: (DRIFT_YARD.bounds.minX + DRIFT_YARD.bounds.maxX) / 2,
  z: (DRIFT_YARD.driveway.minZ + DRIFT_YARD.bounds.maxZ) / 2,
  width: DRIFT_YARD.bounds.maxX - DRIFT_YARD.bounds.minX + 4,
  depth: DRIFT_YARD.bounds.maxZ - DRIFT_YARD.driveway.minZ + 4,
  height: 1, base: DRIFT_YARD.base, rotation: 0,
};

/** Established drift course translated 100 m south to clear the arena shell. */
export const YARD_LINE = [
  [-575, 855], [-580, 915], [-580, 975], [-555, 1015], [-515, 1035],
  [-470, 1015], [-440, 975], [-425, 935], [-405, 935], [-390, 960], [-360, 970], [-337, 935], [-350, 880],
  [-370, 850], [-430, 850], [-490, 855], [-575, 855],
].map(([x, z]) => ({ x: x!, z: z! + 100 }));

export const DRIFT_ZONES = [
  { id: "south-sweep", name: "Loading dock sweep", x: -515, z: 1130, radius: 17 },
  { id: "transition", name: "Freight transition", x: -407, z: 1033, radius: 17 },
  { id: "container-clip", name: "Container clip", x: -360, z: 1076, radius: 18 },
  { id: "north-sweep", name: "Return sweep", x: -371, z: 949, radius: 17 },
  { id: "west-sweep", name: "Warehouse entry", x: -598, z: 978, radius: 17 },
] as const;

const block = (id: string, x: number, z: number, width: number, depth: number, height: number, color: number) =>
  ({ id, x, z, width, depth, height, color, base: DRIFT_YARD.base, rotation: 0 });
export const YARD_STRUCTURES = [
  block("warehouse", -515, 1055, 56, 70, 12, 0x526775),
  block("container-south", -392, 1104, 12, 32, 5.2, 0xb96236),
  ...[[-610, 970], [-610, 1130], [-310, 965], [-310, 1130]].map(([x, z], i) =>
    block(`floodlight-${i}`, x!, z!, .6, .6, 14, 0x69717c)),
] satisfies readonly (BuildingBlock & { id: string; color: number })[];

/** Harbor Way's gate remains aligned with the garage exit. Beyond the posts,
 * the approach turns southwest through the arena's rounded eastern end. */
export const YARD_GATE = {
  x: -45, z: 910, opening: 13.3, postHeight: 9,
  /** The existing street-facing gateway posts. */
  postZ: [903, 917] as const,
  sign: { y: 6.9, width: 13, height: 1.6, text: "SOUTH WHARF YARD / EAST GATE" },
  booth: { x: -52, z: 922.5, width: 4, depth: 3.6, height: 3.2 },
} as const;

export const GATE_STRUCTURES = [
  block("gate-post-north", YARD_GATE.x, YARD_GATE.postZ[0], .7, .7, YARD_GATE.postHeight, 0x526775),
  block("gate-post-south", YARD_GATE.x, YARD_GATE.postZ[1], .7, .7, YARD_GATE.postHeight, 0x526775),
  block("gate-booth", YARD_GATE.booth.x, YARD_GATE.booth.z,
    YARD_GATE.booth.width, YARD_GATE.booth.depth, YARD_GATE.booth.height, 0x46545e),
] satisfies readonly (BuildingBlock & { id: string; color: number })[];

/** The site is paved wall to wall, so it drives as asphalt rather than as the
 *  grass it stood on. Two rectangles, because the fence steps south at x -250
 *  to clear the road by Harbor Way. Paving carries no version of its own, so
 *  anything that moves these must bump the yard's token in the same commit. */
export const SITE_PAVING = [
  { minX: -1150, maxX: -250, minZ: 800, maxZ: 1195 },
  { minX: -250, maxX: -45, minZ: 860, maxZ: 1195 },
  // The approach: gate to kerb, because a gate reached across grass is not a
  // gate. It runs a little past the pavement's edge so there is no seam of
  // turf between the street and the site.
  { minX: -45, maxX: -22, minZ: 898, maxZ: 922 },
] as const;

/** Occupancy footprints for the arena; its exact mesh supplies collision. */
export const SITE_FENCE_WALLS = WHARF_ARENA_PROXIES;

export function inYard(x: number, z: number): boolean {
  const b = DRIFT_YARD.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export const SABLE = {
  id: "sable", name: "Sable", carName: "NS-01", car: "blender", eventId: "sable-yard-drift",
  start: { x: -526, z: 931, y: 2, heading: Math.PI / 2, pitch: 0 },
} as const;
