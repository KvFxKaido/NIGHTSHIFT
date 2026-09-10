import { projectOntoCourse, COURSE_POINTS, COURSE_WALLS, type CoursePoint, type CourseProjection, type CourseWall } from "./track.ts";
import type { RoadWorld } from "./road-world.ts";
import { streetSurfaceHeight } from "./street-surface.ts";
import { CARRIAGEWAY, laneLength, lanes, lanePose, lanesPerDirection, pathLength,
  type Lane, type LanePose, type StreetClass } from "./lanes.ts";
import { createTraffic, TRAFFIC_KINDS, type TrafficLane, type TrafficMovement,
  type TrafficNetwork, type TrafficState } from "./traffic.ts";

/** The lane model is world geometry, so it is part of the district's public
 *  surface rather than something each consumer re-derives. */
export * from "./lanes.ts";


// Fixed, authored metres. This is an offline blockout, not runtime-random roads.
// The existing perimeter is referenced verbatim; never restamp the Blender asset.
/** v4 places the free-roam start outside the district garage. */
export const DISTRICT_VERSION = "blackglass-district-blockout-v4";
export interface Street {
  id: string;
  name: string;
  from: string;
  to: string;
  added: boolean;
  /** Road class. Alleys are deliberately too narrow for two cars abreast. */
  kind: StreetClass;
  points: readonly CoursePoint[];
}
export interface RouteLeg { street: string; reverse?: boolean }
export interface DistrictRoute {
  id: string;
  name: string;
  kind: "circuit" | "sprint";
  color: string;
  description: string;
  legs: readonly RouteLeg[];
}

const boulevard = COURSE_POINTS[5]!;
const freight = COURSE_POINTS[60]!;
const civic = COURSE_POINTS[80]!;
const market: CoursePoint = { x: -20, y: 2, z: -10, width: 20, zone: "old-quarter" };

/**
 * Where the original loop is cut so a surface street can meet it at a shared
 * point. Every entry is an exact COURSE_POINTS index, which keeps the perimeter
 * an exact partition of the baseline course rather than a copy of it.
 *
 * The elevated spans are deliberately absent. The bridge crown sits at 24 m and
 * the tunnel run at 9-15 m, so a ground-level street cannot join them at grade.
 */
const RING_NODES: readonly { index: number; id: string; name: string }[] = [
  { index: 5, id: "boulevard", name: "Boulevard Junction" },
  { index: 10, id: "marquee", name: "Marquee Approach" },
  { index: 15, id: "portal", name: "Portal Approach" },
  { index: 50, id: "quayside", name: "Quayside Sweep" },
  { index: 60, id: "freight", name: "Freight Gate" },
  { index: 65, id: "container", name: "Container Wall" },
  { index: 80, id: "civic", name: "Civic Junction" },
  { index: 95, id: "hotel", name: "Hotel Braking" },
];

// ---------------------------------------------------------------------------
// Geography. North is -Z and east is +X, matching the route board's compass.
// Roads are consequences of this, not decoration laid over it: the belts they
// replaced were perfect rectangles at round numbers with no cause anywhere.
// ---------------------------------------------------------------------------

/**
 * The Blackglass runs south down the eastern edge, then bends west across the
 * bottom of the district — passing directly beneath the original Rivergate
 * bridge, which is what that bridge has always been for. It is a hard barrier:
 * banks are walled and only three crossings exist.
 */
export const RIVER: readonly (readonly [number, number])[] = [
  [368, -560], [356, -330], [344, -170], [330, 10], [300, 130],
  [240, 196], [110, 180], [-40, 188], [-190, 216], [-340, 250], [-560, 264],
];
export const RIVER_HALF_WIDTH = 44;

/**
 * A freight line curving across the north, serving the wharf. It severs the
 * northern approaches except at two level crossings, which is most of what
 * makes that side of the district read as somewhere rather than as space.
 */
export const RAIL: readonly (readonly [number, number])[] = [
  [300, -520], [150, -430], [-70, -452], [-286, -470], [-520, -440],
];
export const RAIL_HALF_WIDTH = 17;

/** Metres of rise from the waterline to the highest inland corner. */
const TERRAIN_RISE = 20;

/**
 * Ground climbs inland to the north-west and falls away to the river, so the
 * old quarter sits on a hill and the wharf sits on the flat. Only the outer
 * network reads this; the original loop keeps its own authored profile, and
 * radials interpolate between the two.
 */
export function outerTerrain(x: number, z: number): number {
  const inland = Math.max(0, Math.min(1, -(x + z) / 900 + 0.25));
  const raw = TERRAIN_RISE * inland * inland;
  // Near the original loop the ground defers to the loop's own authored height,
  // or the loop sits in a cutting relative to the inland ramp and every street
  // leaving it has to climb 6 m in the first 40 metres.
  //
  // But only where the loop is ON the ground. A bridge deck 24 m up and a
  // tunnel run at 15 are structures, not terrain, and conforming to them raised
  // the whole valley to meet them — which drew the river 23.5 m in the air
  // beneath its own bridge. A road far above the inland ramp is read as built
  // rather than graded, and the ground passes underneath it.
  const road = projectOntoCourse(x, z);
  const t = Math.max(0, Math.min(1, (road.distance - 55) / 205));
  const near = 1 - t * t * (3 - 2 * t);
  // A dead zone matters: a linear ramp from zero disengaged conforming even
  // where the loop was only 3.5 m off the ramp, lifting the ground away from
  // the boulevard. Under 5 m is grading, over 14 m is a structure.
  const diff = Math.abs(road.height - raw);
  const d = Math.max(0, Math.min(1, (diff - 5) / 9));
  const structural = d * d * (3 - 2 * d);
  const conform = near * (1 - structural);
  return Math.round((raw + (road.height - raw) * conform) * 10) / 10;
}

/** Plan-view distance from a point to a polyline, for river and rail tests. */
/** Clearance kept between the drawn ground and the road surface above it. */
const GROUND_CLEARANCE = 0.35;
/** How far past the kerb the clamp still binds before the ground returns to its
 *  own shape. The verges span exactly this, so they meet ground, not a step. */
export const GROUND_CORRIDOR = 16;
/** Past this the road is a structure — a bridge deck, a tunnel bore — and the
 *  ground belongs above or below it on its own terms rather than being dragged. */
const GROUND_STRUCTURE = 6;

/**
 * The ground as drawn: `outerTerrain`'s shape, clamped below the roads.
 *
 * `outerTerrain` conforms to `projectOntoCourse` — the ORIGINAL loop, and only
 * it. Every street added since is graded by `easeGrade` to be driveable on its
 * own terms, and nothing tied the two together, so 39% of road samples had
 * ground drawn over them, up to 4.23 m of it. At night that ground is nearly
 * black and reads as water with the road running into it.
 *
 * Resolution was not the problem and would not have fixed it: raising the
 * terrain mesh from 110 to 880 segments, 64x the triangles, moved 898 buried
 * samples to 893 and made the worst case worse. The mesh was drawing the field
 * faithfully; the field was wrong.
 *
 * This cannot fold into `outerTerrain`. Street construction calls that for node
 * and shape-point heights, so making it depend on the street network is a cycle.
 * As a pass on top there is none — the same layering the junction aprons use.
 */
/**
 * The ground as drawn, at one point: `outerTerrain`'s shape clamped below the
 * roads.
 *
 * `outerTerrain` conforms to `projectOntoCourse` — the ORIGINAL loop, and only
 * it. Every street added since is graded by `easeGrade` to be driveable on its
 * own terms, and nothing tied the two together, so 39% of road samples had
 * ground drawn over them, up to 4.23 m of it. At night that ground is nearly
 * black and reads as water with the road running into it.
 *
 * Resolution was not the cause and would not have been the cure: raising the
 * terrain mesh from 110 to 880 segments, 64x the triangles, moved 898 buried
 * samples to 893 and made the worst case worse. The mesh was drawing the field
 * faithfully; the field was wrong.
 *
 * This cannot fold into `outerTerrain`. Street construction calls that for node
 * and shape-point heights, so making it depend on the street network is a cycle.
 * As a pass on top there is none — the same layering the junction aprons use.
 */
export function groundHeight(x: number, z: number): number {
  return clampBelowRoad(outerTerrain(x, z), x, z);
}

/** Offsets, in radii, probed around a point for `groundHeightNear`. The four
 *  cell centres around a grid vertex: a bilinear patch is bounded by its
 *  corners, so what a straight line between vertices can hide is a road through
 *  the middle of a cell. */
const PROBE_RING: readonly (readonly [number, number])[] =
  [[-1, -1], [1, -1], [-1, 1], [1, 1]];

/**
 * The lowest drawn ground within `radius`, which is what a terrain vertex needs:
 * `groundHeight` is exact where it is sampled, and what you see between two
 * vertices is a straight line that a road curving inside the cell passes under.
 * Sampling vertices alone left 32 buried road samples at 0.61 m.
 *
 * The terrain shape is evaluated once and reused for every probe. It is the
 * inland ramp plus the old loop's profile, both of which vary slowly, while
 * `outerTerrain` costs a full projection onto the course — recomputing it per
 * probe was most of a second of district load for a number that barely moves
 * across twelve metres.
 */
export function groundHeightNear(x: number, z: number, radius: number): number {
  const shape = outerTerrain(x, z);
  let low = clampBelowRoad(shape, x, z);
  for (const [ox, oz] of PROBE_RING) {
    low = Math.min(low, clampBelowRoad(shape, x + ox * radius, z + oz * radius));
  }
  return low;
}

/** Push a terrain height below whatever road is above it here, easing out
 *  across the corridor so the ground rejoins its own shape rather than stepping. */
function clampBelowRoad(shape: number, x: number, z: number): number {
  // The nearest street's surface, without projectOntoDistrict's pitch: that
  // costs two extra apron scans per call to answer a question about grade the
  // ground does not ask, and the terrain mesh runs this tens of thousands of
  // times at district load.
  const { nearest, covering } = districtProjections(x, z);
  const road = surfaceOwner(nearest, covering);
  const kerb = road.width / 2;
  if (road.distance > kerb + GROUND_CORRIDOR) return shape;
  const ceiling = blendedSurfaceHeight(x, z, road, covering) - GROUND_CLEARANCE;
  // Already below: nothing to do, and this is the case under every bridge.
  if (shape <= ceiling) return shape;
  // Far below the road rather than just under it: a structure. Clamping here
  // would trench the valley out to meet a deck instead of leaving it standing.
  if (shape - ceiling > GROUND_STRUCTURE) return shape;
  const t = Math.max(0, Math.min(1, (road.distance - kerb) / GROUND_CORRIDOR));
  const blend = 1 - t * t * (3 - 2 * t);
  return shape + (ceiling - shape) * blend;
}

