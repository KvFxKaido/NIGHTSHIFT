import type { CoursePoint } from "./track.ts";

/**
 * Where the lanes are. This is world geometry, so it belongs to the simulation
 * beside walls and surface height, not to whatever happens to want it first.
 * The renderer paints these lanes; traffic will drive them (GDD §12); rivals
 * will reason about them (§11). One authority; every consumer reads it.
 *
 * Nothing here reads a clock, a random number or a renderer. Every function is
 * a pure function of a street's own points.
 */

/** Which way along a street's point order a lane runs. */
export type LaneDirection = 1 | -1;

export interface Lane {
  readonly direction: LaneDirection;
  /** 0 is the lane against the centreline; higher numbers move toward the kerb. */
  readonly index: number;
}

/**
 * Two each way, on every street. The district's carriageways run 16 m to 22 m
 * and are all arterials, so the lane *count* is fixed and the lane *width*
 * breathes with the road. The alternative — a fixed 3.6 m lane — gives 16 m
 * streets one lane and 18 m streets two, which puts a lane drop in the middle
 * of the ring for no reason a driver could read.
 */
/** Road classes, and the carriageway each one is authored at. Class lives here
 *  rather than in district.ts because it is world geometry: how wide a road is
 *  and how many lanes it carries are the same fact stated twice. */
export const CARRIAGEWAY = { arterial: 24, collector: 17, local: 12, alley: 8 } as const;
export type StreetClass = keyof typeof CARRIAGEWAY;

/**
 * Lanes each way, by class.
 *
 * This was a fixed 2, and the reasoning above held while every carriageway was
 * 16-22 m and every street an arterial. A width hierarchy breaks that premise
 * on purpose: two each way in an 8 m alley is 1.4 m of tarmac per lane. So the
 * count follows the class, and the lane drop this avoids on the ring is exactly
 * the drop a driver DOES read turning off an arterial into an alley.
 */
export function lanesPerDirection(kind: StreetClass = "arterial"): number {
  return kind === "local" || kind === "alley" ? 1 : 2;
}

/** @deprecated Kept for the arterial case; prefer lanesPerDirection(kind). */
export const LANES_PER_DIRECTION = 2;
/** Half-width of the centre band. No lane starts inside this. */
export const CENTRE_MARGIN = 0.45;
/** Kerb-side margin outside the edge line: shoulder, not a lane. */
export const SHOULDER = 0.7;
/** Distance from the axis to each of the two centre lines. */
export const CENTRE_LINE_OFFSET = 0.28;

/** Width of one lane where the carriageway is `width` metres across. */
export function laneWidth(width: number, kind: StreetClass = "arterial"): number {
  return (width / 2 - CENTRE_MARGIN - SHOULDER) / lanesPerDirection(kind);
}

/**
 * Signed metres from the centreline to the middle of a lane. Positive is to the
 * right of the street's point order, and a lane's own direction already carries
 * that sign — so traffic keeps right whichever way it is pointing.
 */
export function laneOffset(width: number, lane: Lane, kind: StreetClass = "arterial"): number {
  return lane.direction * (CENTRE_MARGIN + laneWidth(width, kind) * (lane.index + 0.5));
}

export function lanes(kind: StreetClass = "arterial"): Lane[] {
  return ([1, -1] as const).flatMap(direction =>
    Array.from({ length: lanesPerDirection(kind) }, (_, index) => ({ direction, index })));
}

export type LaneMarkingKind = "centre" | "divider" | "edge";
export interface LaneMarking {
  readonly offset: number;
  readonly kind: LaneMarkingKind;
}

/**
 * The paint, derived from the lanes rather than guessed alongside them. A
 * divider sits on the boundary between two lanes going the same way; an edge
 * line closes the outermost lane, with the shoulder beyond it.
 */
