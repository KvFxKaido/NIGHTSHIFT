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
 * Where a lane is, `distance` metres along that lane's own direction of travel.
 * A car driving direction -1 still counts upward from where it entered, so a
 * follower only ever has to add to its odometer.
 */
export function lanePose(points: readonly CoursePoint[], lane: Lane, distance: number,
  surfaceHeight: (x: number, z: number) => number): LanePose {
  const along = lane.direction === 1 ? distance : pathLength(points) - distance;
  const sample = pathPoint(points, along);
  // Right of the point order. Combined with the sign already in laneOffset,
  // this puts every lane on the right of its own direction of travel.
  const rightX = -sample.dirZ, rightZ = sample.dirX;
  const offset = laneOffset(sample.width, lane);
  const x = sample.x + rightX * offset, z = sample.z + rightZ * offset;
  const dirX = sample.dirX * lane.direction, dirZ = sample.dirZ * lane.direction;
  return { x, y: surfaceHeight(x, z), z, heading: Math.atan2(-dirX, -dirZ) };
}