export function distanceToPath(path: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!, [bx, bz] = path[i + 1]!;
    const dx = bx - ax, dz = bz - az, lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

export const inRiver = (x: number, z: number): boolean => distanceToPath(RIVER, x, z) < RIVER_HALF_WIDTH;
export const inRail = (x: number, z: number): boolean => distanceToPath(RAIL, x, z) < RAIL_HALF_WIDTH;

/**
 * Street classes. One width everywhere gave no cue about where you were or how
 * fast the road wanted you to go, and left no room for shortcuts.
 */
// Road class and its carriageway width live in lanes.ts: how wide a road is and
// how many lanes it carries are the same fact, and only one file should own it.

/**
 * The outer network. Coordinates are irregular on purpose — nothing sits on a
 * round number, junctions are staggered rather than aligned into crossroads,
 * and each node exists because of the river, the rail or the hill.
 */
const CITY_NODES: readonly { id: string; name: string; x: number; z: number }[] = [
  // West bank of the river: shipping frontage, flat, wide.
  { id: "wharf-gate", name: "Wharf Gate", x: 298, z: -132 },
  { id: "wharf-mid", name: "Wharf Reach", x: 292, z: -298 },
  { id: "wharf-head", name: "Wharf Head", x: 274, z: -454 },
  // East bank, reachable only over the Wharf Bridge.
  { id: "dock-cross", name: "Dock Crossing", x: 452, z: -246 },
  { id: "dock-head", name: "Dock Head", x: 466, z: -438 },
  { id: "quay-north", name: "North Quay", x: 416, z: -392 },
  // Where the Wharf Bridge crosses the quay frontage. It crossed here already,
  // at grade, sharing 19 m of asphalt with no node registered: nothing graded
  // the crossing and nothing downstream could know two carriageways met.
  { id: "quay-cross", name: "Bridgefoot", x: 419, z: -255 },
  { id: "quay-south", name: "Lower Quay", x: 412, z: -150 },
  { id: "dock-quay", name: "Container Quay", x: 448, z: -46 },
  { id: "dock-south", name: "South Wharf", x: 424, z: 104 },
  // Northern approaches, above and below the freight line.
  { id: "north-east", name: "Marquee North", x: 158, z: -316 },
  { id: "north-mid", name: "Northgate", x: -42, z: -338 },
  { id: "north-west", name: "Hill Approach", x: -248, z: -366 },
  { id: "rail-east", name: "East Crossing", x: 146, z: -474 },
  { id: "rail-west", name: "West Crossing", x: -282, z: -510 },
  // The old quarter, climbing north-west. Narrow, close-spaced, irregular.
  { id: "hill-north", name: "Hillcrest", x: -426, z: -402 },
  { id: "hill-mid", name: "Hill Cross", x: -452, z: -206 },
  { id: "hill-south", name: "Lower Hill", x: -434, z: -18 },
  { id: "quarter-north", name: "Quarter North", x: -302, z: -284 },
  { id: "quarter-mid", name: "Quarter Cross", x: -324, z: -104 },
  { id: "quarter-south", name: "Quarter South", x: -332, z: 76 },
  { id: "lower-west", name: "Lower West", x: -404, z: 148 },
  { id: "lower-south", name: "Millgate", x: -298, z: 176 },
  // South bank, across the water.
  { id: "south-bank-m", name: "South Bank", x: -28, z: 320 },
  { id: "south-bank-w", name: "Millgate Bank", x: -246, z: 342 },
  { id: "south-bank-e", name: "Ferry Point", x: 172, z: 296 },
];

export const DISTRICT_JUNCTIONS: readonly { id: string; name: string; point: CoursePoint }[] = [
  ...RING_NODES.map(node => ({ id: node.id, name: node.name, point: COURSE_POINTS[node.index]! })),
  { id: "market", name: "Market Square", point: market },
  ...CITY_NODES.map(node => ({
    id: node.id, name: node.name,
    point: { x: node.x, y: outerTerrain(node.x, node.z), z: node.z, width: 22,
      zone: "old-quarter" } as CoursePoint,
  })),
];

const junctionPoint = (id: string): CoursePoint => {
  const junction = DISTRICT_JUNCTIONS.find(candidate => candidate.id === id);
  if (!junction) throw new RangeError(`Unknown district junction '${id}'`);
  return junction.point;
};


/** Clamped cubic sampling of an open street; endpoints are exact shared nodes. */
function streetCurve(controls: readonly CoursePoint[]): CoursePoint[] {
  const result: CoursePoint[] = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[Math.max(0, i - 1)]!, b = controls[i]!;
    const c = controls[i + 1]!, d = controls[Math.min(controls.length - 1, i + 2)]!;
    const steps = Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / 4);
    const cubic = (key: "x" | "z", t: number) => 0.5 * (2 * b[key] + (-a[key] + c[key]) * t +
      (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t +
      (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t);
    const leg: CoursePoint[] = [];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      leg.push({ x: cubic("x", t), z: cubic("z", t), y: 0,
        width: b.width + (c.width - b.width) * t, zone: "old-quarter" });
    }
    // Height follows PLAN DISTANCE along the leg, not the curve parameter. The
    // parameter is eased at both ends, so distributing height by it made the
    // first few metres of a real descent far steeper than the road itself —
    // a 5 m drop off a junction registered as a 100% grade over one sample.
    const cumulative = [0];
    for (let j = 1; j <= steps; j++) {
      cumulative.push(cumulative[j - 1]! +
        Math.hypot(leg[j]!.x - leg[j - 1]!.x, leg[j]!.z - leg[j - 1]!.z));
    }
    const total = cumulative[steps]! || 1;
    for (let j = 1; j < steps; j++) leg[j]!.y = b.y + (c.y - b.y) * (cumulative[j]! / total);
    // The shared junction point itself, so endpoints stay identical by identity.
    leg[0] = b;
    result.push(...leg.slice(0, steps));
  }
  result.push(controls.at(-1)!);
  return result;
}

const p = (x: number, y: number, z: number, width = 20): CoursePoint =>
  ({ x, y, z, width, zone: "old-quarter" });

/** Consecutive COURSE_POINTS slices, so the ring streets together stay an exact
 *  partition of the baseline course however many times it is cut. */
function ringStreets(): Street[] {
  return RING_NODES.map((node, index) => {
    const next = RING_NODES[(index + 1) % RING_NODES.length]!;
    const points = next.index > node.index
      ? COURSE_POINTS.slice(node.index, next.index + 1)
      : [...COURSE_POINTS.slice(node.index), ...COURSE_POINTS.slice(0, next.index + 1)];
    return { id: `ring-${node.id}`, name: `${node.name} to ${next.name}`,
      from: node.id, to: next.id, added: false, kind: "arterial", points };
  });
}

/**
 * An avenue is junction ids with optional [x, z] shape points between them.
 * Each consecutive pair of junctions becomes one street edge whose endpoints
 * ARE the junction points, so the shared-endpoint invariant holds by
 * construction. Shape points take the terrain height where they sit, which is
 * how a road ends up following the ground rather than cutting through it.
 */
type AvenueStep = string | readonly [number, number];

/**
 * Vertical alignment. A shape point takes the height of the ground it sits on,
 * which can compress a whole climb into one leg: the Container approach sat at
 * 0.1 m beside the loop and then had to gain 8 m in 57, a 14% wall. Ease the
 * intermediate heights until no leg exceeds the grade, leaving the junctions
 * themselves fixed. If the endpoints alone break it, that is a layout problem
 * and no smoothing should hide it.
 */
function easeGrade(controls: CoursePoint[], maxGrade = 0.1): void {
  if (controls.length < 3) return;
  const span = controls.map((point, i) => i === 0 ? 0 :
    Math.hypot(point.x - controls[i - 1]!.x, point.z - controls[i - 1]!.z));
  for (let i = 1; i < controls.length - 1; i++) {
    const low = controls[i - 1]!.y - maxGrade * span[i]!;
    const high = controls[i - 1]!.y + maxGrade * span[i]!;
    controls[i] = { ...controls[i]!, y: Math.min(high, Math.max(low, controls[i]!.y)) };
  }
  for (let i = controls.length - 2; i > 0; i--) {
    const low = controls[i + 1]!.y - maxGrade * span[i + 1]!;
    const high = controls[i + 1]!.y + maxGrade * span[i + 1]!;
    controls[i] = { ...controls[i]!, y: Math.min(high, Math.max(low, controls[i]!.y)) };
  }
}

function avenue(id: string, name: string, kind: StreetClass, steps: readonly AvenueStep[]): Street[] {
  const width = CARRIAGEWAY[kind];
  const streets: Street[] = [];
  let from: string | null = null;
  let controls: CoursePoint[] = [];
  for (const step of steps) {
    if (typeof step !== "string") {
      controls.push(p(step[0], outerTerrain(step[0], step[1]), step[1], width));
      continue;
    }
    const node = junctionPoint(step);
    controls.push(node);
    if (from !== null) {
      easeGrade(controls);
      streets.push({ id: `${id}-${streets.length + 1}`, name, from, to: step, added: true,
        kind, points: streetCurve(controls) });
    }
    from = step;
    controls = [node];
  }
  return streets;
}

export const DISTRICT_STREETS: readonly Street[] = [
  ...ringStreets(),
  // Interior connections from the first blockout.
  { id: "market-east", kind: "collector", name: "Market Avenue East", from: "boulevard", to: "market", added: true,
    points: streetCurve([boulevard, p(46, 0.2, -145), p(34, 1, -80), market]) },
  { id: "market-west", kind: "collector", name: "Market Avenue West", from: "market", to: "freight", added: true,
    points: streetCurve([market, p(-91, 2, 22), p(-175, 0.4, 38), freight]) },
  { id: "civic-link", kind: "collector", name: "Civic Link", from: "civic", to: "market", added: true,
    points: streetCurve([civic, p(-89, 7, -57, 18), p(-55, 4.6, -33, 18), market]) },

  // --- Shipping frontage along the west bank: flat, wide, following the water.
  ...avenue("wharf", "Wharf Road", "arterial",
    ["portal", "wharf-gate", [304, -214], "wharf-mid", [300, -376], "wharf-head"]),
  // One of three crossings. Everything on the far bank hangs off this bridge.
  ...avenue("wharf-span", "Wharf Bridge", "arterial", ["wharf-mid", [372, -268], "quay-cross", "dock-cross"]),
  ...avenue("dock", "Dock Road", "arterial",
    ["dock-head", [470, -350], "dock-cross", [456, -150], "dock-quay", [440, 30], "dock-south"]),
  // A quay frontage inboard of the dock road, so the far bank is a loop rather
  // than one spine you have to drive back down.
  ...avenue("quay", "Quay Frontage", "collector",
    ["dock-head", "quay-north", "quay-cross", "quay-south", [428, -96], "dock-quay"]),

  // --- Northern approaches, severed by the freight line except at two crossings.
  ...avenue("north", "North Arterial", "arterial",
    ["marquee", [172, -244], "north-east", [62, -330], "north-mid", [-144, -358], "north-west"]),
  ...avenue("north-wharf", "Wharf Approach", "collector", ["wharf-head", [210, -462], "rail-east"]),
  // Staggered on purpose, so the rail is never a straight run through.
  ...avenue("cross-east", "East Level Crossing", "local", ["north-east", [150, -400], "rail-east"]),
  ...avenue("cross-west", "West Level Crossing", "local", ["north-west", [-272, -430], "rail-west"]),
  ...avenue("rail-frontage", "Rail Frontage", "collector", ["rail-east", [-70, -524], "rail-west"]),

  // --- The old quarter, climbing north-west to the crest.
  ...avenue("hill", "Hill Road", "arterial",
    ["north-west", [-360, -400], "hill-north", [-462, -300], "hill-mid", [-458, -110], "hill-south",
      [-424, 62], "lower-west"]),
  ...avenue("quarter", "Quarter Street", "local",
    ["quarter-north", [-318, -196], "quarter-mid", [-336, -16], "quarter-south", [-316, 140], "lower-south"]),
  ...avenue("quarter-hill-n", "Hillcrest Steps", "local", ["hill-north", [-370, -344], "quarter-north"]),
  ...avenue("quarter-hill-s", "Millgate Rise", "collector", ["hill-south", [-378, 34], "quarter-south"]),
  // No connection at the Hotel Hairpin. It left on almost the ring's own
  // bearing, so two roads a metre apart at different heights traded places as
  // nearest and snapped the car 17 m; and a junction inside a hairpin is bad
  // road design regardless. The quarter is reached from Container and Freight.
  ...avenue("container-quarter", "Container Approach", "collector", ["container", [-282, -66], "quarter-mid"]),
  ...avenue("freight-quarter", "Freight Approach", "collector", ["freight", [-292, 58], "quarter-south"]),
  ...avenue("lower", "Lower Road", "collector", ["lower-west", [-350, 176], "lower-south"]),

  // --- South bank, reachable only over the water.
  // No bridge at Quayside: it would land within metres of the Rivergate span,
  // two bridges stacked at 17 m. The far bank is one landmass wrapping the
  // river's bend, so the Wharf Bridge and Millgate Crossing reach all of it and
  // a lap can go out over one and back over the other.
  ...avenue("mill-span", "Millgate Crossing", "collector", ["lower-south", [-268, 262], "south-bank-w"]),
  ...avenue("south-bank", "South Bank Road", "collector",
    ["south-bank-w", [-140, 336], "south-bank-m", [70, 312], "south-bank-e"]),
  ...avenue("ferry", "Ferry Reach", "collector", ["south-bank-e", [284, 228], "dock-south"]),

  // --- Alleys. Deliberately few: enough that knowing them matters, not enough
  // --- to turn the graph into spaghetti. Each one cuts a corner a main road takes.
  // Peels off Northgate at 44 deg, not 26. On the arterial's own bearing the two
  // carriageways shared their kerbs for 45 m and the surface stepped 1.9 m out
  // there, which is the same defect that made a radial snap the car off the ring.
  ...avenue("alley-quarter", "Cutlers Alley", "alley", ["north-mid", [-104, -296], [-190, -300], "quarter-north"]),
  ...avenue("alley-hill", "Coopers Alley", "alley", ["hill-mid", [-390, -156], "quarter-mid"]),
  ...avenue("alley-wharf", "Crane Alley", "alley", ["wharf-gate", [232, -244], "north-east"]),

  // --- Cross-links. The geography rebuild traded route choice for character;
  // --- these buy it back now that the structure underneath is right.
  ...avenue("wharf-cross", "Crane Street", "collector", ["wharf-mid", [222, -304], "north-east"]),
  ...avenue("quayside-road", "Quayside Road", "collector", ["quayside", [-222, 170], "lower-south"]),
  ...avenue("quarter-link", "Quarter Rise", "local", ["north-west", [-282, -318], "quarter-north"]),

  // --- Northgate's missing south arm. Everything from the north-west entered
  // --- the core through Marquee North and nowhere else: north-2, ring-boulevard
  // --- and market-east each carried 54-78 journeys with no alternative. Scored
  // --- before it was drawn — of every candidate link, this one moved the
  // --- numbers most (31% -> 36% of journeys with a real alternative, median
  // --- detour 45% -> 37%) and it is the shortest, all inland, no crossing.
  ...avenue("northgate", "Northgate Street", "collector", ["north-mid", [-18, -268], "boulevard"]),
];

