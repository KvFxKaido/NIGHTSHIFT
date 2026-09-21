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

/**
 * A street's corners (2026-09-20): a right angle or a hairpin at ONE vertex of a
 * centreline, where a circuit's tightest bend is a 16 m arc. Drawn through Uptown
 * Circuit with RACING_LINE, a corner came out as a 23 m arc on one lap and a 4 m
 * spike on the next, by where the solver's coarse nodes (64 m apart, and a lap is
 * not a multiple of that) happened to land on it. The rival orbited each spike at
 * full lock, and at the hairpin its place on the route ran backwards: over three
 * laps alone, 1:42.12, 1:34.62 and 1:39.93, and with tighter margins a first lap
 * of 1:46.88 with 24 resets. It read as "lap 1 is broken"; lap 3 was too, and the
 * lap between them only by luck. Three faults, each fixed here:
 *
 * - **A spike read as a gentle bend.** The circle through three points is smallest
 *   when they turn a right angle and grows again past it. So once a sample had been
 *   thrown to the outside of a corner (a 118 degree kink at 23rd & Harrison) its
 *   curvature read LOWER than its neighbours asked for, and it was pushed further
 *   out. `curvature` here keeps rising past a right angle. This alone mended every
 *   right-angle corner on every lap.
 * - **An offset that folds.** Normals fan in on the inside of a corner, so samples
 *   offset past where they meet pass each other and the line runs backwards round
 *   the apex. The inside is held to where each step of the line still covers
 *   `foldStep` of the road's, and to the circle that touches the road here and
 *   reaches its other leg: a hairpin's two legs are 51 degrees apart, so 7 m inside
 *   one is across the other's line.
 * - **A hairpin's vertex.** Bounded or not, offsets from a 129 degree vertex zigzag
 *   (CORNER_ARC), so its samples are put on an arc first. Every corner's are, since
 *   the same day: below.
 *
 * **Cutting corners that are not grass** (Shawn, the same day, after racing it: he
 * was 20 to 28 mph quicker through the fast bends, from 8 to 13 m off the centreline
 * where the line was held within 6 or 7). Every vertex past `roundFrom` is rounded,
 * and on the INSIDE of each the line may go as far as `paved` says a car may be,
 * `cutMargin` kept all round it, instead of stopping `edgeMargin` short of the kerb:
 * over the pavement and the corner both streets share, never onto grass, never near
 * a building or a tree. The outside of a bend and every straight keep to the
 * carriageway, so it cuts corners and does not drive down pavements. The rounding
 * alone is worth 2.1 s a lap on Uptown (an arc's room is both legs' asphalt, a
 * vertex's one leg's), and the cut about 2 more. `cutMargin` 2.6 put one tyre on the
 * grass for 2 to 6 ticks at the two tightest corners, the car cutting 1.6 to 1.9 m
 * inside its own line as any driver aiming ahead does; 3.2 for 2 ticks; 3.6 and 4.0
 * for none, over 0.76 to 0.88.
 *
 * Driven alone on Uptown, clear, at the racing line's own 0.76: 1:32.45, 1:30.38,
 * 1:29.75, every lap valid, no reset, no reverse, no wheel off the pavement, where
 * the rival as shipped (lane arcs, its own side, 0.80) laps in 1:35.18
 * (tests/racing-line.test.ts; design/PORT_ALDER.md, "Against a human, measured").
 *
 * All of it is off for Ridge Circuit, whose lines are bit for bit what they were.
 * Its turns pass a right angle only between coarse nodes, the finer levels already
 * put that right, and nothing on it folds; but the first fix moves Full's and
 * East's lines, and a moved line is a moved rival (RIVAL_REVISION), which would
 * refuse every raced recording for the sake of a line that was not broken. When
 * that revision is next bumped for its own reasons, Ridge can take this.
 *
 * Uptown Circuit / Clear drives one (street-circuit.ts; RIVAL_STREET_LINE in rival.ts
 * for how hard). It ignores lanes, so it is for clear streets only (above, "Not in
 * the city"): every street race with traffic keeps the centreline and its lane arcs.
 */
