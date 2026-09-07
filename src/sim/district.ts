import { COURSE_POINTS, COURSE_WALLS, type CoursePoint, type CourseProjection, type CourseWall } from "./track.ts";
import type { RoadWorld } from "./road-world.ts";

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
 * point. Every entry is an exact COURSE_POINTS index, which is what keeps the
 * perimeter an exact partition of the baseline course rather than a copy of it.
 *
 * The elevated spans are deliberately absent. The bridge crown sits at 24 m and
 * the tunnel run at 9-15 m, so a ground-level avenue cannot join them at grade;
 * the belts reach that side of the district the long way round, which is an
 * honest city constraint rather than a gap.
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

/**
 * Two orbital belts around the loop, and the radials that tie them to it.
 *
 * Junctions multiply routes; kilometres only add to them. The first blockout
 * carried 52% of a 100 m grid's road length across 17% of its junctions, and
 * four degree-3 nodes had already reached the ceiling of distinct cycles they
 * could produce. Orbital-plus-radial is the cheapest real-city pattern that
 * turns ground covered into route choice.
 */
const BELT_NODES: readonly { id: string; name: string; x: number; z: number }[] = [
  { id: "o-sw", name: "Southwest Gate", x: -470, z: -470 },
  { id: "o-s1", name: "South Yard", x: -170, z: -470 },
  { id: "o-s2", name: "South Approach", x: 170, z: -470 },
  { id: "o-se", name: "Southeast Gate", x: 465, z: -470 },
  { id: "o-e1", name: "East Reach", x: 465, z: -160 },
  { id: "o-e2", name: "East Basin", x: 465, z: 160 },
  { id: "o-ne", name: "Northeast Gate", x: 465, z: 465 },
  { id: "o-n2", name: "North Wharf", x: 170, z: 465 },
  { id: "o-n1", name: "North Quay", x: -170, z: 465 },
  { id: "o-nw", name: "Northwest Gate", x: -470, z: 465 },
  { id: "o-w2", name: "West Basin", x: -470, z: 160 },
  { id: "o-w1", name: "West Reach", x: -470, z: -160 },
  { id: "i-sw", name: "Inner Southwest", x: -350, z: -340 },
  { id: "i-s1", name: "Inner South Yard", x: -120, z: -340 },
  { id: "i-s2", name: "Inner South", x: 120, z: -340 },
  { id: "i-se", name: "Inner Southeast", x: 345, z: -340 },
  { id: "i-e1", name: "Inner East Reach", x: 345, z: -110 },
  { id: "i-e2", name: "Inner East Basin", x: 345, z: 110 },
  { id: "i-ne", name: "Inner Northeast", x: 345, z: 330 },
  { id: "i-n2", name: "Inner North Wharf", x: 120, z: 330 },
  { id: "i-n1", name: "Inner North Quay", x: -120, z: 330 },
  { id: "i-nw", name: "Inner Northwest", x: -350, z: 330 },
  { id: "i-w2", name: "Inner West Basin", x: -350, z: 110 },
  { id: "i-w1", name: "Inner West Reach", x: -350, z: -110 },
];

export const DISTRICT_JUNCTIONS: readonly { id: string; name: string; point: CoursePoint }[] = [
  ...RING_NODES.map(node => ({ id: node.id, name: node.name, point: COURSE_POINTS[node.index]! })),
  { id: "market", name: "Market Square", point: market },
  ...BELT_NODES.map(node => ({ id: node.id, name: node.name,
    point: { x: node.x, y: 0, z: node.z, width: 22, zone: "old-quarter" } as CoursePoint })),
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
    for (let j = 0; j < steps; j++) {
      if (j === 0) { result.push(b); continue; }
      const t = j / steps;
      const cubic = (key: "x" | "z") => 0.5 * (2 * b[key] + (-a[key] + c[key]) * t +
        (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t +
        (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t);
      // Monotone elevation avoids cubic height overshoot at junctions.
      result.push({ x: cubic("x"), z: cubic("z"), y: b.y + (c.y - b.y) * t,
        width: b.width + (c.width - b.width) * t, zone: "old-quarter" });
    }
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
      from: node.id, to: next.id, added: false, points };
  });
}