export const DISTRICT_ROUTES: readonly DistrictRoute[] = [
  { id: "perimeter", name: "Blackglass Perimeter", kind: "circuit", color: "#63d6df",
    description: "The complete original loop, cut at eight junctions. Long infrastructure runs, then the Freight S and Hotel Hairpin.",
    legs: [{ street: "ring-boulevard" }, { street: "ring-marquee" }, { street: "ring-portal" },
      { street: "ring-quayside" }, { street: "ring-freight" }, { street: "ring-container" },
      { street: "ring-civic" }, { street: "ring-hotel" }] },
  { id: "market-loop", name: "Market Loop", kind: "circuit", color: "#efb968",
    description: "Market Avenue out, the Civic Link uphill, then the hotel descent. Shorter, junction-led driving.",
    legs: [{ street: "market-east" }, { street: "civic-link", reverse: true },
      { street: "ring-civic" }, { street: "ring-hotel" }] },
  { id: "freight-run", name: "Freight Run", kind: "sprint", color: "#e88fa0",
    description: "Freight S into the civic connection, through Market Square and out onto the boulevard.",
    legs: [{ street: "ring-freight" }, { street: "ring-container" }, { street: "civic-link" },
      { street: "market-east", reverse: true }] },
  { id: "wharf-run", name: "Wharf Run", kind: "sprint", color: "#8f9bd6",
    description: "Out of the tunnel portal, north along the shipping frontage and over the bridge onto the far bank.",
    legs: [{ street: "wharf-1" }, { street: "wharf-2" }, { street: "wharf-span-1" },
      { street: "wharf-span-2" }, { street: "dock-2" }, { street: "dock-3" }] },
  { id: "hill-climb", name: "Hill Climb", kind: "sprint", color: "#d69f8f",
    description: "From the hairpin up through the old quarter to the crest. Narrow streets and every metre of the climb.",
    legs: [{ street: "container-quarter-1" }, { street: "quarter-1", reverse: true },
      { street: "quarter-hill-n-1", reverse: true }] },
  { id: "river-loop", name: "River Loop", kind: "circuit", color: "#7fc7a4",
    description: "Both crossings and the whole far bank: west over Millgate, east along the water, back over the Wharf Bridge and down through the quarter.",
    legs: [{ street: "mill-span-1" }, { street: "south-bank-1" }, { street: "south-bank-2" },
      { street: "ferry-1" }, { street: "dock-3", reverse: true }, { street: "dock-2", reverse: true },
      { street: "wharf-span-2", reverse: true }, { street: "wharf-span-1", reverse: true },
      { street: "wharf-2", reverse: true },
      { street: "wharf-1", reverse: true }, { street: "ring-portal" }, { street: "ring-quayside" },
      { street: "freight-quarter-1" }, { street: "quarter-3" }] },
];

export function getDistrictRoute(id: string): DistrictRoute {
  const route = DISTRICT_ROUTES.find(route => route.id === id);
  if (!route) throw new RangeError(`Unknown district route '${id}'`);
  return route;
}

export function routePoints(route: DistrictRoute): CoursePoint[] {
  return route.legs.flatMap((leg, index) => {
    const street = DISTRICT_STREETS.find(street => street.id === leg.street);
    if (!street) throw new RangeError(`Unknown street '${leg.street}'`);
    const points = leg.reverse ? [...street.points].reverse() : [...street.points];
    return index === 0 ? points : points.slice(1);
  });
}

/** Local rival diagnostics: sprint gaps never wrap across the finish. */
export function districtRouteGap(route: DistrictRoute, fromX: number, fromZ: number, toX: number, toZ: number): number {
  const points = routePoints(route);
  let gap = projectOntoPath(points, toX, toZ).along - projectOntoPath(points, fromX, fromZ).along;
  if (route.kind === "circuit") {
    const length = pathLength(points);
    if (gap > length / 2) gap -= length;
    if (gap < -length / 2) gap += length;
  }
  return gap;
}

/**
 * A path's segments in runs of eight with a plan-view box each, and the arc
 * length at every point, built once per points array. A projection then skips
 * every run whose box is already farther than the nearest segment found, and
 * the answer is the one the plain scan gives: a run is skipped only when no
 * segment in it can be strictly nearer, and the arc lengths are the same sums
 * in the same order. This is the spatial index the district was waiting for:
 * `projectOntoDistrict` was 50 us a call, all of it walking the whole polyline
 * of every candidate street, and the terrain, the ribbons, the traffic build
 * and now the junction aprons each ask tens of thousands of times.
 */
const PATH_RUN = 8;
interface PathRun { start: number; end: number; minX: number; maxX: number; minZ: number; maxZ: number }
interface PathIndex { runs: PathRun[]; along: number[] }
const PATH_INDEX = new WeakMap<readonly CoursePoint[], PathIndex>();
function pathIndex(points: readonly CoursePoint[]): PathIndex {
  let index = PATH_INDEX.get(points);
  if (index) return index;
  const along = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    along.push(along[i]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const runs: PathRun[] = [];
  for (let start = 0; start < points.length - 1; start += PATH_RUN) {
    const end = Math.min(points.length - 1, start + PATH_RUN);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = start; i <= end; i++) {
      const point = points[i]!;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    runs.push({ start, end, minX, maxX, minZ, maxZ });
  }
  index = { runs, along };
  PATH_INDEX.set(points, index);
  return index;
}

export function projectOntoPath(points: readonly CoursePoint[], x: number, z: number): CourseProjection {
  const { runs, along } = pathIndex(points);
  let nearest: CourseProjection | undefined;
  for (const run of runs) {
    if (nearest) {
      const gapX = Math.max(run.minX - x, 0, x - run.maxX), gapZ = Math.max(run.minZ - z, 0, z - run.maxZ);
      if (gapX * gapX + gapZ * gapZ > nearest.distance * nearest.distance) continue;
    }
    for (let i = run.start; i < run.end; i++) {
      const a = points[i]!, b = points[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
      const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
      if (!nearest || distance < nearest.distance) nearest = { along: along[i]! + length * t,
        segmentIndex: i, distance, height: a.y + (b.y - a.y) * t,
        pitch: Math.atan2(b.y - a.y, length), ux: dx / length, uz: dz / length,
        width: a.width + (b.width - a.width) * t };
    }
  }
  if (!nearest) throw new RangeError("A road needs at least two distinct points");
  return nearest;
}

/** The plain scan `projectOntoPath` must agree with, kept for the test that
 *  says so; never call it from the district. */
export function projectOntoPathUnindexed(points: readonly CoursePoint[], x: number, z: number): CourseProjection {
  let nearest: CourseProjection | undefined;
  let along = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
    const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (!nearest || distance < nearest.distance) nearest = { along: along + length * t,
      segmentIndex: i, distance, height: a.y + (b.y - a.y) * t,
      pitch: Math.atan2(b.y - a.y, length), ux: dx / length, uz: dz / length,
      width: a.width + (b.width - a.width) * t };
    along += length;
  }
  if (!nearest) throw new RangeError("A road needs at least two distinct points");
  return nearest;
}

/**
 * Plan-view bounds per street, widened by half its road width. Nearest-street
 * queries run per wall piece per tick; at 51 streets over 11 km of blockout
 * that was tens of millions of point projections, so reject by box first.
 */
const STREET_BOUNDS: readonly { street: Street; minX: number; maxX: number; minZ: number; maxZ: number }[] =
  DISTRICT_STREETS.map(street => {
    const pad = Math.max(...street.points.map(point => point.width)) / 2 + 4;
    return {
      street,
      minX: Math.min(...street.points.map(point => point.x)) - pad,
      maxX: Math.max(...street.points.map(point => point.x)) + pad,
      minZ: Math.min(...street.points.map(point => point.z)) - pad,
      maxZ: Math.max(...street.points.map(point => point.z)) + pad,
    };
  });

/** Streets whose widened bounds contain the point; the only ones that can win. */
function streetsNear(x: number, z: number, margin = 0): Street[] {
  return STREET_BOUNDS.filter(bounds => x >= bounds.minX - margin && x <= bounds.maxX + margin &&
    z >= bounds.minZ - margin && z <= bounds.maxZ + margin).map(bounds => bounds.street);
}

/** A street outside its own padded box by this much is at least this far from
 *  the point: the narrowest street's half width plus the box's 4 m. */
const STREET_BOX_PAD = Math.min(...DISTRICT_STREETS.map(street =>
  Math.max(...street.points.map(point => point.width)) / 2 + 4));

/**
 * The street nearest a point, certainly. The search widens the box margin until
 * the nearest candidate found is closer than any street the boxes excluded —
 * a street outside every box at margin m is more than m + STREET_BOX_PAD away.
 * A point on a road is answered in one round; open ground in three or four.
 * It used to be `candidates.length ? candidates : DISTRICT_STREETS`: every
 * terrain vertex beyond the roads projected onto all fifty streets, which was
 * the 40 us a projection cost, and a point inside one long street's box was
 * answered with that street even when a nearer street's box had missed it.
 */
function districtProjections(x: number, z: number): { nearest: CourseProjection; covering: CourseProjection[] } {
  let nearest: CourseProjection | undefined;
  // Every street with a claim on the point (its carriageway, or the spill just
  // outside its kerb) sits inside its own padded box, so the first round finds
  // them all; later rounds only widen the nearest.
  const covering: CourseProjection[] = [];
  for (let margin = 0; ; margin = margin ? margin * 2 : 32) {
    for (const street of streetsNear(x, z, margin)) {
      const projected = projectOntoPath(street.points, x, z);
      if (projected.distance < projected.width / 2 + APRON_SPILL) {
        projected.height = streetSurfaceHeight(street.points, x, z);
      }
      if (!nearest || projected.distance < nearest.distance) nearest = projected;
      if (margin === 0 && projected.distance < projected.width / 2 + APRON_SPILL) covering.push(projected);
    }
    if (nearest && (nearest.distance <= margin + STREET_BOX_PAD || margin > 8192)) return { nearest, covering };
  }
}

/**
 * One surface per junction. Where two carriageways overlap, each street's claim
 * on the surface fades over the last APRON_FEATHER metres inside its own kerb,
 * and the surface is the claims' weighted blend of the streets' graded heights.
 * The car used to ride the NEAREST street's height, and the nearest flips at
 * the bisector: inside 18 of 35 aprons that was a step, 1.07 m at Lower Hill,
 * physically as well as visually. A blend by coverage is continuous — a
 * street's weight fades to zero beyond its kerb — and every ribbon and apron
 * vertex is dropped on the same function,
 * so the meshes cannot disagree with the tyres or with each other.
 */
export const APRON_FEATHER = 8;
/** A claim reaches this far OUTSIDE the kerb before it is nothing. Zero at the
 *  kerb exactly was a 1.17 m step at the corner where two kerbs cross: on one
 *  side only A covered, at a weight of 0.013, on the other only B, at 0.009,
 *  and normalising made each a full claim. The two supports must overlap. */
export const APRON_SPILL = 4;
function coverage(projected: CourseProjection): number {
  const inside = projected.width / 2 - projected.distance;
  const t = Math.max(0, Math.min(1, (inside + APRON_SPILL) / (APRON_SPILL + APRON_FEATHER)));
  return t * t * (3 - 2 * t);
}

/** The street that owns a point: the one it is deepest inside, or, off every
 *  carriageway, the nearest. Not the nearest on the road: a point just outside
 *  a narrow street's kerb and well inside a wide one belongs to the wide one,
 *  and answering with the narrow one put the off-road chamfer on a carriageway. */
function surfaceOwner(nearest: CourseProjection, covering: readonly CourseProjection[]): CourseProjection {
  let owner = nearest, depth = 0;
  for (const projected of covering) {
    const inside = projected.width / 2 - projected.distance;
    if (inside > depth) { owner = projected; depth = inside; }
  }
  return owner;
}

function blendedSurfaceHeight(x: number, z: number, owner: CourseProjection,
  covering: readonly CourseProjection[]): number {
  if (covering.length < 2) return districtSurfaceHeight(x, z, owner.height);
  let weight = 0, sum = 0;
  for (const projected of covering) {
    const w = coverage(projected);
    weight += w;
    sum += w * districtSurfaceHeight(x, z, projected.height);
  }
  return weight > 0 ? sum / weight : districtSurfaceHeight(x, z, owner.height);
}

/** The driven surface's height alone, for the callers that ask nothing else. */
export function districtSurfaceAt(x: number, z: number): number {
  const { nearest, covering } = districtProjections(x, z);
  return blendedSurfaceHeight(x, z, surfaceOwner(nearest, covering), covering);
}

export function projectOntoDistrict(x: number, z: number): CourseProjection {
  const { nearest, covering } = districtProjections(x, z);
  const road = surfaceOwner(nearest, covering);
  if (covering.length === 0) {
    // Beyond every street's support, retain the nearest-road projection.
    const before = districtSurfaceHeight(x - road.ux, z - road.uz, road.height - Math.tan(road.pitch));
    const after = districtSurfaceHeight(x + road.ux, z + road.uz, road.height + Math.tan(road.pitch));
    return { ...road, height: districtSurfaceHeight(x, z, road.height), pitch: Math.atan2(after - before, 2) };
  }
  // Measure grade on the actual surface, including single-street bends where
  // the nearest centreline segment's pitch is no longer the surface's pitch.
  const before = districtSurfaceAt(x - road.ux, z - road.uz);
  const after = districtSurfaceAt(x + road.ux, z + road.uz);
  return { ...road, height: blendedSurfaceHeight(x, z, road, covering), pitch: Math.atan2(after - before, 2) };
}

// ---------------------------------------------------------------------------
// Junction aprons: where a junction's ribbons stop and one mesh takes over.
//
// Two ribbons drawn through each other at different heights was the ridge in
// 18 of 35 junctions. The surface blend above makes their heights agree, which
// turns a ridge into two coplanar meshes fighting for the same pixels. So each
// arm's ribbon is CUT where its overlap with the other arms ends, and the
// junction is one radial mesh from the node out to the union's boundary. The
// cut section is the seam the two meshes share, vertex for vertex.

/** Columns across a ribbon, kerb to kerb: the renderer's and the seam's. */
export const RIBBON_COLUMNS = 17;
/** Ribbon kept past the last overlap, so the seam never sits on the overlap's own edge. */
const APRON_MARGIN = 1.5;

export interface ApronArm {
  street: string;
  /** The street's points run INTO the node; its cut is measured from its far end. */
  reversed: boolean;
  /** Metres along the street's own points at which its ribbon ends and the apron begins. */
  cut: number;
  /** The ribbon's cross-section at the cut, in the renderer's column order. */
  section: readonly { x: number; z: number }[];
}
export interface DistrictApron {
  id: string;
  x: number;
  z: number;
  arms: readonly ApronArm[];
  /** The union's outline, ordered by angle around the node, cut sections included. */
  boundary: readonly { x: number; z: number }[];
  /** The farthest boundary point from the node. */
  radius: number;
}

interface PathPoint { x: number; z: number; ux: number; uz: number; width: number }

/** The point `along` metres down a polyline, clamped to its ends. */
export function pathPointAt(points: readonly CoursePoint[], along: number): PathPoint {
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (acc + length >= along || i === points.length - 2) {
      const t = Math.max(0, Math.min(1, (along - acc) / length));
      return { x: a.x + dx * t, z: a.z + dz * t, ux: dx / length, uz: dz / length,
        width: a.width + (b.width - a.width) * t };
    }
    acc += length;
  }
  throw new RangeError("A road needs at least two distinct points");
}

