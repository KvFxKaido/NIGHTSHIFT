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
  // The apron's own four walls came out on 2026-09-21: the site fence encloses
  // everything now, and an inner wall round the old lot only cut the site in
  // half. The ground runs from the fence to the apron without a step.
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
/** The gate stands ON the fence line (x -45), so it is the way through rather
 *  than a second gateway in front of one. It was 11 m outside it until
 *  2026-09-21, with grass between the two and a 22 m hole in the fence behind
 *  a 13 m gate — an approach that crossed a threshold twice and a lawn once.
 *
 *  The garage exit faces it down z = 910, which moving it west did not change. */
export const YARD_GATE = {
  x: -45, z: 910, opening: 13.3, postHeight: 9,
  /** Where the posts stand, which is also where the fence stops either side. */
  postZ: [903, 917] as const,
  sign: { y: 6.9, width: 13, height: 1.6, text: "SOUTH WHARF YARD / EAST GATE" },
  booth: { x: -52, z: 922.5, width: 4, depth: 3.6, height: 3.2 },
} as const;

export const GATE_STRUCTURES = [
  block("gate-post-north", YARD_GATE.x, YARD_GATE.postZ[0], .7, .7, YARD_GATE.postHeight, 0x526775),
  block("gate-post-south", YARD_GATE.x, YARD_GATE.postZ[1], .7, .7, YARD_GATE.postHeight, 0x526775),
  // The rails are gone: the fence runs up to each post now, so a stub of wall
  // beside the gate would be a second fence beside the real one.
  block("gate-booth", YARD_GATE.booth.x, YARD_GATE.booth.z,
    YARD_GATE.booth.width, YARD_GATE.booth.depth, YARD_GATE.booth.height, 0x46545e),
] satisfies readonly (BuildingBlock & { id: string; color: number })[];

/**
 * The arena's outer rim, and nothing else of it.
 *
 * Traced from the plan of the reference in the ignored `inspiration/` tree at
 * 1 model unit = 0.43 m (Shawn, 2026-09-21). Its outline only: no geometry, no
 * textures, and none of its look. What stands on it here is the wall a freight
 * yard would have, the same one the apron already uses.
 *
 * 640 m east to west and 423 m north to south, centred on (-830, 991): west of
 * the old yard, out in the empty ground between it and the water. The site is
 * fenced, so it answers to nothing around it — the nearest carriageway is 298 m
 * away and the shoreline 29 m past the west wall. Everything inside it is clay.
 *
 * The scale is what the ground allows rather than a preference: 423 m of depth
 * is all there is between the streets and the map's own south edge at z 1202,
 * and the outline is 984 units across.
 *
 * Traced row by row off the plan and simplified to 4 m, which is why the runs
 * are 11 to 476 m rather than even.
 */
export const SITE_FENCE: readonly (readonly [number, number])[] = [
  [-1150, 800], [-250, 800], [-250, 860], [-45, 860], [-45, 1195], [-1150, 1195],
];

/** Ways through it. Everything else is closed. */
export const SITE_FENCE_GAPS = [
  // The yard's own driveway, off the south-western leg of Harbor Way.
  { x: -560, z: 800, width: 48 },
  // The east gate. Derived from the gate itself so the two cannot drift apart
  // again: the fence stops at each post and the opening is the gate's.
  { x: YARD_GATE.x, z: YARD_GATE.z, width: YARD_GATE.postZ[1] - YARD_GATE.postZ[0] },
] as const;

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

/** How it stands: the apron's wall, taller, because this one encloses a site
 *  rather than a yard. Height is the obvious dial. */
export const SITE_FENCE_WALL = { height: 3, thickness: 1.5, color: 0x73818a } as const;

/** One wall block per run, turned to lie along it. A block's local +x runs
 *  along `rotation` (`blockCorners`), so width is the run and depth the
 *  thickness; the drawn mesh negates the angle.
 *
 *  Each edge is walked a metre at a time and broken where a gap falls, so a
 *  way in is an absence of wall rather than a wall with a hole drawn in it. */
export const SITE_FENCE_WALLS = (() => {
  const walls: (BuildingBlock & { id: string; color: number })[] = [];
  const inGap = (x: number, z: number) => SITE_FENCE_GAPS.some(gap =>
    Math.abs(x - gap.x) <= gap.width / 2 && Math.abs(z - gap.z) <= gap.width / 2);
  for (let edge = 0; edge < SITE_FENCE.length; edge++) {
    const a = SITE_FENCE[edge]!, b = SITE_FENCE[(edge + 1) % SITE_FENCE.length]!;
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const rotation = Math.atan2(dz, dx);
    let start: number | null = null;
    const close = (end: number) => {
      if (start === null || end - start < 2) { start = null; return; }
      const mid = (start + end) / 2;
      walls.push({
        id: `site-fence-${edge}-${walls.length}`,
        x: a[0] + dx * mid / length, z: a[1] + dz * mid / length,
        width: end - start + SITE_FENCE_WALL.thickness, depth: SITE_FENCE_WALL.thickness,
        height: SITE_FENCE_WALL.height, base: DRIFT_YARD.base, rotation,
        color: SITE_FENCE_WALL.color,
      });
      start = null;
    };
    for (let d = 0; d <= length; d++) {
      const open = inGap(a[0] + dx * d / length, a[1] + dz * d / length);
      if (open) close(d - 1);
      else if (start === null) start = d;
    }
    close(length);
  }
  return walls;
})() satisfies readonly (BuildingBlock & { id: string; color: number })[];

export function inYard(x: number, z: number): boolean {
  const b = DRIFT_YARD.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export const SABLE = {
  id: "sable", name: "Sable", carName: "NS-01", car: "blender", eventId: "sable-yard-drift",
  start: { x: -526, z: 831, y: 2, heading: Math.PI / 2, pitch: 0 },
} as const;
