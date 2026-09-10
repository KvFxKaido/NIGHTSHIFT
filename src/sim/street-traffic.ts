import type { Street } from "./street-path.ts";
import { laneLength, lanes, lanePose, lanesPerDirection, type Lane } from "./lanes.ts";
import { TRAFFIC_KINDS, type TrafficLane, type TrafficMovement, type TrafficNetwork } from "./traffic.ts";

export const JUNCTION_SEARCH = 70;
/** Slack added to a reservation zone beyond the last crossing found in it. */
const RESERVE_MARGIN = 6;
/**
 * Two movements conflict when the largest vehicle on one could touch the
 * largest vehicle on the other. Asked as a distance between centrelines it has
 * no answer: opposing lanes in an alley run 3.75 m apart and must not conflict,
 * while two paths crossing at an angle collide from 4.5 m apart because a 7.2 m
 * lorry sweeps far wider than the line it drives. Measured both ways, a single
 * threshold either seizes every alley or misses every turn.
 *
 * So the question is asked as geometry: each path segment becomes the box a
 * worst-case vehicle sweeps along it, and two movements conflict if any pair of
 * those boxes overlaps. Conservative — it assumes lorries everywhere — which is
 * the right direction for a safety property.
 */
const CONFLICT_LENGTH = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.length));
const CONFLICT_WIDTH = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.width));
/** Bounding-box slack for the cheap reject, covering the swept box's reach. */
const CONFLICT_CLEARANCE = CONFLICT_LENGTH + CONFLICT_WIDTH;
/** Spacing at which movement paths are sampled to find crossings. */
const CONFLICT_STEP = 3;

/** The box a worst-case vehicle sweeps driving one path segment. */
interface SweptBox {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  halfLength: number;
  halfWidth: number;
}

function sweptBox(ax: number, az: number, bx: number, bz: number): SweptBox {
  const dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: (ax + bx) / 2, z: (az + bz) / 2, dirX: dx / length, dirZ: dz / length,
    halfLength: length / 2 + CONFLICT_LENGTH / 2, halfWidth: CONFLICT_WIDTH / 2,
  };
}

/** Separating-axis overlap test for two swept boxes. */
function sweptBoxesOverlap(a: SweptBox, b: SweptBox): boolean {
  const extent = (box: SweptBox, axisX: number, axisZ: number) =>
    Math.abs(box.dirX * axisX + box.dirZ * axisZ) * box.halfLength
    + Math.abs(-box.dirZ * axisX + box.dirX * axisZ) * box.halfWidth;
  for (const [axisX, axisZ] of [[a.dirX, a.dirZ], [-a.dirZ, a.dirX],
    [b.dirX, b.dirZ], [-b.dirZ, b.dirX]] as const) {
    const separation = Math.abs((b.x - a.x) * axisX + (b.z - a.z) * axisZ);
    if (separation > extent(a, axisX, axisZ) + extent(b, axisX, axisZ)) return false;
  }
  return true;
}


interface LaneEntry { street: Street; lane: Lane; junction: string }

/** The junction a lane arrives at, travelling in its own direction. */
function laneExitJunction(street: Street, lane: Lane): string {
  return lane.direction === 1 ? street.to : street.from;
}