function ribbonSection(at: PathPoint): { x: number; z: number }[] {
  const nx = -at.uz, nz = at.ux;
  return Array.from({ length: RIBBON_COLUMNS }, (_, column) => {
    const side = 1 - column / (RIBBON_COLUMNS - 1) * 2;
    return { x: at.x + nx * at.width / 2 * side, z: at.z + nz * at.width / 2 * side };
  });
}

function buildAprons(): DistrictApron[] {
  return DISTRICT_JUNCTIONS.map(junction => {
    const arms = DISTRICT_STREETS.filter(street => street.from === junction.id || street.to === junction.id)
      .map(street => ({ street, reversed: street.to === junction.id,
        out: street.to === junction.id ? [...street.points].reverse() : street.points }));
    const covered = (arm: typeof arms[number], x: number, z: number) => arms.some(other => {
      if (other === arm) return false;
      const on = projectOntoPath(other.street.points, x, z);
      return on.distance <= on.width / 2;
    });
    const sectionCovered = (arm: typeof arms[number], along: number) => {
      const at = pathPointAt(arm.out, along);
      const nx = -at.uz, nz = at.ux;
      return [-1, -0.5, 0, 0.5, 1].some(side => covered(arm, at.x + nx * at.width / 2 * side, at.z + nz * at.width / 2 * side));
    };
    const built: ApronArm[] = arms.map(arm => {
      const length = pathLength(arm.out);
      // Walk out until no other arm covers the ribbon, then find the edge.
      let inside = 0, outside = Math.min(length, 200);
      for (let along = 2; along <= outside; along += 2) {
        if (sectionCovered(arm, along)) inside = along;
        else { outside = along; break; }
      }
      for (let i = 0; i < 8; i++) {
        const mid = (inside + outside) / 2;
        if (sectionCovered(arm, mid)) inside = mid; else outside = mid;
      }
      const cut = Math.min(outside + APRON_MARGIN, length / 2 - 1);
      return { street: arm.street.id, reversed: arm.reversed, cut, section: ribbonSection(pathPointAt(arm.out, cut)) };
    });
    // Each arm's piece as a closed outline: its ribbon from the node to the cut,
    // plus the half-disc cap projectOntoPath counts as carriageway behind the
    // node, which is what fills the outer corner of a bend.
    const pieces = arms.map((arm, i) => {
      const cut = built[i]!.cut, left: { x: number; z: number }[] = [], right: { x: number; z: number }[] = [];
      for (let along = 0; along < cut; along += 2) {
        const section = ribbonSection(pathPointAt(arm.out, along));
        left.push(section[0]!); right.push(section[RIBBON_COLUMNS - 1]!);
      }
      const end = built[i]!.section;
      left.push(end[0]!); right.push(end[RIBBON_COLUMNS - 1]!);
      const start = pathPointAt(arm.out, 0);
      // From the right kerb round behind the node to the left kerb.
      const cap: { x: number; z: number }[] = [];
      for (let k = 1; k < 8; k++) {
        const theta = Math.PI - Math.PI * k / 8, nx = -start.uz, nz = start.ux;
        cap.push({ x: start.x + (nx * Math.cos(theta) - start.ux * Math.sin(theta)) * start.width / 2,
          z: start.z + (nz * Math.cos(theta) - start.uz * Math.sin(theta)) * start.width / 2 });
      }
      return [...left, ...right.reverse(), ...cap];
    });
    // The union's boundary, by rays from the node: the farthest exit from any
    // piece. Every union is star-shaped from its node — measured before this
    // was written, and asserted by the test that draws them.
    const exit = (angle: number): number => {
      const dx = Math.cos(angle), dz = Math.sin(angle);
      let farthest = 0;
      for (const piece of pieces) {
        for (let i = 0; i < piece.length; i++) {
          const a = piece[i]!, b = piece[(i + 1) % piece.length]!;
          const ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((a.x - junction.point.x) * ez - (a.z - junction.point.z) * ex) / den;
          const u = ((a.x - junction.point.x) * dz - (a.z - junction.point.z) * dx) / den;
          if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9) farthest = Math.max(farthest, t);
        }
      }
      return farthest;
    };
    const rays: { angle: number; r: number }[] = [];
    const step = 4 * Math.PI / 180;
    for (let angle = 0; angle < 2 * Math.PI - 1e-9; angle += step) rays.push({ angle, r: exit(angle) });
    // Where the radius jumps between two rays there is a corner: find it.
    const refined: { angle: number; r: number }[] = [];
    for (let i = 0; i < rays.length; i++) {
      const a = rays[i]!, b = rays[(i + 1) % rays.length]!;
      refined.push(a);
      if (Math.abs(a.r - b.r) < 0.75) continue;
      let lo = a.angle, hi = a.angle + step, rlo = a.r, rhi = b.r;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2, rm = exit(mid);
        if (Math.abs(rm - rlo) < Math.abs(rm - rhi)) { lo = mid; rlo = rm; } else { hi = mid; rhi = rm; }
      }
      refined.push({ angle: lo, r: rlo }, { angle: hi, r: rhi });
    }
    // Ray samples on a cut edge are replaced by the cut section itself, so the
    // apron and the ribbon share the seam's vertices exactly.
    const onCut = (x: number, z: number) => built.some(arm => {
      const a = arm.section[0]!, b = arm.section[RIBBON_COLUMNS - 1]!;
      const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez;
      const u = ((x - a.x) * ex + (z - a.z) * ez) / len2;
      if (u < -1e-6 || u > 1 + 1e-6) return false;
      return Math.hypot(x - a.x - ex * u, z - a.z - ez * u) < 0.05;
    });
    const boundary: { x: number; z: number; angle: number }[] = [];
    for (const ray of refined) {
      const x = junction.point.x + Math.cos(ray.angle) * ray.r, z = junction.point.z + Math.sin(ray.angle) * ray.r;
      if (ray.r > 0 && !onCut(x, z)) boundary.push({ x, z, angle: ray.angle });
    }
    for (const arm of built) for (const point of arm.section) {
      const angle = (Math.atan2(point.z - junction.point.z, point.x - junction.point.x) + 2 * Math.PI) % (2 * Math.PI);
      boundary.push({ x: point.x, z: point.z, angle });
    }
    boundary.sort((p, q) => p.angle - q.angle);
    const radius = Math.max(...boundary.map(p => Math.hypot(p.x - junction.point.x, p.z - junction.point.z)));
    return { id: junction.id, x: junction.point.x, z: junction.point.z, arms: built,
      boundary: boundary.map(({ x, z }) => ({ x, z })), radius };
  });
}
export const DISTRICT_APRONS: readonly DistrictApron[] = buildAprons();

/** Shared junction grading for road meshes, barriers and the vertical constraint.
 * This changes only the blockout's junction aprons, never baseline Blackglass.
 */
export function districtSurfaceHeight(x: number, z: number, height: number): number {
  let remaining = 1, weight = 0, sum = 0;
  for (const junction of DISTRICT_JUNCTIONS) {
    const distance = Math.hypot(x - junction.point.x, z - junction.point.z);
    if (distance >= 28) continue;
    const t = Math.max(0, (distance - 9) / 19);
    const blend = t * t * (3 - 2 * t);
    const influence = 1 - blend;
    remaining *= blend;
    weight += influence;
    sum += junction.point.y * influence;
  }
  // All nearby discs contribute. Returning the first one snapped to another
  // junction's grade at its 28 m edge when two grading discs overlapped.
  return weight > 0 ? height * remaining + sum / weight * (1 - remaining) : height;
}

