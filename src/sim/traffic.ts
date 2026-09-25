import type { LanePose } from "./lanes.ts";

/**
 * Traffic: sparse, readable moving hazards (GDD §12), not urban density. It is
 * simulation, so it lives here and the renderer only draws it, and it is
 * deterministic, so a run reproduces from (start state + input log) with the
 * same vans in the same places.
 *
 * Conflicts are resolved by reservation, not by looking for near misses. The
 * district guarantees that two carriageways share ground only within 70 m of a
 * junction they both meet at — `tests/district.test.ts` gates it — so every
 * place two vehicles can collide is a junction, every one is known offline, and
 * a vehicle asks permission to cross rather than watching for trouble.
 *
 * An earlier attempt sampled predicted positions and braked for near misses
 * instead. Five variants, all measured: each traded gridlock against vehicles
 * driving through each other, the best still leaving 170 overlap sites in five
 * minutes, and the whole thing swung wildly when lane geometry moved by
 * centimetres. That is what a heuristic standing in for a fact looks like.
 *
 * Determinism note: every choice below routes through `mix`, an integer hash.
 * The renderer's `hash01` uses `Math.sin`, whose last bits are not specified
 * across engines — harmless for where a neon sign goes, fatal for which way a
 * lorry turns. Nothing in here may use it.
 */

/** Integer avalanche hash. `Math.imul` and the shifts are exactly specified, so
 *  the same tick gives the same answer on every engine. */
