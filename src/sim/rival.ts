import { planTrafficPass, passingOffset, passingPoint, type PassingContext, type TrafficPass } from "./traffic-pass.ts";
import { HANDLING, handlingFor, maxCorneringSpeed, steadyWheelAngleFor, steeringAngleFor, type Input, type RivalState } from "./sim.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";
import { laneOffset } from "./lanes.ts";
import type { RaceDefinition } from "./race.ts";

export interface RivalDefinition {
  /** The car it drives (`car-handling.ts`): its numbers, and its drivetrain. The
   *  body drawn for it must be the same car (cars.test.ts). */
  readonly car?: string;
  /** Only for a route with no car, which drives the shared model on this layout;
   *  absent means FWD. Beside a car it must agree with the car's own. */
  readonly drivetrain?: "fwd" | "awd" | "rwd";
  readonly id: string;
  readonly start: RoadWorld["start"];
  readonly points: readonly CoursePoint[];
  readonly along: readonly number[];
  readonly gates: readonly number[];
  readonly loop?: boolean;
  readonly speedLimit?: number;
  /** Each point's offset from the road's centre, positive to the right, when the
   *  route is a racing line (`racing-line.ts`). Absent means the points are the centre. */
  readonly lateral?: readonly number[];
  /** How well this driver launches, 0-1 (`launch.ts`). Absent is `RIVAL_LAUNCH_SKILL`. */
  readonly launch?: number;
  /** The share of the grip-limited speed this route's corners are planned at, where it is not its surface's own
   *  (`RIVAL_CORNERING` on a street, `RIVAL_BRAKING` on a racing line): `RIVAL_STREET_LINE`. */
  readonly cornering?: number;
  /** Metres of ground a car may be on, kept all round the line wherever it leaves the carriageway to cut a corner
   *  (`cutMargin`, racing-line.ts). Within it of its line the car is where it means to be, not lost. */
  readonly clearance?: number;
  /** A racing line this street route may take one corner at a time, when traffic allows (street-line.ts). */
  readonly line?: StreetLine;
  /** Forecasted, committed overtakes for street races. */
  readonly trafficPassing?: boolean;
  /** Metres of asphalt past each edge of the carriageway that no traffic drives: Port Alder's shoulders (2026-09-23,
   *  design/ROAD_EDGES.md). A rival may pass on it and take a bend's arc over it, and is neither lost nor making no
   *  progress there. Absent is none, as on every road before them. */
  readonly shoulder?: number;
  /** How hard this DRIVER takes a street line's corners, as a share of the grip-limited speed (`BLACKLIST_CORNERING`).
   *  Absent is `RIVAL_STREET_LINE`'s. It is the line's corners only: in its lane a rival's limit is its tracking, not
   *  its nerve (`RIVAL_CORNERING`), whoever is driving. */
  readonly skill?: number;
}
/** A line carried by a centreline route as a shift from its lane, at stations `spacing` metres apart along the route's
 *  own distance (street-line.ts). */
export interface StreetLine {
  readonly spacing: number;
  /** From the lane the rival rests in to the line, in metres east and south. Nothing outside `corners`. */
  readonly dx: readonly number[];
  readonly dz: readonly number[];
  /** Where the line is, and how tightly it bends there: what the forecast is read against. */
  readonly x: readonly number[];
  readonly z: readonly number[];
  readonly radius: readonly number[];
  /** The stretches of the route, in its own metres, where the line leaves the lane. */
  readonly corners: readonly { readonly from: number; readonly to: number; readonly bend?: true }[];
  /** The share of the grip-limited speed the line is cornered at (RIVAL_STREET_LINE), and the ground it keeps clear. */
  readonly cornering: number;
  readonly clearance: number;
}
/** The line's shift from the lane at a distance along the route. */
export function shiftAt(line: StreetLine, distance: number): { x: number; z: number } {
  const k = distance / line.spacing, i = Math.max(0, Math.min(line.dx.length - 2, Math.floor(k))), t = clamp(k - i, 0, 1);
  return { x: line.dx[i]! + (line.dx[i + 1]! - line.dx[i]!) * t, z: line.dz[i]! + (line.dz[i + 1]! - line.dz[i]!) * t };
}
/** How far along the route a car is, read off the LINE: the station of the line it is nearest, looked for round where
 *  it last was. On a line that cuts a corner the route's own legs cannot say: they jump as it crosses the bisector. */
function alongLine(line: StreetLine, from: number, x: number, z: number): number {
  const last = line.x.length - 1, start = clamp(Math.floor(from / line.spacing) - 6, 0, last - 1);
  let best = from, nearest = Infinity;
  for (let k = start; k < Math.min(last, start + 30); k++) {
    const ax = line.x[k]!, az = line.z[k]!, sx = line.x[k + 1]! - ax, sz = line.z[k + 1]! - az, l2 = sx * sx + sz * sz;
    const t = l2 > 1e-9 ? clamp(((x - ax) * sx + (z - az) * sz) / l2, 0, 1) : 0, d = Math.hypot(x - ax - sx * t, z - az - sz * t);
    if (d < nearest) { nearest = d; best = (k + t) * line.spacing; }
  }
  return best;
}
export interface RivalDriver {
  along: number;
  progressMark: number;
  noProgressTicks: number;
  resetCheckIn: number;
  resets: number;
  /** Put back on its line out of the player's sight (`UNSEEN_RECOVERY` in sim.ts), counted apart from the 12 s fallback. */
  unseenResets: number;
  /** Where the last reset put it along its route: a second one near there may go past what blocked it. */
  resetAlong: number;
  stuckTicks: number;
  reverseTicks: number;
  recoveries: number;
  recoverySide: number;
  bypassUntil: number;
  avoidance: number;
  targetSpeed: number;
  /** Only on a route with a `line` (street-line.ts), and absent otherwise so every other driver's state is what it
   *  was: the corner being read, whether its line may be taken, until which tick it is refused, and how far onto
   *  the line the driver has blended, 0 to 1. */
  lineCorner?: number;
  lineGo?: boolean;
  lineRefused?: number;
  lineBlend?: number;
  trafficPass?: TrafficPass;
}
export function createRivalDriver(): RivalDriver {
  return { along: 0, progressMark: 0, noProgressTicks: 0, resetCheckIn: 0, resets: 0, unseenResets: 0, resetAlong: -1e9, stuckTicks: 0, reverseTicks: 0, recoveries: 0, recoverySide: 0, bypassUntil: 0, avoidance: 0, targetSpeed: 0 };
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
/** The segment a distance falls in: the first whose end is at or past it, as a
 *  linear scan from the start would find, by binary search so a densely sampled
 *  racing line costs the same as a street's few points. */
function segmentAt(along: readonly number[], distance: number): number {
  let low = 0, high = along.length - 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (along[mid + 1]! < distance) low = mid + 1; else high = mid;
  }
  return low;
}
/** The route's own height at a distance along it: the road under the line there. A loop wraps. */
export function routeHeightAt(route: RivalDefinition, distance: number): number {
  const length = route.along.at(-1)!;
  distance = route.loop && length > 0 ? ((distance % length) + length) % length : clamp(distance, 0, length);
  const i = segmentAt(route.along, distance);
  const a = route.points[i]!, b = route.points[i + 1] ?? a;
  const span = (route.along[i + 1] ?? route.along[i]!) - route.along[i]!;
  return a.y + (b.y - a.y) * (span ? (distance - route.along[i]!) / span : 0);
}
export function sampleRivalPath(route: RivalDefinition, distance: number) {
  distance = clamp(distance, 0, route.along.at(-1)!);
  const i = segmentAt(route.along, distance);
  const a = route.points[i]!, b = route.points[i + 1]!;
  const length = route.along[i + 1]! - route.along[i]!;
  const t = length ? (distance - route.along[i]!) / length : 0;
  const lateral = route.lateral ? route.lateral[i]! + (route.lateral[i + 1]! - route.lateral[i]!) * t : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    ux: (b.x - a.x) / length, uz: (b.z - a.z) / length, width: Math.min(a.width,b.width), lateral, index: i };
}

/**
 * Street corners, rounded (2026-09-13). A street route is its centreline, whose
 * junctions are sharp polyline corners. The rival planned every one from that
 * corner, a 5.7 m radius read across 8 m either side, so a right angle was always
 * the 7 m/s floor; it steered for the corner itself, arrived over that plan and
 * ran wide into the oncoming lane. It now drives an arc at each corner: as large as
 * the pavement allows, less `kerbMargin`, and within its own side of the street.
 * A right turn cuts in only as far as the kerb allows from its side (RIVAL_LANE);
 * a left turn is back on its own side by the edge of the junction. An arc uses at
 * most `legShare` of the shorter leg either side, so neighbouring arcs never meet.
 * A leg is the straight run to the next corner (2026-09-13), not the segment beside
 * the corner: a route is resampled about every 29 m, and 45% of one segment held
 * every right angle on Uptown Circuit to a 12.6 m arc where its side of the street
 * allowed 18.5.
 * The route itself, its distances and its gates stay on the centreline; only the
 * path it aims along and plans from is rounded, and its progress through a corner
 * is read round the arc.
 *
 * Measured, rival alone, over 82 generated races in traffic: 8,046.3 s to 7,559.8 s
 * (6% faster), 1,218 ticks of contact to 292, time off course 12.3 s to 3.6 s, none
 * past 16 m. On clear streets (42 races) the slowest point of a junction turn went
 * from 18.7 to 24.6 mph on average, and exits more than 1 m into the oncoming half
 * from 118 turns to 116. `legShare` 0.38 and 0.45 were clean; 0.3 and 0.5 each put
 * a race past 16 m.
 */