function connectorWalls(street: Street): CourseWall[] {
  return street.points.slice(1).flatMap((b, i) => {
    const a = street.points[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz), offset = (a.width + b.width) / 4 + 0.45;
    return [-1, 1].map(side => ({ x: (a.x + b.x) / 2 - dz / length * offset * side,
      z: (a.z + b.z) / 2 + dx / length * offset * side, y: (a.y + b.y) / 2,
      width: Math.hypot(length, b.y - a.y) + 0.3, depth: 0.9,
      rotation: -Math.atan2(dz, dx), pitch: Math.atan2(b.y - a.y, length),
      accent: "white" as const, zone: a.zone }));
  });
}

/** Clip boundary pieces against OTHER street ribbons, opening real junctions.
 * Subdivision keeps clipping local instead of removing an entire long barrier.
 * The exact result is shared by the renderer and Rapier.
 */
/** A street rail stays only beside a fall of at least this much. */
const RAIL_DROP = 1.5;

function buildDistrictWalls(): CourseWall[] {
  const candidates = [
    ...COURSE_WALLS.map(wall => ({ wall, others: DISTRICT_STREETS.filter(s => s.added) })),
    ...DISTRICT_STREETS.filter(s => s.added).flatMap(street => connectorWalls(street).map(wall =>
      ({ wall, others: DISTRICT_STREETS.filter(other => other !== street) }))),
  ];
  return candidates.flatMap(({ wall, others }) => {
    const pieces: CourseWall[] = [];
    const count = Math.ceil(wall.width / 2);
    for (let i = 0; i < count; i++) {
      const local = ((i + 0.5) / count - 0.5) * wall.width;
      const x = wall.x + Math.cos(wall.rotation) * Math.cos(wall.pitch) * local;
      const z = wall.z - Math.sin(wall.rotation) * Math.cos(wall.pitch) * local;
      const y = wall.y + Math.sin(wall.pitch) * local;
      const nearby = new Set(streetsNear(x, z));
      const inJunction = others.some(street => {
        if (!nearby.has(street)) return false;
        const road = projectOntoPath(street.points, x, z);
        return road.distance < road.width / 2 + 1.8 && Math.abs(road.height - y) < 3;
      });
      if (!inJunction) {
        const ux = Math.cos(wall.rotation), uz = -Math.sin(wall.rotation), slope = Math.tan(wall.pitch);
        const before = districtSurfaceHeight(x - ux, z - uz, y - slope);
        const after = districtSurfaceHeight(x + ux, z + uz, y + slope);
        const graded = districtSurfaceHeight(x, z, y);
        // The rule: a rail stands only where it guards something. Structures
        // keep theirs — the deck's edge and the bore's wall are what the sim
        // has to stop you at. Everywhere else a rail stays only beside a drop:
        // the raw terrain 4 m to either side more than RAIL_DROP below the
        // road. Either side, because a piece does not know which way is out and
        // an embankment falls away on both. Of 10,808 pieces, 70% guarded open
        // ground and 20% stood in front of a building that is already solid;
        // the rule keeps 1,436. Buildings are the walls now, and the gaps
        // between them are the shortcuts.
        const structural = wall.zone === "bridge" || wall.zone === "tunnel";
        const nx = Math.sin(wall.rotation), nz = Math.cos(wall.rotation);
        const drop = Math.max(graded - outerTerrain(x + nx * 4, z + nz * 4), graded - outerTerrain(x - nx * 4, z - nz * 4));
        // Water is a drop the terrain does not show: the river is drawn 1.6 m
        // under the ground it sits in, and where the corridor's own fence line
        // runs down a road — Ferry Reach hugs the bank at the river's bend — the
        // road's rail is all there is between the car and the water.
        const water = inRiver(x + nx * 4, z + nz * 4) || inRiver(x - nx * 4, z - nz * 4);
        if (!structural && !water && drop < RAIL_DROP) continue;
        pieces.push({ ...wall, x, y: graded, z,
          pitch: Math.atan2(after - before, 2), width: wall.width / count + 0.08 });
      }
    }
    return pieces;
  });
}

/**
 * A closed edge to the blockout.
 *
 * Junction clipping deliberately opens boundary pieces where streets cross, and
 * that was harmless while every junction was interior to a ring. With the belts
 * now forming the district's edge, those openings face empty ground: free roam
 * drove straight out through a corner and kept going across the void.
 *
 * This is the wall that says the district ends here. It is not a race barrier
 * and belongs to no street, so junction clipping never touches it.
 */
function boundaryWalls(): CourseWall[] {
  const extent = Math.max(...DISTRICT_STREETS.flatMap(street =>
    street.points.flatMap(point => [Math.abs(point.x), Math.abs(point.z)]))) + 46;
  const walls: CourseWall[] = [];
  const step = 24;
  for (let start = -extent; start < extent; start += step) {
    const mid = start + Math.min(step, extent - start) / 2;
    const width = Math.min(step, extent - start) + 0.4;
    for (const side of [-1, 1]) {
      // rotation 0 runs along +X; -PI/2 runs along +Z, matching connectorWalls.
      // On the ground, not at datum: at the hill's far corner datum is 20 m down.
      walls.push({ x: mid, z: side * extent, y: outerTerrain(mid, side * extent), width, depth: 1.2,
        rotation: 0, pitch: 0, accent: "white", zone: "old-quarter" });
      walls.push({ x: side * extent, z: mid, y: outerTerrain(side * extent, mid), width, depth: 1.2,
        rotation: -Math.PI / 2, pitch: 0, accent: "white", zone: "old-quarter" });
    }
  }
  return walls;
}

/**
 * Banks and lineside fences. A barrier is only a barrier if you cannot drive
 * round it, so both sides of the river and the rail are walled continuously and
 * opened only where a street actually spans them. That is what makes three
 * crossings meaningful rather than decorative.
 */
function corridorWalls(
  path: readonly (readonly [number, number])[], halfWidth: number,
): CourseWall[] {
  const walls: CourseWall[] = [];
  const step = 22;
  for (const side of [-1, 1]) {
    // The fence follows an OFFSET POLYLINE with mitred vertices, exactly as a
    // lane does. Laid per segment at a fixed offset instead, the two segments
    // either side of a bend diverge: an 89 m hole opened on the outside of the
    // river's bend at (240, 196), beside Ferry Reach, and on the inside the
    // pieces piled up 26-35 m from a line that is 44 m out. The mitre is
    // clamped like the road ribbon's, so a hairpin cannot throw it to infinity.
    const offset: { x: number; z: number }[] = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[Math.max(0, i - 1)]!, here = path[i]!, next = path[Math.min(path.length - 1, i + 1)]!;
      const inX = here[0] - prev[0], inZ = here[1] - prev[1];
      const outX = next[0] - here[0], outZ = next[1] - here[1];
      const inLength = Math.hypot(inX, inZ) || 1, outLength = Math.hypot(outX, outZ) || 1;
      let nx = -inZ / inLength - outZ / outLength, nz = inX / inLength + outX / outLength;
      const length = Math.hypot(nx, nz) || 1;
      nx /= length;
      nz /= length;
      const miter = 1 / Math.max(0.5, nx * (-outZ / outLength) + nz * (outX / outLength));
      offset.push({ x: here[0] + nx * halfWidth * side * miter, z: here[1] + nz * halfWidth * side * miter });
    }
    for (let i = 0; i < offset.length - 1; i++) {
      const a = offset[i]!, b = offset[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const ux = dx / length, uz = dz / length;
      for (let along = 0; along < length; along += step) {
        const run = Math.min(step, length - along);
        const x = a.x + ux * (along + run / 2), z = a.z + uz * (along + run / 2);
        // Leave the bank open where a road genuinely CROSSES: that is a bridge
        // or a level crossing. Near is not enough — Ferry Reach runs alongside
        // the river fence for eighty metres on the outside of its bend, and
        // "near a road" opened a 77 m hole in the bank there. A crossing road is
        // transverse to the fence.
        // And never ON a road at all: the west bank's line runs straight down
        // Wharf Road's carriageway, and a fence in the middle of the shipping
        // frontage stopped two inspection drives. Where the corridor line lies
        // on a road, the road's own drop rail is the barrier.
        const spanned = streetsNear(x, z, 26).some(street => {
          const road = projectOntoPath(street.points, x, z);
          if (road.distance < road.width / 2 + 0.5) return true;
          if (road.distance >= road.width / 2 + 6) return false;
          return Math.abs(road.ux * ux + road.uz * uz) < 0.7;
        });
        if (spanned) continue;
        walls.push({ x, z, y: outerTerrain(x, z), width: run + 0.4, depth: 1.2,
          rotation: -Math.atan2(uz, ux), pitch: 0, accent: "white", zone: "old-quarter" });
      }
    }
  }
  return walls;
}

/** The three kinds of wall, kept apart so a test can ask each one its own
 *  question: a street rail must guard something, a fence must be whole, the
 *  boundary must close. Classifying them by geometry instead mistook a fence
 *  piece inside a river bend for a street rail guarding nothing. */
export const DISTRICT_STREET_RAILS: readonly CourseWall[] = buildDistrictWalls();
export const DISTRICT_BOUNDARY_WALLS: readonly CourseWall[] = boundaryWalls();
export const DISTRICT_RIVER_FENCE: readonly CourseWall[] = corridorWalls(RIVER, RIVER_HALF_WIDTH);
export const DISTRICT_RAIL_FENCE: readonly CourseWall[] = corridorWalls(RAIL, RAIL_HALF_WIDTH);
export const DISTRICT_WALLS: readonly CourseWall[] = [
  ...DISTRICT_STREET_RAILS, ...DISTRICT_BOUNDARY_WALLS, ...DISTRICT_RIVER_FENCE, ...DISTRICT_RAIL_FENCE,
];


/** Metres past the kerb over which the driven surface eases from the road
 *  down onto the ground: a chamfered kerb, not a step. The ground is clamped
 *  to 0.35 m under the road beside it, and a 0.35 m step in one tick is a jolt. */
const KERB_CHAMFER = 1.5;

/**
 * The surface the car rides: the road across the carriageway, the drawn ground
 * beyond it. With the rails gone the car can leave the road, and a car that
 * still rode `projectOntoDistrict` would float on the nearest road's height —
 * on the hill, metres above the ground it can see. Grade eases to zero off
 * the kerb: the height follows the ground, the pitch does not try to.
 */
export function districtSurface(x: number, z: number): CourseProjection {
  const road = projectOntoDistrict(x, z);
  const over = road.distance - road.width / 2;
  if (over <= 0) return road;
  const t = Math.min(1, over / KERB_CHAMFER);
  const blend = t * t * (3 - 2 * t);
  const ground = groundHeight(x, z);
  return { ...road, height: road.height + (ground - road.height) * blend, pitch: road.pitch * (1 - blend) };
}

function worldFrom(id: string, points: readonly CoursePoint[], start?: RoadWorld["start"]): RoadWorld {
  const a = points[0]!, b = points[1]!;
  // Boundaries and projection are the whole network in both modes: a route is a
  // guide drawn over the district, never a subset of the road you may drive on.
  return { id: `${DISTRICT_VERSION}/${id}`, walls: DISTRICT_WALLS, solids: DISTRICT_BLOCKS,
    // A getter, so the network is built only if something asks for traffic.
    get traffic() { return districtTraffic(); }, project: projectOntoDistrict, surface: districtSurface,
    start: start ?? { x: a.x, y: a.y, z: a.z, heading: Math.atan2(a.x - b.x, a.z - b.z),
      pitch: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) } };
}

export function createDistrictWorld(route: DistrictRoute): RoadWorld {
  return worldFrom(route.id, routePoints(route));
}

/** Free roam begins outside the garage; routes and races keep their grids. */
export function createFreeRoamWorld(): RoadWorld {
  const street = DISTRICT_STREETS.find(candidate => candidate.id === "ring-boulevard");
  if (!street) throw new RangeError("Free roam needs the boulevard to start from");
  return worldFrom("free-roam", street.points, DISTRICT_GARAGE.entrance);
}

/**
 * The planar faces of the street graph — the city blocks the streets enclose.
 *
 * Massing used to be a uniform grid filtered down to whatever gaps the roads
 * left, which is backwards: urban form is a tessellation of blocks and streets
 * are the negative space between them. Walking the faces means the buildings
 * take their shape from the network instead of from a checkerboard.
 *
 * Standard half-edge traversal: at each node take the next incident edge
 * clockwise from the one you arrived on, and you trace one face.
 */
