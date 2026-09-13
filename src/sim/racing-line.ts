/**
 * A racing line for a rival's route (2026-09-13): a smoothed path through the
 * road the route drives, inside its width, instead of the centreline.
 *
 * Recorded laps showed where the rival loses once its commitment matched the
 * player's: where the player widens a corner. At T2 on Ridge Circuit the
 * player's path had a radius of 39-41 m to the centreline's 26, at the Jog 25-26
 * to 16, at T9 83-84 to 37, and the rival was 27-42% slower there. The rival
 * plans corner speed from the radius of whatever line it follows, so a smoother
 * line is a faster rival without touching how hard it drives.
 *
 * The line: every sample is pulled toward the point that smooths the curve
 * through its neighbours (a fourth-difference stencil), clamped to the road,
 * solved coarse to fine. That stencil also shortens the path, so the line leans
 * to the inside of a corner as well as widening it. On the rival's driven laps
 * T2 went from the centreline's 26 m to 32 m, the Jog 16 to 20 and T9 37 to 53,
 * against the player's 39-41, 25-26 and 83-84. Deterministic: fixed sweeps, no
 * randomness, the same route gives the same line.
 *
 * Measured on Ridge Circuit, flying laps with no traffic: Full 83.1 -> 78.5 s,
 * East 63.1 -> 59.8 s, Ridge 51.5 -> 48.6 s, no grass, with the line kept 2.5 m
 * inside the edge lines (`edgeMargin` 4.5 on a 14 m track). 4.0 to 5.0 were all
 * clean; 3.5 spun it out of T9's exit and 2.2 put it on the grass at the Drop.
 *
 * A true racing line was tried and is not shipped. Coulom's K1999 method (each
 * point takes the curvature its neighbours interpolate to) draws the player's
 * corners almost exactly, T2 at 38 m and the Jog at 27, and laps Full in
 * 69-75 s. The rival cannot hold it. It tracks the line to within half a metre
 * on average, but that line sits near an edge for long stretches and through
 * braking, and the 2-3 m of error the rival carries braking into a corner, and
 * 5-6 m where T9 tightens onto the main straight, put wheels on the grass on
 * every setting tried: the line 2.5 to 4.8 m from the centre, corner speed 0.60
 * to 0.76, steering lookahead, a braking budget shared with cornering, and
 * curvature feedforward (fastest, and least clean). How the rival brakes and
 * turns at once is the limit now, not the line.
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
  edgeMargin: 4.5,
  /** Metres either side a sample's road direction is averaged over, so a sharp street corner turns its normal gradually. */
  tangentReach: 8,
  /** Samples per coarse step, coarsest first, and the relaxation sweeps at each. */
  levels: [16, 8, 4, 2, 1],
  sweeps: 400,
} as const;

export interface RacingLineOptions {
  readonly spacing: number;
  readonly edgeMargin: number;
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

/** Offsets from the centre, positive to the right of travel, for every sample. */
export function racingLineOffsets(samples: readonly Pick<Sample, "x" | "z" | "width">[], options: RacingLineOptions = RACING_LINE): { offsets: number[]; normals: { x: number; z: number }[] } {
  const n = samples.length;
  const reach = Math.max(1, Math.round(options.tangentReach / options.spacing));
  const normals = samples.map((_, i) => {
    const a = samples[Math.max(0, i - reach)]!, b = samples[Math.min(n - 1, i + reach)]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
  });
  const limit = samples.map(s => Math.max(0, s.width / 2 - options.edgeMargin));
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
        const tx = (-px(k - 2) + 4 * px(k - 1) + 4 * px(k + 1) - px(k + 2)) / 6;
        const tz = (-pz(k - 2) + 4 * pz(k - 1) + 4 * pz(k + 1) - pz(k + 2)) / 6;
        const wanted = (tx - c.x) * normal.x + (tz - c.z) * normal.z;
        w[i] = Math.max(-limit[i]!, Math.min(limit[i]!, w[i]! + (wanted - w[i]!) * 0.5));
      }
    }
    // Carry this level's offsets to the samples between its nodes.
    for (let k = 0; k < nodes.length - 1; k++) {
      const i = nodes[k]!, j = nodes[k + 1]!;
      for (let m = i + 1; m < j; m++) {
        const t = (m - i) / (j - i);
        w[m] = Math.max(-limit[m]!, Math.min(limit[m]!, w[i]! + (w[j]! - w[i]!) * t));
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
