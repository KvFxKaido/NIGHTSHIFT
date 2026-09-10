import type { CoursePoint } from "./track.ts";

interface Segment {
  x: number; z: number; y: number; dx: number; dz: number; dy: number;
  length2: number; radius: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
}
const profiles = new WeakMap<readonly CoursePoint[], Segment[]>();

/** Smooth a street's graded profile across bends. Each segment contributes a
 * continuous projected height, weighted by distance with a 4 m Gaussian and
 * a compact support beyond its kerb. All nearby segments contribute, so a
 * nearest-segment flip at the inside kerb cannot select a different height.
 * Junction grading still owns node heights. This does not change path distance,
 * routing, or the baseline circuit, only the district's vertical surface. */
export function streetSurfaceHeight(points: readonly CoursePoint[], x: number, z: number): number {
  let segments = profiles.get(points);
  if (!segments) {
    segments = points.slice(1).map((b, i) => {
      const a = points[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const radius = Math.max(a.width, b.width) / 2 + 8;
      return { x: a.x, z: a.z, y: a.y, dx, dz, dy: b.y - a.y, length2: dx * dx + dz * dz, radius,
        minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius,
        minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius };
    });
    profiles.set(points, segments);
  }
  let weight = 0, sum = 0;
  for (const segment of segments) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - segment.x) * segment.dx + (z - segment.z) * segment.dz) / segment.length2));
    const dx = x - segment.x - t * segment.dx, dz = z - segment.z - t * segment.dz;
    const distance2 = dx * dx + dz * dz;
    if (distance2 >= segment.radius * segment.radius) continue;
    const feather = Math.min(1, (segment.radius - Math.sqrt(distance2)) / 4);
    const w = Math.exp(-distance2 / 32) * feather * feather * (3 - 2 * feather);
    weight += w;
    sum += w * (segment.y + t * segment.dy);
  }
  if (!weight) throw new RangeError("Street surface queried outside its carriageway support");
  return sum / weight;
}

export interface RibbonSample extends CoursePoint { offsetX: number; offsetZ: number }

/** Subdivide the original mitred strip. Recomputing a mitre after subdivision
 * can fold the inside kerb backwards when the new segment is shorter than the
 * mitre's extension. Interpolate the original cross-sections instead. */
export function streetSurfaceSamples(points: readonly CoursePoint[]): RibbonSample[] {
  const sections = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    let ix = p.x - a.x, iz = p.z - a.z, ox = b.x - p.x, oz = b.z - p.z;
    const il = Math.hypot(ix, iz), ol = Math.hypot(ox, oz);
    if (il) { ix /= il; iz /= il; }
    if (ol) { ox /= ol; oz /= ol; }
    if (!i) { ix = ox; iz = oz; }
    if (i === points.length - 1) { ox = ix; oz = iz; }
    const length = Math.hypot(-iz - oz, ix + ox), nx = (-iz - oz) / length, nz = (ix + ox) / length;
    const reach = p.width / 2 / Math.max(0.5, -nx * oz + nz * ox);
    return { ...p, offsetX: nx * reach, offsetZ: nz * reach };
  });
  return sections.flatMap((a, i) => {
    const b = sections[i + 1];
    if (!b) return [a];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    return Array.from({ length: count }, (_, j) => ({ ...a, x: a.x + (b.x - a.x) * j / count,
      z: a.z + (b.z - a.z) * j / count, y: a.y + (b.y - a.y) * j / count,
      width: a.width + (b.width - a.width) * j / count,
      offsetX: a.offsetX + (b.offsetX - a.offsetX) * j / count,
      offsetZ: a.offsetZ + (b.offsetZ - a.offsetZ) * j / count }));
  });
}