interface HalfEdge {
  key: string;
  from: string;
  to: string;
  bearing: number;
  points: readonly CoursePoint[];
}

function districtFaces(): { x: number; z: number }[][] {
  const halves: HalfEdge[] = [];
  for (const street of DISTRICT_STREETS) {
    const forward = street.points;
    const back = [...street.points].reverse();
    const bearing = (points: readonly CoursePoint[]) =>
      Math.atan2(points[1]!.z - points[0]!.z, points[1]!.x - points[0]!.x);
    halves.push({ key: `${street.id}+`, from: street.from, to: street.to, points: forward, bearing: bearing(forward) });
    halves.push({ key: `${street.id}-`, from: street.to, to: street.from, points: back, bearing: bearing(back) });
  }
  const byKey = new Map(halves.map(half => [half.key, half]));
  const byNode = new Map<string, HalfEdge[]>();
  for (const half of halves) {
    const list = byNode.get(half.from) ?? [];
    list.push(half);
    byNode.set(half.from, list);
  }
  for (const list of byNode.values()) list.sort((a, b) => a.bearing - b.bearing);
  const twin = (key: string) => key.endsWith("+") ? `${key.slice(0, -1)}-` : `${key.slice(0, -1)}+`;

  const seen = new Set<string>();
  const faces: { x: number; z: number }[][] = [];
  for (const start of halves) {
    if (seen.has(start.key)) continue;
    const polygon: { x: number; z: number }[] = [];
    let half: HalfEdge | undefined = start;
    for (let guard = 0; guard < 600 && half && !seen.has(half.key); guard++) {
      seen.add(half.key);
      for (const point of half.points.slice(0, -1)) polygon.push({ x: point.x, z: point.z });
      const arrived = byKey.get(twin(half.key));
      const list = byNode.get(half.to);
      if (!arrived || !list) break;
      const index = list.indexOf(arrived);
      half = list[(index - 1 + list.length) % list.length];
    }
    if (polygon.length > 3) faces.push(polygon);
  }
  // The outer face traces the district's outside and has the opposite winding.
  const area = (polygon: { x: number; z: number }[]) => polygon.reduce((sum, point, i) => {
    const next = polygon[(i + 1) % polygon.length]!;
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
  const areas = faces.map(area);
  const outer = areas.indexOf(Math.max(...areas.map(Math.abs)) === Math.abs(Math.min(...areas))
    ? Math.min(...areas) : Math.max(...areas));
  return faces.filter((_, i) => i !== outer && Math.abs(areas[i]!) > 900);
}

export const DISTRICT_FACES = districtFaces();

function inside(polygon: { x: number; z: number }[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

export interface DistrictBlock {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Yaw, so a building can stand square to the street it fronts. */
  readonly rotation: number;
  /** Height of the base: the LOWEST drawn ground under the footprint, so no
   *  corner floats and the uphill side is buried by at most the ground's spread
   *  across the block. Not zero. This district climbs 20 m, and at zero 227 of
   *  321 buildings stood with their base more than a metre underground. */
  readonly base: number;
}

/** The four corners of an oriented footprint. Clearance is a rectangle problem;
 *  a circumscribed circle demanded a 35 m setback on an arterial and is why the
 *  first pass left every block floating in the middle of its face. */
export function blockCorners(block: DistrictBlock): { x: number; z: number }[] {
  const cos = Math.cos(block.rotation), sin = Math.sin(block.rotation);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => {
    const localX = sx * block.width / 2, localZ = sz * block.depth / 2;
    return { x: block.x + localX * cos - localZ * sin, z: block.z + localX * sin + localZ * cos };
  });
}

/** Metres between samples along a footprint's edge when testing clearance. */
const EDGE_STEP = 3;

/**
 * True when the whole footprint stands clear of every street's asphalt.
 *
 * Measured per street rather than against the nearest one: beside an alley the
 * nearest centreline is 4 m wide and says nothing about the arterial behind it.
 *
 * Two things this used to get wrong, found the day the outer district gained
 * its buildings. It tested only the four corners, so on a curved street both
 * corners cleared while the straight edge between them cut the chord — a 32 m
 * frontage stood 10 m onto Crane Street with every corner in the clear. And it
 * measured against the street's NARROWEST width, which is right for laying out
 * lanes and wrong for this: the asphalt flares wider into every junction, a car
 * can be on the flare, and a building cleared to the narrow width stood 1.6 m
 * onto Quarter Street's apron and wedged the Hill Climb inspection driver for
 * 131 of its 160 seconds. So: every edge is sampled, against the width the road
 * actually has where the sample lands.
 */
export function blockClearsStreets(block: DistrictBlock, pavement: number): boolean {
  const corners = blockCorners(block);
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge]!, b = corners[(edge + 1) % 4]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / EDGE_STEP));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const street of streetsNear(x, z, 46)) {
        const on = projectOntoPath(street.points, x, z);
        // Placement puts the near face EXACTLY at the back of the pavement, so
        // the boundary itself must pass; only a sample inside it fails.
        if (on.distance < on.width / 2 + pavement - 1e-6) return false;
      }
    }
  }
  return true;
}

/** Half the diagonal: the radius that certainly contains an oriented footprint. */
const spanOf = (block: { width: number; depth: number }) => Math.hypot(block.width, block.depth) / 2;

/** Is a point inside an oriented footprint, with `margin` metres of grace? */
function footprintContains(block: DistrictBlock, x: number, z: number, margin = 0): boolean {
  const cos = Math.cos(-block.rotation), sin = Math.sin(-block.rotation);
  const dx = x - block.x, dz = z - block.z;
  const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= block.width / 2 + margin && Math.abs(localZ) <= block.depth / 2 + margin;
}

/**
 * Rule: a building cannot clip a barrier. Every rail piece that exists — street
 * rails, the river and rail fences, the boundary — must stand outside the
 * footprint. Placement used to clear the streets and nothing else, so 46
 * buildings put a corner in the river corridor and 7 in the lineside, and 27
 * rail pieces stood inside 19 of them with the fence running through the
 * building.
 */
export function blockClearsWalls(block: DistrictBlock): boolean {
  const reach = spanOf(block) + 2;
  for (const wall of DISTRICT_WALLS) {
    if (Math.abs(wall.x - block.x) > reach || Math.abs(wall.z - block.z) > reach) continue;
    if (footprintContains(block, wall.x, wall.z, 0.6)) return false;
  }
  return true;
}

/**
 * The authored structures — the tunnel bore and the bridge deck — as corridors
 * along the original loop. Placement clears the road ribbon and its pavement;
 * to it the tunnel section was just a road, and 14 buildings stood inside the
 * bore 12-15 m off the centreline: five on the tunnel floor beside the road,
 * nine rising 24-40 m up through its walls and roof from the low ground
 * beside it. The wall cladding sits at half the road width plus 1.9 m and the
 * vault spreads beyond that, so the corridor is half the width plus six.
 * Measured against the asset itself, casting horizontal rays outward from the
 * tunnel's centreline: walls at 10.7-11.8 m, median 10.9. The buildings the
 * corridor now leaves stand at 15.2 m or more — outside the tunnel, not in it.
 */
const STRUCTURE_CLEARANCE = 6;
const STRUCTURE_SPANS: readonly (readonly CoursePoint[])[] = (() => {
  const spans: CoursePoint[][] = [];
  const structural = (point: CoursePoint) => point.zone === "tunnel" || point.zone === "bridge";
  // Contiguous runs of structural points, one point of grace either end so the
  // corridor reaches the portal faces; the loop is a circuit, so runs may wrap.
  const n = COURSE_POINTS.length;
  let start = COURSE_POINTS.findIndex(point => !structural(point));
  if (start < 0) return [COURSE_POINTS];
  for (let step = 0, i = (start + 1) % n; step < n; step++, i = (i + 1) % n) {
    if (!structural(COURSE_POINTS[i]!)) continue;
    const run = [COURSE_POINTS[(i - 1 + n) % n]!];
    while (structural(COURSE_POINTS[i]!)) { run.push(COURSE_POINTS[i]!); i = (i + 1) % n; step++; }
    run.push(COURSE_POINTS[i]!);
    spans.push(run);
  }
  return spans;
})();

/** Inside the tunnel or bridge corridor: half the road's width plus the
 *  structure's own margin. Street furniture has no business there either —
 *  the tunnel carries its own authored lights, and eight sodium posts stood
 *  inside the bore because the lamp pass walks every street including the
 *  loop's tunnel section. */
export function nearStructure(x: number, z: number): boolean {
  return STRUCTURE_SPANS.some(span => {
    const on = projectOntoPath(span, x, z);
    return on.distance <= on.width / 2 + STRUCTURE_CLEARANCE;
  });
}

/** Rule: a building cannot stand in the tunnel or on the bridge. */
export function blockClearsStructures(block: DistrictBlock): boolean {
  return [...blockCorners(block), { x: block.x, z: block.z }].every(point =>
    STRUCTURE_SPANS.every(span => {
      const on = projectOntoPath(span, point.x, point.z);
      return on.distance > on.width / 2 + STRUCTURE_CLEARANCE;
    }));
}

/** Rule: a building stays out of the water and off the line. The fence is
 *  where those corridors end, and a footprint inside one has its back in the
 *  river whether or not a rail piece happens to fall inside it. */
export function blockClearsCorridors(block: DistrictBlock): boolean {
  return [...blockCorners(block), { x: block.x, z: block.z }].every(point =>
    distanceToPath(RIVER, point.x, point.z) > RIVER_HALF_WIDTH + 1 &&
    distanceToPath(RAIL, point.x, point.z) > RAIL_HALF_WIDTH + 1);
}

/** Firewall gap between two buildings that do not share a wall. */
const BLOCK_GAP = 1.2;
/** How far, in metres, a building may retreat from the pavement line to clear
 *  the asphalt before the candidate is given up on. */
const PUSH_BACK = 6;
/** The most the ground may drop across one footprint for it to be a plot. */
const MAX_PLOT_DROP = 4;

/**
 * How deeply two oriented footprints interpenetrate; <= 0 when they are apart,
 * and then its magnitude is a lower bound on the gap between them.
 *
 * Separating axes, because clearance is a rectangle problem — the same thing
 * building-vs-street had to learn. Two circumscribed circles with 7 m of slack
 * was the first answer here, and slack on a circle is slack on the rectangle
 * inside it: 15 pairs interpenetrated, the worst by 4.21 m. A circle cannot
 * express "these two terraces share a party wall but do not overlap", which is
 * the whole shape of a city block, so it needs slack, so it lets buildings
 * through each other.
 */
export function blockPenetration(a: DistrictBlock, b: DistrictBlock): number {
  let least = Infinity;
  for (const box of [a, b]) {
    const cos = Math.cos(box.rotation), sin = Math.sin(box.rotation);
    for (const [axisX, axisZ] of [[cos, sin], [-sin, cos]] as const) {
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const corner of blockCorners(a)) {
        const t = corner.x * axisX + corner.z * axisZ;
        aMin = Math.min(aMin, t); aMax = Math.max(aMax, t);
      }
      for (const corner of blockCorners(b)) {
        const t = corner.x * axisX + corner.z * axisZ;
        bMin = Math.min(bMin, t); bMax = Math.max(bMax, t);
      }
      least = Math.min(least, Math.min(aMax, bMax) - Math.max(aMin, bMin));
    }
  }
  return least;
}

/**
 * Buildings fronting the street around each block's perimeter.
 *
 * The first pass sampled a grid inside each face and kept whatever cleared the
 * road, which left the middle of every block occupied and its edges bare —
 * exactly backwards. A city block is built out to its street frontage with the
 * gap, if any, in the middle. Walking the face boundary and setting each
 * building back by the carriageway plus a pavement puts the wall where a
 * pedestrian would stand, and gives it a rotation so it stands square to the
 * road rather than to the world axes.
 */
