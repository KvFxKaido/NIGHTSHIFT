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
export const LANES_PER_DIRECTION = 2;
/** Half-width of the centre band. No lane starts inside this. */
export const CENTRE_MARGIN = 0.45;
/** Kerb-side margin outside the edge line: shoulder, not a lane. */
export const SHOULDER = 0.7;
/** Distance from the axis to each of the two centre lines. */
export const CENTRE_LINE_OFFSET = 0.28;

/** Width of one lane where the carriageway is `width` metres across. */
export function laneWidth(width: number): number {
  return (width / 2 - CENTRE_MARGIN - SHOULDER) / LANES_PER_DIRECTION;
}

/**
 * Signed metres from the centreline to the middle of a lane. Positive is to the
 * right of the street's point order, and a lane's own direction already carries
 * that sign — so traffic keeps right whichever way it is pointing.
 */
export function laneOffset(width: number, lane: Lane): number {
  return lane.direction * (CENTRE_MARGIN + laneWidth(width) * (lane.index + 0.5));
}

export function lanes(): Lane[] {
  return ([1, -1] as const).flatMap(direction =>
    Array.from({ length: LANES_PER_DIRECTION }, (_, index) => ({ direction, index })));
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
export function laneMarkings(width: number): LaneMarking[] {
  const lane = laneWidth(width);
  return ([1, -1] as const).flatMap(side => [
    { offset: side * CENTRE_LINE_OFFSET, kind: "centre" as const },
    ...Array.from({ length: LANES_PER_DIRECTION - 1 }, (_, i) => ({
      offset: side * (CENTRE_MARGIN + lane * (i + 1)), kind: "divider" as const,
    })),
    { offset: side * (CENTRE_MARGIN + lane * LANES_PER_DIRECTION), kind: "edge" as const },
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

/** The segment a distance falls in, and how far along it. */
function locate(points: readonly CoursePoint[], distance: number): { index: number; fraction: number } {
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.z - points[i]!.z);
    if (length < 1e-6) continue;
    if (distance > travelled + length && i < points.length - 2) { travelled += length; continue; }
    return { index: i, fraction: Math.max(0, Math.min(1, (distance - travelled) / length)) };
  }
  return { index: Math.max(0, points.length - 2), fraction: 1 };
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
function laneVertex(points: readonly CoursePoint[], lane: Lane, index: number): { x: number; z: number } {
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
  const offset = laneOffset(point.width, lane) * miter;
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

/**
 * Where a lane is, `distance` metres along the street's centreline, measured in
 * that lane's own direction of travel. A car driving direction -1 still counts
 * upward from where it entered, so a follower only ever has to add to its
 * odometer.
 *
 * The parameter is centreline arc length, not the lane's own. Around a bend an
 * offset lane is longer or shorter than the line it is measured from — up to
 * 2.7% on this district's longest curve. That is a constant scale on speed
 * through a curve, and it keeps the lanes of one street abreast at equal
 * `distance`, but it is a real difference and is stated rather than left to be
 * found later.
 */
export function lanePose(points: readonly CoursePoint[], lane: Lane, distance: number,
  surfaceHeight: (x: number, z: number) => number): LanePose {
  const along = lane.direction === 1 ? distance : pathLength(points) - distance;
  // Interpolate along the lane's own mitered polyline rather than offsetting a
  // centreline sample sideways: the latter is discontinuous at every vertex.
  const { index, fraction } = locate(points, along);
  const from = laneVertex(points, lane, index);
  const to = laneVertex(points, lane, index + 1);
  const x = from.x + (to.x - from.x) * fraction;
  const z = from.z + (to.z - from.z) * fraction;
  const runX = (to.x - from.x) * lane.direction, runZ = (to.z - from.z) * lane.direction;
  return { x, y: surfaceHeight(x, z), z, heading: Math.atan2(-runX, -runZ) };
}