export const STREET_RACING_LINE = { ...RACING_LINE, sharpCorners: true, foldStep: 0.25, roundFrom: 45, cutMargin: 4 } as const;

export interface RacingLineOptions {
  readonly spacing: number;
  readonly edgeMargin: number;
  readonly outsideMargin: number;
  readonly tangentReach: number;
  readonly levels: readonly number[];
  readonly sweeps: number;
  /** Corners at a single vertex (STREET_RACING_LINE): curvature that keeps rising past a right angle, and no folding inside one. */
  readonly sharpCorners?: boolean;
  /** With `sharpCorners`, the least share of the road's step that a step of the line may cover on the inside of a corner. */
  readonly foldStep?: number;
  /** With `sharpCorners`, degrees a vertex must turn to be rounded before the line is drawn (CORNER_ARC). Absent, none is. */
  readonly roundFrom?: number;
  /** Where a car may be, for cutting a corner: true on ground the line may cross. Asked only on the inside of a rounded
   *  corner, for the point and a ring `edgeMargin` round it. Absent, the inside is the legs' own carriageway. */
  readonly paved?: (x: number, z: number) => boolean;
  /** Metres of `paved` ground kept all round the line where it cuts a corner. Absent is `edgeMargin`. */
  readonly cutMargin?: number;
  /** A line for traffic (street-line.ts): outside `cornerReach` metres of a rounded corner the line is HELD at this
   *  offset for the road's width there, the lane a rival rests in, so it is drawn leaving its lane for a corner and
   *  coming back to it, rather than wandering the road between corners. Both or neither. */
  readonly rest?: (width: number) => number;
  readonly cornerReach?: number;
  /** With `rest`: on the way INTO a corner the line may not go outside its lane, only inside it. A line that swings
   *  out for a corner has to do it in the braking zone, and that swing is itself a bend to slow for. */
  readonly entryInLane?: boolean;
  /** With `rest`: degrees a vertex must turn to be a corner the line may leave its lane for, when it is not sharp
   *  enough to be rounded (`roundFrom`). Absent, only rounded corners are. A street rival's lane arc keeps to its own
   *  half of the road, so a 26 degree bend on a 20 m street was planned at 77 mph that a player takes flat at 116. */
  readonly bendFrom?: number;
  /** Metres either side of such a bend that the line may be out of its lane, where `cornerReach` is a corner's. A bend
   *  is taken three times as fast as a corner, so the same seconds to leave the lane and come back are more metres. */
  readonly bendReach?: number;
}

/** Metres of road either way that a sample's other leg is looked for in: the legs of Uptown's hairpin share asphalt 38 m out. */
const FOLD_WINDOW = 100;

/**
 * A street corner is rounded before a line is drawn through it (STREET_RACING_LINE's
 * `roundFrom`). A line is offsets from the road's samples along their normals, and at a
 * sharp vertex the samples either side jump sideways as the normals swing, so an offset
 * to the inside zigzags: Uptown's hairpin (129 degrees) came out as a 4 m spike on one
 * lap in three whatever bounded it. The samples there follow an arc inside the vertex,
 * and what the line may use either side of the arc is the asphalt itself: within the
 * margin of either leg, which at a junction is both streets' and the corner between
 * them, and on the inside whatever `paved` allows.
 */
export const CORNER_ARC = {
  /** Metres from the vertex the line may be at its deepest: well inside the 20 m a street gate takes. */
  gateReach: 14,
  /** Share of the shorter leg beside it that the arc may use, as RIVAL_STREET_CORNERS. */
  legShare: 0.45,
  /** Metres between the steps that find the asphalt's edge from an arc sample, and how far they look. */
  march: 0.25,
  marchReach: 40,
} as const;

/** Eight directions: the ring a point's margin is checked on. */
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)] as const);