export const DISTRICT_BLOCKS: readonly DistrictBlock[] = DISTRICT_FACES.flatMap((face, faceIndex) => {
  const centre = face.reduce((sum, point) => ({ x: sum.x + point.x / face.length, z: sum.z + point.z / face.length }),
    { x: 0, z: 0 });
  const river = distanceToPath(RIVER, centre.x, centre.z);
  const rail = distanceToPath(RAIL, centre.x, centre.z);
  const industrial = river < 190 || rail < 150;
  // Depth is tried deepest-first. A narrow face cannot host a deep building
  // once the setback clears the carriageway, and a shallow terrace is what
  // actually gets built on one — so fall back rather than leave it bare.
  const depths = industrial ? [26, 17, 11] : [17, 12, 8];
  const pavement = industrial ? 3.5 : 2.6;

  const placed: DistrictBlock[] = [];
  // Walk the WHOLE perimeter in frontage-sized strides, carrying the remainder
  // across vertices exactly as pathSamples does. The face follows street
  // polylines, so its vertices are 4 m apart, and a frontage is 21-34 m: a walk
  // that restarted at every vertex never took a single step on ten of the
  // eighteen faces, and the outer two thirds of the district had no buildings
  // at all. Faces on the original ring only worked because its points happen
  // to sit far enough apart to clear a frontage.
  const frontage = industrial ? 34 : 21;
  const stride = frontage + 1.5;
  let carry = frontage / 2;
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    const runX = b.x - a.x, runZ = b.z - a.z;
    const run = Math.hypot(runX, runZ);
    if (run < 1e-6) continue;
    const dirX = runX / run, dirZ = runZ / run;
    const start = carry;
    carry = ((carry - run) % stride + stride) % stride;
    for (let along = start; along < run; along += stride) {
      const edgeX = a.x + dirX * along, edgeZ = a.z + dirZ * along;
      // Inward is whichever normal lands inside the face.
      let normalX = -dirZ, normalZ = dirX;
      if (!inside(face, edgeX + normalX * 4, edgeZ + normalZ * 4)) { normalX = -normalX; normalZ = -normalZ; }
      const road = projectOntoDistrict(edgeX, edgeZ);
      // Search the setback rather than guess it once and reject. A straight
      // frontage on a curved street dips into the pavement mid-edge by its
      // sagitta — under a metre on most bends here — and a frontage whose end
      // lands on a junction flare dips by a little more. Measured when the
      // clearance test started sampling edges honestly: 268 of 436 rejected
      // candidates were inside the line by less than 1 m. Stepping back a metre
      // at a time recovers them; a forecourt is a building, a void is not. The
      // cap keeps a terrace from retreating into the middle of its block. The
      // few that intrude by many metres are footprints straddling another
      // street, and those fall to a shallower depth or are dropped, as before.
      let done = false;
      for (const depth of depths) {
        for (let back = 0; back <= PUSH_BACK && !done; back += 1) {
          const setback = road.width / 2 + pavement + back + depth / 2;
          const x = edgeX + normalX * setback, z = edgeZ + normalZ * setback;
          // Further back only lands further outside the face.
          if (!inside(face, x, z)) break;
          const seed = ((faceIndex * 31 + Math.round(x) * 7 + Math.round(z) * 13) % 6 + 6) % 6;
          const inland = Math.max(0, Math.min(1, -(x + z) / 900 + 0.25));
          const shape = { x, z, width: frontage - 2 - (seed % 3), depth, rotation: Math.atan2(dirZ, dirX) };
          // Stand it on the ground it is actually on. The lowest of the corners
          // and the centre: the uphill side is buried by the spread, nothing
          // floats, and the ground floor meets the pavement it fronts because
          // groundHeight is clamped to the road there.
          const grounds = [groundHeight(x, z),
            ...blockCorners({ ...shape, height: 0, base: 0 }).map(corner => groundHeight(corner.x, corner.z))];
          const base = Math.min(...grounds);
          // A plot, not a slope. Past this much drop across one footprint the
          // building either floats on its downhill side or is buried past its
          // ground floor uphill; 18 candidates straddle more, all beside the
          // old loop where its authored grade meets the inland ramp, and the
          // worst spans 10.9 m. Those stay embankment.
          if (Math.max(...grounds) - base > MAX_PLOT_DROP) continue;
          const block: DistrictBlock = {
            ...shape, base: Math.round(base * 10) / 10,
            height: Math.round(industrial ? 8 + seed * 3.5 : 13 + seed * 5 + inland * 18),
          };
          // Two frontages meeting at a corner, or facing each other across a
          // narrow block, must not occupy the same ground.
          // Reject by the circle first — it is cheap and rules out most of the
          // face — then by the footprints that are actually being built.
          if (placed.some(other => Math.hypot(other.x - x, other.z - z) < spanOf(other) + spanOf(block)
            && blockPenetration(other, block) > -BLOCK_GAP)) continue;
          if (!blockClearsStreets(block, pavement)) continue;
          if (!blockClearsCorridors(block) || !blockClearsWalls(block) || !blockClearsStructures(block)) continue;
          placed.push(block);
          done = true;
        }
        if (done) break;
      }
    }
  }
  return placed;
});

/** An authored location in an existing industrial footprint. Refuse a missing
 * plot rather than moving the player's home when the massing changes. */
export const DISTRICT_GARAGE = (() => {
  const building = DISTRICT_BLOCKS.find(block => Math.abs(block.x - 269.3221008053601) < 0.01 &&
    Math.abs(block.z + 339.25142242330605) < 0.01);
  if (!building) throw new Error("Wharf Garage needs its authored warehouse plot");
  const reach = building.depth / 2 + 5;
  const x = building.x + Math.sin(building.rotation) * reach;
  const z = building.z - Math.cos(building.rotation) * reach;
  const surface = districtSurface(x, z);
  return { id: "wharf-garage", name: "Wharf Garage", building,
    // Park along the near-side lane outside the shutter. Facing straight out
    // would put the chase camera eight metres behind the car, inside the bay.
    entrance: { x, y: surface.height, z, heading: Math.atan2(surface.ux, surface.uz), pitch: -surface.pitch } };
})();

/** A lane of a named district street. Traffic and rivals address lanes by id
 *  rather than by object, because a street is data and an id survives a reload
 *  (and, one day, a saved ghost) in a way an object reference does not. */
export interface DistrictLane extends Lane {
  readonly street: string;
}

export function districtLanes(streetId: string): DistrictLane[] {
  return lanes(streetOf(streetId).kind).map(lane => ({ ...lane, street: streetId }));
}

/** Every lane in the district, in street order. */
export const DISTRICT_LANES: readonly DistrictLane[] =
  DISTRICT_STREETS.flatMap(street => districtLanes(street.id));

function streetOf(id: string): Street {
  const street = DISTRICT_STREETS.find(candidate => candidate.id === id);
  if (!street) throw new RangeError(`Unknown street '${id}'`);
  return street;
}

/** How far a lane runs along its own path, in metres. Not its street's length:
 *  an offset lane round a bend is longer or shorter than the line it is
 *  measured from. */
export function districtLaneLength(lane: DistrictLane): number {
  const street = streetOf(lane.street);
  return laneLength(street.points, lane, street.kind);
}

/**
 * Where a district lane is, `distance` metres along its own direction of
 * travel. The height comes from the district's own graded surface, so a lane
 * follows an apron rather than cutting through it.
 */
export function districtLanePose(lane: DistrictLane, distance: number): LanePose {
  const street = streetOf(lane.street);
  return lanePose(street.points, lane, distance,
    (x, z) => projectOntoDistrict(x, z).height, street.kind);
}


// ---------------------------------------------------------------------------
// The traffic network: a lane graph, the movements through each junction, and
// which of those movements cross each other.
//
// This is only possible because the district guarantees that two carriageways
// share ground solely within 70 m of a junction they both meet at (see the
// carriageway-overlap test). Every place two vehicles can collide is therefore
// a junction, so the whole conflict set can be computed here, once, from the
// geometry — rather than looked for at runtime by watching for near misses.

/**
 * How far either side of a junction its movements are searched for crossings.
 *
 * The carriageway-overlap gate permits two streets that share a junction to
 * share asphalt up to 70 m out from it, so that is how far a conflict can be.
 * A 28 m apron — districtSurfaceHeight's own blend radius, and the obvious
 * choice — leaves a 42 m band where two lanes overlap with nothing reserving
 * them, which is where every measured non-junction overlap came from.
 */
export const JUNCTION_SEARCH = 70;
/** Slack added to a reservation zone beyond the last crossing found in it. */
const RESERVE_MARGIN = 6;
/**
 * Two movements conflict when the largest vehicle on one could touch the
 * largest vehicle on the other. Asked as a distance between centrelines it has
 * no answer: opposing lanes in an alley run 3.75 m apart and must not conflict,
 * while two paths crossing at an angle collide from 4.5 m apart because a 7.2 m
 * lorry sweeps far wider than the line it drives. Measured both ways, a single
 * threshold either seizes every alley or misses every turn.
 *
 * So the question is asked as geometry: each path segment becomes the box a
 * worst-case vehicle sweeps along it, and two movements conflict if any pair of
 * those boxes overlaps. Conservative — it assumes lorries everywhere — which is
 * the right direction for a safety property.
 */
const CONFLICT_LENGTH = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.length));
const CONFLICT_WIDTH = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.width));
/** Bounding-box slack for the cheap reject, covering the swept box's reach. */
const CONFLICT_CLEARANCE = CONFLICT_LENGTH + CONFLICT_WIDTH;
/** Spacing at which movement paths are sampled to find crossings. */
const CONFLICT_STEP = 3;

/** The box a worst-case vehicle sweeps driving one path segment. */
interface SweptBox {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  halfLength: number;
  halfWidth: number;
}

function sweptBox(ax: number, az: number, bx: number, bz: number): SweptBox {
  const dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: (ax + bx) / 2, z: (az + bz) / 2, dirX: dx / length, dirZ: dz / length,
    halfLength: length / 2 + CONFLICT_LENGTH / 2, halfWidth: CONFLICT_WIDTH / 2,
  };
}

/** Separating-axis overlap test for two swept boxes. */
function sweptBoxesOverlap(a: SweptBox, b: SweptBox): boolean {
  const extent = (box: SweptBox, axisX: number, axisZ: number) =>
    Math.abs(box.dirX * axisX + box.dirZ * axisZ) * box.halfLength
    + Math.abs(-box.dirZ * axisX + box.dirX * axisZ) * box.halfWidth;
  for (const [axisX, axisZ] of [[a.dirX, a.dirZ], [-a.dirZ, a.dirX],
    [b.dirX, b.dirZ], [-b.dirZ, b.dirX]] as const) {
    const separation = Math.abs((b.x - a.x) * axisX + (b.z - a.z) * axisZ);
    if (separation > extent(a, axisX, axisZ) + extent(b, axisX, axisZ)) return false;
  }
  return true;
}


interface LaneEntry { street: Street; lane: Lane; junction: string }

/** The junction a lane arrives at, travelling in its own direction. */
function laneExitJunction(street: Street, lane: Lane): string {
  return lane.direction === 1 ? street.to : street.from;
}

