import type { CoursePoint, CourseProjection } from "./track.ts";
import type { StreetClass } from "./lanes.ts";

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
