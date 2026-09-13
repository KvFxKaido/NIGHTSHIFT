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

export type TrafficKind = "sedan" | "taxi" | "van" | "box-truck";

/**
 * How traffic drives, for anything replayed through it: a recording made in
 * traffic reproduces only on the traffic that drove it. "traffic-v2"
 * (2026-09-13): traffic yields to the cars it does not drive (`TrafficRacer`).
 * "traffic-v3": nothing slower than 35 mph.
 */
export const TRAFFIC_REVISION = "traffic-v3";

/**
 * A car traffic does not drive but must not drive into (2026-09-13): the player,
 * the rival, a parked rival. Traffic used to be blind to them. It stays a solid,
 * kinematic hazard that no racer can push, but it follows a racer in its lane as
 * it follows its own kind, and it does not claim a junction a racer is in or is
 * about to cross. Blind, it shoved a rival slowed into a one-lane street for ten
 * seconds and turned a truck across a rival passing it at 100 mph.
 */
export interface TrafficRacer { readonly x: number; readonly z: number; readonly heading: number; readonly speed: number }
/** A racer's length, for gaps: the longest car a racer drives, with some to spare. */
const RACER_LENGTH = 4.8;
/** Metres either side of a lane a racer counts as in it: half a lane, and half a car. */
const RACER_IN_LANE = 2.6;
/** Metres from a movement's path a racer counts as in its way: half of each car and room. */
const RACER_IN_JUNCTION = 5;
/** Seconds of a racer's course checked against a junction: long enough to cross one from the line. */
const RACER_HORIZON = 4;
/** A racer slower than this, m/s, holds no junction: it is waiting, not crossing. */
const RACER_MOVING = 3;

export interface TrafficKindSpec {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  /** Cruise speed in m/s. All well under the car: traffic is an obstacle. */
  readonly cruise: number;
}

export const TRAFFIC_KINDS: Readonly<Record<TrafficKind, TrafficKindSpec>> = {
  // Nothing slower than 35 mph (2026-09-13): sedan 40, taxi 38, van 36, box truck
  // 35. At 25-35 mph the trucks and vans were what clogged a street for a racer.
  sedan: { length: 4.4, width: 1.85, height: 1.42, cruise: 17.9 },
  taxi: { length: 4.6, width: 1.88, height: 1.5, cruise: 17 },
  van: { length: 5.4, width: 2, height: 2.25, cruise: 16.1 },
  "box-truck": { length: 7.2, width: 2.4, height: 3.1, cruise: 15.7 },
};

const KIND_ORDER: readonly TrafficKind[] = ["sedan", "sedan", "sedan", "taxi", "van", "box-truck"];