/** A stretch of samples on a corner's arc, which side is its inside, and the legs whose pavement they may use. */
interface Pavement { from: number; to: number; inside: number; legs: { ax: number; az: number; bx: number; bz: number; limit: number }[] }
const distanceToLeg = (leg: Pavement["legs"][number], x: number, z: number) => {
  const dx = leg.bx - leg.ax, dz = leg.bz - leg.az, t = Math.max(0, Math.min(1, ((x - leg.ax) * dx + (z - leg.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - leg.ax - dx * t, z - leg.az - dz * t);
};

/** The route with each sharp vertex replaced by an arc: where every original point went, and the arcs. */
function roundCorners(points: readonly CoursePoint[], options: RacingLineOptions) {
  const rounded: CoursePoint[] = [], origin: number[] = [], arcs: { from: number; to: number; vertex: number; inside: number }[] = [];
  const keep = 1 - (options.foldStep ?? 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i - 1], q = points[i]!, r = points[i + 1];
    const l1 = p ? Math.hypot(q.x - p.x, q.z - p.z) : 0, l2 = r ? Math.hypot(r.x - q.x, r.z - q.z) : 0;
    if (!p || !r || l1 < 1e-6 || l2 < 1e-6) { origin.push(rounded.length); rounded.push(q); continue; }
    const u1x = (q.x - p.x) / l1, u1z = (q.z - p.z) / l1, u2x = (r.x - q.x) / l2, u2z = (r.z - q.z) / l2;
    const turn = Math.atan2(u1x * u2z - u1z * u2x, u1x * u2x + u1z * u2z), half = Math.abs(turn) / 2;
    if (Math.abs(turn) * 180 / Math.PI <= (options.roundFrom ?? Infinity)) { origin.push(rounded.length); rounded.push(q); continue; }
    // As large as leaves the line's deepest point, the arc's own and the inside the solver may add, within reach of the gate.
    const radius = Math.min(CORNER_ARC.gateReach / (1 / Math.cos(half) - 1 + keep), CORNER_ARC.legShare * Math.min(l1, l2) / Math.tan(half));
    const T = radius * Math.tan(half), side = Math.sign(turn);
    const sx = q.x - u1x * T, sz = q.z - u1z * T, cx = sx - u1z * side * radius, cz = sz + u1x * side * radius;
    const count = Math.max(2, Math.ceil(radius * Math.abs(turn) / options.spacing));
    arcs.push({ from: rounded.length, to: rounded.length + count, vertex: i, inside: side });
    origin.push(rounded.length + Math.round(count / 2));
    for (let k = 0; k <= count; k++) {
      const a = turn * k / count, c = Math.cos(a), sn = Math.sin(a), t = k / count;
      // Height runs from one tangent point to the other, by way of the vertex's.
      const y = t < 0.5 ? q.y + (p.y - q.y) * (T / l1) * (1 - 2 * t) : q.y + (r.y - q.y) * (T / l2) * (2 * t - 1);
      rounded.push({ ...q, x: cx + (sx - cx) * c - (sz - cz) * sn, z: cz + (sx - cx) * sn + (sz - cz) * c, y });
    }
  }
  return { rounded, origin, arcs };
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

/** Signed Menger curvature through three points, positive for a right-hand bend. `sharp` keeps it rising through a
 *  turn past a right angle, where the circle through the points grows again (STREET_RACING_LINE). */
function curvature(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, sharp = false): number {
  const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ac = Math.hypot(cx - ax, cz - az);
  const denominator = ab * bc * ac;
  if (denominator < 1e-12) return 0;
  const cross = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
  // 2 sin(turn) / ac, and past a right angle 2 (2 - sin(turn)) / ac: continuous, and sharper is always more.
  if (sharp && (bx - ax) * (cx - bx) + (bz - az) * (cz - bz) < 0) return 2 * (Math.sign(cross) * 2 * ab * bc - cross) / denominator;
  return 2 * cross / denominator;
}

/** Offsets from the centre, positive to the right of travel, for every sample. */
export function racingLineOffsets(samples: readonly Pick<Sample, "x" | "z" | "width">[], options: RacingLineOptions = RACING_LINE, pavement: readonly Pavement[] = [], held: readonly (number | null)[] = [],
  entries: readonly ({ inside: number; rest: number } | null)[] = []): { offsets: number[]; normals: { x: number; z: number }[] } {
  const n = samples.length, sharp = options.sharpCorners ?? false;
  const reach = Math.max(1, Math.round(options.tangentReach / options.spacing));
  const normals = samples.map((_, i) => {
    const a = samples[Math.max(0, i - reach)]!, b = samples[Math.min(n - 1, i + reach)]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
  });
  // How far each sample may go right and left: the road less the margins, and
  // less again on the outside of the road's own bend (all of it from a 300 m radius in).
  const right: number[] = [], left: number[] = [];
  // A lapped route asks the same sample every lap.
  const rooms = new Map<string, number>(), cutMargin = options.cutMargin ?? options.edgeMargin;
  for (let i = 0; i < n; i++) {
    const limit = Math.max(0, samples[i]!.width / 2 - options.edgeMargin);
    const a = samples[Math.max(0, i - reach * 2)]!, b = samples[i]!, c = samples[Math.min(n - 1, i + reach * 2)]!;
    const bend = curvature(a.x, a.z, b.x, b.z, c.x, c.z, sharp);
    // On a corner's arc the samples are off the centreline, and the room either side is the asphalt's: as far
    // along the normal as stays within the margin of one leg or the other.
    const paved = pavement.find(stretch => i >= stretch.from && i <= stretch.to);
    const room = (sign: number) => {
      if (!paved) return limit;
      // Inside the corner, whatever the ground allows (`paved`), the margin kept all round; else the legs' carriageway.
      const ground = sign === paved.inside ? options.paved : undefined;
      const key = `${b.x},${b.z},${sign}`, known = rooms.get(key);
      if (known !== undefined) return known;
      let reached = 0;
      for (let t = 0; t <= CORNER_ARC.marchReach; t += CORNER_ARC.march) {
        const x = b.x + normals[i]!.x * sign * t, z = b.z + normals[i]!.z * sign * t;
        const on = ground ? ground(x, z) && RING.every(([rx, rz]) => ground(x + rx * cutMargin, z + rz * cutMargin))
          : paved.legs.some(leg => distanceToLeg(leg, x, z) <= leg.limit);
        if (!on) break;
        reached = t;
      }
      rooms.set(key, reached);
      return reached;
    };
    const margin = options.outsideMargin * Math.min(1, Math.abs(bend) * 300);
    // A right-hand bend has its outside on the left.
    right.push(bend < 0 ? Math.max(0, room(1) - margin) : room(1));
    left.push(bend > 0 ? Math.max(0, room(-1) - margin) : room(-1));
  }
  // Inside a corner the normals fan in, and an offset past where they meet folds the line back on itself.
  for (let i = 0; sharp && i < n - 1; i++) {
    const a = normals[i]!, b = normals[i + 1]!;
    const turn = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z), fan = Math.hypot(b.x - a.x, b.z - a.z);
    if (fan < 1e-9) continue;
    // The step between two samples, along the road's direction between them: what the road gives, less what the fan takes.
    const fx = a.z + b.z, fz = -(a.x + b.x), f = Math.hypot(fx, fz) || 1;
    const given = ((samples[i + 1]!.x - samples[i]!.x) * fx + (samples[i + 1]!.z - samples[i]!.z) * fz) / f;
    const room = Math.max(0, (1 - (options.foldStep ?? 0)) * given / fan);
    // A right-hand bend has its inside on the right.
    const inside = turn > 0 ? right : left;
    inside[i] = Math.min(inside[i]!, room); inside[i + 1] = Math.min(inside[i + 1]!, room);
  }
  // And past the normals' fan, the road's other leg: the two sides of a hairpin are one stretch of asphalt, and a
  // sample may go no nearer the other leg than its own, which is the circle touching the road here that reaches it.
  const reachAlong = [0];
  for (let i = 1; i < n; i++) reachAlong.push(reachAlong[i - 1]! + Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z));
  for (let i = 0; sharp && i < n; i++) {
    const normal = normals[i]!, keep = 1 - (options.foldStep ?? 0);
    for (const direction of [-1, 1]) {
      for (let j = i + direction; j >= 0 && j < n && Math.abs(reachAlong[j]! - reachAlong[i]!) <= FOLD_WINDOW; j += direction) {
        if (Math.abs(reachAlong[j]! - reachAlong[i]!) <= options.tangentReach * 2) continue;
        const dx = samples[j]!.x - samples[i]!.x, dz = samples[j]!.z - samples[i]!.z, across = dx * normal.x + dz * normal.z;
        if (Math.abs(across) < 1e-6) continue;
        const room = keep * (dx * dx + dz * dz) / (2 * Math.abs(across));
        if (across > 0) right[i] = Math.min(right[i]!, room); else left[i] = Math.min(left[i]!, room);
      }
    }
  }
  // Into a corner the outside of the bend is the lane: a right-hand corner's inside is the right, so nothing left of rest.
  for (let i = 0; i < n; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.inside > 0) left[i] = Math.min(left[i]!, -entry.rest); else right[i] = Math.min(right[i]!, entry.rest);
  }
  // Held samples take no part: both limits are the value they are held at, after every other bound has had its say.
  for (let i = 0; i < n; i++) { const at = held[i]; if (at !== null && at !== undefined) { right[i] = at; left[i] = -at; } }
  const w = Array.from({ length: n }, (_, i) => held[i] ?? 0);
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
        const before = curvature(px(k - 2), pz(k - 2), px(k - 1), pz(k - 1), px(k), pz(k), sharp);
        const after = curvature(px(k), pz(k), px(k + 1), pz(k + 1), px(k + 2), pz(k + 2), sharp);
        const toPrevious = Math.hypot(px(k) - px(k - 1), pz(k) - pz(k - 1)), toNext = Math.hypot(px(k + 1) - px(k), pz(k + 1) - pz(k));
        const wanted = (before * toNext + after * toPrevious) / Math.max(1e-9, toPrevious + toNext);
        // Move across the road by how far off that curvature is, through its local slope.
        const here = curvature(px(k - 1), pz(k - 1), px(k), pz(k), px(k + 1), pz(k + 1), sharp);
        const nudge = 0.01;
        const moved = curvature(px(k - 1), pz(k - 1), c.x + normal.x * (w[i]! + nudge), c.z + normal.z * (w[i]! + nudge), px(k + 1), pz(k + 1), sharp);
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
  return drawRacingLine(route, options).route;
}