/**
 * An avenue is a list of junction ids with optional [x, z, y] shape points
 * between them. Each consecutive pair of junctions becomes one street edge
 * whose endpoints ARE the junction points, so the shared-endpoint invariant
 * holds by construction rather than by careful typing.
 */
type AvenueStep = string | readonly [number, number, number?];

function avenue(id: string, name: string, steps: readonly AvenueStep[], width = 22): Street[] {
  const streets: Street[] = [];
  let from: string | null = null;
  let controls: CoursePoint[] = [];
  for (const step of steps) {
    if (typeof step !== "string") {
      controls.push({ x: step[0], y: step[2] ?? 0, z: step[1], width, zone: "old-quarter" });
      continue;
    }
    const point = junctionPoint(step);
    controls.push(point);
    if (from !== null) {
      streets.push({ id: `${id}-${streets.length + 1}`, name, from, to: step, added: true,
        points: streetCurve(controls) });
    }
    from = step;
    controls = [point];
  }
  return streets;
}

const OUTER_BELT = ["o-sw", "o-s1", "o-s2", "o-se", "o-e1", "o-e2",
  "o-ne", "o-n2", "o-n1", "o-nw", "o-w2", "o-w1", "o-sw"];
const INNER_BELT = ["i-sw", "i-s1", "i-s2", "i-se", "i-e1", "i-e2",
  "i-ne", "i-n2", "i-n1", "i-nw", "i-w2", "i-w1", "i-sw"];

// Market Avenue is split at its junction so routes reference streets, not copies.
export const DISTRICT_STREETS: readonly Street[] = [
  ...ringStreets(),
  { id: "market-east", name: "Market Avenue East", from: "boulevard", to: "market", added: true,
    points: streetCurve([boulevard, p(46, 0.2, -145), p(34, 1, -80), market]) },
  { id: "market-west", name: "Market Avenue West", from: "market", to: "freight", added: true,
    points: streetCurve([market, p(-91, 2, 22), p(-175, 0.4, 38), freight]) },
  { id: "civic-link", name: "Civic Link", from: "civic", to: "market", added: true,
    points: streetCurve([civic, p(-89, 7, -57, 18), p(-55, 4.6, -33, 18), market]) },
  ...avenue("outer", "Outer Orbital", OUTER_BELT),
  ...avenue("inner", "Inner Orbital", INNER_BELT),
  // Radials. Each leaves the loop where it is near grade and steps out through
  // the inner belt to the outer one, so both belts are reachable from the loop.
  ...avenue("rad-south", "South Radial", ["boulevard", "i-s2", "o-s2"]),
  ...avenue("rad-marquee", "Marquee Radial", ["marquee", "i-se", "o-se"]),
  ...avenue("rad-east", "East Radial", ["portal", "i-e1", "o-e1"]),
  ...avenue("rad-quay", "Quayside Radial", ["quayside", "i-n1", "o-n1"]),
  ...avenue("rad-basin", "Basin Radial", ["freight", "i-w2", "o-w2"]),
  ...avenue("rad-west", "West Radial", ["container", "i-w1", "o-w1"]),
  // The hotel radial needs a shape point. Left as a straight line it ran nearly
  // PARALLEL to the ring out of the hairpin, so two streets 1 m apart at
  // different heights traded places as nearest and snapped the car vertically
  // every few ticks. Leaving westward first separates them immediately.
  ...avenue("rad-hotel", "Hotel Radial", ["hotel", [-330, -185, 5], "i-sw", "o-sw"]),
  // Two belt-to-belt spurs with no loop connection. They add cycles rather than
  // nodes, which is what turns a pair of concentric rings into a network.
  ...avenue("spur-south", "South Yard Spur", ["o-s1", "i-s1"]),
  ...avenue("spur-north", "North Wharf Spur", ["o-n2", "i-n2"]),
];