export const RIVAL_STREET_CORNERS = { kerbMargin: 1.5, legShare: 0.45 } as const;
interface StreetCorner { start: number; end: number; cx: number; cz: number; vx: number; vz: number; radius: number; sweep: number }
const cornerCache = new WeakMap<RivalDefinition, { list: (StreetCorner | null)[]; bySegment: number[][] }>();
/** Each route vertex's arc, or null where the route runs straight on or has no room. Racing lines have none. */
function streetCorners(route: RivalDefinition): (StreetCorner | null)[] { return cornerIndex(route).list; }
/** The corners whose arcs reach into a segment of the route: an arc can span several. */
function cornersOn(route: RivalDefinition, segment: number): readonly number[] { return cornerIndex(route).bySegment[segment] ?? []; }
function cornerIndex(route: RivalDefinition) {
  let cached = cornerCache.get(route);
  if (cached) return cached;
  const list: (StreetCorner | null)[] = route.points.map(() => null);
  // How far the route turns at a vertex, in radians; a route's ends count as corners.
  const turnAt = (i: number) => {
    if (i <= 0 || i >= route.points.length - 1) return Infinity;
    const p = route.points[i - 1]!, q = route.points[i]!, r = route.points[i + 1]!;
    const l1 = Math.hypot(q.x - p.x, q.z - p.z), l2 = Math.hypot(r.x - q.x, r.z - q.z);
    if (l1 < 1e-6 || l2 < 1e-6) return Infinity;
    return Math.abs(Math.atan2(((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x)) / (l1 * l2), ((q.x - p.x) * (r.x - q.x) + (q.z - p.z) * (r.z - q.z)) / (l1 * l2)));
  };
  for (let i = 1; !route.lateral && i < route.points.length - 1; i++) {
    const p = route.points[i - 1]!, q = route.points[i]!, r = route.points[i + 1]!;
    let l1 = Math.hypot(q.x - p.x, q.z - p.z), l2 = Math.hypot(r.x - q.x, r.z - q.z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u1x = (q.x - p.x) / l1, u1z = (q.z - p.z) / l1, u2x = (r.x - q.x) / l2, u2z = (r.z - q.z) / l2;
    const turn = Math.abs(Math.atan2(u1x * u2z - u1z * u2x, u1x * u2x + u1z * u2z));
    if (turn < 0.01) continue;
    // Each leg runs straight back, and on, to the next corner.
    let j = i - 1; while (j > 0 && turnAt(j) < 0.01) j--;
    let k = i + 1; while (k < route.points.length - 1 && turnAt(k) < 0.01) k++;
    l1 = route.along[i]! - route.along[j]!; l2 = route.along[k]! - route.along[i]!;
    // Room to the inside kerb, measured from the centreline.
    const room = Math.min(p.width, q.width, r.width) / 2 - RIVAL_STREET_CORNERS.kerbMargin;
    if (room <= 0) continue;
    const tan = Math.tan(turn / 2);
    const right = -u1z * u2x + u1x * u2z > 0;
    const ownSide = (width: number) => RIVAL_LANE.share * laneOffset(width, { direction: 1, index: 0 }, width > 14 ? "collector" : "local");
    const side = Math.min(ownSide(p.width), ownSide(r.width)), box = Math.min(p.width, r.width) / 2;
    // A right turn's arc bulges into its own side, so its apex keeps the kerb margin from
    // there. A left turn's bulges across the centre line, and has to be back on its own
    // side, `side` metres out, by the time it leaves the junction.
    const fits = (radius: number) => {
      if (right) return radius * (1 - Math.cos(turn / 2)) <= room - side;
      const T = radius * tan;
      return radius * (1 - Math.cos(turn / 2)) <= room && (T <= box || radius - Math.sqrt(Math.max(0, radius * radius - (T - box) ** 2)) <= side);
    };
    let radius = RIVAL_STREET_CORNERS.legShare * Math.min(l1, l2) / tan;
    if (!fits(radius)) {
      let low = 0, high = radius;
      for (let k = 0; k < 40; k++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
      radius = low;
    }
    if (radius < 0.5) continue;
    const T = radius * tan;
    let nx = -u1z, nz = u1x;
    if (nx * u2x + nz * u2z < 0) { nx = -nx; nz = -nz; }
    const x1 = q.x - u1x * T, z1 = q.z - u1z * T, cx = x1 + nx * radius, cz = z1 + nz * radius;
    // Which way round: the sweep that carries the start of the arc onto its end.
    const vx = x1 - cx, vz = z1 - cz, x2 = q.x + u2x * T, z2 = q.z + u2z * T;
    const miss = (a: number) => (vx * Math.cos(a) - vz * Math.sin(a) + cx - x2) ** 2 + (vx * Math.sin(a) + vz * Math.cos(a) + cz - z2) ** 2;
    const sweep = miss(turn) < miss(-turn) ? turn : -turn;
    list[i] = { start: route.along[i]! - T, end: route.along[i]! + T, cx, cz, vx, vz, radius, sweep };
  }
  const bySegment: number[][] = route.points.slice(1).map(() => []);
  list.forEach((c, index) => {
    if (!c) return;
    for (let s = segmentAt(route.along, Math.max(0, c.start)); s < bySegment.length && route.along[s]! <= c.end; s++) bySegment[s]!.push(index);
  });
  cached = { list, bySegment };
  cornerCache.set(route, cached);
  return cached;
}
/**
 * Progress through a rounded corner, read round its arc. Off the centreline it is
 * whichever leg is nearer, and a car cutting the corner jumped 11 m from one to the
 * other halfway round: its aim and its speed plan jumped with it, it accelerated
 * while still turning and clipped a waiting truck on Uptown Circuit.
 */
function alongDriven(route: RivalDefinition, along: number, x: number, z: number): number {
  const list = streetCorners(route), i = segmentAt(route.along, clamp(along, 0, route.along.at(-1)!));
  for (const index of cornersOn(route, i)) {
    const corner = list[index]!;
    if (along < corner.start || along > corner.end) continue;
    const ax = x - corner.cx, az = z - corner.cz;
    // Angle from the start of the arc, in the sweep's direction.
    const a = Math.atan2(corner.vx * az - corner.vz * ax, corner.vx * ax + corner.vz * az) * Math.sign(corner.sweep);
    return corner.start + clamp(a / Math.abs(corner.sweep), 0, 1) * (corner.end - corner.start);
  }
  return along;
}
/** The path the rival drives and plans from: the route, with a street's corners rounded (RIVAL_STREET_CORNERS). */
export function sampleDrivingPath(route: RivalDefinition, distance: number) {
  const base = sampleRivalPath(route, distance);
  const list = streetCorners(route), d = clamp(distance, 0, route.along.at(-1)!);
  for (const index of cornersOn(route, base.index)) {
    const corner = list[index]!;
    if (d < corner.start || d > corner.end) continue;
    const a = corner.sweep * (d - corner.start) / (corner.end - corner.start), c = Math.cos(a), s = Math.sin(a);
    const vx = corner.vx * c - corner.vz * s, vz = corner.vx * s + corner.vz * c, sign = Math.sign(corner.sweep);
    return { ...base, x: corner.cx + vx, z: corner.cz + vz, ux: -sign * vz / corner.radius, uz: sign * vx / corner.radius };
  }
  return base;
}

/** Metres past a gate the exit direction is read at: past any kerb mitre, well short of the next junction. */
export const EXIT_LOOKAHEAD = 6;
/** The direction the line leaves each gate in — the marker's arrow — read
 *  from the line itself. The finish has none: no arrow is how you know it is
 *  the finish. */
export function gateExits(route: RivalDefinition): ({ x: number; z: number } | null)[] {
  return route.gates.map((along, i) => {
    if (i === route.gates.length - 1) return null;
    const at = sampleRivalPath(route, along), ahead = sampleRivalPath(route, along + EXIT_LOOKAHEAD);
    const run = Math.hypot(ahead.x - at.x, ahead.z - at.z);
    if (run < 1e-6) throw new RangeError(`${route.id} has no road past gate ${i}`);
    return { x: (ahead.x - at.x) / run, z: (ahead.z - at.z) / run };
  });
}
/** The race with each gate's exit taken from its rival's line: the reference
 *  route is the line, so the arrow is read from it rather than kept twice. */
export function withExits(race: RaceDefinition, route: RivalDefinition): RaceDefinition {
  if (route.gates.length !== race.checkpoints.length) {
    throw new RangeError(`${route.id} has ${route.gates.length} gates for ${race.checkpoints.length} checkpoints`);
  }
  if (race.kind === "unordered") return race;
  const exits = gateExits(route);
  return { ...race, checkpoints: race.checkpoints.map((gate, i) => exits[i] ? { ...gate, exit: exits[i]! } : gate) };
}
interface Obstacle { x: number; y: number; z: number; speed: number; heading: number; length?: number; id?: number }
/**
 * Why the rival wants the speed it does this tick (2026-09-25), for the slowdown census (`pnpm rival:census`) and
 * `rival-scene`: the corner plan's speed, the target it settled on, and the rule that brought the target lowest, with
 * the traffic car's id where one did. Filled only when the caller passes one; it is outside the sim's state, so
 * nothing that hashes or records the state sees it, and it changes nothing the rival does.
 */
export interface RivalSpeedWhy { plan: number; target: number; by: string; id?: number }
/** A fixed-tick driver: plans input, never moves the car or disables contact. */
/**
 * How a rival races the player (2026-09-13). Before this the player was passed
 * in with traffic, so the rival moved about 3.8 m away and braked beside them,
 * and braked behind a player it had no room to dodge: it let the player past.
 * With room it did pass, by dodging them as traffic. A racing rival now wants to
 * win: it goes for the pass instead of queueing, holds its line alongside,
 * covers the player's side when they close from behind, and does not lift for
 * contact. Traffic is still a hazard it slows for, and a player stopped in the
 * road still is too. Nothing here reads race position, and nothing changes
 * grip, mass or top speed: the same car, driven like it means it.
 */
/**
 * The rival's one revision string, as it was to 2026-09-21: a recording with a rival replays only against the same
 * rival, and any change to how any rival drove bumped this for every race. It is retired for an identity composed
 * from what a race's own rival is made of (rival-revision.ts), and kept as the record of what changed and when.
 * "racing-line-v1" (2026-09-13): cornering tuned to recorded laps and a
 * smoothed line on Ridge Circuit. "full-line-v1": braking while turning, steering
 * feedforward and the full racing line. "full-line-v2": on a racing line the
 * lost-car speed cap means off the road, not off the line. "full-line-v3": it
 * brakes later and harder on a racing line (RIVAL_BRAKING). "full-line-v4": traffic
 * judged in the route's frame and passed to a gap beside it, and an aim more than
 * a radian off moved outside the turning circle. "full-line-v5": recovery out of
 * the player's sight (UNSEEN_RECOVERY in sim.ts). "full-line-v6": a passing side is
 * checked for an oncoming car where it will be when the rival is alongside.
 * "full-line-v7": keeps to its own side of a street (RIVAL_LANE), and traffic
 * judged against the car's offset at its aim point. "full-line-v8": the 12 s reset
 * no longer puts it further along, unless stuck again where the last one put it.
 * "full-line-v9": street corners rounded (RIVAL_STREET_CORNERS). "full-line-v10":
 * a corner's arc measured against the straight run either side, steering
 * feedforward on streets, and lost meaning off the carriageway everywhere.
 * "full-line-v11": it launches out of the countdown like the player, by its own
 * skill (`launch.ts`), which moves it on the first lap of any raced recording.
 * "full-line-v12": traffic is judged by height above the road, not raw height, so
 * a car on the same climbing or falling street is no longer hidden by the grade.
 * "full-line-v13": Moth's Kestrel has its own tune (kestrel r2, car-handling.ts),
 * so every race she drives, and her cruise, moves; the driver is unchanged.
 * "full-line-v14": Stray's Latch has its own tune (latch r2).
 * "full-line-v15": Rivet's Hammer has its own tune (hammer r2), and power drives
 * the drag gearbox, so her quarter mile moves.
 * "full-line-v16": Bollard's Breakwater has its own tune (breakwater r2).
 * "full-line-v17": Deuce's Wager has its own tune (wager r2).
 * "full-line-v18": Sable's NS-01 has its own tune (ns01 r2), which she parks in
 * her yard as "blender", the same car.
 * "full-line-v19": Plumb's Meridian has its own tune (meridian r2).
 * "full-line-v20": Crest's Skim has its own tune (skim r2).
 * "full-line-v21": Wake's Reign has its own tune (reign r2).
 * "full-line-v22": Tally's Vesper has its own tune (vesper r2), the last of the
 * ten, and the only car past the 140 mph cap.
 * "full-line-v23": the ladder pass over the four names tuned before the street
 * measure existed or judged by their own events -- Moth, Stray, Bollard and
 * Sable (kestrel, latch, breakwater r3, ns01 r3).
 * "full-line-v24": a street rival corners at 0.80 of the grip-limited speed
 * instead of 0.76, as far as steering feedforward raised the ceiling. A racing
 * line keeps 0.76, which is all its own width leaves it.
 * "full-line-v25": on clear streets (Uptown Circuit / Clear, the one street race
 * with no traffic) it drives a racing line at 0.88 (RIVAL_STREET_LINE). Every
 * other race drives as it did; the revision is one string, so it moves for all.
 * "full-line-v26": that line cuts the corners that are not grass, and is cornered
 * at 0.80 (RIVAL_STREET_LINE). Never committed: it was on the dev server for an
 * hour, and Shawn raced it four times.
 * "full-line-v27": the same, no longer "lost" at a cut apex. A one-line fix to a
 * rival somebody has raced is still a revision: of the four v26 recordings two
 * were driven before it and two after, and the name could not say which. Not
 * committed either; raced once.
 * "full-line-v28": that line cornered at 0.88 (Shawn), not 0.80.
 * "full-line-v29": generated street rivals and Uptown in traffic take a cut line
 * one corner at a time when the traffic forecast allows, returning to their lane.
 * "full-line-v30": those rivals can commit to a forecasted traffic pass, planning
 * its pull-out, speed, clearance and return together.
 * "full-line-v31": each Blacklist name takes a street line's corners at its own share
 * of the grip-limited speed (BLACKLIST_CORNERING), 0.84 for Moth to 0.975 for Tally.
 * A race with no name on it, the circuits included, keeps 0.88.
 * "full-line-v32": four things from one race (Shawn against Wake, gen-wake-42) and the batch run to check them. It
 * steers for the wheel a turn takes, not its geometry alone (RIVAL_STEERING.slip, every rival, Ridge included); reads a
 * car that follows this road in the road's frame where it is (RIVAL_TRAFFIC_FRAME); a pass whose return is blocked
 * only by the car being passed stays out rather than braking to its speed, and a car off its pass's path looks ahead
 * as if it had none (traffic-pass.ts, PASS_ASTRAY); and a gentle bend gets a line where that is quicker (street-line.ts).
 * "driver-v1", "street-line-v1", "pass-v1" (rival-revision.ts) are full-line-v32, named by layer.
 * "driver-v2" (2026-09-22): a slower car ahead is slowed for where this car will be, at the rate it is moving across
 * the road, not only where it means to be (RIVAL_RACING.followWhereItIs). Shawn's second legit race against Wake.
 * "driver-v3" was never shipped: the pass rules gated on 2026-09-22 (design/measurements/driver-v3.patch).
 * "driver-v4" (2026-09-23): behind the player and out of their sight it drives the road as if it were empty
 * (UNSEEN_ROAD in sim.ts, Shawn).
 * "pass-v2" (2026-09-23): the player is in a pass's way only while ahead of it (planTrafficPass); a player catching
 * it from behind had braked it to let them by. Shawn's race against Wake that morning.
 * "driver-v5", "pass-v3", "street-line-v3" (2026-09-23): the shoulders Port Alder gained that day are road to a race
 * rival (`shoulder`): its edge, its passes, its bends' arcs, and where it is lost or making progress.
 * "pass-v4" (2026-09-25): a pass past its lead early rejoins over the length its speed then asks for (traffic-pass.ts).
 * "pass-v5" (2026-09-25): a pass's speed plan reads no road behind the car (`evaluatePass`).
 * "driver-v6" (2026-09-25): a car going its way is dodged only when it is nearer the rival's line than the pass gap;
 *   further off it is left alone, where the dodge had moved the rival towards it.
 * "driver-v7" (2026-09-25): that dodge reads the car where it will be when the rival is alongside, not where it is.
 */
export const LAST_SINGLE_RIVAL_REVISION = "full-line-v32";

export const RIVAL_RACING = {
  /** Metres ahead, plus this much per m/s of closing speed, that it starts a pass. */
  passReach: 15,
  passReachPerClosing: 1.6,
  /** A player slower than this is parked in the road, not racing: slow for them. */
  racingSpeed: 4,
  /** How far behind, in metres, a closing player gets blocked. */
  blockReach: 25,
  /** Share of the room available that a block uses, and its lateral rate in metres per tick. */
  blockShare: 0.8,
  blockRate: 0.03,
  /** A slower car ahead is slowed for where this car WILL be when it gets there, from where it is at the rate it is
   *  moving across the road, and not only where it means to be (2026-09-22). False is the driver to driver-v1. */
  followWhereItIs: true,
  /** Metres per second squared the car is credited with across the road while it judges that: what the heading
   *  controller delivers once it is steering (1.4 m in the 0.6 s after it began, at 85 mph). Zero would read a car
   *  30 m ahead, in the lane, as unavoidable before the wheel has turned. */
  followAcross: 2,
  /** Metres between the two cars' centres, across the road, at which they touch: the corridor that check keeps clear
   *  when it is alongside, and the margin it adds to that over the first second there is to react. */
  followCorridor: 2,
  followMargin: 0.3,
  /** Metres per second of closing speed under which the check does not apply: an impact there is a nudge, the old
   *  bumper rule holds, and a car slowed to a stop beside a stopped car is let go rather than held (gen-67). */
  followClosing: 4,
} as const;

/**
 * How hard the rival plans corners: its target speed is `speedFactor` of the
 * line's grip-limited speed, never below `minimumSpeed`, braked for at
 * `planningDeceleration` from `brakingMargin` metres before the corner.
 *
 * `speedFactor` is a share of the grip-limited SPEED, and speed goes as the root
 * of grip, so the grip a corner actually uses is its SQUARE.
 *
 * Tuned 2026-09-13 against Shawn's recorded laps of Ridge Circuit (Full, RWD
 * Cinder). At the apexes he used 74-82% of the car's lateral grip and braked at
 * 7-10 m/s² into the big stops; the rival, at 0.62, 5 and 12, used 19-43% and
 * braked at 3-5, lifting 320 m before T1. Braking was safe to match in full.
 * Corner speed was not: the rival follows the centreline with a lagging
 * steering controller, and at 0.82 it overshot the reverse bend after the
 * south junction onto the grass and ran 19.8 m wide on Sound to Sky. 0.74,
 * 0.76 and 0.78 were all clean, so 0.76 kept a margin.
 *
 * 0.80 ON STREETS since 2026-09-19 (Shawn's call). RIVAL_STEERING's feedforward
 * -- which fixes exactly the lagging controller that broke 0.82, landed the same
 * day and reached streets with RIVAL_STREET_CORNERS -- was never swept against
 * this. It raises the ceiling without removing it. The grass, read as
 * `alderGround` over eight street races clear and in traffic, no longer bites at
 * all below 0.92; what bites first now is how wide the arc runs, which
 * `tests/rival-racing.test.ts` holds to 2 m through a 35 degree bend at 52 m/s:
 * 1.18 m at 0.76, 1.60 at 0.80, 1.86 at 0.82, 2.16 at 0.84 and 2.49 at 0.86.
 * 0.80 keeps a fifth of that gate in hand, where 0.82 would sit at 93% of it.
 *
 * So "past about 0.8 its tracking, not its grip, is the limit" still holds; what
 * moved is the symptom, from a wheel on the grass to a wide arc, and with it the
 * ceiling, from 0.76 to about 0.82. Sound to Sky 145.8 s to 144.2.
 *
 * Re-measured 2026-09-23, after the slip term: that 35 degree bend runs 0.96 m wide
 * at 0.80 and 1.26 at 0.92 on the shared fixture, which flatters it. In the names'
 * own cars the limit is a fast gentle bend, two 21 degree bends on a 20 m street
 * after a long run: 0.80 holds the Reign to 1.45 m, 0.84 lets it run 3.25, 0.86
 * 6.10, and the Vesper is 2.33 at 0.80 already. There the steering is at full lock
 * (`steeringAngleFor` allows about 1.5 degrees at 150 mph) and the tyres at 93% of
 * their envelope under full throttle: about 1 g where the planner's grip is 1.56,
 * which is 0.8 squared. So 0.80 is the lock at speed as much as nerve, and it stays.
 * A player takes such a bend faster by using the road's width, which is the street
 * line's job (`bendArcs` in street-line.ts), not this number's.
 *
 * A RACING LINE keeps 0.76 (`RIVAL_BRAKING.speedFactor`): it cannot take more.
 * Ridge Full with Moth's Kestrel goes onto the grass for 53 ticks at 0.80, 111 at
 * 0.82, 149 at 0.84 and 165 at 0.86, where 0.76 puts no wheel off. A K1999 line
 * already spends the track's width on itself, running 2.2-2.6 m from the edges,
 * so an overshoot has nowhere to go; a street rival sits half-way into its lane
 * with metres of asphalt either side. East and Ridge stay clean throughout, so it
 * is Full's long corners that set the ceiling
 * (design/PORT_ALDER.md, "How hard the rival corners").
 *
 * Braking while turning (2026-09-13). The braking plan used to assume a
 * straight: from any corner back to the car, `planningDeceleration` the whole
 * way. It is now a speed profile worked back from the far end of the preview,
 * and at each sample the braking available is what cornering at that speed
 * leaves of `frictionShare` of the grip (a friction ellipse), so it brakes
 * before a curve rather than in it. On the full racing line it is what kept a
 * line 2.2 m from the edges clean on East; at the shipped 2.6 m the laps were
 * clean without it and 0.3 s faster, so it widens the margin rather than being
 * the fix. The fix was steering (RIVAL_STEERING; design/PORT_ALDER.md, "Braking
 * while turning"). On a racing line the plan is RIVAL_BRAKING's instead.
 */
export const RIVAL_CORNERING = {
  speedFactor: 0.80,
  minimumSpeed: 7,
  planningDeceleration: 10,
  brakingMargin: 6,
  /** Share of lateral grip at which cornering leaves the braking plan nothing. */
  frictionShare: 0.9,
} as const;

/**
 * A racing line through clear streets, and how hard it is cornered (2026-09-20,
 * Shawn: "build it at 0.88"). He beat the rival on Uptown Circuit / Clear by
 * 6 to 8 s a lap, all of it within 70 m of a gate: 49.5 mph at the slowest point
 * of a corner against its 32.6. Half of that was the line (lane arcs within its
 * own half of the street, against the whole road: 4.8 s a lap) and half was how
 * much of the grip it planned to use. The rival alone, three laps:
 *
 * | | lap 1 | lap 2 | lap 3 |
 * |---|---|---|---|
 * | lane arcs, 0.80 (every other street race) | 1:37.78 | 1:35.18 | 1:35.18 |
 * | street line, 0.76 | 1:32.45 | 1:30.38 | 1:29.75 |
 * | street line, 0.88 | 1:29.30 | 1:27.07 | 1:26.57 |
 * | street line, 1.00 | 1:27.03 | 1:24.80 | 1:24.40 |
 * | Shawn, racing it, no pedal assist | 1:31.78 | 1:27.53 | 1:26.47 |
 *
 * 0.88 was his pace, to within half a second a flying lap, and he raced it:
 * 1:30.40, 1:25.63, 1:25.92 to its 1:29.47 and 1:27.27, won by 3.4 s where the race
 * before was won by twenty, the lead changing seven times. "Way more competitive",
 * and what would help is "letting the cpu cut corners that aren't grass": he was 20
 * to 28 mph quicker through the fast bends, from 8 to 13 m off the centreline. The
 * line now cuts them (racing-line.ts, "Cutting corners that are not grass"), which
 * is worth about 4 s a lap, so the fraction came down with it. With the cut:
 *
 * | plan | lap 1 | lap 2 | lap 3 |
 * |---|---|---|---|
 * | 0.76 | 1:29.10 | 1:26.82 | 1:25.88 |
 * | 0.80 | 1:27.70 | 1:25.30 | 1:24.47 |
 * | 0.84 | 1:26.55 | 1:24.13 | 1:23.32 |
 * | 0.88 | 1:25.47 | 1:23.02 | 1:22.23 |
 * | 0.92 | 1:24.48 | 1:21.98 | 1:21.30 |
 *
 * Shawn since, the same evening: 1:23.92 and 1:23.38 with no pedal assist, and with
 * it 1:25.62, 1:22.18, 1:21.30, which is the like-for-like race, the rival being on
 * the clamp always. On the same assists he drives what this arithmetic calls 0.92.
 *
 * **0.88 (Shawn, 2026-09-20: "set it to 0.88").** Claude first took it down to
 * 0.80 with the cut, level with his 15:52 laps, and he raced that five times in
 * forty minutes: by the second race he was two seconds a lap quicker than it with
 * no assist, and with the assist on he won by 3 to 4.7 s a lap. 0.88 is about a
 * second a lap quicker than his best valid lap without the assist (1:23.92), which
 * is how the game is played, and nearly two slower than his laps with it. Every
 * row was clean (no reset, no reverse, no wheel off the pavement). That a racing
 * line takes more here than Ridge Circuit's 0.76 (RIVAL_BRAKING) is the road: Ridge
 * Full's long corners put it on the grass at 0.80, and a street corner is over in
 * 30 m with margin either side.
 *
 * Clear streets only. A racing line ignores lanes, and in traffic every one tried
 * ran into it (racing-line.ts); that stays so until the rival reads traffic's
 * forecast. It is the same car on the same tyres under the same clamp: no grip,
 * power or mass is changed, and nothing reads race position.
 */
/**
 * How hard each Blacklist name takes a street line's corners (2026-09-20, Shawn: "build the per-driver numbers"). He
 * had raced Uptown in traffic and "wasn't worried about losing", and the levers on the table were catch-up or taking
 * traffic out of races. This is the one that touches no car and reads no race position: a better driver uses more of
 * the grip the car always had. One number had driven every name, `RIVAL_STREET_LINE`'s 0.88; it climbs the list now, as
 * `BLACKLIST_LAUNCH` does, and a test holds both to the ladder's order (`settings/blacklist.ts`, above the sim).
 *
 * Each is what that name's own car holds. Alone on Uptown's clear line, three laps, every one is clean (valid laps, no
 * wheel off the pavement, no reset). The step above was tried for four: clean for Moth's Kestrel and Crest's Skim at
 * 0.975, and not for Wake, whose Reign puts a wheel off at 0.99, so her 0.96 is a step under her car's limit. Tally's Vesper is clean to 1.00 and loose: past 15 degrees of slip for 74 ticks.
 * In traffic the number is worth 0.3 to 1.5 s a lap and does not change how often a car meets traffic, which goes with
 * the car: the Meridian 65 ticks of contact at 0.88 and 71 at 0.93, the Skim 40 and 30 (design/BLACKLIST.md).
 *
 * Rivet and Sable are here for the ladder's sake; her race is the strip and hers the yard. The circuits field Moth's
 * Kestrel with nobody's name on it, and keep 0.88: Uptown / Clear's pace is Shawn's decision and a test pins it.
 */
export const BLACKLIST_CORNERING: Readonly<Record<string, number>> = {
  moth: .84, stray: .855, rivet: .87, bollard: .885, deuce: .9, sable: .915, plumb: .93, crest: .945, wake: .96, tally: .975,
};

export const RIVAL_STREET_LINE = { speedFactor: 0.88,
  /** Share of a line's shift taken up or given back each tick, in traffic (street-line.ts): about 0.8 s from lane to line. */
  blendRate: 1 / 48 } as const;

/**
 * Steering feedforward (2026-09-13). The rival steered on heading error alone,
 * and an error-only controller holds a steady curve only by being off the line:
 * the steering a bend needs comes from the error that produces it. At 100 mph
 * round T9 that was 3-6 m outward, enough to put a racing line's outside wheel
 * on the grass. It now steers for the line's own curvature first, the wheel angle
 * `atan(wheelbase × curvature)` as a share of the lock allowed at this speed,
 * read `feedforwardLead` seconds ahead for the steering's lag, and the error only
 * corrects. Swept 0.6 to 0.9 on Ridge Circuit's full line, all clean with the
 * braking plan above; 0.8 is the middle. It was racing lines only: a street
 * centreline's curvature at its polyline corners is an artefact of sampling, and
 * steering for it put a generated race's rival 31 m off the street. Street corners
 * are arcs now (RIVAL_STREET_CORNERS), so their curvature is real, and on streets
 * too (2026-09-13) it holds the larger arcs at speed that heading error alone let
 * run wide.
 *
 * `slip` (2026-09-20): the geometry is not the wheel a turn takes. The fronts are
 * softer than the rears (12 against 15) and lighter under power, so the car
 * understeers, and a steady turn takes the geometry plus the difference between
 * the axles' slip angles (`steadyWheelAngleFor`, from the car's own tyres and its
 * load at that moment). At 30 mph that difference is 3% of the lock and nobody
 * noticed; the lock shrinks with the square of the speed, and at 130 mph a 414 m
 * arc took 0.41 degrees by its geometry and 1.5 on the road, of a lock of 1.7.
 * The rest came from the heading error, which means from being wide: 5 m, into an
 * oncoming van at 120 mph (gen-78). A synthetic 21 degree bend flat out: 8.0 m
 * wide without it, 1.7 m with. A lane's bends planned no faster than the lock
 * could hold with a fifth in hand was tried on top and measured on the 83-race
 * batch: 0.06% slower and no cleaner, so it is not here.
 */
export const RIVAL_STEERING = { feedforward: 0.8, feedforwardLead: 0.3, slip: 1 } as const;


/**
 * Reading a car that follows this road in the road's own frame (2026-09-20). `station`: metres its place along the
 * route may be out, as projected along the aim, for that place to be trusted; `verge`: metres past the carriageway it
 * may be and still be on this road; `aligned`: the cosine its heading keeps to the road's, either way (about 25 degrees).
 */
export const RIVAL_TRAFFIC_FRAME = { on: true, station: 10, verge: 2, aligned: 0.9 } as const;

/** Metres off the path of a committed pass at which the car stops trusting that path to be clear (traffic-pass.ts). */
export const PASS_ASTRAY = 1;

/** Metres past the carriageway's edge a rival may be before it counts as lost: a paved shoulder's worth. */
export const OFF_ROAD_MARGIN = 1.5;

/**
 * Passing traffic (2026-09-13): a gap `gap` metres centre to centre beside the car
 * being passed (half of each car and room between), never more than `reach`
 * metres off the route. Passes free to swing to the road's edge were measured
 * and hit more traffic and strayed further (a 31.5 m stray in twelve races).
 */
const PASS = { gap: 3.2, reach: 3.8 } as const;

/**
 * Lane discipline on streets (2026-09-13). A street route is its centreline, and
 * the rival used to rest on it, straddling the centre line and meeting every
 * oncoming car half in its lane. It now rests `share` of the way from the
 * centreline to the middle of the inner lane going its way (`laneOffset`, the
 * lane traffic drives), and passes, dodges and blocks from there. Racing lines
 * are untouched.
 *
 * Measured over 82 generated races in traffic, with the frame fix below in both:
 * on the centreline, 8,135.8 s, 322 contact ticks, 9 races more than 16 m off the
 * street; half-way, 8,046.3 s, 1,218 ticks, none past 16 m, and time lost off
 * course 20.5 s down to 12.3 s. The whole inner lane (share 1) ran into slower cars
 * ahead: 1,346 ticks on the first 42 races. Most of the half-way contact is one
 * corner: races from the default start whose first gates are Main & 4th, then
 * 6th & James, turn right from 4th Ave onto James St 44 s in, the rival runs wide
 * into the oncoming lane, and a truck waits there (11 of the 82). On the
 * centreline it runs as wide and misses the same truck, arriving half a second
 * earlier.
 */
export const RIVAL_LANE = { share: 0.5 } as const;
/** Metres along the route aimed at when the aim is more than a radian off: well outside the tightest circle the car can turn. */
const orbitReach = () => 2.5 * (HANDLING.frontAxleDistance + HANDLING.rearAxleDistance) / Math.tan(HANDLING.maxSteeringAngle);

/**
 * Braking on a racing line: later and harder (2026-09-13). The brake answers
 * excess speed alone, `(speed - target) / 5`, so it presses only once the car is
 * already over its plan: on Ridge Circuit the rival rode 3-5 m/s above a 10 m/s²
 * plan and lifted for T1 on Full 164 m out at 0.60 pedal, where the player brakes
 * at about 120. On a racing line the plan is now `planningDeceleration` with
 * `frictionShare` of the grip for braking in a curve, and where it falls at least
 * `zone` m/s² the rival stays flat out until it reaches the plan, then brakes as
 * hard as the plan falls, less what drag already takes, plus a full pedal per
 * `correction` m/s over it. T1 on Full is braked 144 m out at 11.3 m/s², 0.97 pedal.
 *
 * Swept on the three layouts at zone 12: plan 13 to 15 were clean at share 0.6,
 * and share 0.5 to 0.7 at 14; share 0.75 and 0.9 put East on the grass (13 and 30
 * ticks). Zone 9 to 13 were clean; riding the plan wherever it fell (zone 3) was a
 * second slower on Full, because the lag had carried speed into gentle entries
 * and the chicane that the plan does not allow.
 *
 * Not on streets. Over twelve races in traffic it put four rivals more than 16 m
 * off a street; the harder plan with the old brake put two there, one 24 m off
 * with a reset; the old braking, none. Braking hard for traffic at a junction,
 * the rival stopped where it was hit, or ended on full lock circling its target.
 */
export const RIVAL_BRAKING = {
  /** A racing line's own corner speed: it has no room to run wide (RIVAL_CORNERING). */
  speedFactor: 0.76,
  planningDeceleration: 14,
  /** Share of lateral grip at which cornering leaves the braking plan nothing. */
  frictionShare: 0.6,
  /** m/s² the plan must fall at before the brake rides it. */
  zone: 12,
  /** m/s over the plan that adds a full pedal. */
  correction: 3,
} as const;

export function rivalInput(route: RivalDefinition, state: Pick<RivalState, "vehicle" | "driver"> & { race: RivalState["race"] | null }, obstacles: readonly Obstacle[], opponent: Obstacle | null = null, trafficContext?: PassingContext, why?: RivalSpeedWhy): Input {
  const car = state.vehicle, driver = state.driver;
  if (state.race && (state.race.countdown > 0 || state.race.finished)) return { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  const gate = state.race ? route.gates[state.race.targetIndex]! : route.along.at(-1)!;
  if (route.loop && driver.along > gate - 12 && Math.hypot(car.x - route.points[0]!.x, car.z - route.points[0]!.z) < 8) {
    Object.assign(driver, createRivalDriver(), { recoveries: driver.recoveries, resets: driver.resets, unseenResets: driver.unseenResets });
  }
  // `nearestSide` is the car's offset across that nearest segment, positive to the
  // right; `nearestRoad` is where that puts it across the road, and the road's width.
  let nearest = Infinity, nearestSide = 0, nearestRoad = 0, nearestWidth = Infinity, along = driver.along;
  // Local progress prevents jumping between the outward and return legs.
  // The window's segments, in order: the first ending past its start, until one begins past its end.
  const windowEnd = Math.min(gate + 8, driver.along + 100);
  for (let i = segmentAt(route.along, driver.along - 65); i < route.points.length - 1 && route.along[i]! <= windowEnd; i++) {
    if (route.along[i + 1]! < driver.along - 65) continue;
    const a = route.points[i]!, b = route.points[i + 1]!;
    const dx = b.x-a.x, dz=b.z-a.z, length = Math.hypot(dx,dz);
    const t = clamp(((car.x-a.x)*dx+(car.z-a.z)*dz)/(length*length),0,1);
    const distance = Math.hypot(car.x-a.x-dx*t,car.z-a.z-dz*t);
    if (distance < nearest) {
      nearest=distance; nearestSide=((car.x-a.x-dx*t)*-dz+(car.z-a.z-dz*t)*dx)/length; along=route.along[i]!+t*length;
      nearestRoad = nearestSide + (route.lateral ? route.lateral[i]! + (route.lateral[i + 1]! - route.lateral[i]!) * t : 0);
      nearestWidth = a.width + (b.width - a.width) * t;
    }
  }
  const before = driver.along;
  driver.along = Math.min(gate + 8, alongDriven(route, along, car.x, car.z));
  // On a street line the car's place is the line's, by as much as it is on it: the route's legs jump under a car that
  // cuts a corner, and by then it is all the way on.
  if (route.line && (driver.lineBlend ?? 0) > 0) {
    const on = driver.lineBlend!;
    driver.along = Math.min(gate + 8, driver.along * (1 - on) + alongLine(route.line, before, car.x, car.z) * on);
  }
  // A high-water mark prevents reversing or circling over the same few metres
  // from continually postponing the fallback reset. Off-road drift isn't progress.
  if (driver.along > driver.progressMark + 4 && nearest < sampleRivalPath(route, driver.along).width / 2 + (route.shoulder ?? 0)) {
    driver.progressMark = driver.along;
    driver.noProgressTicks = 0;
  } else driver.noProgressTicks++;
  driver.resetCheckIn = Math.max(0, driver.resetCheckIn - 1);
  const lookAhead = 8 + car.speed * .35;
  const target = sampleDrivingPath(route, Math.min(gate, driver.along + lookAhead));
  const here = sampleDrivingPath(route, driver.along);
  const trafficDecision = route.trafficPassing && trafficContext ? planTrafficPass(route, driver, car, trafficContext) : undefined;
  const pass = trafficDecision?.pass;
  if (trafficDecision) driver.lineGo = false;
  // The street line (street-line.ts): while the corner being read may be taken, the driver blends onto its line over
  // about a second, and off it the same way the moment it may not. With no line, or no go, none of this moves anything.
  const line = route.line, corner = line?.corners[driver.lineCorner ?? -1];
  const taking = !!line && !!corner && !!driver.lineGo && driver.along >= corner.from - 1 && driver.along <= corner.to;
  if (line) driver.lineBlend = clamp((driver.lineBlend ?? 0) + (taking ? RIVAL_STREET_LINE.blendRate : -RIVAL_STREET_LINE.blendRate), 0, 1);
  const blend = driver.lineBlend ?? 0;
  // What it means to drive, for the speed plan and the steering: shifted onto the line where a corner is go.
  const planned = (at: number) => !!line && !!corner && !!driver.lineGo && at >= corner.from && at <= corner.to;
  const intended = (at: number) => {
    if (pass) return passingPoint(route, pass, at);
    const on = sampleDrivingPath(route, at);
    if (!planned(at)) return on;
    const shift = shiftAt(line!, at);
    return { ...on, x: on.x + shift.x, z: on.z + shift.z };
  };
  // It plans with its own car's numbers, the ones its tyres will actually have.
  const handling = handlingFor(route);
  let desiredSpeed = route.speedLimit ?? handling.topSpeed;
  // Every rule below lowers the target through `cap`: the same Math.min, naming the rule that got it lowest (`why`).
  let by = "top", byId: number | undefined;
  const cap = (speed: number, rule: string, id?: number) => { const next = Math.min(desiredSpeed, speed); if (next < desiredSpeed) { by = rule; byId = id; } desiredSpeed = next; };
  // At highway speed, a 100 m preview cannot see a corner early enough to stop,
  // so the preview looks through the whole braking envelope.
  const plan = route.lateral ? RIVAL_BRAKING : RIVAL_CORNERING;
  const { planningDeceleration } = plan;
  const previewDistance = Math.max(100, car.speed ** 2 / (2 * planningDeceleration) + 24);
  const limits: number[] = [], curvatures: number[] = [];
  for (let d = 0; d <= previewDistance; d += 4) {
    const at = driver.along + d;
    const a=line||pass?intended(at-8):sampleDrivingPath(route,at-8), b=line||pass?intended(at):sampleDrivingPath(route,at), c=line||pass?intended(at+8):sampleDrivingPath(route,at+8);
    const ab=Math.hypot(b.x-a.x,b.z-a.z), bc=Math.hypot(c.x-b.x,c.z-b.z), ac=Math.hypot(c.x-a.x,c.z-a.z);
    const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
    const radius=cross<.001?Infinity:ab*bc*ac/(2*cross);
    const cornerSpeed=Math.max(RIVAL_CORNERING.minimumSpeed, maxCorneringSpeed(radius, handling)*(planned(at) ? line!.cornering : route.cornering ?? plan.speedFactor));
    // A straight's limit is infinite; the profile works in finite speeds.
    limits.push(Math.min(cornerSpeed, handling.topSpeed)); curvatures.push(1 / radius);
  }
  // The fastest speed profile the line allows, worked back from the far end:
  // at each sample the braking left is what cornering at that speed does not use.
  const grip = plan.frictionShare * handling.maxLateralAcceleration;
  const profile = new Array<number>(limits.length);
  let v = profile[limits.length - 1] = limits.at(-1)!;
  for (let k = limits.length - 2; k >= 0; k--) {
    const share = v * v * curvatures[k]! / grip;
    v = Math.min(limits[k]!, Math.sqrt(v * v + 2 * planningDeceleration * Math.sqrt(Math.max(0, 1 - share * share)) * 4));
    profile[k] = v;
  }
  // Brake as if every corner were `brakingMargin` metres nearer.
  const marginIndex = Math.min(profile.length - 1, Math.round(RIVAL_CORNERING.brakingMargin / 4));
  const planSpeed = profile[marginIndex]!;
  cap(planSpeed, "corner");
  // How hard the profile slows from here to the next sample: what the brake should
  // deliver while the car rides it. Zero where the profile is not falling.
  const profileSpeed = profile[marginIndex]!, profileNext = profile[Math.min(profile.length - 1, marginIndex + 1)]!;
  const profileDeceleration = Math.max(0, (profileSpeed ** 2 - profileNext ** 2) / (2 * 4));
  // Stay on the road while making room for a slower car. Crossing traffic is
  // handled by braking too; it remains a solid kinematic hazard.
  // On a street, rest towards its own side (RIVAL_LANE): classed as Port Alder
  // classes streets, two lanes each way wider than 14 m.
  const ownSide = route.lateral ? 0
    : RIVAL_LANE.share * laneOffset(target.width, { direction: 1, index: 0 }, target.width > 14 ? "collector" : "local");
  let offset = driver.along < driver.bypassUntil ? driver.recoverySide * Math.min(5, target.width / 2 - 2.2) : ownSide;
  if (pass) offset = passingOffset(route, pass, Math.min(gate, driver.along + lookAhead));
  let blocking = false;
  // A parked or crawling player is in the way, not in the race: that one is
  // avoided and slowed for like any other obstacle. A racing player is raced.
  const hazards = opponent && (pass || opponent.speed < RIVAL_RACING.racingSpeed) ? [...obstacles, opponent] : obstacles;
  if (!trafficDecision && opponent && opponent.speed >= RIVAL_RACING.racingSpeed && state.race && driver.along >= driver.bypassUntil
    && Math.abs(opponent.y - car.y) <= 3) {
    const dx = opponent.x - car.x, dz = opponent.z - car.z;
    const ahead = dx * target.ux + dz * target.uz, side = dx * -target.uz + dz * target.ux;
    const room = Math.min(3.8, target.width / 2 - 2.2);
    const opponentAlong = opponent.speed * (-Math.sin(opponent.heading) * target.ux - Math.cos(opponent.heading) * target.uz);
    const closing = car.speed - opponentAlong;
    const reach = RIVAL_RACING.passReach + Math.max(0, closing) * RIVAL_RACING.passReachPerClosing;
    if (ahead > 0 && ahead < reach && Math.abs(side) < 4 && room > 0) {
      // Behind them: take the side they are not covering. It does not queue,
      // so there is no speed match here; if the gap shuts, it is contact.
      offset = side >= 0 ? -room : room;
    } else if (ahead < -2.5 && ahead > -RIVAL_RACING.blockReach && Math.abs(side) < 6 && closing < 1 && room > 0
      // Not while braking for a corner: a block there throws the car wide.
      && desiredSpeed >= car.speed - 2) {
      // Ahead of them and being caught: cover their side of the road.
      offset = clamp(side, -room, room) * RIVAL_RACING.blockShare;
      blocking = true;
    }
    // Alongside (|ahead| small) nothing is added: it holds its line and does
    // not brake for them.
  }
  // Traffic (2026-09-13). It used to slow for anything within 5 m of its line
  // ahead, at that car's speed along the line: a car crossing a junction 80 m
  // on has none, so it braked for cars that would be gone before it arrived,
  // and it queued behind slower cars it could have passed. Now each car is
  // judged by where it will be when the rival gets there.
  const slowFor = (along: number, ahead: number, length: number, rule: string, id?: number) => {
    cap(Math.max(0,along)+Math.max(0,ahead-length-5)*.65, rule, id);
  };
  // Every lateral position below is an offset from the route, the frame
  // `driver.avoidance` is in (2026-09-13). `side` is measured from the car, so a
  // car's offset from the route is `side` plus the car's own, `carOffset`.
  // Comparing `side` with `driver.avoidance` directly, as this loop did, was
  // right only while the rival was on its route: 3.8 m out to pass a truck on
  // Uptown Circuit, it saw the truck 1.2 m to its left as 5 m out of its path,
  // neither slowed nor moved, and pushed it at full throttle for 42 s.
  // The shoulder is road: a pass's path, a dodge or a block may use it (`shoulder`).
  const edge = Math.max(0, target.width / 2 + (route.shoulder ?? 0) - 2.2);
  // Never past the line itself: a line that cuts a corner over the pavement is further from the road's centre than
  // `edge`, and these would otherwise push the aim off it, back towards the road, at every apex.
  const lowest = Math.min(0, -edge - target.lateral), highest = Math.max(0, edge - target.lateral);
  const normalX = -target.uz, normalZ = target.ux;
  // This car's own offset in the same frame as `side`: across the route at the aim
  // point. Not `nearestSide`, which is across the nearest segment: through a corner
  // that is still the street being left, and on seed 17 it put a stopped truck
  // dead ahead 2.2 m to the side, out of the path, and the rival drove into it.
  const carOffset = (car.x - target.x) * normalX + (car.z - target.z) * normalZ;
  // Heights are compared above the road, not raw (2026-09-16). A car is ignored when
  // it sits more than 3 m off the route's height where it is, measured against how far
  // this car sits off the route here: a bridge overhead, never the same road rising.
  // Comparing raw heights hid a car on the same street whenever the road climbed or
  // fell 3 m within the look-ahead, which at top speed is about a third of the city's
  // streets; on Queen Anne Climb it hid an oncoming sedan until it was 54 m away.
  const aboveRoute = car.y - routeHeightAt(route, driver.along);
  // Where across the route it means to be at the aim point: the offset it is easing to, and as much of the line's
  // shift as it has taken up.
  const aimShift = line && blend > 0 ? shiftAt(line, Math.min(gate, driver.along + lookAhead)) : null;
  const intent = (pass ? offset : driver.avoidance) + (aimShift ? blend * (aimShift.x * normalX + aimShift.z * normalZ) : 0);
  // Pulling out or coming back in, is the car where its pass says it is?
  const astray = !!pass && Math.abs(carOffset - passingOffset(route, pass, driver.along)) > PASS_ASTRAY;
  for (const obstacle of hazards) {
    const dx=obstacle.x-car.x, dz=obstacle.z-car.z;
    const ahead=dx*target.ux+dz*target.uz, side=dx*normalX+dz*normalZ;
    if (Math.abs(obstacle.y - routeHeightAt(route, driver.along + ahead) - aboveRoute) > 3) continue;
    const length=(obstacle.length??4.2)/2+2.1;
    const headingX=-Math.sin(obstacle.heading), headingZ=-Math.cos(obstacle.heading);
    // A car following this road is read in the road's frame where IT is, not the aim point's (`RIVAL_TRAFFIC_FRAME`):
    // its place across the route there, and its speed along and across the road there. Round a bend the aim point's
    // frame is turned from the road under a car 100 m on by the bend itself, so a van keeping to the oncoming lane
    // read as crossing into this car's path, and the rival stabbed the brake at 123 mph in the middle of a 21 degree
    // bend (gen-78). Anything else (a side street's car, one the projection has misplaced round a sharp corner) is
    // read from the aim point as before.
    const road = RIVAL_TRAFFIC_FRAME.on && !pass ? sampleDrivingPath(route, driver.along + ahead) : null;
    const follows = !!road && Math.abs((obstacle.x - road.x) * road.ux + (obstacle.z - road.z) * road.uz) < RIVAL_TRAFFIC_FRAME.station
      && Math.abs((obstacle.x - road.x) * -road.uz + (obstacle.z - road.z) * road.ux) < road.width / 2 + RIVAL_TRAFFIC_FRAME.verge
      && Math.abs(headingX * road.ux + headingZ * road.uz) > RIVAL_TRAFFIC_FRAME.aligned;
    const offRoute = follows ? (obstacle.x - road!.x) * -road!.uz + (obstacle.z - road!.z) * road!.ux : side + carOffset;
    if (pass) {
      // The committed path already owns the full forecast. Keep a short,
      // body-relative emergency check; the old straight-line arrival guess
      // otherwise brakes for cars the curved passing path safely clears.
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      const immediate = dx * fx + dz * fz, lateral = dx * -fz + dz * fx;
      // That check is short because the path is clear, and the path is clear only of a car that is ON it. Pulling out
      // at 105 mph round a sedan that had all but stopped (gen-46), this car was still drifting the other way from the
      // bend before, was 1.2 m short of its path a fifth of a second in and 2.2 m short where it should have been
      // clear, saw the sedan at 26 m and hit it at 91 mph. Off its path by `PASS_ASTRAY`, it looks as far as it
      // would with no pass at all.
      if (immediate > 0 && immediate < (astray ? 15 + car.speed * 1.6 : length + car.speed * .45) && Math.abs(lateral) < 2.6) {
        const speed = obstacle.speed * (-Math.sin(obstacle.heading) * fx - Math.cos(obstacle.heading) * fz);
        slowFor(speed, immediate, length, "pass-hold", obstacle.id);
      }
      continue;
    }
    if (ahead < -length || ahead > 15+car.speed*1.6) continue;
    const along=obstacle.speed*(follows ? headingX*road!.ux+headingZ*road!.uz : headingX*target.ux+headingZ*target.uz);
    const across=obstacle.speed*(follows ? headingX*-road!.uz+headingZ*road!.ux : headingX*normalX+headingZ*normalZ);
    const crossing=Math.abs(across)>2;
    if (!crossing && Math.abs(follows ? offRoute-carOffset : side)>5) continue;
    // Its offset from the route when this car reaches it, and how wide a
    // corridor that has to miss: a crossing car sweeps its own length.
    const arrival=Math.max(0,ahead-length)/Math.max(1,car.speed-along);
    const sideAtArrival=offRoute+across*arrival;
    const inPath=Math.abs(sideAtArrival-intent)<(crossing?length:2.6);
    if (crossing || along < -2) {
      // Crossing, or oncoming: it matters only if it will be across the line
      // when this car gets there, and then it is slowed for rather than
      // swerved round. Swerving round oncoming cars was tried on 2026-09-13
      // and lost time and hit more traffic (187 s, 119 contact ticks, against
      // 182 s and 30): the rival's line runs down the middle of the street, so
      // an oncoming car is often genuinely in its way. That is the line's
      // problem, not this loop's.
      if (inPath && ahead>0) slowFor(along,ahead,length,crossing ? "crossing" : "oncoming",obstacle.id);
      continue;
    }
    if (trafficDecision) {
      if (inPath && ahead > 0) slowFor(along, ahead, length, "pass-path", obstacle.id);
      continue;
    }
    // Same direction: pass it on whichever side is clear, the way it passes the
    // player, to a gap beside it (`PASS`), the nearer side first. A side that
    // would not clear the car is no side. Only with nowhere to go, or already on
    // its bumper, does it take that car's speed.
    // A side is clear if nobody is beside this car there now, beside the car being
    // passed there now, or there when this car gets alongside it. The last is for an
    // oncoming car: on Uptown the rival pulled out round a queue at the hairpin into
    // the path of a car 41 m away and closing at 35 m/s, clear by the first two.
    const alongside=Math.min(4,arrival);
    const passAt=(candidate: number)=>({ x: obstacle.x-Math.sin(obstacle.heading)*obstacle.speed*alongside+normalX*(candidate-offRoute),
      z: obstacle.z-Math.cos(obstacle.heading)*obstacle.speed*alongside+normalZ*(candidate-offRoute) });
    const clear=(candidate: number)=>!hazards.some(other=>other!==obstacle && (
      Math.hypot(other.x-(car.x+normalX*(candidate-carOffset)),other.z-(car.z+normalZ*(candidate-carOffset)))<7
      || Math.hypot(other.x-(obstacle.x+normalX*(candidate-offRoute)),other.z-(obstacle.z+normalZ*(candidate-offRoute)))<7
      || Math.hypot(other.x-Math.sin(other.heading)*other.speed*alongside-passAt(candidate).x,other.z-Math.cos(other.heading)*other.speed*alongside-passAt(candidate).z)<7));
    const reach=Math.min(PASS.reach, edge);
    // Where it will be when this car is alongside, as far as `alongside` looks, not where it is (driver-v7, 2026-09-25),
    // for whether it is in the way, the sides it offers and whether there is none: the crossing branch above has always
    // read a car at arrival. Read where it was, a box truck finishing its turn onto Uptown's road was 3.8 m from the
    // rival's line and left alone, and came 1.2 m across in the last second to 2.5, at 117 mph (seed 1000).
    const there=offRoute+across*alongside;
    const sides=[there-PASS.gap,there+PASS.gap].map(c=>clamp(c,Math.max(lowest,-reach),Math.min(highest,reach)))
      .filter(c=>Math.abs(c-there)>=2.6).sort((a,b)=>Math.abs(a-intent)-Math.abs(b-intent));
    const open=sides.find(clear);
    // Only round a car that is in the way (driver-v6, 2026-09-25): nearer where it means to be than the gap it passes
    // at. Taken for any car within 5 m, the side nearest its line moved it TOWARDS an SUV standing at a bar in the
    // outer lane, 4.5 m clear of it, to pass it at 3.2; at 105 mph it ran 1.25 m past that and hit the SUV at 110 (gen-19,
    // seed 1000). A car further off is left where it is, as if it were not there.
    const dodge=open!==undefined && Math.abs(there-intent)<PASS.gap ? open : undefined;
    if (dodge!==undefined) { offset=dodge; blocking=false; }
    const onBumper=ahead-length<4;
    // And, for a car following this road, against where this car will actually BE when it gets there (2026-09-22):
    // from where it is, at the rate it is moving across the road, towards the side being chosen now (`open`) or where
    // it already means to be, and never past it, credited with the lateral acceleration it has (`followAcross`) so a
    // car it has room to pass is not read as unavoidable before the wheel has turned. `intent` moves 4 m/s the moment
    // a side is chosen; at 85 mph the car behind it moved 0.4 m in the 0.75 s that took (gen-wake-42, 2465 m, Shawn's
    // race): a sedan 24 m ahead at 31 mph read as out of its path, the foot stayed down, and the hit spun it for 5 s.
    // Every offset here is across the road at its own station and nothing is projected onto another's frame: her
    // offset at the aim point 17 m on and her offset projected onto the road 60 m on differed by 0.65 m where the road
    // bent, and carrying `open` across as a displacement braked gen-54 from 100 to 35 mph for a truck 4.6 m beside
    // its line. Where she is: `nearestSide`, across the route at her own station; where the car is: `offRoute`, across
    // the road at its; where she means to be: `open`, across the road where the aim is, the same quantity followed.
    const carAcross = (car.x - here.x) * -here.uz + (car.z - here.z) * here.ux, nx = -here.uz, nz = here.ux;
    const acrossRate = (-Math.sin(car.heading) * car.forwardSpeed + Math.cos(car.heading) * car.lateralSpeed) * nx
      + (-Math.cos(car.heading) * car.forwardSpeed - Math.sin(car.heading) * car.lateralSpeed) * nz;
    const meant = dodge ?? intent;
    const toward = Math.sign(meant - carAcross), moving = Math.max(0, acrossRate * toward);
    const willBe = carAcross + toward * Math.min(Math.abs(meant - carAcross), moving * arrival + .5 * RIVAL_RACING.followAcross * arrival * arrival);
    // Alongside, the corridor is the cars' own width: matching the speed of a car 2.5 m beside this one is not a way
    // out of its path (gen-70 again, 135 ticks); with a second to react it has `followMargin` on top. Not the loop's
    // 2.6 m: a truck drifting 0.5 m/s across the road in its own lane (gen-54, a bend) was 2.5 m from where she would
    // be, which driver-v1 passed at, and 2.6 braked her from 100 mph to 35 for it.
    // Not under `followClosing` of closing speed: a car slowed to a stop beside a stopped car 2.5 m off its line is
    // let go, where held to this it stayed stopped until the unseen reset (gen-67, the old rule passed it at 34 mph).
    const corridor = RIVAL_RACING.followCorridor + RIVAL_RACING.followMargin * Math.min(1, arrival);
    const stillInPath = RIVAL_RACING.followWhereItIs && follows && car.speed - along > RIVAL_RACING.followClosing && Math.abs(sideAtArrival - willBe) < corridor;
    if (ahead>0 && ((Math.abs(there-intent)<2.8 && (open===undefined || onBumper)) || stillInPath)) slowFor(along,ahead,length,stillInPath ? "follow" : onBumper ? "bumper" : "no-side",obstacle.id);
  }
  // A block eases across; dodging a hazard or taking a pass does not wait.
  const lateralRate = blocking ? RIVAL_RACING.blockRate : .07;
  if (pass) driver.avoidance = offset;
  else driver.avoidance += clamp(offset-driver.avoidance,-lateralRate,lateralRate);
  // However far a pass, block or dodge moves it, the car stays on the road: on a
  // racing line the room each side is measured from where the line already is.
  driver.avoidance = clamp(driver.avoidance, lowest, highest);
  let tx=target.x-target.uz*driver.avoidance, tz=target.z+target.ux*driver.avoidance;
  // The shift is added after the clamp: the line has checked its own ground, and the clamp knows only the carriageway.
  if (aimShift) { tx += blend * aimShift.x; tz += blend * aimShift.z; }
  let error=angle(Math.atan2(car.x-tx,car.z-tz)-car.heading);
  if (Math.abs(error)>1) {
    // More than a radian off, at a sharp corner or after a shove, the aim can be
    // inside the tightest circle the car can turn (8.4 m at full lock): steering
    // for it at full lock orbits it, and the aim does not move because the car
    // makes no progress. Seed 5 circled a junction corner for 3.5 s that way.
    // Aim further along the route instead, outside that circle.
    const wideAt = Math.min(gate, driver.along + Math.max(lookAhead, orbitReach()));
    const wide = sampleDrivingPath(route, wideAt);
    const wideOffset = pass ? passingOffset(route, pass, wideAt) : driver.avoidance;
    tx=wide.x-wide.uz*wideOffset; tz=wide.z+wide.ux*wideOffset;
    if (aimShift) { const shift = shiftAt(line!, wideAt); tx += blend * shift.x; tz += blend * shift.z; }
    error=angle(Math.atan2(car.x-tx,car.z-tz)-car.heading);
  }
  if (Math.abs(error)>1) cap(6, "aim");
  // Lost: held to 10 m/s until it is back, which is off the road. On a racing line
  // the line and any pass already use most of the width, and in a recorded race
  // (2026-09-13) the rival abandoning a re-pass at 95 mph drifted 6.5 m from its
  // line, still 4 m inside the edge, read as lost, and braked to 59 mph in the kink
  // after the Drop. On a street it was more than 5 m from the centreline, and on
  // the larger arcs of 2026-09-13 it tracked 5.5 m out at 95 mph and was braked
  // to 22 mph mid-bend on an empty street.
  // A line that cuts a corner is itself past the carriageway there, by design and over ground it has checked
  // (`clearance`). Read from the road's centre alone, the rival was "lost" at the apex of Harrison & Broadway on every
  // lap, 8.5 m from a 14 m street's centre and 2 m inside its own line, and braked for 22 mph where it planned 36.
  // On a street line it is past the carriageway where the line is, over ground the line has checked.
  const onItsLine = () => {
    const at = sampleDrivingPath(route, driver.along), shift = shiftAt(line!, driver.along);
    return Math.hypot(car.x - (at.x - at.uz * driver.avoidance + blend * shift.x), car.z - (at.z + at.ux * driver.avoidance + blend * shift.z)) < line!.clearance;
  };
  const lost = Math.abs(nearestRoad) > nearestWidth / 2 + (route.shoulder ?? 0) + OFF_ROAD_MARGIN && Math.abs(nearestSide) >= (route.clearance ?? 0)
    && !(line && blend > 0 && onItsLine());
  if (lost) cap(10, "lost");
  if (driver.along < driver.bypassUntil) cap(8, "bypass");
  if (pass) cap(pass.speed, "pass-plan");
  driver.targetSpeed=desiredSpeed;
  if (why) { why.plan = planSpeed; why.target = desiredSpeed; why.by = by; why.id = byId; }
  if (car.speed<1.2) driver.stuckTicks++; else driver.stuckTicks=0;
  if (driver.stuckTicks>100 && driver.reverseTicks===0) {
    driver.reverseTicks=110; driver.stuckTicks=0; driver.recoveries++;
    driver.recoverySide=Math.abs(error)>.1 ? -Math.sign(error) : driver.recoveries%2 ? 1 : -1;
    driver.bypassUntil=driver.along+20;
  }
  if (driver.reverseTicks>0) {
    driver.reverseTicks--;
    return {throttle:0,brake:car.forwardSpeed < -4 ? 0 : .65,steer:-driver.recoverySide*.8,handbrake:0};
  }
  // Heading feedback plus lateral-slip correction. The same steering envelope
  // and tyre forces that constrain the player constrain this request.
  // Feedforward: the wheel angle the line's curvature needs, as a share of the
  // lock the car allows at this speed, read a little ahead for the steering's lag.
  const ahead = Math.min(gate, driver.along + car.speed * RIVAL_STEERING.feedforwardLead);
  const p = line ? intended(ahead - 8) : sampleDrivingPath(route, ahead - 8), q = line ? intended(ahead) : sampleDrivingPath(route, ahead), r = line ? intended(ahead + 8) : sampleDrivingPath(route, ahead + 8);
  const pq = Math.hypot(q.x - p.x, q.z - p.z), qr = Math.hypot(r.x - q.x, r.z - q.z), pr = Math.hypot(r.x - p.x, r.z - p.z);
  // Signed, positive for a right-hand bend, which positive steer turns into.
  const lineCurvature = pq * qr * pr > 1e-6 ? 2 * ((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x)) / (pq * qr * pr) : 0;
  const wheelbase = HANDLING.frontAxleDistance + HANDLING.rearAxleDistance;
  // And the slip the tyres need to make that turn (`slip`): the fronts are softer than the rears and lighter under
  // power, so a steady turn takes more wheel than its geometry, by the difference between the two axles' slip angles.
  const geometry = Math.atan(wheelbase * lineCurvature);
  const tyreSlip = steadyWheelAngleFor(car.forwardSpeed, lineCurvature, car.frontLoadFraction, handling, Math.max(0, car.longitudinalAcceleration)) - geometry;
  const feedforward = (RIVAL_STEERING.feedforward * geometry + RIVAL_STEERING.slip * tyreSlip) / Math.max(1e-6, steeringAngleFor(car.forwardSpeed, 1, handling));
  const steer=clamp(-error*3.5 + car.lateralSpeed*.025 + feedforward,-1,1);
  // A clear racing straight needs full engine demand to overcome high-speed drag.
  // Feather only when the route, traffic or recovery asks for a lower speed.
  let throttle = desiredSpeed >= handling.topSpeed ? 1 : clamp((desiredSpeed-car.speed)/5+.16,0,1);
  let brake = car.speed>desiredSpeed+.5?clamp((car.speed-desiredSpeed)/5,0,1):0;
  // On a racing line, in a hard stop that the corner plan sets (not traffic, a pass
  // or being lost): flat out until the plan is reached, then brake as hard as it
  // falls, less what drag already takes, plus a correction for being over it.
  if (route.lateral && profileDeceleration > RIVAL_BRAKING.zone && desiredSpeed >= profileSpeed - .5) {
    if (car.speed < desiredSpeed) throttle = 1;
    else if (car.speed > desiredSpeed) {
      const wanted = Math.max(0, profileDeceleration - handling.aerodynamicDrag * car.speed ** 2) / handling.brakeDeceleration;
      brake = clamp(Math.min(1, wanted) ** (1 / HANDLING.brakeResponseExponent) + (car.speed - desiredSpeed) / RIVAL_BRAKING.correction, 0, 1);
    }
  }
  return {throttle:brake>0||car.speed>desiredSpeed+.5?0:throttle,
    brake,
    steer,handbrake:desiredSpeed<.5&&car.speed<.7?1:0};
}

/** Every table the driver above reads, for its fingerprint (rival-revision.ts): a number changed here renames the
 *  rival of every raced recording, whether or not anybody remembered to. A new table belongs in this list. */
export const RIVAL_TABLES = { RIVAL_STREET_CORNERS, RIVAL_RACING, RIVAL_CORNERING, RIVAL_STEERING, RIVAL_TRAFFIC_FRAME, PASS_ASTRAY,
  OFF_ROAD_MARGIN, PASS, RIVAL_LANE, RIVAL_BRAKING } as const;
