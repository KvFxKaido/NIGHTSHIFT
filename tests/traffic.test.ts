import assert from "node:assert/strict";
import test from "node:test";
import { DISTRICT_TRAFFIC, createDistrictTraffic, projectOntoDistrict } from "../src/sim/district.ts";
import { mix, stepTraffic, TRAFFIC_KINDS, TRAFFIC_SPACING,
  type TrafficVehicleState } from "../src/sim/traffic.ts";

const DT = 1 / 60;
const network = DISTRICT_TRAFFIC;

/** Overlap depth of two vehicles' oriented boxes, 0 when clear.
 *
 *  A circle of each vehicle's half-length — the obvious first attempt — reads
 *  two cars ABREAST in adjacent lanes as a collision, because a sedan's half
 *  length exceeds a lane's width. It reported 231 overlap sites where a real
 *  box test finds 20, so the test has to be the real one. */
function overlap(a: TrafficVehicleState, b: TrafficVehicleState): number {
  const half = (v: TrafficVehicleState, axisX: number, axisZ: number) => {
    const spec = TRAFFIC_KINDS[v.kind];
    return Math.abs(-Math.sin(v.heading) * axisX + -Math.cos(v.heading) * axisZ) * spec.length / 2
      + Math.abs(Math.cos(v.heading) * axisX + -Math.sin(v.heading) * axisZ) * spec.width / 2;
  };
  let least = Infinity;
  for (const [axisX, axisZ] of [a, b].flatMap(v => [
    [-Math.sin(v.heading), -Math.cos(v.heading)], [Math.cos(v.heading), -Math.sin(v.heading)]] as const)) {
    const gap = half(a, axisX, axisZ) + half(b, axisX, axisZ)
      - Math.abs((b.x - a.x) * axisX + (b.z - a.z) * axisZ);
    if (gap <= 0) return 0;
    least = Math.min(least, gap);
  }
  return least;
}

test("the routing hash is exact, not merely random-looking", () => {
  // Determinism (law 2) rests on this. The renderer's hash01 uses Math.sin,
  // whose last bits are not specified across engines: fine for where a neon
  // sign goes, fatal for which way a lorry turns. These are the values every
  // engine must agree on.
  assert.deepEqual([0, 1, 2, 7, 40503].map(mix),
    [0, 824515495, 1722258072, 148231923, 3261717523]);
  assert.equal(mix(7), mix(7));
});

test("the lane graph is closed and its conflicts are symmetric", () => {
  assert.ok(network.lanes.length > 100);
  for (const lane of network.lanes) {
    assert.ok(lane.movements.length > 0, `lane ${lane.id} is a dead end`);
    assert.ok(lane.entry > 0 && lane.entry < lane.length, `lane ${lane.id} has a nonsense entry line`);
    for (const id of lane.movements) {
      assert.equal(network.movements[id]!.from, lane.id);
      assert.ok(network.lanes[network.movements[id]!.to], "a movement leads nowhere");
    }
  }
  for (const movement of network.movements) {
    assert.ok(movement.clear > 0);
    for (const conflict of movement.conflicts) {
      const other = network.movements[conflict.other]!;
      assert.ok(other.conflicts.some(back => back.other === movement.id),
        `${movement.id} conflicts with ${conflict.other} but not the reverse`);
    }
  }
});

test("traffic is laid out and driven identically every time", () => {
  const snapshot = (vehicles: readonly TrafficVehicleState[]) => vehicles
    .map(v => `${v.kind}:${v.lane}:${v.distance.toFixed(6)}:${v.speed.toFixed(6)}:${v.holds}`).join("|");
  const a = createDistrictTraffic(), b = createDistrictTraffic();
  assert.equal(snapshot(a.vehicles), snapshot(b.vehicles));
  for (let tick = 0; tick < 900; tick++) {
    stepTraffic(network, a, DT);
    stepTraffic(network, b, DT);
  }
  assert.equal(snapshot(a.vehicles), snapshot(b.vehicles));
});

// The invariant the whole reservation rests on. Everything else — no collisions,
// no deadlock — is reasoning about vehicles that hold the junction they are in.
test("nothing is ever inside a junction without holding it", () => {
  const state = createDistrictTraffic();
  for (let tick = 0; tick < 60 * 120; tick++) {
    stepTraffic(network, state, DT);
    for (const vehicle of state.vehicles) {
      if (vehicle.holds.length) continue;
      const lane = network.lanes[vehicle.lane]!;
      assert.ok(vehicle.distance <= lane.length - lane.entry + 1e-6,
        `#${vehicle.id} is ${(vehicle.distance - (lane.length - lane.entry)).toFixed(2)} m past ` +
        `lane ${vehicle.lane}'s entry line holding nothing, at tick ${tick}`);
    }
  }
});

test("traffic does not drive through traffic, and stays on the road", () => {
  const state = createDistrictTraffic();
  let worstOverlap = 0, worstAt = "", worstOverhang = -Infinity;
  for (let tick = 0; tick < 60 * 120; tick++) {
    stepTraffic(network, state, DT);
    if (tick % 10) continue;
    for (const vehicle of state.vehicles) {
      const road = projectOntoDistrict(vehicle.x, vehicle.z);
      worstOverhang = Math.max(worstOverhang, road.distance - road.width / 2);
    }
    for (let i = 0; i < state.vehicles.length; i++) {
      for (let j = i + 1; j < state.vehicles.length; j++) {
        const a = state.vehicles[i]!, b = state.vehicles[j]!;
        if (Math.hypot(a.x - b.x, a.z - b.z) > 12) continue;
        const depth = overlap(a, b);
        if (depth <= worstOverlap) continue;
        worstOverlap = depth;
        worstAt = `#${a.id}/#${b.id} at ${a.x.toFixed(0)},${a.z.toFixed(0)} tick ${tick}`;
      }
    }
  }
  // Conflict paths are sampled every 3 m, so a grazing crossing can be missed by
  // a few centimetres of body. Metres would be a vehicle driving through another.
  assert.ok(worstOverlap < 0.25, `traffic overlapped by ${worstOverlap.toFixed(2)} m — ${worstAt}`);
  assert.ok(worstOverhang <= 0, `traffic ran ${worstOverhang.toFixed(2)} m past the road edge`);
});

test("traffic keeps moving: no vehicle is stranded", () => {
  const state = createDistrictTraffic();
  const stopped = new Map<number, number>();
  let longest = 0, longestId = -1;
  for (let tick = 0; tick < 60 * 120; tick++) {
    stepTraffic(network, state, DT);
    for (const vehicle of state.vehicles) {
      const run = vehicle.speed < 0.5 ? (stopped.get(vehicle.id) ?? 0) + 1 : 0;
      stopped.set(vehicle.id, run);
      if (run > longest) { longest = run; longestId = vehicle.id; }
    }
  }
  // Queueing at a junction is traffic; a minute stationary is a deadlock. The
  // network's capacity is the constraint here — see design/DISTRICT.md.
  assert.ok(longest < 60 * 45,
    `#${longestId} stood still for ${(longest / 60).toFixed(0)} s`);
  for (const vehicle of state.vehicles) {
    assert.ok(vehicle.turns > 0, `#${vehicle.id} never reached a junction`);
  }
});

test("the district is dressed sparsely, as GDD §12 asks", () => {
  const state = createDistrictTraffic();
  assert.ok(TRAFFIC_SPACING >= 800, "spacing below the measured capacity cliff deadlocks the network");
  assert.ok(state.vehicles.length >= 12 && state.vehicles.length <= 30,
    `${state.vehicles.length} vehicles is not sparse traffic over a 9 km district`);
});