function buildTrafficNetwork(): TrafficNetwork {
  const entries: LaneEntry[] = DISTRICT_STREETS.flatMap(street =>
    lanes(street.kind).map(lane => ({ street, lane, junction: laneExitJunction(street, lane) })));
  const idOf = new Map<string, number>();
  entries.forEach((entry, id) =>
    idOf.set(`${entry.street.id}|${entry.lane.direction}|${entry.lane.index}`, id));
  // Each lane's own length, not its street's: distances along a lane, and every
  // reach and sweep derived from them, are that lane's arc length.
  const lengths = entries.map(entry => laneLength(entry.street.points, entry.lane, entry.street.kind));
  const reach = (id: number) => Math.min(JUNCTION_SEARCH, lengths[id]! * 0.9);

  const junctionIds = DISTRICT_JUNCTIONS.map(junction => junction.id);
  const junctionOf = new Map(junctionIds.map((id, index) => [id, index]));

  /** Lanes leaving a junction, keeping to the same lane index where the exit
   *  street has one — turning off an arterial into an alley drops you to its
   *  only lane, which is exactly the lane drop a driver reads. */
  const exitsAt = (junction: string, index: number, exclude: Street | null): number[] => {
    const exits: number[] = [];
    for (const street of DISTRICT_STREETS) {
      if (street === exclude) continue;
      for (const direction of [1, -1] as const) {
        if ((direction === 1 ? street.from : street.to) !== junction) continue;
        const kept = Math.min(index, lanesPerDirection(street.kind) - 1);
        const id = idOf.get(`${street.id}|${direction}|${kept}`);
        if (id !== undefined) exits.push(id);
      }
    }
    return exits;
  };

  const movements: TrafficMovement[] = [];
  const laneMovements: number[][] = entries.map(() => []);
  entries.forEach((entry, from) => {
    // A U-turn is the last resort, not a choice: only where a junction offers
    // nothing else, which the district's graph does not currently do.
    const exits = exitsAt(entry.junction, entry.lane.index, entry.street);
    const usable = exits.length ? exits : exitsAt(entry.junction, entry.lane.index, null);
    for (const to of usable) {
      const id = movements.length;
      movements.push({
        id, junction: junctionOf.get(entry.junction)!, from, to,
        conflicts: [], sweeps: [], clear: reach(to),
      });
      laneMovements[from]!.push(id);
    }
  });

  // Surface height is irrelevant to whether two paths cross, and projecting it
  // for every sample of every movement is most of this build's cost.
  const flatPose = (lane: number, distance: number) => {
    const entry = entries[lane]!;
    return lanePose(entry.street.points, entry.lane, distance, () => 0, entry.street.kind);
  };

  /**
   * A movement's path through its junction: the tail of the lane it arrives on,
   * then the head of the lane it leaves by. `along` is signed — negative metres
   * still to go before the junction, positive metres past it — so a crossing
   * found here says exactly how far back the reservation has to start.
   */
  const pathOf = (movement: TrafficMovement): { x: number; z: number; along: number; lane: number }[] => {
    const path: { x: number; z: number; along: number; lane: number }[] = [];
    const fromLength = lengths[movement.from]!;
    for (let back = reach(movement.from); back >= 0; back -= CONFLICT_STEP) {
      path.push({ ...flatPose(movement.from, fromLength - back), along: -back, lane: movement.from });
    }
    for (let forward = CONFLICT_STEP; forward <= reach(movement.to); forward += CONFLICT_STEP) {
      path.push({ ...flatPose(movement.to, forward), along: forward, lane: movement.to });
    }
    return path;
  };
  const paths = movements.map(pathOf);
  const bounds = paths.map(path => ({
    minX: Math.min(...path.map(p => p.x)), maxX: Math.max(...path.map(p => p.x)),
    minZ: Math.min(...path.map(p => p.z)), maxZ: Math.max(...path.map(p => p.z)),
  }));

  interface Span { from: number; to: number }
  const spans = new Map<string, { a: Span; b: Span }>();
  // How far back along its approach, and how far on past the junction, each
  // movement's crossings actually reach. The reservation zone is then exactly
  // the zone that needs one, rather than a radius picked in advance.
  const backReach = movements.map(() => 0);
  const forwardReach = movements.map(() => 0);
  // Every pair, not just pairs at the same junction. Two junctions in this
  // district sit 34 m apart with overlapping aprons, and a movement's path
  // reaches far enough to cross one belonging to the junction next door — which
  // is where the last overlaps came from once the reservation itself was sound.
  // The bounding-box reject below keeps this affordable.
  for (let i = 0; i < movements.length; i++) {
    {
      for (let j = i + 1; j < movements.length; j++) {
        const a = movements[i]!, b = movements[j]!;
        // Two vehicles on one approach are a queue, not a conflict; the
        // follower rule already keeps them apart.
        if (a.from === b.from) continue;
        const boxA = bounds[a.id]!, boxB = bounds[b.id]!;
        if (boxA.minX - CONFLICT_CLEARANCE > boxB.maxX || boxB.minX - CONFLICT_CLEARANCE > boxA.maxX
          || boxA.minZ - CONFLICT_CLEARANCE > boxB.maxZ || boxB.minZ - CONFLICT_CLEARANCE > boxA.maxZ) continue;
        let crosses = false;
        const pathA = paths[a.id]!, pathB = paths[b.id]!;
        for (let m = 1; m < pathA.length; m++) {
          const a0 = pathA[m - 1]!, a1 = pathA[m]!;
          const boxA = sweptBox(a0.x, a0.z, a1.x, a1.z);
          // One distance against a bounding radius, before four axes of exact
          // test. A movement path spans up to 140 m, so its own bounding box is
          // far too coarse to reject the pair; the segments are not.
          const radiusA = boxA.halfLength + boxA.halfWidth;
          for (let n = 1; n < pathB.length; n++) {
            const b0 = pathB[n - 1]!, b1 = pathB[n]!;
            const midX = (b0.x + b1.x) / 2 - boxA.x, midZ = (b0.z + b1.z) / 2 - boxA.z;
            const radiusB = Math.hypot(b1.x - b0.x, b1.z - b0.z) / 2
              + CONFLICT_LENGTH / 2 + CONFLICT_WIDTH / 2;
            if (midX * midX + midZ * midZ > (radiusA + radiusB) ** 2) continue;
            // Once two movements are on the same lane they have merged, and a
            // merge is a queue: the follower rule owns it from there. Counting
            // the shared lane as conflict makes two movements onto one street
            // exclude each other along its entire length, which is what turned
            // every junction into a one-at-a-time gate.
            if (a1.lane === b1.lane && a0.lane === b0.lane) continue;
            if (!sweptBoxesOverlap(boxA, sweptBox(b0.x, b0.z, b1.x, b1.z))) continue;
            crosses = true;
            const key = `${a.id}|${b.id}`;
            let span = spans.get(key);
            if (!span) {
              span = { a: { from: Infinity, to: -Infinity }, b: { from: Infinity, to: -Infinity } };
              spans.set(key, span);
            }
            for (const [side, from, to] of [["a", a0, a1], ["b", b0, b1]] as const) {
              for (const sample of [from, to]) {
                span[side].from = Math.min(span[side].from, sample.along);
                span[side].to = Math.max(span[side].to, sample.along);
              }
            }
            for (const [movement, from, to] of [[a, a0, a1], [b, b0, b1]] as const) {
              for (const sample of [from, to]) {
                if (sample.along < 0) {
                  backReach[movement.id] = Math.max(backReach[movement.id]!, -sample.along);
                } else {
                  forwardReach[movement.id] = Math.max(forwardReach[movement.id]!, sample.along);
                }
              }
            }
          }
        }
        if (!crosses) continue;
      }
    }
  }

  // Surface height, sampled once per lane instead of projected every tick.
  // projectOntoDistrict searches the street network, and measured at most of a
  // traffic tick when called per vehicle — re-deriving a number that cannot
  // change. districtLanePose stays exact; this is the realtime path.
  const profiles = entries.map((_, id) => {
    const count = Math.max(2, Math.ceil(lengths[id]! / TRAFFIC_HEIGHT_STEP) + 1);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const flat = flatPose(id, Math.min(lengths[id]!, i * TRAFFIC_HEIGHT_STEP));
      heights[i] = projectOntoDistrict(flat.x, flat.z).height;
    }
    return heights;
  });

  const conflicts: { other: number; from: number; to: number; otherFrom: number; otherTo: number }[][] =
    movements.map(() => []);
  for (const [key, span] of spans) {
    const [x, y] = key.split("|").map(Number) as [number, number];
    conflicts[x]!.push({ other: y, from: span.a.from, to: span.a.to,
      otherFrom: span.b.from, otherTo: span.b.to });
    conflicts[y]!.push({ other: x, from: span.b.from, to: span.b.to,
      otherFrom: span.a.from, otherTo: span.a.to });
  }

  // Which stretches of which lanes each movement's swept path crosses. Sampling
  // the lanes against the boxes is the same question the conflict pass asks,
  // put to stationary vehicles instead of to other movements.
  // Sampled at 4 m, not 2: a span this pass exists to find is a *vehicle*
  // standing in a movement's path, and the shortest vehicle is 4.4 m long, so
  // no occupied span can hide between samples. Halves the hottest loop.
  const SWEEP_STEP = 4;
  // Lane extents, so a movement only samples the lanes it could possibly reach.
  // Without this the pass walks every lane end to end for every movement — 209
  // million box tests, and most of a 26-second module import.
  const laneExtent = entries.map((_, id) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let d = 0; d <= lengths[id]!; d += SWEEP_STEP) {
      const point = flatPose(id, d);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  });
  const sweeps = movements.map(movement => {
    const boxes = [];
    const path = paths[movement.id]!;
    for (let m = 1; m < path.length; m++) {
      boxes.push(sweptBox(path[m - 1]!.x, path[m - 1]!.z, path[m]!.x, path[m]!.z));
    }
    const spans = new Map<number, { from: number; to: number }>();
    const box = bounds[movement.id]!;
    for (let lane = 0; lane < entries.length; lane++) {
      if (lane === movement.from || lane === movement.to) continue;
      const extent = laneExtent[lane]!;
      if (box.minX - CONFLICT_CLEARANCE > extent.maxX || extent.minX - CONFLICT_CLEARANCE > box.maxX
        || box.minZ - CONFLICT_CLEARANCE > extent.maxZ || extent.minZ - CONFLICT_CLEARANCE > box.maxZ) continue;
      for (let distance = 0; distance <= lengths[lane]!; distance += SWEEP_STEP) {
        const point = flatPose(lane, distance);
        // Four comparisons against the whole path's extent before ~47 exact box
        // tests. Most of a lane lies nowhere near any one movement, and this is
        // the single hottest loop in the build.
        if (point.x < box.minX - CONFLICT_CLEARANCE || point.x > box.maxX + CONFLICT_CLEARANCE
          || point.z < box.minZ - CONFLICT_CLEARANCE || point.z > box.maxZ + CONFLICT_CLEARANCE) continue;
        const hit = boxes.some(swept => sweptBoxesOverlap(swept,
          { x: point.x, z: point.z, dirX: 1, dirZ: 0, halfLength: 0, halfWidth: 0 }));
        if (!hit) continue;
        const span = spans.get(lane);
        if (span) span.to = distance;
        else spans.set(lane, { from: distance, to: distance });
      }
    }
    // Widened by the sample step at each end, so the recorded span provably
    // contains the true one rather than the samples that happened to land in it.
    return [...spans].map(([lane, span]) => ({
      lane, from: span.from - SWEEP_STEP, to: span.to + SWEEP_STEP }));
  });

  const trafficLanes: TrafficLane[] = entries.map((_, id) => ({
    id, length: lengths[id]!, movements: laneMovements[id]!,
    // The entry line covers both the crossings of movements leaving this lane
    // and any tarmac the lane itself shares near its end.
    // Matching the far side: the reservation begins where this lane starts
    // sharing tarmac with anything, so the region a vehicle holds is exactly
    // the region where it could meet another.
    entry: Math.min(lengths[id]! * 0.45, RESERVE_MARGIN + Math.max(0,
      ...laneMovements[id]!.map(movement => backReach[movement]!))),
  }));

  return {
    lanes: trafficLanes,
    movements: movements.map(movement => ({
      ...movement, conflicts: conflicts[movement.id]!, sweeps: sweeps[movement.id]!,
      // Hold the claim until clear of the shared tarmac on the far side, not
      // merely past the crossings found. The two differ, and the difference is
      // where the last collisions lived: two exits of one junction diverge
      // slowly, and a vehicle "past its crossing" is still beside the next lane.
      clear: Math.min(reach(movement.to), RESERVE_MARGIN + forwardReach[movement.id]!),
    })),
    pose: (lane, distance) => {
      const pose = flatPose(lane, distance);
      const heights = profiles[lane]!;
      const at = Math.max(0, Math.min(heights.length - 1, distance / TRAFFIC_HEIGHT_STEP));
      const index = Math.floor(at);
      const next = Math.min(index + 1, heights.length - 1);
      pose.y = heights[index]! + (heights[next]! - heights[index]!) * (at - index);
      return pose;
    },
  };
}

/** Spacing of the sampled lane height profile, in metres. */
export const TRAFFIC_HEIGHT_STEP = 4;

let trafficNetwork: TrafficNetwork | null = null;

/**
 * The district's traffic network, built once on first use.
 *
 * Not at module load. `main.ts` imports this module for the world builders
 * whichever world is being played, so an eager build charges a Blackglass
 * session — which has no lanes and no traffic — for the whole geometric pass,
 * and charges every test that touches the district but not traffic.
 */
export function districtTraffic(): TrafficNetwork {
  trafficNetwork ??= buildTrafficNetwork();
  return trafficNetwork;
}

export function createDistrictTraffic(): TrafficState {
  return createTraffic(districtTraffic());
}