export function mix(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export type TrafficKind = "sedan" | "taxi" | "suv" | "van" | "box-truck";

/**
 * How traffic drives, for anything replayed through it: a recording made in
 * traffic reproduces only on the traffic that drove it. "traffic-v2"
 * (2026-09-13): traffic yields to the cars it does not drive (`TrafficRacer`).
 * "traffic-v3": nothing slower than 35 mph. "traffic-v4":
 * junctions held for a racer that could not stop before reaching them.
 */
// v5 adds SUVs to the deterministic fleet, with their own collision dimensions.
// v6 (2026-09-20): corners and lane bends are driven as curves and slowed for
// (`Corner`), where a vehicle used to drive to its lane's end and slide onto the next.
// v7 (2026-09-20): a lane no longer runs backwards over a street segment shorter
// than its mitre (`unfold` in lanes.ts). One lane of 4th Ave is 1.4 m shorter. It
// is too short to start a vehicle on, so traffic is laid out exactly as before;
// but its length is part of the reservation spans at both its junctions, and
// traffic differs from v6 within ten seconds, from the first vehicle through them.
// v8 (2026-09-22): a claim reckons how long the vehicle will hold its junction from
// the corner it will take, not the speed it has (`clearingTime`), so it holds a
// junction for a racer it would have turned across. Traffic alone is unchanged.
// v9 (2026-09-23): a racer can knock a car off its lane (`knockTraffic`, sim.ts): near a racer a car is a physics
// body of its kind's mass for the tick, hit hard enough it is a wreck until it is put back out of sight
// (`restoreTraffic`), and traffic queues behind a wreck and keeps out of a junction it sits in. Traffic alone is
// unchanged.
// v10 (2026-09-24): a car on a red-flash or stop-sign approach (design/INTERSECTIONS.md) stops with its front at the painted
// bar and stands there `STOP_DWELL` before it may claim, where it used to claim from 34 m out on the move; the forecast
// holds it there too. Amber approaches and undressed junctions are driven as before. A claim's reckoning near racers
// (`clearingTime`) floors a corner at traffic's own crawl, 2 m/s, where it floored it at a racer's 3.
// v11 (2026-09-24): 31 more junctions dressed (intersection-dressing.ts, the second pass), so traffic stops at their
// bars too: 144 of 169, where the rival's crossing incidents at bare junctions were. The rules are v10's.
export const TRAFFIC_REVISION = "traffic-v11";

/**
 * A car traffic does not drive but must not drive into (2026-09-13): the player,
 * the rival, a parked rival. Traffic used to be blind to them. It stays a solid,
 * kinematic hazard that no racer can push, but it follows a racer in its lane as
 * it follows its own kind, and it does not claim a junction a racer is in or is
 * about to cross. Blind, it shoved a rival slowed into a one-lane street for ten
 * seconds and turned a truck across a rival passing it at 100 mph.
 */
export interface TrafficRacer {
  readonly x: number; readonly z: number; readonly heading: number; readonly speed: number;
  /** A thing in the road rather than a car racing it: a wreck (`traffic-v9`). Queued behind whichever way it points,
   *  and a junction it sits in is not claimed, moving or not. */
  readonly obstacle?: boolean;
}
/** A racer's length, for gaps: the longest car a racer drives, with some to spare. */
const RACER_LENGTH = 4.8;
/** Metres either side of a lane a racer counts as in it: half a lane, and half a car. */
export const RACER_IN_LANE = 2.6;
/** Metres from a movement's path a racer counts as in its way: half of each car and room. */
const RACER_IN_JUNCTION = 5;
/**
 * How far along a racer's course a junction is checked (2026-09-13): the longer
 * of the time the waiting car needs to clear it and the time the racer needs to
 * stop, never more than `max` seconds. A flat four seconds is 217 m at 122 mph:
 * on seed 5 a car claimed its junction with the rival about 250 m out, turned
 * across it, and the rival, unable to stop, hit it at 113 mph.
 */
export const RACER_HORIZON = { braking: 9, reaction: 0.5, max: 8 } as const;
/** A racer slower than this, m/s, holds no junction: it is waiting, not crossing. */
const RACER_MOVING = 3;

export interface TrafficKindSpec {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  /** Cruise speed in m/s. All well under the car: traffic is an obstacle. */
  readonly cruise: number;
  /** Kilograms it has when a racer hits it (`traffic-v9`); absent, nothing moves it. */
  readonly mass?: number;
}

export const TRAFFIC_KINDS: Readonly<Record<TrafficKind, TrafficKindSpec>> = {
  // Nothing slower than 35 mph (2026-09-13): sedan 40, taxi 38, van 36, box truck
  // 35. At 25-35 mph the trucks and vans were what clogged a street for a racer.
  // Masses are the MC3 feel, not the kerb weights (Shawn, 2026-09-23): clipping a sedan
  // should cost a second, not the race, against cars of 1,050 to 1,900 kg. A box
  // truck is a wall.
  sedan: { length: 4.4, width: 1.85, height: 1.42, cruise: 17.9, mass: 900 },
  taxi: { length: 4.6, width: 1.88, height: 1.5, cruise: 17, mass: 950 },
  suv: { length: 4.85, width: 1.98, height: 1.82, cruise: 17, mass: 1_200 },
  van: { length: 5.4, width: 2, height: 2.25, cruise: 16.1, mass: 1_500 },
  "box-truck": { length: 7.2, width: 2.4, height: 3.1, cruise: 15.7 },
};

const KIND_ORDER: readonly TrafficKind[] = ["sedan", "sedan", "suv", "taxi", "van", "box-truck"];

export interface TrafficLane {
  readonly id: number;
  readonly length: number;
  /** Movements leaving the far end of this lane. Never empty. */
  readonly movements: readonly number[];
  /** Metres before the end of this lane at which its junction begins. */
  readonly entry: number;
  /** How its junction is controlled (design/INTERSECTIONS.md, step 2), where step 1 dressed it. Absent is as before. */
  readonly control?: TrafficControl;
}

/**
 * A lane's junction control (`traffic-v10`, 2026-09-24). `stop`: a red flash or a stop sign, where a car stops with
 * its front at the painted bar, `stopAt` metres along the lane, and stands there `STOP_DWELL` before it may claim the
 * junction at all. `priority`: an amber flash, driven as every lane was before. A lane with none is driven as before.
 */
export interface TrafficControl {
  readonly rule: "stop" | "priority";
  readonly stopAt: number;
}
/** Seconds a car stands at its bar before it may claim (Shawn, 2026-09-24: a full stop, which reads). */
export const STOP_DWELL = 0.8;
/** Metres short of its bar a car's front counts as at it, and the speed under which it is standing. */
const AT_BAR = 1.5, STANDING = 0.3;
/** Where a car on a stop lane that has not yet reached it stops: its front at the bar, or the junction's entry line where
 *  the bar is inside it (12 lanes). Null on any other lane, and for a car already past the point, which is driven as
 *  it was before the bars. */
function stopPoint(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): number | null {
  const lane = network.lanes[vehicle.lane]!, control = lane.control;
  if (control?.rule !== "stop") return null;
  const at = Math.min(control.stopAt, lane.length - lane.entry);
  return vehicle.distance <= at + 0.5 ? at : null;
}

/**
 * One way through a junction: arrive on `from`, leave on `to`. `conflicts` are
 * the other movements at that junction whose path this one crosses, computed
 * offline from the lane geometry — two vehicles holding conflicting movements
 * may not be inside the junction together.
 */
export interface TrafficMovement {
  readonly id: number;
  readonly junction: number;
  readonly from: number;
  readonly to: number;
  /**
   * The other movements this one crosses, each with the stretch of *both* paths
   * over which they cross.
   *
   * Held as spans rather than as a plain flag because a flag is far too coarse
   * here: streets leaving a junction on similar bearings run within a vehicle's
   * width of each other for 70 m, so "this movement is occupied" locks the
   * crossing for as long as anyone is anywhere alongside. Positions make it
   * "occupied *where we actually cross*", which is what a reservation means.
   */
  readonly conflicts: readonly TrafficConflict[];
  /** Metres into `to` at which a vehicle taking this movement is clear. */
  readonly clear: number;
  /**
   * Stretches of other lanes this movement's path sweeps over.
   *
   * Conflicts cover vehicles that will *arrive*; this covers vehicles already
   * *sitting* there. A queue on a short lane between two close junctions can
   * stand inside a crossing movement's path while holding no reservation at
   * all, so nothing in the movement's conflict set knows about it.
   */
  readonly sweeps: readonly TrafficSweep[];
}

export interface TrafficConflict {
  readonly other: number;
  /** Signed metres along this movement — negative before the junction, positive
   *  after — over which the two paths are within a vehicle of each other. */
  readonly from: number;
  readonly to: number;
  /** The same stretch measured along the other movement. */
  readonly otherFrom: number;
  readonly otherTo: number;
}

export interface TrafficSweep {
  readonly lane: number;
  readonly from: number;
  readonly to: number;
}

/** A vertex of a lane's own polyline: metres along the lane, and how far it turns there (positive is left). */
export interface TrafficBend { readonly distance: number; readonly turn: number }

/** What traffic needs from a world to drive it. Supplied by whichever world has
 *  lanes; `RoadWorld.traffic` is optional and Blackglass has none. */
export interface TrafficNetwork {
  readonly lanes: readonly TrafficLane[];
  readonly movements: readonly TrafficMovement[];
  pose(lane: number, distance: number): LanePose;
  /** Where a lane turns along its own length, in order. A world without them has lanes driven as drawn. */
  bends?(lane: number): readonly TrafficBend[];
  /** Metres from a lane's line to the kerb on its right, at least. A world that cannot say is taken to have half a lane's. */
  kerb?(lane: number): number;
  /** Ground height anywhere, not only on a lane. A vehicle crossing a junction
   *  is briefly between two lanes, and `pose` can only answer for one of them. */
  height(x: number, z: number): number;
}

export interface TrafficVehicleState {
  readonly id: number;
  readonly kind: TrafficKind;
  lane: number;
  /** Metres along the current lane, in its own direction of travel. */
  distance: number;
  speed: number;
  /** The movement this vehicle will take at the end of its current lane. */
  movement: number;
  /** Seconds stood at its bar on a stop lane, holding nothing (`traffic-v10`). Absent until it has stood. */
  stood?: number;
  /**
   * The movements it currently occupies, in the order it will drive them.
   *
   * Usually one. It is a chain where the lane between two junctions is shorter
   * than the junction regions either side of it: there is nowhere on that lane
   * to stand without blocking, so a vehicle that entered holding only the first
   * movement strands inside it, and the vehicle stopped ahead of it is waiting
   * on exactly the movement it holds. That is a deadlock with no local escape,
   * so the pair of junctions is reserved together or not at all.
   */
  holds: number[];
  /** How many junctions this vehicle has crossed — the routing hash's counter. */
  turns: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  /**
   * The movement it arrived on this lane by, or -1: which corner it is still
   * driving out of (`Corner`). `holds` cannot say, because a chain drops each
   * movement as the next takes over.
   */
  via: number;
  /** Slowing, or held at a standstill: what its brake lights show. */
  braking: boolean;
  /** The traffic seed it was laid out under (`createTraffic`), and part of which way it turns at every junction.
   *  Absent is seed 0: the one traffic every run had to 2026-09-22. Carried on the vehicle, so a forecast and the
   *  indicators, which copy the vehicle, read the same plan the vehicle drives. */
  readonly seed?: number;
  /** Knocked off its lane by a racer (`traffic-v9`): a physics body, sliding to rest, until it is put back out of the
   *  player's sight. `still` counts the ticks it has been at rest. Absent on every car nobody has hit, so a run with
   *  no knock is the traffic it was, to the byte. `lane` and `distance` stay where it was hit, which is where it is
   *  put back. */
  wreck?: { still: number };
}

export interface TrafficState {
  vehicles: TrafficVehicleState[];
}

/** One vehicle per this many metres of lane. Sparse on purpose. */
export const TRAFFIC_SPACING = 900;
/** Clearance kept between a starting vehicle and its lane's junctions. */
const SPAWN_MARGIN = 9;
/** Bumper gap a follower will not close. */
const MIN_GAP = 7;
/** Metres between the places along its lane a wreck is tried at when the one it rests at is taken (`restoreTraffic`). */
const RESTORE_STEP = 8;
/** Metres of gap per m/s of speed: the follower's headway. */
const HEADWAY = 1.5;
/** How far ahead a follower looks, including one lane hop. */
const LOOKAHEAD = 80;
const ACCELERATION = 3.2;
const BRAKING = 7.5;
/** How far out a vehicle may claim its junction. Comfortably beyond the 21 m it
 *  takes a sedan to stop from its 40 mph cruise, and short enough that claims are not held for a
 *  quarter of a street while the holder walks up to the line. */
const CLAIM_RANGE = 34;
/** Longest run of too-short lanes a vehicle will reserve in one go. */
const MAX_CHAIN = 4;
/** A vehicle with no claim aims to stop this far short of the entry line. */
const STOP_SHORT = 2;

/**
 * How a movement is driven (2026-09-20): a curve from the lane it arrives on to
 * the lane it leaves by, tangent to both, standing in for the last `a` metres of
 * the one and the first `b` of the other.
 *
 * Lanes are independent offset polylines, so they do not meet: a right turn's
 * lane runs 1.75 m past the lane it turns into and the next begins 1.75 m back,
 * and a left turn's stops that far short. Until now a vehicle drove to the end of
 * its lane, was put on the next, and had the step between them and the change of
 * heading interpolated away over the next few metres, each on its own schedule.
 * Measured over 1,136 turns: the body pointed a median 140 degrees from the way
 * it was moving in a right turn and 70 in a left, turned at 180 degrees a second
 * with single ticks of 90, and took it all at cruise, 36 to 38 mph.
 *
 * Bookkeeping is untouched: a vehicle is still on a lane at a distance, which is
 * what every reservation, gap and entry line is measured in. Only where that puts
 * it on the ground changes, and how fast the distance runs. The curve is shorter
 * than the lane ends it replaces, so the ground is covered along the curve's own
 * length and the lane distance read back from it (`advance`): the vehicle moves
 * at exactly its speed the whole way, which is also what lets a corner have a
 * speed in real m/s, and lane distance simply runs faster while it is on one.
 */
interface Corner {
  readonly a: number;
  readonly b: number;
  readonly x: readonly [number, number, number, number];
  readonly z: readonly [number, number, number, number];
  /** The curve's own length, which is less than the `a + b` of lane it stands in for wherever it cuts a corner. */
  readonly length: number;
  /** The curve's parameter at equal shares of its length, so it is driven by distance, not by parameter. */
  readonly params: Float64Array;
  /** What the corner is taken at, m/s. Infinity where it is no corner at all. */
  readonly speed: number;
}

const CORNER = {
  /**
   * A turn is rounded as wide as its kerb lets it be. The kerbs are square: the
   * road is a mitred ribbon and a junction's pavements meet in a point, so inside
   * a right turn that point stands `kerb / cos(turn / 2)` from where the lane lines
   * meet, and an arc of radius r reaches `r (1 / cos(turn / 2) - 1)` towards it.
   * Keeping half the widest body (the box truck, and a little) clear of it gives
   * the radius, which is tight at a right angle and tighter past one, because that
   * is what a square kerb leaves. A fixed 4.5 m put an SUV's corner on the point of
   * an acute junction. A left turn has the same arc a lane further out, and at a
   * junction never less than `left`: it sweeps the middle, where there is no kerb.
   */
  body: 1.3, kerb: 1.75, lane: 3.5, left: 8, widest: 14,
  /** A turn sharper or gentler than these is not rounded about where its lane lines meet: they barely meet. */
  gentlest: 25 * Math.PI / 180, sharpest: 155 * Math.PI / 180,
  /** Lane swapped for curve either side where there is no such meeting point: straight on, or back the way it came. */
  straight: 6, about: 4,
  /** Least lane either side, however the lines fall; most, as a share of the lane, so two corners never overlap on a short one. */
  least: 1, share: 0.45, most: 25,
  /** Most lane either side of a bend in a lane's own polyline that its curve stands in for. */
  reach: 12,
  /** A vertex turning less than this is left as drawn: two degrees is a twitch nobody sees. */
  bend: 2 * Math.PI / 180,
  /**
   * Sideways acceleration a corner is taken at, and the braking a driver plans on
   * for one. Brisk, not cautious, and for a reason: a turning vehicle holds its
   * junction for as long as the turn takes, and at a cautious 3.5 m/s² (right
   * turns at 10 mph) the fleet crossed a fifth fewer junctions and twice as many
   * stood waiting. At 6 it is 14 mph and a ninth fewer.
   */
  lateral: 6, comfort: 3.5,
  /** No corner is taken slower than this, however tight: a two-metre connector between junctions would otherwise stop traffic. */
  crawl: 2,
  steps: 32,
} as const;

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The radius a turn of `turn` radians (positive is left) is rounded to, `kerb` metres from the lane line to the kerb inside it. */
function cornerRadius(turn: number, kerb: number): number {
  const half = Math.cos(Math.abs(turn) / 2);
  const right = Math.max(1.5, Math.min(CORNER.widest, (kerb - CORNER.body * half) / Math.max(1e-6, 1 - half)));
  return turn > 0 ? right + CORNER.lane : right;
}

const corners = new WeakMap<TrafficNetwork, Map<number, Corner | null>>();
function cornerOf(network: TrafficNetwork, id: number): Corner | null {
  let cache = corners.get(network);
  if (!cache) corners.set(network, cache = new Map());
  let corner = cache.get(id);
  if (corner === undefined) cache.set(id, corner = buildCorner(network, network.movements[id]!));
  return corner;
}

function buildCorner(network: TrafficNetwork, movement: TrafficMovement): Corner | null {
  const from = network.lanes[movement.from]!, to = network.lanes[movement.to]!;
  const end = network.pose(movement.from, from.length), start = network.pose(movement.to, 0);
  const turn = wrapAngle(start.heading - end.heading), sharp = Math.abs(turn);
  let a: number, b: number;
  if (sharp < CORNER.gentlest) a = b = CORNER.straight;
  else if (sharp > CORNER.sharpest) a = b = CORNER.about;
  else {
    // Where the two lane lines meet, measured along each: past the end of the
    // one (a left turn), short of it (a right), and the same for the other's start.
    const ax = -Math.sin(end.heading), az = -Math.cos(end.heading), bx = -Math.sin(start.heading), bz = -Math.cos(start.heading);
    const det = az * bx - ax * bz, dx = start.x - end.x, dz = start.z - end.z;
    const alongA = (dz * bx - dx * bz) / det;
    const alongB = (ax * alongA - dx) * bx + (az * alongA - dz) * bz;
    // The tangent a fillet of this radius needs, and no less than reaches back onto both lanes.
    const kerb = Math.min(network.kerb?.(movement.from) ?? CORNER.kerb, network.kerb?.(movement.to) ?? CORNER.kerb);
    const radius = turn > 0 ? Math.max(CORNER.left, cornerRadius(turn, kerb)) : cornerRadius(turn, kerb);
    const tangent = Math.min(CORNER.most, Math.max(radius * Math.tan(sharp / 2), alongA + CORNER.least, CORNER.least - alongB));
    a = tangent - alongA;
    b = tangent + alongB;
  }
  a = Math.max(Math.min(a, from.length * CORNER.share), Math.min(CORNER.least, from.length * CORNER.share));
  b = Math.max(Math.min(b, to.length * CORNER.share, movement.clear), Math.min(CORNER.least, to.length * CORNER.share));
  return curveBetween(network.pose(movement.from, from.length - a), network.pose(movement.to, b), a, b);
}

/** The curve from one lane pose to another, standing in for `a` metres of lane before it and `b` after. */
function curveBetween(p0: LanePose, p3: LanePose, a: number, b: number): Corner | null {
  const chord = Math.hypot(p3.x - p0.x, p3.z - p0.z);
  if (chord < 0.5) return null;
  // Control arms that make the curve a circular arc where the ends allow one,
  // and a plain smooth blend (a third of the chord) where there is no turn.
  const swing = Math.abs(wrapAngle(p3.heading - p0.heading));
  const arm = chord * (swing < 1e-3 ? 1 / 3 : (2 / 3) * Math.tan(swing / 4) / Math.sin(swing / 2));
  // Neither arm past where the two tangents meet. Where the ends are not
  // mirror images (a skewed junction, a lane that bends inside the curve) an arm
  // that reaches past it pulls the curve into a hook: all its turning in a metre
  // at one end, 8 degrees in a tick and 33 m/s² sideways on three junctions.
  const ax = -Math.sin(p0.heading), az = -Math.cos(p0.heading), bx = -Math.sin(p3.heading), bz = -Math.cos(p3.heading);
  const det = az * bx - ax * bz, dx = p3.x - p0.x, dz = p3.z - p0.z;
  let arm0 = arm, arm3 = arm;
  if (Math.abs(det) > 1e-6) {
    const ahead = (dz * bx - dx * bz) / det, behind = (dx * az - dz * ax) / det;
    if (ahead > 0 && behind > 0) { arm0 = Math.min(arm, ahead * 0.9); arm3 = Math.min(arm, behind * 0.9); }
  }
  const x = [p0.x, p0.x + ax * arm0, p3.x - bx * arm3, p3.x] as const;
  const z = [p0.z, p0.z + az * arm0, p3.z - bz * arm3, p3.z] as const;

  const lengths = new Float64Array(CORNER.steps + 1);
  let px = x[0], pz = z[0], tightest = 0;
  for (let i = 0; i <= CORNER.steps; i++) {
    const u = i / CORNER.steps, [cx, cz, tx, tz] = bezier(x, z, u);
    if (i) lengths[i] = lengths[i - 1]! + Math.hypot(cx - px, cz - pz);
    px = cx; pz = cz;
    // Curvature, from the curve's second derivative: the tightest point is what a corner's speed answers to.
    const sx = 6 * (1 - u) * (x[2] - 2 * x[1] + x[0]) + 6 * u * (x[3] - 2 * x[2] + x[1]);
    const sz = 6 * (1 - u) * (z[2] - 2 * z[1] + z[0]) + 6 * u * (z[3] - 2 * z[2] + z[1]);
    const speed2 = tx * tx + tz * tz;
    if (speed2 > 1e-9) tightest = Math.max(tightest, Math.abs(tx * sz - tz * sx) / (speed2 * Math.sqrt(speed2)));
  }
  const length = lengths[CORNER.steps]!;
  const params = new Float64Array(CORNER.steps + 1);
  for (let i = 1, j = 1; i <= CORNER.steps; i++) {
    const want = length * i / CORNER.steps;
    while (j < CORNER.steps && lengths[j]! < want) j++;
    const span = lengths[j]! - lengths[j - 1]!;
    params[i] = (j - 1 + (span > 1e-12 ? (want - lengths[j - 1]!) / span : 1)) / CORNER.steps;
  }
  const speed = tightest < 1 / 120 ? Infinity : Math.max(CORNER.crawl, Math.sqrt(CORNER.lateral / tightest));
  return { a, b, x, z, length, params, speed };
}

function bezier(x: readonly number[], z: readonly number[], u: number): [number, number, number, number] {
  const v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
  const d0 = 3 * v * v, d1 = 6 * v * u, d2 = 3 * u * u;
  return [
    b0 * x[0]! + b1 * x[1]! + b2 * x[2]! + b3 * x[3]!, b0 * z[0]! + b1 * z[1]! + b2 * z[2]! + b3 * z[3]!,
    d0 * (x[1]! - x[0]!) + d1 * (x[2]! - x[1]!) + d2 * (x[3]! - x[2]!), d0 * (z[1]! - z[0]!) + d1 * (z[2]! - z[1]!) + d2 * (z[3]! - z[2]!),
  ];
}

interface Bend { readonly from: number; readonly corner: Corner }

const laneBends = new WeakMap<TrafficNetwork, Map<number, readonly Bend[]>>();
const arrivals = new WeakMap<TrafficNetwork, Map<number, number[]>>();
/** A lane's rounded bends, in order. None reaches into the lane a junction's corner stands in for, at either end. */
function bendsOf(network: TrafficNetwork, id: number): readonly Bend[] {
  let cache = laneBends.get(network);
  if (!cache) laneBends.set(network, cache = new Map());
  let bends = cache.get(id);
  if (bends) return bends;
  const drawn = (network.bends?.(id) ?? []).filter(bend => Math.abs(bend.turn) >= CORNER.bend);
  const built: Bend[] = [];
  if (drawn.length) {
    let into = arrivals.get(network);
    if (!into) {
      arrivals.set(network, into = new Map());
      for (const movement of network.movements) { const list = into.get(movement.to); if (list) list.push(movement.id); else into.set(movement.to, [movement.id]); }
    }
    const lane = network.lanes[id]!;
    const first = Math.max(0, ...(into.get(id) ?? []).map(movement => cornerOf(network, movement)?.b ?? 0));
    const last = lane.length - Math.max(0, ...lane.movements.map(movement => cornerOf(network, movement)?.a ?? 0));
    drawn.forEach((bend, i) => {
      const before = i ? drawn[i - 1]!.distance : -Infinity, after = i + 1 < drawn.length ? drawn[i + 1]!.distance : Infinity;
      const radius = cornerRadius(bend.turn, network.kerb?.(id) ?? CORNER.kerb);
      const tangent = Math.min(radius * Math.tan(Math.abs(bend.turn) / 2), CORNER.reach,
        (bend.distance - before) * CORNER.share, (after - bend.distance) * CORNER.share, bend.distance - first, last - bend.distance);
      if (tangent < 0.3) return;
      const corner = curveBetween(network.pose(id, bend.distance - tangent), network.pose(id, bend.distance + tangent), tangent, tangent);
      if (corner) built.push({ from: bend.distance - tangent, corner });
    });
  }
  cache.set(id, bends = built);
  return bends;
}

/** The corner a vehicle is on and how far through the lane it replaces, or null on its lane. */
interface OnCorner {
  readonly corner: Corner;
  /** Metres into the lane the curve replaces, and the lane distance at which that is zero (negative on the lane a turn leaves by). */
  readonly along: number;
  readonly from: number;
  /**
   * The lane distance at which this lane's stretch of the curve ends: a turn's
   * first stretch ends with its lane and carries on in the next. Held as the very
   * number the test for being on the curve compares against, never rebuilt from
   * `from`: rebuilt, it came out 2e-15 short of `b`, and a vehicle that had
   * finished its corner was still on it, going nowhere at 9 mph.
   */
  readonly end: number;
}

function cornerAt(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): OnCorner | null {
  const lane = network.lanes[vehicle.lane]!;
  // Leaving: the movement it holds from here, or has decided on. Deciding is
  // pure (`movementAt`), so a vehicle waiting at the line is on the curve it will drive.
  for (const id of [vehicle.holds[0], vehicle.movement]) {
    if (id === undefined || id < 0 || network.movements[id]!.from !== vehicle.lane) continue;
    const corner = cornerOf(network, id);
    if (corner && vehicle.distance >= lane.length - corner.a) {
      return { corner, along: vehicle.distance - (lane.length - corner.a), from: lane.length - corner.a, end: lane.length };
    }
    break;
  }
  if (vehicle.via >= 0 && network.movements[vehicle.via]!.to === vehicle.lane) {
    const corner = cornerOf(network, vehicle.via);
    if (corner && vehicle.distance < corner.b) return { corner, along: corner.a + vehicle.distance, from: -corner.a, end: corner.b };
  }
  for (const bend of bendsOf(network, vehicle.lane)) {
    if (vehicle.distance < bend.from) break;
    const span = bend.corner.a + bend.corner.b;
    if (vehicle.distance < bend.from + span) return { corner: bend.corner, along: vehicle.distance - bend.from, from: bend.from, end: bend.from + span };
  }
  return null;
}

/** Where the next curve ahead on this lane begins, or Infinity: a bend, or the corner of the movement it will take. */
function nextCorner(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): number {
  let next = Infinity;
  for (const bend of bendsOf(network, vehicle.lane)) if (bend.from >= vehicle.distance) { next = bend.from; break; }
  for (const id of [vehicle.holds[0], vehicle.movement]) {
    if (id === undefined || id < 0 || network.movements[id]!.from !== vehicle.lane) continue;
    const corner = cornerOf(network, id);
    if (corner) next = Math.min(next, Math.max(vehicle.distance, network.lanes[vehicle.lane]!.length - corner.a));
    break;
  }
  return next;
}

/**
 * Drive `ground` metres along the vehicle's lane, no further than `stop` or the
 * lane's end, and hand back what is left. On its lane a metre of ground is a
 * metre of lane. On a curve the ground is covered along the curve's own length
 * and the lane distance read back from it, exactly: a curve can be a fraction of
 * the lane it replaces, lane distance then runs many times faster than the
 * vehicle, and stepping it at a rate sampled once a tick threw one van 21.6 m
 * past the end of its corner in a single tick.
 */
function advance(network: TrafficNetwork, vehicle: TrafficVehicleState, ground: number, stop: number): number {
  const limit = Math.min(network.lanes[vehicle.lane]!.length, stop);
  for (let guard = 0; guard < 32 && ground > 1e-12 && vehicle.distance < limit; guard++) {
    const on = cornerAt(network, vehicle);
    if (!on) {
      const next = Math.min(limit, nextCorner(network, vehicle));
      const room = next - vehicle.distance;
      if (ground < room) { vehicle.distance += ground; return 0; }
      vehicle.distance = next;
      ground -= room;
      continue;
    }
    // Metres of lane to a metre of curve, and how much curve is left before this stretch ends.
    const scale = (on.corner.a + on.corner.b) / on.corner.length;
    const end = Math.min(on.end, limit), room = (end - vehicle.distance) / scale;
    if (ground < room) { vehicle.distance = Math.min(end, vehicle.distance + ground * scale); return 0; }
    vehicle.distance = end;
    ground -= Math.max(0, room);
  }
  return ground;
}

/** Whether a vehicle is on a curve, a junction's or a bend's, rather than on its lane as drawn. */
export function trafficCornering(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): boolean {
  return cornerAt(network, vehicle) !== null;
}

/**
 * The fastest a vehicle may be going here for the corner it is in or coming to:
 * the corner's own speed on it, and on the way in whatever still brakes to that
 * by where the curve starts, at the rate a driver plans on, not the one they have.
 */
function cornerLimit(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): number {
  const on = cornerAt(network, vehicle);
  let limit = on ? on.corner.speed : Infinity;
  const brakingFor = (corner: Corner, before: number) => {
    if (corner.speed !== Infinity && before >= 0) limit = Math.min(limit, Math.sqrt(corner.speed * corner.speed + 2 * CORNER.comfort * before));
  };
  for (const bend of bendsOf(network, vehicle.lane)) brakingFor(bend.corner, bend.from - vehicle.distance);
  for (const id of [vehicle.holds[0], vehicle.movement]) {
    if (id === undefined || id < 0 || network.movements[id]!.from !== vehicle.lane) continue;
    const corner = cornerOf(network, id);
    if (corner) brakingFor(corner, network.lanes[vehicle.lane]!.length - corner.a - vehicle.distance);
    break;
  }
  return limit;
}

function place(network: TrafficNetwork, vehicle: TrafficVehicleState): void {
  const on = cornerAt(network, vehicle);
  if (!on) {
    const pose = network.pose(vehicle.lane, vehicle.distance);
    vehicle.x = pose.x;
    vehicle.y = pose.y;
    vehicle.z = pose.z;
    vehicle.heading = pose.heading;
    return;
  }
  const { corner } = on;
  const at = Math.max(0, Math.min(1, on.along / (corner.a + corner.b))) * CORNER.steps;
  const i = Math.min(CORNER.steps - 1, Math.floor(at));
  const u = corner.params[i]! + (corner.params[i + 1]! - corner.params[i]!) * (at - i);
  const [x, z, dx, dz] = bezier(corner.x, corner.z, u);
  vehicle.x = x;
  vehicle.z = z;
  vehicle.heading = Math.atan2(-dx, -dz);
  // Under the curve, not from either lane: the two do not meet the ground at the
  // same place, and across the hill districts a lane's height left a turning
  // vehicle floating or sunk. `tests/alder.test.ts` holds it to 2 cm.
  vehicle.y = network.height(x, z);
}

/** The movement a vehicle takes at the end of `lane`, on its `turns`-th
 *  transition. Pure, so the chain below predicts exactly what will be driven.
 *  Under a seed the hash's input is salted by it (`mix` is a bijection, so every nonzero seed salts); seed 0 is
 *  the unsalted hash, the turns every run took to 2026-09-22. */
function movementAt(network: TrafficNetwork, id: number, lane: number, turns: number, seed = 0): number {
  const options = network.lanes[lane]!.movements;
  return options[(seed ? mix((id * 40503 + turns) ^ mix(seed)) : mix(id * 40503 + turns)) % options.length]!;
}

function chooseMovement(network: TrafficNetwork, vehicle: TrafficVehicleState): number {
  return movementAt(network, vehicle.id, vehicle.lane, vehicle.turns, vehicle.seed);
}

/** Whether a lane has anywhere to stand between its junctions. */
function hasRefuge(network: TrafficNetwork, movement: TrafficMovement, length: number): boolean {
  const lane = network.lanes[movement.to]!;
  return lane.length - lane.entry - movement.clear > length + MIN_GAP;
}

/**
 * The movements a vehicle must hold to cross without stranding: the one it is
 * taking, plus onward movements for as long as the lanes it lands on are too
 * short to stop on.
 */
/**
 * Whether any conflicting movement is held.
 *
 * Deliberately a claim, not a position. Asking instead whether anyone is
 * *currently standing* in the stretch where the two paths cross flows far
 * better and is wrong: a grant is decided while the vehicle is still up to
 * 34 m short of the line, and the crossing happens seconds later, by which time
 * the other vehicle has arrived. Measured, that snapshot let 141 pairs into the
 * same crossing in five minutes. Answering it properly means reserving time
 * windows rather than movements, which this does not do.
 */
/**
 * Whether a movement `vehicle` wants crosses one somebody holds.
 *
 * Not counting a holder whose movement delivers it onto `vehicle`'s own lane
 * behind it (2026-09-20). Two movements conflict wherever their swept paths
 * overlap, and the movement onto a lane overlaps the run-up of every movement off
 * its far end, since that run-up reaches back most of a short lane. But a car
 * arriving behind you on your lane is a queue, which the follower rule owns, as
 * the network's own conflict pass says of a merge. Counted as a crossing it is a
 * lock: the car at the line is refused because of the car behind it, which
 * cannot release what it holds until it is clear, which it cannot be while the
 * car at the line stands in its way. It was always possible and needed the
 * follower to be waiting at its own line when the leader cleared; since traffic
 * slows for its corners that is the usual case, and on the 73 m of lane 429 it
 * stopped 16 vehicles in ten minutes.
 */
function crossingBusy(network: TrafficNetwork, holders: Map<number, TrafficVehicleState[]>,
  movement: number, vehicle: Readonly<TrafficVehicleState>): boolean {
  return network.movements[movement]!.conflicts.some(conflict => (holders.get(conflict.other) ?? []).some(holder =>
    !(network.movements[conflict.other]!.to === vehicle.lane && (holder.lane !== vehicle.lane || holder.distance < vehicle.distance))));
}

function chainFor(network: TrafficNetwork, vehicle: TrafficVehicleState): number[] {
  const chain = [vehicle.movement];
  const length = TRAFFIC_KINDS[vehicle.kind].length;
  for (let step = 1; step <= MAX_CHAIN; step++) {
    const last = network.movements[chain[chain.length - 1]!]!;
    if (hasRefuge(network, last, length)) break;
    chain.push(movementAt(network, vehicle.id, last.to, vehicle.turns + step, vehicle.seed));
  }
  return chain;
}

/**
 * Lay traffic out across the whole network at a fixed spacing. There is no
 * spawning and no despawning: the set of vehicles never changes, which keeps
 * the collider set constant and takes the player's position out of a decision
 * that a replay would then have to reproduce.
 *
 * `seed` (2026-09-22): with no seed a race from the grid met the same cars in the
 * same places every time it was run, since the sim starts at tick 0 and nothing
 * here varies. Shawn noticed on the third restart. A seed moves where every vehicle
 * starts along the ruler (a phase of up to one `spacing`) and salts which way it
 * turns (`movementAt`). It changes nothing the renderer sized itself by at load:
 * the vehicle count is the ruler's length over the spacing whatever the phase, and
 * each id keeps its kind, so a restart draws into the same instanced slots. Seed 0
 * is the traffic every run had before, to the byte: its vehicles carry no `seed`,
 * and the golden master hashes the state as JSON.
 */
export function createTraffic(network: TrafficNetwork, spacing = TRAFFIC_SPACING, seed = 0): TrafficState {
  const vehicles: TrafficVehicleState[] = [];
  // Laid out along one ruler laid end to end over every lane's placeable window,
  // rather than restarted per lane. Per-lane placement puts a vehicle on every
  // stub in the network regardless of how short it is, which quietly doubles the
  // count and is not what "sparse" means.
  // The ruler's length, accumulated exactly as the loop below accumulates it, and the vehicles it holds at seed 0:
  // positions k * spacing - phase for k = 1..count all lie on it for any phase in [0, spacing).
  let length = 0;
  for (const lane of network.lanes) {
    const window = lane.length - lane.entry - SPAWN_MARGIN - (lane.entry + SPAWN_MARGIN);
    if (window > 0) length += window;
  }
  const count = Math.floor(length / spacing), phase = seed ? mix(seed) / 4294967296 * spacing : 0;
  let travelled = 0;
  for (const lane of network.lanes) {
    // Never start a vehicle inside a junction. Lanes are laid out independently,
    // so without this two of them converging on a junction put their first
    // vehicles on the same tarmac before anything has reserved anything — and
    // one such pair deadlocks its junction permanently, because each holds a
    // movement the other is waiting on.
    const first = lane.entry + SPAWN_MARGIN;
    const window = lane.length - lane.entry - SPAWN_MARGIN - first;
    if (window <= 0) continue;
    for (let next = Math.ceil((travelled + phase + 1e-9) / spacing) * spacing - phase;
      next <= travelled + window && vehicles.length < count; next += spacing) {
      const id = vehicles.length;
      const kind = KIND_ORDER[mix(id * 2654435761) % KIND_ORDER.length]!;
      const vehicle: TrafficVehicleState = {
        id, kind, lane: lane.id, distance: first + (next - travelled),
        speed: TRAFFIC_KINDS[kind].cruise,
        movement: -1, holds: [], turns: 0, x: 0, y: 0, z: 0, heading: 0,
        via: -1, braking: false, ...(seed ? { seed } : {}),
      };
      vehicle.movement = chooseMovement(network, vehicle);
      place(network, vehicle);
      vehicles.push(vehicle);
    }
    travelled += window;
  }
  return { vehicles };
}

/** Vehicles per lane, ordered along the lane. Rebuilt each tick: 150-odd
 *  vehicles is nothing, and a cache is a chance to be wrong. */
function occupancy(state: TrafficState): Map<number, TrafficVehicleState[]> {
  const byLane = new Map<number, TrafficVehicleState[]>();
  for (const vehicle of state.vehicles) {
    // A wreck has left its lane: it is an obstacle to the cars in it (`TrafficRacer`), not one of them.
    if (vehicle.wreck) continue;
    const list = byLane.get(vehicle.lane);
    if (list) list.push(vehicle); else byLane.set(vehicle.lane, [vehicle]);
  }
  for (const list of byLane.values()) list.sort((a, b) => a.distance - b.distance);
  return byLane;
}

/**
 * Clear distance to the vehicle ahead, looking one lane past the end. Without
 * the hop, a queue held at a junction is invisible to the lane behind it and
 * the traffic drives into its own tail.
 */
function gapAhead(network: TrafficNetwork, byLane: Map<number, TrafficVehicleState[]>,
  vehicle: TrafficVehicleState): number {
  const lane = network.lanes[vehicle.lane]!;
  const ahead = byLane.get(vehicle.lane)!.find(other => other.distance > vehicle.distance);
  if (ahead) return ahead.distance - vehicle.distance - TRAFFIC_KINDS[ahead.kind].length;
  const toEnd = lane.length - vehicle.distance;
  if (toEnd > LOOKAHEAD) return LOOKAHEAD;
  // Every exit this lane offers, not just the one this vehicle chose. Two
  // vehicles from one approach taking different exits are still nose to tail
  // while they cross the node; watching only your own exit makes the leader
  // vanish the moment it commits to a different one, and they meet at the
  // node itself — which is where every missed conflict was measured.
  let best = LOOKAHEAD;
  for (const movement of lane.movements) {
    const first = byLane.get(network.movements[movement]!.to)?.[0];
    if (first) best = Math.min(best, toEnd + first.distance - TRAFFIC_KINDS[first.kind].length);
  }
  return best;
}

/**
 * Whether there is room to leave on the far side. Conflicts are checked by the
 * caller; this is the other half, and it is the half that matters. Without it a
 * vehicle stops inside the junction waiting for the queue beyond it, every
 * approach blocks behind it, and the jam spreads across the district. Not
 * blocking the box is what makes this deadlock-free rather than merely orderly.
 */
function mayEnter(network: TrafficNetwork, byLane: Map<number, TrafficVehicleState[]>,
  vehicle: TrafficVehicleState, chain: readonly number[]): boolean {
  const movement = network.movements[chain[chain.length - 1]!]!;
  // Nobody parked in the path. A vehicle standing in a stretch any of these
  // movements sweeps is an obstacle whether or not it holds anything.
  for (const id of chain) {
    for (const sweep of network.movements[id]!.sweeps) {
      for (const other of byLane.get(sweep.lane) ?? []) {
        if (other === vehicle) continue;
        const half = TRAFFIC_KINDS[other.kind].length * 0.5;
        if (other.distance + half > sweep.from && other.distance - half < sweep.to) return false;
      }
    }
  }
  // Room on the far side for the vehicle itself, at the start of the exit lane.
  //
  // Measuring this past the point the movement is *clear* at instead makes the
  // check unsatisfiable wherever the exit lane is not much longer than the
  // junction region: no vehicle can ever enter a lane that already has one on
  // it, and the junction locks for good. Room means room for a car, not room
  // beyond the whole crossing.
  const first = byLane.get(movement.to)?.[0];
  if (!first) return true;
  return first.distance
    > TRAFFIC_KINDS[first.kind].length * 0.5 + TRAFFIC_KINDS[vehicle.kind].length + MIN_GAP;
}

/**
 * Clear distance to a racer in this vehicle's lane ahead, along the lane and on
 * into the exit it will take, or `LOOKAHEAD` if none. Along the lane rather than
 * straight ahead, so a racer round a bend is still in the lane it is in.
 */
function racerGap(network: TrafficNetwork, vehicle: TrafficVehicleState, racers: readonly TrafficRacer[]): number {
  let best = LOOKAHEAD;
  if (!racers.length) return best;
  const lane = network.lanes[vehicle.lane]!;
  const exit = vehicle.holds.length ? vehicle.holds[0]! : vehicle.movement;
  const forward = -Math.sin(vehicle.heading), forwardZ = -Math.cos(vehicle.heading);
  for (const racer of racers) {
    const dx = racer.x - vehicle.x, dz = racer.z - vehicle.z;
    if (dx * dx + dz * dz > (LOOKAHEAD + 10) ** 2) continue;
    const straight = dx * forward + dz * forwardZ;
    if (straight <= 0) continue;
    // Where the lane is that far along, and how far off it the racer is.
    const along = vehicle.distance + straight;
    const pose = along <= lane.length || exit < 0 ? network.pose(vehicle.lane, Math.min(along, lane.length))
      : network.pose(network.movements[exit]!.to, Math.min(along - lane.length, network.lanes[network.movements[exit]!.to]!.length));
    const off = Math.abs((racer.x - pose.x) * -Math.cos(pose.heading) + (racer.z - pose.z) * Math.sin(pose.heading));
    if (off >= RACER_IN_LANE) continue;
    // Followed only going this way. Yielding has to run one way: the rival already
    // waits for traffic in its path, so traffic that also waited for a racer facing
    // it, or crossing its lane, waited on a rival that was waiting on it. Stopped
    // inside a junction for a crossing rival (seed 13), and stopped head-on to a
    // rival sitting on the centreline (seeds 2 and 5), neither moved.
    // A wreck is queued behind whichever way it points: spun across the lane it is still in it.
    if (!racer.obstacle && Math.cos(racer.heading - pose.heading) <= 0.5) continue;
    best = Math.min(best, straight - (TRAFFIC_KINDS[vehicle.kind].length + RACER_LENGTH) / 2);
  }
  return best;
}

const movementPaths = new WeakMap<TrafficNetwork, Map<number, LanePose[]>>();
/** A movement's path as a polyline: its lane from the entry line, the corner as it is driven, the far lane to where it is clear. */
function movementPath(network: TrafficNetwork, id: number): LanePose[] {
  let cache = movementPaths.get(network);
  if (!cache) movementPaths.set(network, cache = new Map());
  let path = cache.get(id);
  if (!path) {
    const movement = network.movements[id]!, from = network.lanes[movement.from]!, to = network.lanes[movement.to]!;
    const corner = cornerOf(network, id);
    const turn: LanePose[] = corner
      ? [0, .2, .4, .6, .8, 1].map(u => { const [x, z, dx, dz] = bezier(corner.x, corner.z, u); return { x, y: 0, z, heading: Math.atan2(-dx, -dz) }; })
      : [network.pose(movement.from, from.length), network.pose(movement.to, 0)];
    path = [network.pose(movement.from, Math.max(0, from.length - Math.max(from.entry, corner?.a ?? 0))), ...turn,
      network.pose(movement.to, Math.min(to.length, Math.max(movement.clear, corner?.b ?? 0)))];
    cache.set(id, path);
  }
  return path;
}

/**
 * How long a vehicle about to claim `chain` will be in it, seconds, never more than the racer horizon (2026-09-22):
 * braking to the tightest corner on the chain by its line, as `cornerLimit` plans the approach, and through every
 * movement to where it is clear at that corner's speed. Reckoned at the speed it had and a flat 30 m, which it was to
 * traffic-v7, the hold came out at half what was driven: a taxi at 38 mph claimed a left turn it took at 16, was
 * reckoned clear in 3.8 s and held it 7.1, and the rival, 217 m off at 67 mph and still accelerating, met it at
 * 60 mph (traffic seed 271828, the first junction of 26 of the street-line batch's races). Of eleven junction claims
 * a rival later ran into over three seeds, four were this, the rest coming round a bend (which traffic cannot see
 * without the racer's route, and must not be given the rival's alone) or a car stuck in the junction.
 * Other vehicles are not reckoned: this is the car's own drive, and anything in its way only makes it longer.
 */
export function clearingTime(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>, chain: readonly number[], toEntry: number): number {
  const cruise = TRAFFIC_KINDS[vehicle.kind].cruise;
  let through = 0, taken = cruise;
  for (const id of chain) {
    const path = movementPath(network, id);
    for (let i = 1; i < path.length; i++) through += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
    const corner = cornerOf(network, id);
    if (corner) taken = Math.min(taken, corner.speed);
  }
  // The car's own floor, the corner it crawls (`traffic-v10`): floored at `RACER_MOVING`, a racer's threshold, a 2 m/s
  // hairpin was reckoned at 3 and held 2.2 s past its reckoning (lane 1063, seeds 0 and 271828).
  taken = Math.max(CORNER.crawl, taken);
  const step = 0.1;
  let speed = vehicle.speed, covered = 0, seconds = 0;
  while (covered < toEntry + through && seconds < RACER_HORIZON.max) {
    const limit = covered < toEntry ? Math.sqrt(taken * taken + 2 * CORNER.comfort * (toEntry - covered)) : taken;
    const target = Math.min(cruise, limit);
    speed += Math.max(-BRAKING * step, Math.min(ACCELERATION * step, target - speed));
    covered += speed * step;
    seconds += step;
  }
  return Math.min(RACER_HORIZON.max, seconds);
}

/** Whether a racer is in a movement's path now, or will be before the car could clear it (`clearing` seconds) or the racer could stop. */
function racerCrossing(network: TrafficNetwork, chain: readonly number[], racers: readonly TrafficRacer[], clearing: number): boolean {
  for (const racer of racers) {
    // Only a racer on the move. One stopped or crawling at a junction is waiting
    // for traffic itself, and holding traffic for it made them wait on each other
    // (seeds 2 and 5): traffic goes, as it always did, and the racer goes after.
    // A wreck, though, is in the junction whether it moves or not.
    if (racer.speed < RACER_MOVING && !racer.obstacle) continue;
    const vx = -Math.sin(racer.heading) * racer.speed, vz = -Math.cos(racer.heading) * racer.speed;
    const seconds = Math.min(RACER_HORIZON.max, Math.max(clearing, racer.speed / RACER_HORIZON.braking + RACER_HORIZON.reaction));
    for (const id of chain) {
      const path = movementPath(network, id);
      // At most 4 m of the racer's travel between looks: at 0.25 s a racer at 55 m/s
      // stepped 13.75 m, straight over the 10 m band a junction's path is checked in.
      const every = Math.min(0.25, 4 / racer.speed);
      for (let t = 0; t <= seconds; t += every) {
        const x = racer.x + vx * t, z = racer.z + vz * t;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!, b = path[i]!;
          const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
          const u = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2)) : 0;
          if (Math.hypot(x - a.x - abx * u, z - a.z - abz * u) < RACER_IN_JUNCTION) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Knocked off its lane by a racer (`traffic-v9`): from here the sim drives it as a physics body until it is put back
 * (`restoreTraffic`). It gives up every junction it held, since it will not drive through them; its lane and distance
 * stay, as where it goes back.
 */
export function knockTraffic(vehicle: TrafficVehicleState): void {
  vehicle.wreck = { still: 0 };
  vehicle.holds = [];
  vehicle.braking = true;
}

/**
 * A wreck back on its lane where it has come to rest, stopped: its lane is where it was hit, and its distance along it
 * is that place plus how far down the lane it slid (a rear-ended sedan rolls on 60 m and more; put back where it was hit
 * it landed behind the car queued for it). Short of its line, since it no longer holds the junction. A spot is taken if
 * a car or a racer would overlap it, or a car is ahead of it on the lane within a length and a gap; a car queued behind
 * it is what it is going back to release. Taken, the next spot along the lane is tried, every `RESTORE_STEP` metres to
 * the line, then back from the first: a wreck that waited for its own spot waited, at seed 314159, for the rival stopped
 * beside it, which waited for the car queued behind the wreck, which waited for the wreck. The caller decides nobody is
 * watching (sim.ts). Whether it went back.
 */
export function restoreTraffic(network: TrafficNetwork, state: TrafficState, vehicle: TrafficVehicleState, racers: readonly TrafficRacer[]): boolean {
  const lane = network.lanes[vehicle.lane]!, spec = TRAFFIC_KINDS[vehicle.kind];
  const hit = network.pose(vehicle.lane, vehicle.distance);
  const slid = (vehicle.x - hit.x) * -Math.sin(hit.heading) + (vehicle.z - hit.z) * -Math.cos(hit.heading);
  const last = lane.length - lane.entry - STOP_SHORT, rest = Math.max(0, Math.min(vehicle.distance + slid, last));
  const free = (distance: number) => {
    const at = network.pose(vehicle.lane, distance);
    for (const other of state.vehicles) {
      if (other === vehicle || other.wreck) continue;
      const room = (spec.length + TRAFFIC_KINDS[other.kind].length) / 2;
      if (Math.hypot(other.x - at.x, other.z - at.z) < room + 1) return false;
      if (other.lane === vehicle.lane && other.distance > distance - room && other.distance - distance < room + MIN_GAP) return false;
    }
    return !racers.some(racer => Math.hypot(racer.x - at.x, racer.z - at.z) < (spec.length + RACER_LENGTH) / 2 + 1);
  };
  const spots = [rest];
  for (let d = rest + RESTORE_STEP; d <= last; d += RESTORE_STEP) spots.push(d);
  for (let d = rest - RESTORE_STEP; d >= 0; d -= RESTORE_STEP) spots.push(d);
  const distance = spots.find(free);
  if (distance === undefined) return false;
  delete vehicle.wreck;
  vehicle.distance = distance;
  vehicle.speed = 0;
  vehicle.holds = [];
  vehicle.braking = true;
  place(network, vehicle);
  return true;
}

export function stepTraffic(network: TrafficNetwork, state: TrafficState, dt: number, racers: readonly TrafficRacer[] = []): void {
  const byLane = occupancy(state);
  // A vehicle claims its movements when it is granted, not when it reaches the
  // junction, and keeps them until it is clear on the far side.
  //
  // Granting at the line instead needs an escape for vehicles already too close
  // to stop — and that escape has to ignore whatever is inside the junction,
  // because a vehicle that cannot stop cannot be refused. Which puts it into the
  // side of whatever was already there. Reserving before the approach begins
  // removes the dilemma rather than adjudicating it: nothing passes the line
  // without already holding the right to.
  const holders = new Map<number, TrafficVehicleState[]>();
  for (const vehicle of state.vehicles) {
    for (const held of vehicle.holds) {
      const list = holders.get(held);
      if (list) list.push(vehicle); else holders.set(held, [vehicle]);
    }
  }

  const toEntry = (vehicle: TrafficVehicleState): number => {
    const lane = network.lanes[vehicle.lane]!;
    return lane.length - lane.entry - vehicle.distance;
  };

  // Nearest first, ties by id. A strict total order is what stops two approaches
  // from deferring to each other for ever.
  // Only the vehicle at the head of its approach may claim. A vehicle further
  // back can be inside CLAIM_RANGE with stopped cars between it and the line: it
  // takes the reservation, cannot advance to use it, and never releases it,
  // because release requires arriving on the far side. Everything whose movement
  // conflicts then waits on a crossing nobody is making.
  const headOfQueue = (vehicle: TrafficVehicleState): boolean =>
    !(byLane.get(vehicle.lane) ?? []).some(other => other !== vehicle && other.distance > vehicle.distance);
  // On a stop lane, before its bar, only a car that has stood there (`traffic-v10`): from standstill at the paint, where
  // a racer can see it waiting, and not from 34 m out on the move, forecasting the racer. Its hold is reckoned from
  // standing (`clearingTime`), which is the honest one. Past its bar, or on any other lane, the range as before.
  const mayClaim = (vehicle: TrafficVehicleState): boolean =>
    stopPoint(network, vehicle) === null ? toEntry(vehicle) <= CLAIM_RANGE : (vehicle.stood ?? 0) >= STOP_DWELL;
  const waiting = state.vehicles
    .filter(vehicle => !vehicle.wreck && !vehicle.holds.length && vehicle.movement >= 0 && mayClaim(vehicle)
      && headOfQueue(vehicle))
    .sort((a, b) => toEntry(a) - toEntry(b) || a.id - b.id);
  for (const vehicle of waiting) {
    const chain = chainFor(network, vehicle);
    if (chain.some(id => holders.has(id) || crossingBusy(network, holders, id, vehicle))) continue;
    // Head of every approach it claims, not only its own (2026-09-20). A chain
    // claims the movements off the far end of each short lane it runs through,
    // and whoever is already on one of those lanes is ahead of it for them. A box
    // truck was granted a chain through a lane with a sedan waiting at its line:
    // the truck then held the movement the sedan was first in the queue for,
    // stopped behind it, and neither could ever move. The chain waits for the
    // lanes it runs through to empty, which asks nothing of anyone it could block.
    if (chain.slice(0, -1).some(id => (byLane.get(network.movements[id]!.to) ?? []).some(other => other !== vehicle))) continue;
    if (!mayEnter(network, byLane, vehicle, chain)) continue;
    // A racer in the junction, or crossing it before this vehicle could be clear, has it.
    if (racers.some(racer => racer.speed >= RACER_MOVING) && racerCrossing(network, chain, racers, clearingTime(network, vehicle, chain, toEntry(vehicle)))) continue;
    vehicle.holds = chain;
    for (const id of chain) holders.set(id, [...(holders.get(id) ?? []), vehicle]);
  }

  for (const vehicle of state.vehicles) {
    // A wreck is a physics body until it is put back (`traffic-v9`, sim.ts): nothing here drives it.
    if (vehicle.wreck) continue;
    const spec = TRAFFIC_KINDS[vehicle.kind];
    let gap = Math.min(gapAhead(network, byLane, vehicle), racerGap(network, vehicle, racers));
    const stop = stopPoint(network, vehicle);
    if (!vehicle.holds.length) {
      // Aim to stop short of the line rather than on it: a vehicle with no
      // claim has no right to any part of the junction. On a stop lane the line is the bar, and the front stops at it.
      gap = Math.min(gap, stop !== null ? Math.max(0, stop - vehicle.distance) + MIN_GAP : Math.max(0, toEntry(vehicle) - STOP_SHORT) + MIN_GAP);
    }
    // Linear follower: full cruise at a comfortable gap, stopped at the bumper,
    // and no faster than the corner it is in or coming to is taken.
    const target = Math.max(0, Math.min(spec.cruise, (gap - MIN_GAP) / HEADWAY, cornerLimit(network, vehicle)));
    const rate = target > vehicle.speed ? ACCELERATION : BRAKING;
    const was = vehicle.speed;
    vehicle.speed += Math.max(-rate * dt, Math.min(rate * dt, target - vehicle.speed));
    vehicle.speed = Math.max(0, vehicle.speed);
    // Brake lights: slowing by more than 1 m/s², or held at a standstill.
    vehicle.braking = vehicle.speed < was - dt * 1 || (target < 0.5 && vehicle.speed < 0.5);
    // The entry line is a hard barrier, not a target to aim at. Everything here
    // rests on the invariant that no vehicle is ever past it without holding the
    // movement beyond, so it is where a vehicle holding nothing stops being driven.
    // On a stop lane the bar is that barrier, until the car holds the junction.
    const line = network.lanes[vehicle.lane]!.length - network.lanes[vehicle.lane]!.entry;
    let ground = advance(network, vehicle, vehicle.speed * dt, vehicle.holds.length ? Infinity : Math.max(vehicle.distance, stop ?? line));
    if (!vehicle.holds.length && ground > 1e-9) vehicle.speed = 0;
    // Standing at the bar, holding nothing: counted towards the dwell. Anything else starts it again.
    if (stop !== null && !vehicle.holds.length && stop - vehicle.distance <= AT_BAR && vehicle.speed < STANDING) vehicle.stood = (vehicle.stood ?? 0) + dt;
    else if (vehicle.stood !== undefined) delete vehicle.stood;

    let current = network.lanes[vehicle.lane]!;
    // `while`, not `if`: a short connector can be crossed inside one tick.
    while (vehicle.distance >= current.length) {
      vehicle.distance = 0;
      vehicle.turns++;
      vehicle.via = vehicle.holds[0]!;
      vehicle.lane = network.movements[vehicle.via]!.to;
      current = network.lanes[vehicle.lane]!;
      // Drop the movement just completed only when a later one in the chain
      // takes over; otherwise it is released below, once actually clear.
      if (vehicle.holds.length > 1) vehicle.holds.shift();
      // The movement off the lane it is now on: the chain's next, which is what
      // `chooseMovement` would say too, since the chain was built from it. This
      // read `holds[1]`, the junction after next, from 2026-09-09 until 2026-09-20.
      // Nothing ever saw it: every reader takes `holds[0]` first while anything is
      // held. It is right now so that the next reader need not know that.
      vehicle.movement = vehicle.holds.length > 1
        ? vehicle.holds[0]! : chooseMovement(network, vehicle);
      ground = advance(network, vehicle, ground, Infinity);
    }
    // Released once clear on the far side, which is where the crossing ends.
    if (vehicle.holds.length === 1) {
      const held = network.movements[vehicle.holds[0]!]!;
      if (vehicle.lane === held.to && vehicle.distance >= held.clear) {
        vehicle.holds = [];
        vehicle.movement = chooseMovement(network, vehicle);
      }
    }
    place(network, vehicle);
  }
}

/**
 * Where a vehicle will be `seconds` from now if it keeps its speed and its plan
 * (2026-09-13). It drives the same lanes, takes the movements it holds and then
 * the ones `movementAt` has already decided, rounds each corner on the same curve
 * and slows for it as the tick does, and stops at the entry line of any junction
 * it holds no claim for, because that is the rule it drives by. A forecast, not a
 * promise: a car granted a junction in the meantime pulls out, one that brakes
 * for a queue is further back than this says, and one that has slowed for a
 * corner is forecast still slow after it, where the car itself speeds up again.
 *
 * Not read by the rival yet. Reading it where the rival would reach each car cut
 * circling and strays over 42 races in traffic, but on one pinned seed it passed a
 * truck at 100 mph as the truck turned across, and every narrower fix moved the
 * failure to another seed (design/PORT_ALDER.md). It is exact against traffic
 * (`tests/traffic-intent.test.ts`) and is the plan the indicators show, so a rival
 * that reads it knows no more than a driver watching them.
 */
export function forecastTraffic(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>, seconds: number, step = 0.1, fine = 1 / 60): { x: number; z: number; heading: number } {
  const ghost: TrafficVehicleState = { ...vehicle, holds: [...vehicle.holds] };
  driveGhost(network, ghost, seconds, step, fine);
  return { x: ghost.x, z: ghost.z, heading: ghost.heading };
}

/**
 * The same forecast at every `every` seconds out to `seconds`, from one drive of the
 * ghost rather than one per moment: what a rival reading a whole corner asks for.
 * Index k is k * every seconds from now, 0 being where the car is.
 * Passing also checks `accelerate`: recovery towards cruise after a slow turn,
 * still respecting corner limits and held junctions. The default stays unchanged.
 */
export function forecastTrafficPath(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>, seconds: number, every = 0.25, accelerate = false): { x: number; z: number; heading: number; speed: number }[] {
  const ghost: TrafficVehicleState = { ...vehicle, holds: [...vehicle.holds] };
  const path = [{ x: ghost.x, z: ghost.z, heading: ghost.heading, speed: ghost.speed }];
  for (let t = every; t <= seconds + 1e-9; t += every) {
    driveGhost(network, ghost, every, 0.1, 1 / 60, accelerate);
    path.push({ x: ghost.x, z: ghost.z, heading: ghost.heading, speed: ghost.speed });
  }
  return path;
}

function driveGhost(network: TrafficNetwork, ghost: TrafficVehicleState, seconds: number, step: number, fine: number, accelerate = false): void {
  // A wreck follows no lane: forecast where it is, stopped. It slides a second or two after the hit; a rival reading it
  // as already still brakes for it a little early, never late.
  if (ghost.wreck) { ghost.speed = 0; return; }
  let left = seconds;
  while (left > 1e-9) {
    // Coarse steps where the speed holds, the tick's own step where a corner is
    // being braked for: the speed follows a braking curve there, and a coarse step
    // does not integrate it as the tick does. The ground itself is exact at any step.
    const coarse = Math.min(step, left);
    const limit = cornerLimit(network, ghost);
    const dt = limit < ghost.speed + 1 ? Math.min(fine, coarse) : coarse;
    left -= dt;
    ghost.speed = Math.min(ghost.speed + (accelerate ? ACCELERATION * dt : 0), limit, accelerate ? TRAFFIC_KINDS[ghost.kind].cruise : Infinity);
    const line = stopPoint(network, ghost) ?? network.lanes[ghost.lane]!.length - network.lanes[ghost.lane]!.entry;
    let ground = advance(network, ghost, ghost.speed * dt, ghost.holds.length || ghost.distance > line ? Infinity : line);
    let current = network.lanes[ghost.lane]!;
    while (ghost.distance >= current.length && ghost.holds.length) {
      ghost.distance = 0;
      ghost.turns++;
      ghost.via = ghost.holds[0]!;
      ghost.lane = network.movements[ghost.via]!.to;
      current = network.lanes[ghost.lane]!;
      if (ghost.holds.length > 1) ghost.holds.shift();
      else ghost.holds = [];
      ghost.movement = ghost.holds.length ? ghost.holds[0]! : chooseMovement(network, ghost);
      ground = advance(network, ghost, ground, ghost.holds.length ? Infinity : Math.max(0, stopPoint(network, ghost) ?? current.length - current.entry));
    }
    if (ghost.distance >= current.length) ghost.distance = current.length;
    place(network, ghost);
  }
}

/** Metres before its junction's entry line a vehicle starts showing the turn it has already decided. */
export const SIGNAL_RANGE = 45;
/** A movement turning less than this is straight on and shows nothing. */
const SIGNAL_DEGREES = 30;
const movementTurns = new WeakMap<TrafficNetwork, Map<number, "left" | "right" | null>>();

/** Metres before the entry line the approach is read from: some lanes already bend at the line. */
export const APPROACH_READ = 15;

/**
 * Which way a movement turns: the approach heading, read before the junction,
 * against the leaving lane's heading where the movement is clear. Whether that is
 * left or right is which side of the approach the exit lies, not the sign of the
 * heading change, which flips near a U-turn.
 */
export function movementTurn(network: TrafficNetwork, id: number): "left" | "right" | null {
  let cache = movementTurns.get(network);
  if (!cache) movementTurns.set(network, cache = new Map());
  const known = cache.get(id);
  if (known !== undefined) return known;
  const movement = network.movements[id]!, from = network.lanes[movement.from]!, to = network.lanes[movement.to]!;
  const approach = network.pose(movement.from, Math.max(0, from.length - from.entry - APPROACH_READ));
  const exit = network.pose(movement.to, Math.min(to.length, movement.clear));
  const turn = Math.atan2(Math.sin(exit.heading - approach.heading), Math.cos(exit.heading - approach.heading));
  // Forward is (-sin h, -cos h), so the left is (-cos h, sin h).
  const leftward = (exit.x - approach.x) * -Math.cos(approach.heading) + (exit.z - approach.z) * Math.sin(approach.heading);
  const result = Math.abs(turn) < SIGNAL_DEGREES * Math.PI / 180 ? null : leftward > 0 ? "left" : "right";
  cache.set(id, result);
  return result;
}

/**
 * The indicator a vehicle shows (2026-09-13): the turn at its next junction,
 * from `SIGNAL_RANGE` metres before the entry line until it is clear on the far
 * side. The turn was decided when it entered the lane (`movementAt`), so this is
 * a fact about the plan, not a guess at it, and the same plan `forecastTraffic`
 * drives forward.
 */
export function trafficSignal(network: TrafficNetwork, vehicle: Readonly<TrafficVehicleState>): "left" | "right" | null {
  const id = vehicle.holds.length ? vehicle.holds[0]! : vehicle.movement;
  if (id < 0) return null;
  const movement = network.movements[id]!;
  if (vehicle.lane === movement.to) return movementTurn(network, id);
  if (vehicle.lane !== movement.from) return null;
  const lane = network.lanes[vehicle.lane]!;
  return lane.length - lane.entry - vehicle.distance <= SIGNAL_RANGE ? movementTurn(network, id) : null;
}