export function laneMarkings(width: number, kind: StreetClass = "arterial"): LaneMarking[] {
  const per = lanesPerDirection(kind);
  const lane = laneWidth(width, kind);
  return ([1, -1] as const).flatMap(side => [
    { offset: side * CENTRE_LINE_OFFSET, kind: "centre" as const },
    // A single-lane-each-way street has no divider to draw, which is what makes
    // an alley read as an alley rather than as a narrow road.
    ...Array.from({ length: per - 1 }, (_, i) => ({
      offset: side * (CENTRE_MARGIN + lane * (i + 1)), kind: "divider" as const,
    })),
    { offset: side * (CENTRE_MARGIN + lane * per), kind: "edge" as const },
  ]);
}

export function pathLength(points: readonly CoursePoint[]): number {
  return points.slice(1).reduce((sum, point, i) => sum +
    Math.hypot(point.x - points[i]!.x, point.z - points[i]!.z), 0);
}

/** One position along a centreline, spaced by arc length rather than by point. */
export interface PathSample {
  x: number;
  z: number;
  /** Unit tangent, pointing along the point order. */
  dirX: number;
  dirZ: number;
  width: number;
  /** Metres travelled from the first point. */
  distance: number;
}

/**
 * Walk a centreline at a fixed spacing. Authored points are spaced by whatever
 * the curve needed; paint, street furniture and traffic all need a rhythm
 * measured in metres instead.
 */
export function pathSamples(points: readonly CoursePoint[], step: number): PathSample[] {
  const samples: PathSample[] = [];
  let carry = 0, travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    for (let t = carry; t < length; t += step) {
      const fraction = t / length;
      samples.push({
        x: a.x + dx * fraction, z: a.z + dz * fraction, dirX: dx / length, dirZ: dz / length,
        width: a.width + (b.width - a.width) * fraction, distance: travelled + t,
      });
    }
    carry = ((carry - length) % step + step) % step;
    travelled += length;
  }
  return samples;
}

/** Unit direction of the segment leaving a vertex, or entering the last one. */
function segmentDirection(points: readonly CoursePoint[], index: number): { x: number; z: number } {
  const a = points[Math.min(index, points.length - 2)]!;
  const b = points[Math.min(index + 1, points.length - 1)]!;
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

/**
 * A lane's own position at one authored vertex, mitered.
 *
 * Offsetting by the raw normal of whichever segment you happen to be on makes
 * the lane jump sideways at every corner — measured at up to 2.79 m on the ring
 * hotel bend, most of a lane width. Mitering the two adjacent normals, exactly
 * as the road ribbon does, makes the offset polyline continuous.
 */
/**
 * The width a street's lanes are laid out to: its narrowest point.
 *
 * Not the width at each sample. A carriageway flares into its junctions — which
 * is right for the asphalt and is how a real junction looks — but lanes that
 * breathe with it wander in and out laterally, and on a street tapering 22 m at
 * the ends to 8 m in the middle a lane came out 27% shorter than its own
 * centreline. Taking the narrowest point keeps the lines straight through the
 * flare and guarantees they fit everywhere along the street.
 */
export function carriagewayWidth(points: readonly CoursePoint[]): number {
  let narrowest = Infinity;
  for (const point of points) narrowest = Math.min(narrowest, point.width);
  return narrowest;
}

function laneVertex(points: readonly CoursePoint[], lane: Lane, index: number,
  kind: StreetClass, carriageway: number): { x: number; z: number } {
  const point = points[index]!;
  const incoming = segmentDirection(points, Math.max(0, index - 1));
  const outgoing = segmentDirection(points, index);
  let normalX = -incoming.z - outgoing.z, normalZ = incoming.x + outgoing.x;
  const length = Math.hypot(normalX, normalZ) || 1;
  normalX /= length;
  normalZ /= length;
  // Clamped like the road's own miter: a hairpin must not throw the offset to
  // infinity, and the ribbon under it is clamped the same way.
  const miter = 1 / Math.max(0.5, normalX * -outgoing.z + normalZ * outgoing.x);
  const offset = laneOffset(carriageway, lane, kind) * miter;
  return { x: point.x + normalX * offset, z: point.z + normalZ * offset };
}

/** The centreline at an exact arc length, clamped to the ends. */
export function pathPoint(points: readonly CoursePoint[], distance: number): PathSample {
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    if (distance > travelled + length && i < points.length - 2) { travelled += length; continue; }
    const fraction = Math.max(0, Math.min(1, (distance - travelled) / length));
    return {
      x: a.x + dx * fraction, z: a.z + dz * fraction, dirX: dx / length, dirZ: dz / length,
      width: a.width + (b.width - a.width) * fraction, distance,
    };
  }
  const last = points.at(-1)!;
  return { x: last.x, z: last.z, dirX: 0, dirZ: -1, width: last.width, distance };
}

