/**
 * A racing line for a rival's route (2026-09-13): the path a driver takes
 * through the road, using its width, instead of the centreline.
 *
 * Recorded laps showed where the rival loses once its commitment matched the
 * player's: where the player widens a corner. At T2 on Ridge Circuit the
 * player's path had a radius of 39-41 m to the centreline's 26, at the Jog 25-26
 * to 16, at T9 83-84 to 37. The rival plans corner speed from the radius of
 * whatever line it follows, so a wider line is a faster rival without touching
 * how hard it drives.
 *
 * The line is Coulom's K1999: every sample moves across the road until its
 * curvature is the one its neighbours' curvatures interpolate to, so curvature
 * spreads evenly through a corner, which is the widest arc the road allows.
 * Solved coarse to fine, clamped to the road, with the ends fixed at the centre.
 * Deterministic: fixed sweeps, no randomness, the same route gives the same line.
 *
 * It is kept `edgeMargin` from the edges and `outsideMargin` further from the
 * outside of a bend, where a rival that runs wide goes. Driven with the rival's
 * braking-while-turning plan and steering feedforward (`rival.ts`), flying laps
 * with no traffic over three-lap races: Full 72.8 s (the player's best 72.4),
 * East 55.2 s, Ridge 46.3 s, on no grass. Every neighbour of those settings was clean too: edge
 * margin 2.2 to 3.0, outside margin 2.0 to 3.5, feedforward 0.7 to 0.9, the
 * friction share 0.8 to 1.0, corner speed 0.80. Taking one ingredient out at a
 * time, over three laps: without the steering feedforward Full and East went
 * onto the grass, and without the outside margin East did; without the braking
 * plan the laps stayed clean (it is what kept a line 2.2 m from the edges clean).
 *
 * History, because an earlier account here was wrong. The first line shipped
 * was a fourth-difference smoothing, 2.5 m from the edges (Full 78.5 s). A K1999
 * line was then measured as leaving the road on every setting and not shipped;
 * that measurement drew a line through a route that already carried one, so the
 * offsets doubled and the rival was driving up to 5 m from where the line should
 * have been. Measured once, the same K1999 line at 2.5 m was clean (Full 78.3 s),
 * and what kept a wider one off the grass was the steering and braking above.
 *
 * Not in the city. On Sound to Sky with traffic every line tried hit traffic:
 * the whole road (143 ticks of contact and 161.6 s, against the centreline's
 * none and 143.1 s), and lines kept right of the centre (1,585-1,862 ticks: the
 * rival sat in the traffic's own lane and ran into it). A street line needs to
 * know the lanes.
 *
 * The route's `along` becomes the line's own chord length and its gates move to
 * the line's samples at the same place, so nothing compares a line distance with
 * a street's (the trap `lanePose` taught: distances on different paths are not
 * abreast). `lateral` records each sample's offset from the road's centre, so
 * the rival's passing and blocking stay on the road.
 */
import type { RivalDefinition } from "./rival.ts";
import type { CoursePoint } from "./track.ts";

export const RACING_LINE = {
  /** Metres between the line's samples. */
  spacing: 4,
  /** Metres kept between the line and the road edge. */
  edgeMargin: 2.6,
  /** Extra metres kept from the edge on the outside of a bend. */
  outsideMargin: 2.5,
  /** Metres either side a sample's road direction is averaged over, so a sharp street corner turns its normal gradually. */
  tangentReach: 8,
  /** Samples per coarse step, coarsest first, and the sweeps at each. The line settles within 100. */
  levels: [16, 8, 4, 2, 1],
  sweeps: 100,
} as const;

export interface RacingLineOptions {
  readonly spacing: number;
  readonly edgeMargin: number;
  readonly outsideMargin: number;
  readonly tangentReach: number;
  readonly levels: readonly number[];
  readonly sweeps: number;
}

interface Sample { x: number; z: number; y: number; width: number; zone: CoursePoint["zone"] }

/** Dense samples along the route, and where each original point landed among them. */
function resample(points: readonly CoursePoint[], spacing: number): { samples: Sample[]; index: number[] } {
  const samples: Sample[] = [];
  const index: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.ceil(length / spacing));
    index.push(samples.length);
    for (let k = 0; k < count; k++) {
      const t = k / count;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t,
        width: a.width + (b.width - a.width) * t, zone: a.zone });
    }
  }
  const last = points.at(-1)!;
  index.push(samples.length);
  samples.push({ x: last.x, z: last.z, y: last.y, width: last.width, zone: last.zone });
  return { samples, index };
}

/** Signed Menger curvature through three points, positive for a right-hand bend. */
function curvature(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ac = Math.hypot(cx - ax, cz - az);
  const denominator = ab * bc * ac;
  return denominator < 1e-12 ? 0 : 2 * ((bx - ax) * (cz - bz) - (bz - az) * (cx - bx)) / denominator;
}

