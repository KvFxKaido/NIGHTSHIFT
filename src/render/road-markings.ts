import { laneMarkings, pathLength, pathPoint } from "../sim/lanes.ts";
import { projectOntoPath, type Street } from "../sim/street-path.ts";

export interface RoadPaint {
  ax: number; az: number; bx: number; bz: number;
  color: "yellow" | "white";
}

/** Short strips follow bends and stop before any other carriageway, including
 * crossings in the middle of a source road rather than just its endpoints. */
export function roadMarkings(streets: readonly Street[]): RoadPaint[] {
  const result: RoadPaint[] = [];
  const bounds = streets.map(street => ({ street,
    minX: Math.min(...street.points.map(p => p.x - p.width / 2)) - 3,
    maxX: Math.max(...street.points.map(p => p.x + p.width / 2)) + 3,
    minZ: Math.min(...street.points.map(p => p.z - p.width / 2)) - 3,
    maxZ: Math.max(...street.points.map(p => p.z + p.width / 2)) + 3,
  }));
  for (const street of streets) {
    if (street.kind === "alley") continue;
    const own = bounds.find(b => b.street === street)!;
    const neighbours = bounds.filter(b => b.street !== street && b.minX <= own.maxX &&
      b.maxX >= own.minX && b.minZ <= own.maxZ && b.maxZ >= own.minZ);
    const clear = (x: number, z: number) => !neighbours.some(b => {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
      const on = projectOntoPath(b.street.points, x, z);
      return on.distance < on.width / 2 + 1.5;
    });
    const length = pathLength(street.points);
    for (let distance = 2; distance < length - 2; distance += 2) {
      const a = pathPoint(street.points, distance);
      const b = pathPoint(street.points, Math.min(distance + 2, length - 2));
      for (const mark of laneMarkings(a.width, street.kind)) {
        if (mark.kind === "edge" || (mark.kind === "divider" && distance % 12 >= 4)) continue;
        const ax = a.x - a.dirZ * mark.offset, az = a.z + a.dirX * mark.offset;
        const bx = b.x - b.dirZ * mark.offset, bz = b.z + b.dirX * mark.offset;
        if (Math.hypot(bx - ax, bz - az) < 0.001 || !clear(ax, az) || !clear(bx, bz) ||
          !clear((ax + bx) / 2, (az + bz) / 2)) continue;
        result.push({ ax, az, bx, bz, color: mark.kind === "centre" ? "yellow" : "white" });
      }
    }
  }
  return result;
}