/** The line, and which of its points were free to leave `rest` (all of them, with no `rest`). */
export function drawRacingLine(route: RivalDefinition, options: RacingLineOptions = RACING_LINE): { route: RivalDefinition; free: boolean[] } {
  // A line drawn through a line doubles the offsets, which was once measured as "K1999 leaves the road" (above).
  if (route.lateral) throw new RangeError(`${route.id} already carries a racing line`);
  const { rounded, origin, arcs } = options.sharpCorners ? roundCorners(route.points, options)
    : { rounded: route.points, origin: route.points.map((_, i) => i), arcs: [] };
  const { samples, index } = resample(rounded, options.spacing);
  const pavement: Pavement[] = arcs.map(arc => ({ from: index[arc.from]!, to: index[arc.to]!, inside: arc.inside,
    legs: [-3, -2, -1, 0, 1, 2].map(k => [route.points[arc.vertex + k], route.points[arc.vertex + k + 1]] as const)
      .filter((leg): leg is readonly [CoursePoint, CoursePoint] => !!leg[0] && !!leg[1])
      .map(([a, b]) => ({ ax: a.x, az: a.z, bx: b.x, bz: b.z, limit: Math.max(0, Math.min(a.width, b.width) / 2 - options.edgeMargin) })) }));
  // Free within reach of a corner, held to the lane everywhere else. A corner is a rounded arc, or a gentler bend
  // that is still a bend (`bendFrom`): one sample, its vertex, and which way it turns.
  const corners: { from: number; to: number; inside: number; reach: number }[] = pavement.map(stretch => ({ from: stretch.from, to: stretch.to, inside: stretch.inside, reach: options.cornerReach ?? 0 }));
  if (options.rest && options.bendFrom !== undefined) {
    const rounded = new Set(arcs.map(arc => arc.vertex));
    for (let v = 1; v < route.points.length - 1; v++) {
      if (rounded.has(v)) continue;
      const p = route.points[v - 1]!, q = route.points[v]!, r = route.points[v + 1]!;
      const turn = Math.atan2((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.z - p.z) * (r.z - q.z));
      if (Math.abs(turn) * 180 / Math.PI < options.bendFrom) continue;
      corners.push({ from: index[origin[v]!]!, to: index[origin[v]!]!, inside: Math.sign(turn), reach: options.bendReach ?? options.cornerReach ?? 0 });
    }
  }
  const free = samples.map(() => !options.rest);
  if (options.rest) {
    const run = [0];
    for (let i = 1; i < samples.length; i++) run.push(run[i - 1]! + Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z));
    for (const corner of corners) for (let i = 0; i < samples.length; i++) {
      if (run[i]! >= run[corner.from]! - corner.reach && run[i]! <= run[corner.to]! + corner.reach) free[i] = true;
    }
  }
  const held = samples.map((sample, i) => free[i] ? null : options.rest!(sample.width));
  // Into a corner, up to the middle of its arc, the outside of the bend is the lane itself.
  const outside: (number | null)[] = samples.map(() => null);
  if (options.rest && options.entryInLane) {
    const run = [0];
    for (let i = 1; i < samples.length; i++) run.push(run[i - 1]! + Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z));
    // A sharp corner's way in is written last, over any bend's: two 13 degree right-handers just before a 102 degree
    // left (gen-39, 2030 m) otherwise make the right-hand side "inside" on the way into the left, and the line swings
    // 4 m out for it, which is the swing this rule exists to stop.
    for (const corner of [...corners.slice(pavement.length), ...corners.slice(0, pavement.length)]) {
      const middle = Math.floor((corner.from + corner.to) / 2);
      for (let i = 0; i <= middle; i++) if (run[i]! >= run[corner.from]! - corner.reach) outside[i] = corner.inside;
    }
  }
  const { offsets, normals } = racingLineOffsets(samples, options, pavement, held, outside.map((inside, i) => inside === null ? null : { inside, rest: options.rest!(samples[i]!.width) }));
  const points: CoursePoint[] = samples.map((s, i) => ({ x: s.x + normals[i]!.x * offsets[i]!, z: s.z + normals[i]!.z * offsets[i]!,
    y: s.y, width: s.width, zone: s.zone }));
  // `lateral` is where a point is across the ROAD. On an arc that is across the nearer leg, not from the arc.
  const lateral = [...offsets];
  for (const stretch of pavement) for (let i = stretch.from; i <= stretch.to; i++) {
    const p = points[i]!, leg = stretch.legs.reduce((best, next) => distanceToLeg(next, p.x, p.z) < distanceToLeg(best, p.x, p.z) ? next : best);
    lateral[i] = Math.sign((p.x - leg.ax) * -(leg.bz - leg.az) + (p.z - leg.az) * (leg.bx - leg.ax)) * distanceToLeg(leg, p.x, p.z);
  }
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const gates = route.gates.map(gate => {
    const original = route.along.findIndex(a => Math.abs(a - gate) < 1e-6);
    if (original < 0) throw new RangeError(`${route.id}: gate at ${gate} m is not a point of the route`);
    return along[index[origin[original]!]!]!;
  });
  return { route: { ...route, points, along, gates, lateral, ...(options.paved ? { clearance: options.cutMargin ?? options.edgeMargin } : {}) }, free };
}
