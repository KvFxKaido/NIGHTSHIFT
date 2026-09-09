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

export interface TrafficKindSpec {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  /** Cruise speed in m/s. All well under the car: traffic is an obstacle. */
  readonly cruise: number;
}

export const TRAFFIC_KINDS: Readonly<Record<TrafficKind, TrafficKindSpec>> = {
  sedan: { length: 4.4, width: 1.85, height: 1.42, cruise: 15.5 },
  taxi: { length: 4.6, width: 1.88, height: 1.5, cruise: 14 },
  van: { length: 5.4, width: 2, height: 2.25, cruise: 13 },
  "box-truck": { length: 7.2, width: 2.4, height: 3.1, cruise: 11 },
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
/** How far out a vehicle may claim its junction. Comfortably beyond the 16 m it
 *  takes to stop from cruise, and short enough that claims are not held for a
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

export function stepTraffic(network: TrafficNetwork, state: TrafficState, dt: number): void {
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
  const waiting = state.vehicles
    .filter(vehicle => !vehicle.holds.length && vehicle.movement >= 0 && toEntry(vehicle) <= CLAIM_RANGE)
    .sort((a, b) => toEntry(a) - toEntry(b) || a.id - b.id);
  for (const vehicle of waiting) {
    const chain = chainFor(network, vehicle);
    if (chain.some(id => holders.has(id) || crossingBusy(network, holders, id))) continue;
    if (!mayEnter(network, byLane, vehicle, chain)) continue;
    vehicle.holds = chain;
    for (const id of chain) holders.set(id, [...(holders.get(id) ?? []), vehicle]);
  }

  for (const vehicle of state.vehicles) {
    const spec = TRAFFIC_KINDS[vehicle.kind];
    let gap = gapAhead(network, byLane, vehicle);
    if (!vehicle.holds.length) {
      // Aim to stop short of the line rather than on it: a vehicle with no
      // claim has no right to any part of the junction.
      gap = Math.min(gap, Math.max(0, toEntry(vehicle) - STOP_SHORT) + MIN_GAP);
    }
    // Linear follower: full cruise at a comfortable gap, stopped at the bumper.
    const target = Math.max(0, Math.min(spec.cruise, (gap - MIN_GAP) / HEADWAY));
    const rate = target > vehicle.speed ? ACCELERATION : BRAKING;
    vehicle.speed += Math.max(-rate * dt, Math.min(rate * dt, target - vehicle.speed));
    vehicle.speed = Math.max(0, vehicle.speed);
    vehicle.distance += vehicle.speed * dt;

    // The entry line is a hard barrier, not a target to aim at. Everything here
    // rests on the invariant that no vehicle is ever past it without holding the
    // movement beyond, so it is enforced rather than hoped for.
    const line = network.lanes[vehicle.lane]!.length - network.lanes[vehicle.lane]!.entry;
    if (!vehicle.holds.length && vehicle.distance > line) {
      vehicle.distance = line;
      vehicle.speed = 0;
    }

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
  }
}