export interface TrafficLane {
  readonly id: number;
  readonly length: number;
  /** Movements leaving the far end of this lane. Never empty. */
  readonly movements: readonly number[];
  /** Metres before the end of this lane at which its junction begins. */
  readonly entry: number;
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

/** What traffic needs from a world to drive it. Supplied by whichever world has
 *  lanes; `RoadWorld.traffic` is optional and Blackglass has none. */
export interface TrafficNetwork {
  readonly lanes: readonly TrafficLane[];
  readonly movements: readonly TrafficMovement[];
  pose(lane: number, distance: number): LanePose;
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
   * The offset from the new lane's pose back to where the vehicle actually was
   * when it last crossed into that lane, and how much of it is left to absorb.
   *
   * Lanes are independent offset polylines, so the start of the next lane is
   * not the end of the previous one: writing the new lane's pose directly moved
   * a vehicle several metres sideways in a single tick. Traffic bodies are
   * kinematic, so that swept the body through anything beside it. The offset is
   * closed off as the vehicle drives instead, which keeps the pose continuous.
   */
  blendX: number;
  blendZ: number;
  blendHeading: number;
  /** Metres of offset still to absorb; 0 when not crossing. */
  blendLeft: number;
  /** What blendLeft started at, so the blend has a fraction to interpolate. */
  blendSpan: number;
  /** Slowing, or held at a standstill: what its brake lights show. */
  braking: boolean;
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

function place(network: TrafficNetwork, vehicle: TrafficVehicleState): void {
  const pose = network.pose(vehicle.lane, vehicle.distance);
  vehicle.x = pose.x;
  vehicle.y = pose.y;
  vehicle.z = pose.z;
  vehicle.heading = pose.heading;
}

/** The movement a vehicle takes at the end of `lane`, on its `turns`-th
 *  transition. Pure, so the chain below predicts exactly what will be driven. */
function movementAt(network: TrafficNetwork, id: number, lane: number, turns: number): number {
  const options = network.lanes[lane]!.movements;
  return options[mix(id * 40503 + turns) % options.length]!;
}

/** Longest offset absorbed in one crossing. Beyond this a vehicle would spend
 *  most of a street catching up, which reads as drifting rather than turning. */
const BLEND_CAP = 24;

/**
 * Begin absorbing the step from `from` to wherever the new lane just put it.
 *
 * Held as the offset back to where the vehicle was, not as that point. The new
 * lane's pose keeps advancing, so interpolating toward it chases a receding
 * target: the correction grows with every metre driven instead of shrinking,
 * and costs about two extra steps a tick rather than a fraction of one.
 */
function beginHandoff(vehicle: TrafficVehicleState, from: { x: number; z: number; heading: number }): void {
  const dx = from.x - vehicle.x, dz = from.z - vehicle.z;
  const jump = Math.hypot(dx, dz);
  if (jump <= 1e-6) return;
  vehicle.blendX = dx;
  vehicle.blendZ = dz;
  // Shortest arc: a U-turn must not unwind the long way round.
  vehicle.blendHeading = Math.atan2(Math.sin(from.heading - vehicle.heading),
    Math.cos(from.heading - vehicle.heading));
  // Spread over twice the offset, so closing it adds half a step per tick to
  // the step the vehicle was already taking, rather than a whole one.
  vehicle.blendSpan = Math.min(jump, BLEND_CAP) * 2;
  vehicle.blendLeft = vehicle.blendSpan;
}

/**
 * Add what is left of the crossing offset to the lane pose, decaying it to zero
 * as the vehicle drives. At the crossing tick the offset is still whole, so the
 * pose is where the vehicle already was; by the end of the span it is nothing,
 * and the vehicle is exactly on its lane.
 *
 * `y` is resampled under the blended point rather than kept from the lane. The
 * two lanes do NOT meet the ground at the same place: across the hill districts
 * that left a turning vehicle floating above or sunk into the road, which
 * `tests/alder.test.ts` measures against `alderHeight` to within 2 cm.
 */
function absorbHandoff(network: TrafficNetwork, vehicle: TrafficVehicleState, travelled: number): void {
  if (vehicle.blendLeft <= 0 || vehicle.blendSpan <= 0) return;
  // A vehicle stopped inside a junction still has to converge, or it would hold
  // its offset until it moved again. Small enough never to outrun its own step.
  vehicle.blendLeft = Math.max(0, vehicle.blendLeft - Math.max(travelled, vehicle.blendSpan / 600));
  const left = vehicle.blendLeft / vehicle.blendSpan;
  vehicle.x += vehicle.blendX * left;
  vehicle.z += vehicle.blendZ * left;
  vehicle.heading += vehicle.blendHeading * left;
  vehicle.y = network.height(vehicle.x, vehicle.z);
  if (vehicle.blendLeft === 0) vehicle.blendSpan = 0;
}

function chooseMovement(network: TrafficNetwork, vehicle: TrafficVehicleState): number {
  return movementAt(network, vehicle.id, vehicle.lane, vehicle.turns);
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
function crossingBusy(network: TrafficNetwork, holders: Map<number, TrafficVehicleState[]>,
  movement: number): boolean {
  return network.movements[movement]!.conflicts.some(conflict => holders.has(conflict.other));
}

function chainFor(network: TrafficNetwork, vehicle: TrafficVehicleState): number[] {
  const chain = [vehicle.movement];
  const length = TRAFFIC_KINDS[vehicle.kind].length;
  for (let step = 1; step <= MAX_CHAIN; step++) {
    const last = network.movements[chain[chain.length - 1]!]!;
    if (hasRefuge(network, last, length)) break;
    chain.push(movementAt(network, vehicle.id, last.to, vehicle.turns + step));
  }
  return chain;
}

/**
 * Lay traffic out across the whole network at a fixed spacing. There is no
 * spawning and no despawning: the set of vehicles never changes, which keeps
 * the collider set constant and takes the player's position out of a decision
 * that a replay would then have to reproduce.
 */
export function createTraffic(network: TrafficNetwork, spacing = TRAFFIC_SPACING): TrafficState {
  const vehicles: TrafficVehicleState[] = [];
  // Laid out along one ruler laid end to end over every lane's placeable window,
  // rather than restarted per lane. Per-lane placement puts a vehicle on every
  // stub in the network regardless of how short it is, which quietly doubles the
  // count and is not what "sparse" means.
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
    for (let next = Math.ceil((travelled + 1e-9) / spacing) * spacing;
      next <= travelled + window; next += spacing) {
      const id = vehicles.length;
      const kind = KIND_ORDER[mix(id * 2654435761) % KIND_ORDER.length]!;
      const vehicle: TrafficVehicleState = {
        id, kind, lane: lane.id, distance: first + (next - travelled),
        speed: TRAFFIC_KINDS[kind].cruise,
        movement: -1, holds: [], turns: 0, x: 0, y: 0, z: 0, heading: 0,
        blendX: 0, blendZ: 0, blendHeading: 0, blendLeft: 0, blendSpan: 0, braking: false,
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
    if (Math.cos(racer.heading - pose.heading) <= 0.5) continue;
    best = Math.min(best, straight - (TRAFFIC_KINDS[vehicle.kind].length + RACER_LENGTH) / 2);
  }
  return best;
}

const movementPaths = new WeakMap<TrafficNetwork, Map<number, LanePose[]>>();
/** A movement's path as a polyline: its lane from the entry line, the handoff, the far lane to where it is clear. */
function movementPath(network: TrafficNetwork, id: number): LanePose[] {
  let cache = movementPaths.get(network);
  if (!cache) movementPaths.set(network, cache = new Map());
  let path = cache.get(id);
  if (!path) {
    const movement = network.movements[id]!, from = network.lanes[movement.from]!, to = network.lanes[movement.to]!;
    path = [network.pose(movement.from, Math.max(0, from.length - from.entry)), network.pose(movement.from, from.length),
      network.pose(movement.to, 0), network.pose(movement.to, Math.min(to.length, movement.clear))];
    cache.set(id, path);
  }
  return path;
}

/** Whether a racer is in a movement's path now, or will be within `seconds` on its present course. */
function racerCrossing(network: TrafficNetwork, chain: readonly number[], racers: readonly TrafficRacer[], seconds: number): boolean {
  for (const racer of racers) {
    // Only a racer on the move. One stopped or crawling at a junction is waiting
    // for traffic itself, and holding traffic for it made them wait on each other
    // (seeds 2 and 5): traffic goes, as it always did, and the racer goes after.
    if (racer.speed < RACER_MOVING) continue;
    const vx = -Math.sin(racer.heading) * racer.speed, vz = -Math.cos(racer.heading) * racer.speed;
    for (const id of chain) {
      const path = movementPath(network, id);
      for (let t = 0; t <= seconds; t += 0.25) {
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
  const waiting = state.vehicles
    .filter(vehicle => !vehicle.holds.length && vehicle.movement >= 0 && toEntry(vehicle) <= CLAIM_RANGE
      && headOfQueue(vehicle))
    .sort((a, b) => toEntry(a) - toEntry(b) || a.id - b.id);
  for (const vehicle of waiting) {
    const chain = chainFor(network, vehicle);
    if (chain.some(id => holders.has(id) || crossingBusy(network, holders, id))) continue;
    if (!mayEnter(network, byLane, vehicle, chain)) continue;
    // A racer in the junction, or crossing it before this vehicle could be clear, has it.
    const clearIn = Math.min(RACER_HORIZON, (toEntry(vehicle) + 30) / Math.max(3, vehicle.speed));
    if (racerCrossing(network, chain, racers, clearIn)) continue;
    vehicle.holds = chain;
    for (const id of chain) holders.set(id, [...(holders.get(id) ?? []), vehicle]);
  }

  for (const vehicle of state.vehicles) {
    const spec = TRAFFIC_KINDS[vehicle.kind];
    let gap = Math.min(gapAhead(network, byLane, vehicle), racerGap(network, vehicle, racers));
    if (!vehicle.holds.length) {
      // Aim to stop short of the line rather than on it: a vehicle with no
      // claim has no right to any part of the junction.
      gap = Math.min(gap, Math.max(0, toEntry(vehicle) - STOP_SHORT) + MIN_GAP);
    }
    // Linear follower: full cruise at a comfortable gap, stopped at the bumper.
    const target = Math.max(0, Math.min(spec.cruise, (gap - MIN_GAP) / HEADWAY));
    const rate = target > vehicle.speed ? ACCELERATION : BRAKING;
    const was = vehicle.speed;
    vehicle.speed += Math.max(-rate * dt, Math.min(rate * dt, target - vehicle.speed));
    vehicle.speed = Math.max(0, vehicle.speed);
    // Brake lights: slowing by more than 1 m/s², or held at a standstill.
    vehicle.braking = vehicle.speed < was - dt * 1 || (target < 0.5 && vehicle.speed < 0.5);
    vehicle.distance += vehicle.speed * dt;

    // The entry line is a hard barrier, not a target to aim at. Everything here
    // rests on the invariant that no vehicle is ever past it without holding the
    // movement beyond, so it is enforced rather than hoped for.
    const line = network.lanes[vehicle.lane]!.length - network.lanes[vehicle.lane]!.entry;
    if (!vehicle.holds.length && vehicle.distance > line) {
      vehicle.distance = line;
      vehicle.speed = 0;
    }

    // Where it stood before any crossing, which is what the new pose has to
    // stay continuous with.
    const held = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading };
    const laneBefore = vehicle.lane;
    let current = network.lanes[vehicle.lane]!;
    // `while`, not `if`: a short connector can be crossed inside one tick.
    while (vehicle.distance >= current.length) {
      vehicle.distance -= current.length;
      vehicle.turns++;
      vehicle.lane = network.movements[vehicle.holds[0]!]!.to;
      current = network.lanes[vehicle.lane]!;
      // Drop the movement just completed only when a later one in the chain
      // takes over; otherwise it is released below, once actually clear.
      if (vehicle.holds.length > 1) vehicle.holds.shift();
      vehicle.movement = vehicle.holds.length > 1
        ? vehicle.holds[1]! : chooseMovement(network, vehicle);
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
    if (vehicle.lane !== laneBefore) beginHandoff(vehicle, held);
    absorbHandoff(network, vehicle, vehicle.speed * dt);
  }
}

/**
 * Where a vehicle will be `seconds` from now if it keeps its speed and its plan
 * (2026-09-13). It drives the same lanes, takes the movements it holds and then
 * the ones `movementAt` has already decided, makes the same handoff slide onto
 * each new lane, and stops at the entry line of any junction it holds no claim
 * for, because that is the rule it drives by. A forecast, not a promise: a car
 * granted a junction in the meantime pulls out, and one that brakes for a queue
 * is further back than this says.
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
  let left = seconds;
  while (left > 1e-9) {
    // Coarse steps on a lane, the tick's own step across a lane change: the slide
    // onto the new lane starts from where the car was the step before, and a coarse
    // step starts it from the wrong place (1.2 m off after two seconds at 0.1 s).
    const coarse = Math.min(step, left);
    const crossing = ghost.holds.length > 0 && ghost.distance + ghost.speed * coarse >= network.lanes[ghost.lane]!.length;
    const dt = crossing ? Math.min(fine, coarse) : coarse;
    left -= dt;
    const before = ghost.distance;
    ghost.distance += ghost.speed * dt;
    const line = network.lanes[ghost.lane]!.length - network.lanes[ghost.lane]!.entry;
    if (!ghost.holds.length && before <= line && ghost.distance > line) ghost.distance = line;
    const held = { x: ghost.x, z: ghost.z, heading: ghost.heading };
    const laneBefore = ghost.lane;
    let current = network.lanes[ghost.lane]!;
    while (ghost.distance >= current.length && ghost.holds.length) {
      ghost.distance -= current.length;
      ghost.turns++;
      ghost.lane = network.movements[ghost.holds[0]!]!.to;
      current = network.lanes[ghost.lane]!;
      if (ghost.holds.length > 1) ghost.holds.shift();
      else ghost.holds = [];
      ghost.movement = ghost.holds.length ? ghost.holds[0]! : chooseMovement(network, ghost);
    }
    if (ghost.distance >= current.length) ghost.distance = current.length;
    place(network, ghost);
    if (ghost.lane !== laneBefore) beginHandoff(ghost, held);
    absorbHandoff(network, ghost, ghost.speed * dt);
  }
  return { x: ghost.x, z: ghost.z, heading: ghost.heading };
}

/** Metres before its junction's entry line a vehicle starts showing the turn it has already decided. */
export const SIGNAL_RANGE = 45;
/** A movement turning less than this is straight on and shows nothing. */
const SIGNAL_DEGREES = 30;
const movementTurns = new WeakMap<TrafficNetwork, Map<number, "left" | "right" | null>>();

/** Metres before the entry line the approach is read from: some lanes already bend at the line. */
const APPROACH_READ = 15;

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
