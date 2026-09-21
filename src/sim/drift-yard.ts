import type { BuildingBlock } from "./building-footprint.ts";

/** Flat freight apron, connected to the southern leg of Harbor Way. */
export const DRIFT_YARD = {
  name: "South Wharf Yard", base: 2,
  bounds: { minX: -620, maxX: -300, minZ: 810, maxZ: 1110 },
  entrance: { x: -560, z: 810 },
  driveway: { minX: -580, maxX: -540, minZ: 738, maxZ: 825 },
  start: { x: -575, z: 860, y: 2, heading: Math.PI, pitch: 0 },
} as const;

export const YARD_RESERVE: BuildingBlock = {
  x: (DRIFT_YARD.bounds.minX + DRIFT_YARD.bounds.maxX) / 2,
  z: (DRIFT_YARD.driveway.minZ + DRIFT_YARD.bounds.maxZ) / 2,
  width: DRIFT_YARD.bounds.maxX - DRIFT_YARD.bounds.minX + 4,
  depth: DRIFT_YARD.bounds.maxZ - DRIFT_YARD.driveway.minZ + 4,
  height: 1, base: DRIFT_YARD.base, rotation: 0,
};

export const YARD_LINE = [
  [-575, 855], [-580, 915], [-580, 975], [-555, 1015], [-515, 1035],
  [-470, 1015], [-440, 975], [-425, 935], [-405, 935], [-390, 960], [-360, 970], [-337, 935], [-350, 880],
  [-370, 850], [-430, 850], [-490, 855], [-575, 855],
].map(([x, z]) => ({ x: x!, z: z! }));

export const DRIFT_ZONES = [
  { id: "south-sweep", name: "Loading dock sweep", x: -515, z: 1030, radius: 17 },
  { id: "transition", name: "Freight transition", x: -407, z: 933, radius: 17 },
  { id: "container-clip", name: "Container clip", x: -360, z: 976, radius: 18 },
  { id: "north-sweep", name: "Return sweep", x: -371, z: 849, radius: 17 },
  { id: "west-sweep", name: "Warehouse entry", x: -598, z: 878, radius: 17 },
] as const;

const block = (id: string, x: number, z: number, width: number, depth: number, height: number, color: number) =>
  ({ id, x, z, width, depth, height, color, base: DRIFT_YARD.base, rotation: 0 });
export const YARD_STRUCTURES = [
  block("warehouse", -515, 955, 56, 70, 12, 0x526775),
  block("container-south", -392, 1004, 12, 32, 5.2, 0xb96236),
  block("container-north", -405, 880, 32, 12, 5.2, 0x417e7a),
  block("west-wall", -621, 960, 2, 302, 1.2, 0x73818a),
  block("east-wall", -299, 960, 2, 302, 1.2, 0x73818a),
  block("south-wall", -460, 1111, 320, 2, 1.2, 0x73818a),
  block("north-west-wall", -600, 809, 40, 2, 1.2, 0x73818a),
  block("north-east-wall", -420, 809, 240, 2, 1.2, 0x73818a),
  block("sign-post-left", -487, 809, .5, .5, 9, 0x526775),
  block("sign-post-right", -427, 809, .5, .5, 9, 0x526775),
  ...[[-610, 824], [-610, 1098], [-310, 824], [-310, 1098]].map(([x, z], i) =>
    block(`floodlight-${i}`, x!, z!, .6, .6, 14, 0x69717c)),
] satisfies readonly (BuildingBlock & { id: string; color: number })[];

/** The venue's front door on Harbor Way. The apron is 300 m west of here; this
 *  is the way in the player can see, because the garage exit faces it down
 *  z = 910. Posts, a board and a gatehouse — deliberately not a fence, because
 *  the ground past it stays open (design/CHAOS.md, "The shape of the venue").
 *  Harbor Way runs at x -10 with 20 m of carriageway here, and the west kerb
 *  lamps stand at z 890 and 945, so a 13 m opening centred on 910 clears both. */
export const YARD_GATE = {
  x: -34, z: 910, opening: 13.3, postHeight: 9,
  sign: { y: 6.9, width: 13, height: 1.6, text: "SOUTH WHARF YARD / EAST GATE" },
  booth: { x: -41, z: 922.5, width: 4, depth: 3.6, height: 3.2 },
} as const;

export const GATE_STRUCTURES = [
  block("gate-post-north", YARD_GATE.x, 903, .7, .7, YARD_GATE.postHeight, 0x526775),
  block("gate-post-south", YARD_GATE.x, 917, .7, .7, YARD_GATE.postHeight, 0x526775),
  // Stubs that stop: enough to say the gate is a way through something.
  block("gate-rail-north", YARD_GATE.x, 897, .4, 12.7, 1.2, 0x73818a),
  block("gate-rail-south", YARD_GATE.x, 923, .4, 12.7, 1.2, 0x73818a),
  block("gate-booth", YARD_GATE.booth.x, YARD_GATE.booth.z,
    YARD_GATE.booth.width, YARD_GATE.booth.depth, YARD_GATE.booth.height, 0x46545e),
] satisfies readonly (BuildingBlock & { id: string; color: number })[];

export function inYard(x: number, z: number): boolean {
  const b = DRIFT_YARD.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export const SABLE = {
  id: "sable", name: "Sable", carName: "NS-01", car: "blender", eventId: "sable-yard-drift",
  start: { x: -526, z: 831, y: 2, heading: Math.PI / 2, pitch: 0 },
} as const;