/** Offsets from the centre, positive to the right of travel, for every sample. */
export function racingLineOffsets(samples: readonly Pick<Sample, "x" | "z" | "width">[], options: RacingLineOptions = RACING_LINE): { offsets: number[]; normals: { x: number; z: number }[] } {
  const n = samples.length;
  const reach = Math.max(1, Math.round(options.tangentReach / options.spacing));
  const normals = samples.map((_, i) => {
    const a = samples[Math.max(0, i - reach)]!, b = samples[Math.min(n - 1, i + reach)]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
  });
  // How far each sample may go right and left: the road less the margins, and
  // less again on the outside of the road's own bend (all of it from a 300 m radius in).
  const right: number[] = [], left: number[] = [];
  for (let i = 0; i < n; i++) {
    const limit = Math.max(0, samples[i]!.width / 2 - options.edgeMargin);
    const a = samples[Math.max(0, i - reach * 2)]!, b = samples[i]!, c = samples[Math.min(n - 1, i + reach * 2)]!;
    const bend = curvature(a.x, a.z, b.x, b.z, c.x, c.z);
    const outside = Math.max(0, limit - options.outsideMargin * Math.min(1, Math.abs(bend) * 300));
    // A right-hand bend has its outside on the left.
    right.push(bend < 0 ? outside : limit);
    left.push(bend > 0 ? outside : limit);
  }
  const w = new Array<number>(n).fill(0);
  for (const stride of options.levels) {
    if (n < stride * 5) continue;
    // Samples on this level: every `stride`-th, the ends always fixed at the centre.
    const nodes: number[] = [];
    for (let i = 0; i < n; i += stride) nodes.push(i);
    if (nodes.at(-1) !== n - 1) nodes.push(n - 1);
    const px = (k: number) => samples[nodes[k]!]!.x + normals[nodes[k]!]!.x * w[nodes[k]!]!;
    const pz = (k: number) => samples[nodes[k]!]!.z + normals[nodes[k]!]!.z * w[nodes[k]!]!;
    for (let sweep = 0; sweep < options.sweeps; sweep++) {
      for (let k = 2; k < nodes.length - 2; k++) {
        const i = nodes[k]!, c = samples[i]!, normal = normals[i]!;
        // The curvature this node's neighbours ask of it, weighted by distance.
        const before = curvature(px(k - 2), pz(k - 2), px(k - 1), pz(k - 1), px(k), pz(k));
        const after = curvature(px(k), pz(k), px(k + 1), pz(k + 1), px(k + 2), pz(k + 2));
        const toPrevious = Math.hypot(px(k) - px(k - 1), pz(k) - pz(k - 1)), toNext = Math.hypot(px(k + 1) - px(k), pz(k + 1) - pz(k));
        const wanted = (before * toNext + after * toPrevious) / Math.max(1e-9, toPrevious + toNext);
        // Move across the road by how far off that curvature is, through its local slope.
        const here = curvature(px(k - 1), pz(k - 1), px(k), pz(k), px(k + 1), pz(k + 1));
        const nudge = 0.01;
        const moved = curvature(px(k - 1), pz(k - 1), c.x + normal.x * (w[i]! + nudge), c.z + normal.z * (w[i]! + nudge), px(k + 1), pz(k + 1));
        const slope = (moved - here) / nudge;
        if (Math.abs(slope) < 1e-9) continue;
        w[i] = Math.max(-left[i]!, Math.min(right[i]!, w[i]! + (wanted - here) / slope * 0.5));
      }
    }
    // Carry this level's offsets to the samples between its nodes.
    for (let k = 0; k < nodes.length - 1; k++) {
      const i = nodes[k]!, j = nodes[k + 1]!;
      for (let m = i + 1; m < j; m++) {
        const t = (m - i) / (j - i);
        w[m] = Math.max(-left[m]!, Math.min(right[m]!, w[i]! + (w[j]! - w[i]!) * t));
      }
    }
  }
  return { offsets: w, normals };
}

/** The same route driven on its racing line. */
export function withRacingLine(route: RivalDefinition, options: RacingLineOptions = RACING_LINE): RivalDefinition {
  const { samples, index } = resample(route.points, options.spacing);
  const { offsets, normals } = racingLineOffsets(samples, options);
  const points: CoursePoint[] = samples.map((s, i) => ({ x: s.x + normals[i]!.x * offsets[i]!, z: s.z + normals[i]!.z * offsets[i]!,
    y: s.y, width: s.width, zone: s.zone }));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const gates = route.gates.map(gate => {
    const original = route.along.findIndex(a => Math.abs(a - gate) < 1e-6);
    if (original < 0) throw new RangeError(`${route.id}: gate at ${gate} m is not a point of the route`);
    return along[index[original]!]!;
  });
  return { ...route, points, along, gates, lateral: offsets };
}