export const DISTRICT_ROUTES: readonly DistrictRoute[] = [
  { id: "perimeter", name: "Blackglass Perimeter", kind: "circuit", color: "#63d6df",
    description: "The complete original loop, now cut at eight junctions. Long infrastructure runs, then the Freight S and Hotel Hairpin.",
    legs: [{ street: "ring-boulevard" }, { street: "ring-marquee" }, { street: "ring-portal" },
      { street: "ring-quayside" }, { street: "ring-freight" }, { street: "ring-container" },
      { street: "ring-civic" }, { street: "ring-hotel" }] },
  { id: "market-loop", name: "Market Loop", kind: "circuit", color: "#efb968",
    description: "Market Avenue out, the Civic Link uphill, then the hotel descent. Shorter, junction-led driving.",
    legs: [{ street: "market-east" }, { street: "civic-link", reverse: true },
      { street: "ring-civic" }, { street: "ring-hotel" }] },
  { id: "freight-run", name: "Freight Run", kind: "sprint", color: "#e88fa0",
    description: "Freight S into the new civic connection, through Market Square and out onto the boulevard.",
    legs: [{ street: "ring-freight" }, { street: "ring-container" }, { street: "civic-link" },
      { street: "market-east", reverse: true }] },
  { id: "avenue-loop", name: "Avenue Loop", kind: "circuit", color: "#a9c583",
    description: "Both halves of Market Avenue link back through Freight and the hotel. Tests the interior connection.",
    legs: [{ street: "market-east" }, { street: "market-west" }, { street: "ring-freight" },
      { street: "ring-container" }, { street: "ring-civic" }, { street: "ring-hotel" }] },
  { id: "outer-orbital", name: "Outer Orbital", kind: "circuit", color: "#8f9bd6",
    description: "The full outer belt. Long straights and four hard gate corners; the district's high-speed lap.",
    legs: Array.from({ length: 12 }, (_, i) => ({ street: `outer-${i + 1}` })) },
  { id: "south-orbital", name: "South Orbital", kind: "circuit", color: "#d69f8f",
    description: "Down the south radial, along the inner belt, then back up the east radial and the boulevard the wrong way round.",
    legs: [{ street: "rad-south-1" }, { street: "inner-3" }, { street: "inner-4" },
      { street: "rad-east-1", reverse: true }, { street: "ring-marquee", reverse: true },
      { street: "ring-boulevard", reverse: true }] },
  { id: "west-gate", name: "West Gate Run", kind: "sprint", color: "#7fc7a4",
    description: "Out of the hotel hairpin, across both belts and north up the western edge to the basin.",
    legs: [{ street: "rad-hotel-1" }, { street: "rad-hotel-2" },
      { street: "outer-12", reverse: true }, { street: "outer-11", reverse: true }] },
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

export function pathLength(points: readonly CoursePoint[]): number {
  return points.slice(1).reduce((sum, point, i) => sum +
    Math.hypot(point.x - points[i]!.x, point.z - points[i]!.z), 0);
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

export const DISTRICT_WALLS = [...buildDistrictWalls(), ...boundaryWalls()];

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

// Deliberately coarse district massing, now covering the whole belt footprint
// rather than the original loop's box: an outer orbital across empty ground
// reads as nothing at all. Exclude every road's full clearance envelope before
// accepting a block; these are landmarks, not final buildings.
export const DISTRICT_BLOCKS: readonly { x: number; z: number; width: number; depth: number; height: number }[] =
  Array.from({ length: 21 * 21 }, (_, i) => ({
    x: -470 + (i % 21) * 47, z: -470 + Math.floor(i / 21) * 47,
    width: 26, depth: 28, height: 11 + (i * 7 % 6) * 8,
  }))
    // The margin exceeds the clearance below, so a block outside every nearby
    // street's box genuinely cannot conflict with one further away.
    .filter(block => streetsNear(block.x, block.z, 40).every(street => {
      const road = projectOntoPath(street.points, block.x, block.z);
      return road.distance > road.width / 2 + Math.hypot(block.width, block.depth) / 2 + 7;
    }));
