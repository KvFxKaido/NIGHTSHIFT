/**
 * Where a race starts: where you flashed. A generated race used to begin on
 * the grid on 1st Ave S whatever the flash — MC3 starts them where you are.
 * The flash pose is snapped to the lane it is on and carried across the page
 * transition as ?start=x,z,heading, so (world version, seed, start) is the
 * race's identity, which is what a playlist keeps, and the generator's origin
 * is the junction ahead of the flash rather than the grid's. Sim, not
 * renderer; pure; no clock, no randomness.
 */
import type { Street } from "./street-path.ts";
import type { RoadWorld } from "./road-world.ts";

export type StartPose = RoadWorld["start"];
export type Pose = { readonly x: number; readonly z: number; readonly heading: number };

export const START = {
  /** Metres right of the centreline: the lane the grid start uses. */
  laneOffset: 4.5,
  /** A flash farther than this from any street has no lane to start in. */
  reach: 20,
  /** Room kept to the junction ahead, so the countdown does not end inside it
   *  and the rival, 7 m ahead, is still on the same street. */
  clearance: 15,
} as const;

/** The car's forward for a heading: north is heading 0, forward (0, -1). */
export const forwardOf = (heading: number) => ({ x: -Math.sin(heading), z: -Math.cos(heading) });
/** The heading whose forward is the unit direction (dx, dz). */
export const headingOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** The car's right for a heading: east when facing north. */
export const rightOf = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) });

/**
 * Snap a pose to the right-hand lane of the nearest street, facing the way
 * along it nearest the pose's heading, at least `clearance` short of the
 * junction ahead. Null when no street is within reach. Snapping a snapped
 * pose gives it back, which is what lets the URL carry it.
 */
export function snapToLane(streets: readonly Street[], pose: Pose, height: (x: number, z: number) => number): StartPose | null {
  let best: { street: Street; i: number; t: number; d: number } | null = null;
  for (const street of streets) {
    const p = street.points;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / l2));
      const d = Math.hypot(pose.x - (a.x + dx * t), pose.z - (a.z + dz * t));
      if (!best || d < best.d) best = { street, i, t, d };
    }
  }
  if (!best || best.d > START.reach) return null;
  const p = best.street.points, a = p[best.i]!, b = p[best.i + 1]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const f = forwardOf(pose.heading);
  const ahead = f.x * u.x + f.z * u.z >= 0;
  const d = ahead ? u : { x: -u.x, z: -u.z };
  let foot = { x: a.x + (b.x - a.x) * best.t, z: a.z + (b.z - a.z) * best.t };
  // Road left to the street's end in the direction of travel.
  let room = ahead ? (1 - best.t) * len : best.t * len;
  if (ahead) for (let i = best.i + 1; i < p.length - 1; i++) room += Math.hypot(p[i + 1]!.x - p[i]!.x, p[i + 1]!.z - p[i]!.z);
  else for (let i = best.i - 1; i >= 0; i--) room += Math.hypot(p[i + 1]!.x - p[i]!.x, p[i + 1]!.z - p[i]!.z);
  if (room < START.clearance) {
    // Back up along the road until the junction ahead is clear.
    foot = { x: foot.x - d.x * (START.clearance - room), z: foot.z - d.z * (START.clearance - room) };
  }
  const heading = headingOf(d.x, d.z), right = rightOf(heading);
  const x = foot.x + right.x * START.laneOffset, z = foot.z + right.z * START.laneOffset;
  return { x, z, y: height(x, z), heading, pitch: 0 };
}

/** ?start=x,z,heading to a decimetre and a milliradian: enough to reproduce the snap. */
export function encodeStart(start: Pose): string {
  return `${start.x.toFixed(1)},${start.z.toFixed(1)},${start.heading.toFixed(3)}`;
}
export function decodeStart(text: string): Pose | null {
  const parts = text.split(",").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const [x, z, heading] = parts as [number, number, number];
  if (Math.abs(x) > 5000 || Math.abs(z) > 5000 || Math.abs(heading) > 2 * Math.PI) return null;
  return { x, z, heading };
}