/** A vehicle's placement in a lane: what traffic and a rival both need. */
export interface LanePose {
  x: number;
  y: number;
  z: number;
  /** Simulation heading: forward is (-sin heading, -cos heading). */
  heading: number;
}

/** A lane's own polyline, and the arc length reached at each of its vertices. */
export interface LaneGeometry {
  readonly vertices: readonly { readonly x: number; readonly z: number }[];
  /** Cumulative metres at each vertex; the last entry is the lane's length. */
  readonly cumulative: readonly number[];
}

/** Memoised per (points, lane, class). A pure function of its inputs, so this is
 *  a cache and not state: it cannot make the simulation non-deterministic. */
const laneCache = new WeakMap<readonly CoursePoint[], Map<string, LaneGeometry>>();

export function laneGeometry(points: readonly CoursePoint[], lane: Lane,
  kind: StreetClass = "arterial"): LaneGeometry {
  let byLane = laneCache.get(points);
  if (!byLane) laneCache.set(points, byLane = new Map());
  const key = `${lane.direction}|${lane.index}|${kind}`;
  const cached = byLane.get(key);
  if (cached) return cached;
  const carriageway = carriagewayWidth(points);
  const vertices = points.map((_, index) => laneVertex(points, lane, index, kind, carriageway));
  const cumulative: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!, b = vertices[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const geometry: LaneGeometry = { vertices, cumulative };
  byLane.set(key, geometry);
  return geometry;
}

/** How far a lane runs along ITS OWN path, which is not its street's length. */
export function laneLength(points: readonly CoursePoint[], lane: Lane,
  kind: StreetClass = "arterial"): number {
  const { cumulative } = laneGeometry(points, lane, kind);
  return cumulative[cumulative.length - 1]!;
}

/**
 * Where a lane is, `distance` metres along ITS OWN path, measured in that lane's
 * own direction of travel. A car driving direction -1 still counts upward from
 * where it entered, so a follower only ever has to add to its odometer.
 *
 * The parameter was the street's centreline arc length until it was
 * reparameterised. An offset lane is longer or shorter than the line it is
 * measured from — +/-4.62% on this district's hairpin — so a vehicle advancing
 * its odometer at its own speed did not travel that far on the ground, and the
 * error had opposite sign in the inner and outer lane of the same curve. Speed
 * is now true in every lane.
 *
 * The cost is that two lanes of one street at equal `distance` are no longer
 * exactly abreast through a bend, which is correct: they have not gone equally
 * far. Nothing may assume otherwise.
 */
export function lanePose(points: readonly CoursePoint[], lane: Lane, distance: number,
  surfaceHeight: (x: number, z: number) => number, kind: StreetClass = "arterial"): LanePose {
  const { vertices, cumulative } = laneGeometry(points, lane, kind);
  const total = cumulative[cumulative.length - 1]!;
  const along = Math.max(0, Math.min(total, lane.direction === 1 ? distance : total - distance));
  // Locate on the LANE's own arc length. Using the centreline's segment fraction
  // here is what made the parameter mean different distances in different lanes.
  let index = 0;
  while (index < cumulative.length - 2 && cumulative[index + 1]! <= along) index++;
  const span = cumulative[index + 1]! - cumulative[index]!;
  const fraction = span > 1e-9 ? (along - cumulative[index]!) / span : 0;
  const from = vertices[index]!, to = vertices[index + 1]!;
  const x = from.x + (to.x - from.x) * fraction;
  const z = from.z + (to.z - from.z) * fraction;
  const runX = (to.x - from.x) * lane.direction, runZ = (to.z - from.z) * lane.direction;
  return { x, y: surfaceHeight(x, z), z, heading: Math.atan2(-runX, -runZ) };
}
