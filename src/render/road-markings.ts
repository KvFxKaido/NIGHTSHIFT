import { laneMarkings, type LaneMarkingKind } from "../sim/lanes.ts";
import { projectOntoPath, type Street } from "../sim/street-path.ts";

export interface RoadPaint {
  ax: number; az: number; bx: number; bz: number;
  color: "yellow" | "white";
  kind: LaneMarkingKind;
  streetId: string;
}

interface PaintPoint { x: number; z: number }

/** Offset the whole polyline before measuring paint along it. Offsetting each
 * two-metre sample by its segment normal made a corner jump sideways by up to
 * 20 metres. Outside bends use the road buffer's round join; inside bends meet
 * at the intersection of their offset rails. This affects paint only, not lanes. */
function paintPath(street: Street, rank: number): PaintPoint[] {
  const points = street.points.filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1]!.x, p.z - all[i - 1]!.z) > 1e-6);
  if (points.length < 2) return [];
  const closed = Math.hypot(points[0]!.x - points.at(-1)!.x, points[0]!.z - points.at(-1)!.z) < 1e-6;
  if (closed) points.pop();
  const result: PaintPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, prev = points[(i - 1 + points.length) % points.length]!, next = points[(i + 1) % points.length]!;
    let ix = p.x - prev.x, iz = p.z - prev.z, ox = next.x - p.x, oz = next.z - p.z;
    if (!closed && !i) { ix = ox; iz = oz; }
    if (!closed && i === points.length - 1) { ox = ix; oz = iz; }
    const il = Math.hypot(ix, iz), ol = Math.hypot(ox, oz);
    ix /= il; iz /= il; ox /= ol; oz /= ol;
    const mark = laneMarkings(p.width, street.kind)[rank]!;
    const offset = mark.kind === "edge" ? Math.sign(mark.offset) * p.width / 2 : mark.offset;
    const turn = Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz);
    if (turn * offset < -1e-6) {
      const start = Math.atan2(ix * offset, -iz * offset);
      const steps = Math.max(1, Math.ceil(Math.abs(turn * offset) / 1.5));
      for (let step = 0; step <= steps; step++) {
        const angle = start + turn * step / steps;
        result.push({ x: p.x + Math.cos(angle) * Math.abs(offset), z: p.z + Math.sin(angle) * Math.abs(offset) });
      }
    } else {
      const nx = -iz - oz, nz = ix + ox, length = Math.hypot(nx, nz);
      const denominator = length ? (nx * -oz + nz * ox) / length : 1;
      const scale = offset / Math.max(.5, denominator);
      result.push({ x: p.x + (length ? nx / length : -oz) * scale,
        z: p.z + (length ? nz / length : ox) * scale });
    }
  }
  if (closed && result.length) result.push(result[0]!);
  return result;
}

/** Continuous rails with measured dash spacing, clipped before any crossing
 * carriageway, including crossings in the middle of unsplit source roads. */
export function roadMarkings(streets: readonly Street[], options: { shoulderWidth?: number } = {}): RoadPaint[] {
  const shoulder = options.shoulderWidth ?? 0;
  const result: RoadPaint[] = [];
  const bounds = streets.map(street => ({ street,
    minX: Math.min(...street.points.map(p => p.x - p.width / 2)) - shoulder - 3,
    maxX: Math.max(...street.points.map(p => p.x + p.width / 2)) + shoulder + 3,
    minZ: Math.min(...street.points.map(p => p.z - p.width / 2)) - shoulder - 3,
    maxZ: Math.max(...street.points.map(p => p.z + p.width / 2)) + shoulder + 3,
  }));
  for (const street of streets) {
    if (street.kind === "alley") continue;
    const own = bounds.find(b => b.street === street)!;
    const neighbours = bounds.filter(b => b.street !== street && b.minX <= own.maxX &&
      b.maxX >= own.minX && b.minZ <= own.maxZ && b.maxZ >= own.minZ);
    const clear = (x: number, z: number) => !neighbours.some(b => {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
      const on = projectOntoPath(b.street.points, x, z);
      const first = b.street.points[0]!, last = b.street.points.at(-1)!;
      const closed = Math.hypot(first.x - last.x, first.z - last.z) < 1e-6;
      // An approach ends at the junction axis. A circular endpoint clearance
      // erased the opposite shoulder at every T, even though no street opens
      // through that side. Keep a small cap, not half a road-width of overreach.
      if (!closed && on.segmentIndex === 0 && (x - first.x) * on.ux + (z - first.z) * on.uz < -1.5) return false;
      if (!closed && on.segmentIndex === b.street.points.length - 2 && (x - last.x) * on.ux + (z - last.z) * on.uz > 1.5) return false;
      return on.distance < on.width / 2 + shoulder + 1.5;
    });
    for (const [rank, mark] of laneMarkings(street.points[0]!.width, street.kind).entries()) {
      const points = paintPath(street, rank);
      const lengths = points.slice(1).map((b, i) => Math.hypot(b.x - points[i]!.x, b.z - points[i]!.z));
      const total = lengths.reduce((a, b) => a + b, 0);
      const inset = points.length > 1 && Math.hypot(points[0]!.x - points.at(-1)!.x, points[0]!.z - points.at(-1)!.z) < 1e-6 ? 0 : 2;
      let along = 0;
      for (let i = 0; i < lengths.length; i++) {
        const a = points[i]!, b = points[i + 1]!, length = lengths[i]!;
        const end = Math.min(length, total - inset - along);
        for (let d = Math.max(0, inset - along); d < end - 1e-6;) {
          // Snap boundary roundoff so a sub-ULP "step to the next dash" cannot
          // leave d unchanged on a long road.
          const phase = (Math.round(((along + d) % 12) * 1e6) / 1e6) % 12;
          const dashLeft = phase < 4 - 1e-6 ? 4 - phase : 12 - phase;
          const next = Math.min(end, d + 2, d + (mark.kind === "divider" ? dashLeft : 2));
          const visible = mark.kind !== "divider" || phase < 4 - 1e-6;
          const ax = a.x + (b.x - a.x) * d / length, az = a.z + (b.z - a.z) * d / length;
          const bx = a.x + (b.x - a.x) * next / length, bz = a.z + (b.z - a.z) * next / length;
          d = next;
          if (!visible) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (!clear(ax, az) || !clear(bx, bz) || !clear(mx, mz)) continue;
          // Tight inside corners can fold an offset back into its own road.
          // An edge inside another part of the same carriageway is not an edge.
          if (mark.kind === "edge") {
            const own = projectOntoPath(street.points, mx, mz);
            if (own.distance < own.width / 2 - .25) continue;
          }
          result.push({ ax, az, bx, bz, color: mark.kind === "centre" ? "yellow" : "white", kind: mark.kind, streetId: street.id });
        }
        along += length;
      }
    }
  }
  return result;
}
