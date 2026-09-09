import { projectOntoCourse, COURSE_POINTS, COURSE_WALLS, type CoursePoint, type CourseProjection, type CourseWall } from "./track.ts";
import type { RoadWorld } from "./road-world.ts";
import { CARRIAGEWAY, carriagewayWidth, lanes, lanePose, pathLength,
  type Lane, type LanePose, type StreetClass } from "./lanes.ts";

/** The lane model is world geometry, so it is part of the district's public
 *  surface rather than something each consumer re-derives. */
export * from "./lanes.ts";


// Fixed, authored metres. This is an offline blockout, not runtime-random roads.
// The existing perimeter is referenced verbatim; never restamp the Blender asset.
/** v2 made the massing solid, which changes what a replay does. */
export const DISTRICT_VERSION = "blackglass-district-blockout-v2";
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
  // Near the original loop the ground defers to the loop's own authored height.
  // Without this the loop sits in a cutting relative to the inland ramp, and
  // every street leaving it had to climb 6 m in the first 40 metres.
  const road = projectOntoCourse(x, z);
  const t = Math.max(0, Math.min(1, (road.distance - 55) / 205));
  const blend = t * t * (3 - 2 * t);
  return Math.round((road.height + (raw - road.height) * blend) * 10) / 10;
}

/** Plan-view distance from a point to a polyline, for river and rail tests. */
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
  ...avenue("wharf-span", "Wharf Bridge", "arterial", ["wharf-mid", [372, -268], "dock-cross"]),
  ...avenue("dock", "Dock Road", "arterial",
    ["dock-head", [470, -350], "dock-cross", [456, -150], "dock-quay", [440, 30], "dock-south"]),
  // A quay frontage inboard of the dock road, so the far bank is a loop rather
  // than one spine you have to drive back down.
  ...avenue("quay", "Quay Frontage", "collector",
    ["dock-head", "quay-north", [420, -270], "quay-south", [428, -96], "dock-quay"]),

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
  ...avenue("alley-quarter", "Cutlers Alley", "alley", ["north-mid", [-190, -300], "quarter-north"]),
  ...avenue("alley-hill", "Coopers Alley", "alley", ["hill-mid", [-390, -156], "quarter-mid"]),
  ...avenue("alley-wharf", "Crane Alley", "alley", ["wharf-gate", [232, -244], "north-east"]),

  // --- Cross-links. The geography rebuild traded route choice for character;
  // --- these buy it back now that the structure underneath is right.
  ...avenue("wharf-cross", "Crane Street", "collector", ["wharf-mid", [222, -304], "north-east"]),
  ...avenue("quayside-road", "Quayside Road", "collector", ["quayside", [-222, 170], "lower-south"]),
  ...avenue("quarter-link", "Quarter Rise", "local", ["north-west", [-282, -318], "quarter-north"]),
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
      { street: "dock-2" }, { street: "dock-3" }] },
  { id: "hill-climb", name: "Hill Climb", kind: "sprint", color: "#d69f8f",
    description: "From the hairpin up through the old quarter to the crest. Narrow streets and every metre of the climb.",
    legs: [{ street: "container-quarter-1" }, { street: "quarter-1", reverse: true },
      { street: "quarter-hill-n-1", reverse: true }] },
  { id: "river-loop", name: "River Loop", kind: "circuit", color: "#7fc7a4",
    description: "Both crossings and the whole far bank: west over Millgate, east along the water, back over the Wharf Bridge and down through the quarter.",
    legs: [{ street: "mill-span-1" }, { street: "south-bank-1" }, { street: "south-bank-2" },
      { street: "ferry-1" }, { street: "dock-3", reverse: true }, { street: "dock-2", reverse: true },
      { street: "wharf-span-1", reverse: true }, { street: "wharf-2", reverse: true },
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

export function projectOntoPath(points: readonly CoursePoint[], x: number, z: number): CourseProjection {
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

export function projectOntoDistrict(x: number, z: number): CourseProjection {
  let nearest: CourseProjection | undefined;
  const candidates = streetsNear(x, z);
  for (const street of candidates.length ? candidates : DISTRICT_STREETS) {
    const projected = projectOntoPath(street.points, x, z);
    if (!nearest || projected.distance < nearest.distance) nearest = projected;
  }
  const road = nearest!;
  // All incident streets meet the same flat junction apron, then blend back
  // into their authored grade. Nearest-street changes cannot produce a curb.
  const before = districtSurfaceHeight(x - road.ux, z - road.uz, road.height - Math.tan(road.pitch));
  const after = districtSurfaceHeight(x + road.ux, z + road.uz, road.height + Math.tan(road.pitch));
  return { ...road, height: districtSurfaceHeight(x, z, road.height), pitch: Math.atan2(after - before, 2) };
}

/** Shared junction grading for road meshes, barriers and the vertical constraint.
 * This changes only the blockout's junction aprons, never baseline Blackglass.
 */
export function districtSurfaceHeight(x: number, z: number, height: number): number {
  for (const junction of DISTRICT_JUNCTIONS) {
    const distance = Math.hypot(x - junction.point.x, z - junction.point.z);
    if (distance >= 28) continue;
    const t = Math.max(0, (distance - 9) / 19);
    const blend = t * t * (3 - 2 * t);
    return junction.point.y + (height - junction.point.y) * blend;
  }
  return height;
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
        pieces.push({ ...wall, x, y: districtSurfaceHeight(x, z, y), z,
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
      walls.push({ x: mid, z: side * extent, y: 0, width, depth: 1.2,
        rotation: 0, pitch: 0, accent: "white", zone: "old-quarter" });
      walls.push({ x: side * extent, z: mid, y: 0, width, depth: 1.2,
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
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!, [bx, bz] = path[i + 1]!;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const ux = dx / length, uz = dz / length;
    for (let along = 0; along < length; along += step) {
      const run = Math.min(step, length - along);
      const cx = ax + ux * (along + run / 2), cz = az + uz * (along + run / 2);
      for (const side of [-1, 1]) {
        const x = cx - uz * halfWidth * side, z = cz + ux * halfWidth * side;
        // Leave the bank open where a road genuinely crosses: that is a bridge.
        const spanned = streetsNear(x, z, 26).some(street => {
          const road = projectOntoPath(street.points, x, z);
          return road.distance < road.width / 2 + 9;
        });
        if (spanned) continue;
        walls.push({ x, z, y: outerTerrain(x, z), width: run + 0.4, depth: 1.2,
          rotation: -Math.atan2(uz, ux), pitch: 0, accent: "white", zone: "old-quarter" });
      }
    }
  }
  return walls;
}

export const DISTRICT_WALLS = [
  ...buildDistrictWalls(),
  ...boundaryWalls(),
  ...corridorWalls(RIVER, RIVER_HALF_WIDTH),
  ...corridorWalls(RAIL, RAIL_HALF_WIDTH),
];


function worldFrom(id: string, points: readonly CoursePoint[]): RoadWorld {
  const a = points[0]!, b = points[1]!;
  // Boundaries and projection are the whole network in both modes: a route is a
  // guide drawn over the district, never a subset of the road you may drive on.
  return { id: `${DISTRICT_VERSION}/${id}`, walls: DISTRICT_WALLS, solids: DISTRICT_BLOCKS,
    project: projectOntoDistrict,
    start: { x: a.x, y: a.y, z: a.z, heading: Math.atan2(a.x - b.x, a.z - b.z),
      pitch: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)) } };
}

export function createDistrictWorld(route: DistrictRoute): RoadWorld {
  return worldFrom(route.id, routePoints(route));
}

/** The district with no route guide: same streets, same boundaries, no line to
 *  follow. Reset returns to the boulevard rather than to a route's start gate. */
export function createFreeRoamWorld(): RoadWorld {
  const street = DISTRICT_STREETS.find(candidate => candidate.id === "ring-boulevard");
  if (!street) throw new RangeError("Free roam needs the boulevard to start from");
  return worldFrom("free-roam", street.points);
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

/** True when every corner stands clear of every street's carriageway. Measured
 *  per street rather than against the nearest one: beside an alley the nearest
 *  centreline is 4 m wide and says nothing about the arterial behind it. */
export function blockClearsStreets(block: DistrictBlock, pavement: number): boolean {
  return blockCorners(block).every(corner =>
    streetsNear(corner.x, corner.z, 46).every(street =>
      projectOntoPath(street.points, corner.x, corner.z).distance
        > carriagewayWidth(street.points) / 2 + pavement));
}

/** Half the diagonal: the radius that certainly contains an oriented footprint. */
const spanOf = (block: { width: number; depth: number }) => Math.hypot(block.width, block.depth) / 2;

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
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    const runX = b.x - a.x, runZ = b.z - a.z;
    const run = Math.hypot(runX, runZ);
    if (run < 1e-6) continue;
    const dirX = runX / run, dirZ = runZ / run;
    // Walk this edge in frontage-sized steps rather than by vertex: the face
    // follows street polylines, so its vertices are metres apart.
    const frontage = industrial ? 34 : 21;
    for (let along = frontage / 2; along < run; along += frontage + 1.5) {
      const edgeX = a.x + dirX * along, edgeZ = a.z + dirZ * along;
      // Inward is whichever normal lands inside the face.
      let normalX = -dirZ, normalZ = dirX;
      if (!inside(face, edgeX + normalX * 4, edgeZ + normalZ * 4)) { normalX = -normalX; normalZ = -normalZ; }
      const road = projectOntoDistrict(edgeX, edgeZ);
      for (const depth of depths) {
        const setback = road.width / 2 + pavement + depth / 2;
        const x = edgeX + normalX * setback, z = edgeZ + normalZ * setback;
        if (!inside(face, x, z)) continue;
        const seed = ((faceIndex * 31 + Math.round(x) * 7 + Math.round(z) * 13) % 6 + 6) % 6;
        const inland = Math.max(0, Math.min(1, -(x + z) / 900 + 0.25));
        const block: DistrictBlock = {
          x, z, width: frontage - 2 - (seed % 3), depth, rotation: Math.atan2(dirZ, dirX),
          height: Math.round(industrial ? 8 + seed * 3.5 : 13 + seed * 5 + inland * 18),
        };
        // Two frontages meeting at a corner, or facing each other across a
        // narrow block, must not occupy the same ground.
        if (placed.some(other =>
          Math.hypot(other.x - x, other.z - z) < spanOf(other) + spanOf(block) - 7)) continue;
        if (!blockClearsStreets(block, pavement)) continue;
        placed.push(block);
        break;
      }
    }
  }
  return placed;
});

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

/** How far a lane runs, in metres. */
export function districtLaneLength(lane: DistrictLane): number {
  return pathLength(streetOf(lane.street).points);
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