export function buildStreetTrafficNetwork(streets: readonly Street[],
  heightAt: (x: number, z: number) => number): TrafficNetwork {
  const entries: LaneEntry[] = streets.flatMap(street =>
    lanes(street.kind).map(lane => ({ street, lane, junction: laneExitJunction(street, lane) })));
  const idOf = new Map<string, number>();
  entries.forEach((entry, id) =>
    idOf.set(`${entry.street.id}|${entry.lane.direction}|${entry.lane.index}`, id));
  // Each lane's own length, not its street's: distances along a lane, and every
  // reach and sweep derived from them, are that lane's arc length.
  const lengths = entries.map(entry => laneLength(entry.street.points, entry.lane, entry.street.kind));
  const reach = (id: number) => Math.min(JUNCTION_SEARCH, lengths[id]! * 0.9);

  const junctionIds = [...new Set(streets.flatMap(street => [street.from, street.to]))];
  const junctionOf = new Map(junctionIds.map((id, index) => [id, index]));

  /** Lanes leaving a junction, keeping to the same lane index where the exit
   *  street has one — turning off an arterial into an alley drops you to its
   *  only lane, which is exactly the lane drop a driver reads. */
  const exitsAt = (junction: string, index: number, exclude: Street | null): number[] => {
    const exits: number[] = [];
    for (const street of streets) {
      if (street === exclude) continue;
      for (const direction of [1, -1] as const) {
        if ((direction === 1 ? street.from : street.to) !== junction) continue;
        const kept = Math.min(index, lanesPerDirection(street.kind) - 1);
        const id = idOf.get(`${street.id}|${direction}|${kept}`);
        if (id !== undefined) exits.push(id);
      }
    }
    return exits;
  };

  const movements: TrafficMovement[] = [];
  const laneMovements: number[][] = entries.map(() => []);
  entries.forEach((entry, from) => {
    // A U-turn is the last resort, not a choice: only where a junction offers
    // nothing else, which the district's graph does not currently do.
    const exits = exitsAt(entry.junction, entry.lane.index, entry.street);
    const usable = exits.length ? exits : exitsAt(entry.junction, entry.lane.index, null);
    for (const to of usable) {
      const id = movements.length;
      movements.push({
        id, junction: junctionOf.get(entry.junction)!, from, to,
        conflicts: [], sweeps: [], clear: reach(to),
      });
      laneMovements[from]!.push(id);
    }
  });

  // Surface height is irrelevant to whether two paths cross, and projecting it
  // for every sample of every movement is most of this build's cost.
  const flatPose = (lane: number, distance: number) => {
    const entry = entries[lane]!;
    return lanePose(entry.street.points, entry.lane, distance, () => 0, entry.street.kind);
  };

  /**
   * A movement's path through its junction: the tail of the lane it arrives on,
   * then the head of the lane it leaves by. `along` is signed — negative metres
   * still to go before the junction, positive metres past it — so a crossing
   * found here says exactly how far back the reservation has to start.
   */
  const pathOf = (movement: TrafficMovement): { x: number; z: number; along: number; lane: number }[] => {
    const path: { x: number; z: number; along: number; lane: number }[] = [];
    const fromLength = lengths[movement.from]!;
    for (let back = reach(movement.from); back >= 0; back -= CONFLICT_STEP) {
      path.push({ ...flatPose(movement.from, fromLength - back), along: -back, lane: movement.from });
    }
    for (let forward = CONFLICT_STEP; forward <= reach(movement.to); forward += CONFLICT_STEP) {
      path.push({ ...flatPose(movement.to, forward), along: forward, lane: movement.to });
    }
    return path;
  };
  const paths = movements.map(pathOf);
  const bounds = paths.map(path => ({
    minX: Math.min(...path.map(p => p.x)), maxX: Math.max(...path.map(p => p.x)),
    minZ: Math.min(...path.map(p => p.z)), maxZ: Math.max(...path.map(p => p.z)),
  }));

  interface Span { from: number; to: number }
  const spans = new Map<string, { a: Span; b: Span }>();
  // How far back along its approach, and how far on past the junction, each
  // movement's crossings actually reach. The reservation zone is then exactly
  // the zone that needs one, rather than a radius picked in advance.
  const backReach = movements.map(() => 0);
  const forwardReach = movements.map(() => 0);
  // Every pair, not just pairs at the same junction. Two junctions in this
  // district sit 34 m apart with overlapping aprons, and a movement's path
  // reaches far enough to cross one belonging to the junction next door — which
  // is where the last overlaps came from once the reservation itself was sound.
  // The bounding-box reject below keeps this affordable.
  for (let i = 0; i < movements.length; i++) {
    {
      for (let j = i + 1; j < movements.length; j++) {
        const a = movements[i]!, b = movements[j]!;
        // Two vehicles on one approach are a queue, not a conflict; the
        // follower rule already keeps them apart.
        if (a.from === b.from) continue;
        const boxA = bounds[a.id]!, boxB = bounds[b.id]!;
        if (boxA.minX - CONFLICT_CLEARANCE > boxB.maxX || boxB.minX - CONFLICT_CLEARANCE > boxA.maxX
          || boxA.minZ - CONFLICT_CLEARANCE > boxB.maxZ || boxB.minZ - CONFLICT_CLEARANCE > boxA.maxZ) continue;
        let crosses = false;
        const pathA = paths[a.id]!, pathB = paths[b.id]!;
        for (let m = 1; m < pathA.length; m++) {
          const a0 = pathA[m - 1]!, a1 = pathA[m]!;
          const boxA = sweptBox(a0.x, a0.z, a1.x, a1.z);
          // One distance against a bounding radius, before four axes of exact
          // test. A movement path spans up to 140 m, so its own bounding box is
          // far too coarse to reject the pair; the segments are not.
          const radiusA = boxA.halfLength + boxA.halfWidth;
          for (let n = 1; n < pathB.length; n++) {
            const b0 = pathB[n - 1]!, b1 = pathB[n]!;
            const midX = (b0.x + b1.x) / 2 - boxA.x, midZ = (b0.z + b1.z) / 2 - boxA.z;
            const radiusB = Math.hypot(b1.x - b0.x, b1.z - b0.z) / 2
              + CONFLICT_LENGTH / 2 + CONFLICT_WIDTH / 2;
            if (midX * midX + midZ * midZ > (radiusA + radiusB) ** 2) continue;
            // Once two movements are on the same lane they have merged, and a
            // merge is a queue: the follower rule owns it from there. Counting
            // the shared lane as conflict makes two movements onto one street
            // exclude each other along its entire length, which is what turned
            // every junction into a one-at-a-time gate.
            if (a1.lane === b1.lane && a0.lane === b0.lane) continue;
            if (!sweptBoxesOverlap(boxA, sweptBox(b0.x, b0.z, b1.x, b1.z))) continue;
            crosses = true;
            const key = `${a.id}|${b.id}`;
            let span = spans.get(key);
            if (!span) {
              span = { a: { from: Infinity, to: -Infinity }, b: { from: Infinity, to: -Infinity } };
              spans.set(key, span);
            }
            for (const [side, from, to] of [["a", a0, a1], ["b", b0, b1]] as const) {
              for (const sample of [from, to]) {
                span[side].from = Math.min(span[side].from, sample.along);
                span[side].to = Math.max(span[side].to, sample.along);
              }
            }
            for (const [movement, from, to] of [[a, a0, a1], [b, b0, b1]] as const) {
              for (const sample of [from, to]) {
                if (sample.along < 0) {
                  backReach[movement.id] = Math.max(backReach[movement.id]!, -sample.along);
                } else {
                  forwardReach[movement.id] = Math.max(forwardReach[movement.id]!, sample.along);
                }
              }
            }
          }
        }
        if (!crosses) continue;
      }
    }
  }

  // Surface height, sampled once per lane instead of projected every tick.
  // projectOntoDistrict searches the street network, and measured at most of a
  // traffic tick when called per vehicle — re-deriving a number that cannot
  // change. districtLanePose stays exact; this is the realtime path.
  const profiles = entries.map((_, id) => {
    const count = Math.max(2, Math.ceil(lengths[id]! / TRAFFIC_HEIGHT_STEP) + 1);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const flat = flatPose(id, Math.min(lengths[id]!, i * TRAFFIC_HEIGHT_STEP));
      heights[i] = heightAt(flat.x, flat.z);
    }
    return heights;
  });

  const conflicts: { other: number; from: number; to: number; otherFrom: number; otherTo: number }[][] =
    movements.map(() => []);
  for (const [key, span] of spans) {
    const [x, y] = key.split("|").map(Number) as [number, number];
    conflicts[x]!.push({ other: y, from: span.a.from, to: span.a.to,
      otherFrom: span.b.from, otherTo: span.b.to });
    conflicts[y]!.push({ other: x, from: span.b.from, to: span.b.to,
      otherFrom: span.a.from, otherTo: span.a.to });
  }

  // Which stretches of which lanes each movement's swept path crosses. Sampling
  // the lanes against the boxes is the same question the conflict pass asks,
  // put to stationary vehicles instead of to other movements.
  // Sampled at 4 m, not 2: a span this pass exists to find is a *vehicle*
  // standing in a movement's path, and the shortest vehicle is 4.4 m long, so
  // no occupied span can hide between samples. Halves the hottest loop.
  const SWEEP_STEP = 4;
  // Lane extents, so a movement only samples the lanes it could possibly reach.
  // Without this the pass walks every lane end to end for every movement — 209
  // million box tests, and most of a 26-second module import.
  const laneExtent = entries.map((_, id) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let d = 0; d <= lengths[id]!; d += SWEEP_STEP) {
      const point = flatPose(id, d);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  });
  const sweeps = movements.map(movement => {
    const boxes = [];
    const path = paths[movement.id]!;
    for (let m = 1; m < path.length; m++) {
      boxes.push(sweptBox(path[m - 1]!.x, path[m - 1]!.z, path[m]!.x, path[m]!.z));
    }
    const spans = new Map<number, { from: number; to: number }>();
    const box = bounds[movement.id]!;
    for (let lane = 0; lane < entries.length; lane++) {
      if (lane === movement.from || lane === movement.to) continue;
      const extent = laneExtent[lane]!;
      if (box.minX - CONFLICT_CLEARANCE > extent.maxX || extent.minX - CONFLICT_CLEARANCE > box.maxX
        || box.minZ - CONFLICT_CLEARANCE > extent.maxZ || extent.minZ - CONFLICT_CLEARANCE > box.maxZ) continue;
      for (let distance = 0; distance <= lengths[lane]!; distance += SWEEP_STEP) {
        const point = flatPose(lane, distance);
        // Four comparisons against the whole path's extent before ~47 exact box
        // tests. Most of a lane lies nowhere near any one movement, and this is
        // the single hottest loop in the build.
        if (point.x < box.minX - CONFLICT_CLEARANCE || point.x > box.maxX + CONFLICT_CLEARANCE
          || point.z < box.minZ - CONFLICT_CLEARANCE || point.z > box.maxZ + CONFLICT_CLEARANCE) continue;
        const hit = boxes.some(swept => sweptBoxesOverlap(swept,
          { x: point.x, z: point.z, dirX: 1, dirZ: 0, halfLength: 0, halfWidth: 0 }));
        if (!hit) continue;
        const span = spans.get(lane);
        if (span) span.to = distance;
        else spans.set(lane, { from: distance, to: distance });
      }
    }
    // Widened by the sample step at each end, so the recorded span provably
    // contains the true one rather than the samples that happened to land in it.
    return [...spans].map(([lane, span]) => ({
      lane, from: span.from - SWEEP_STEP, to: span.to + SWEEP_STEP }));
  });

  const trafficLanes: TrafficLane[] = entries.map((_, id) => ({
    id, length: lengths[id]!, movements: laneMovements[id]!,
    // The entry line covers both the crossings of movements leaving this lane
    // and any tarmac the lane itself shares near its end.
    // Matching the far side: the reservation begins where this lane starts
    // sharing tarmac with anything, so the region a vehicle holds is exactly
    // the region where it could meet another.
    entry: Math.min(lengths[id]! * 0.45, RESERVE_MARGIN + Math.max(0,
      ...laneMovements[id]!.map(movement => backReach[movement]!))),
  }));

  return {
    lanes: trafficLanes,
    movements: movements.map(movement => ({
      ...movement, conflicts: conflicts[movement.id]!, sweeps: sweeps[movement.id]!,
      // Hold the claim until clear of the shared tarmac on the far side, not
      // merely past the crossings found. The two differ, and the difference is
      // where the last collisions lived: two exits of one junction diverge
      // slowly, and a vehicle "past its crossing" is still beside the next lane.
      clear: Math.min(reach(movement.to), RESERVE_MARGIN + forwardReach[movement.id]!),
    })),
    pose: (lane, distance) => {
      const pose = flatPose(lane, distance);
      const heights = profiles[lane]!;
      const at = Math.max(0, Math.min(heights.length - 1, distance / TRAFFIC_HEIGHT_STEP));
      const index = Math.floor(at);
      const next = Math.min(index + 1, heights.length - 1);
      pose.y = heights[index]! + (heights[next]! - heights[index]!) * (at - index);
      return pose;
    },
  };
}

/** Spacing of the sampled lane height profile, in metres. */
export const TRAFFIC_HEIGHT_STEP = 4;
