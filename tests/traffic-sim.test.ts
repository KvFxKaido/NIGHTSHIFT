import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, resetSim, step, type Input } from "../src/sim/sim.ts";
import { createFreeRoamWorld } from "../src/sim/district.ts";
import { BLACKGLASS_WORLD } from "../src/sim/road-world.ts";
import { TRAFFIC_KINDS } from "../src/sim/traffic.ts";

await RAPIER.init();
const NEUTRAL: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

/**
 * Rapier stores positions as f32, so a body read back differs from the double
 * the sim put in — measured at 2.7e-5 m worst case out at the district's edge,
 * which is a few f32 ULPs at those coordinates. A millimetre is three orders
 * tighter than any desync worth catching, and still far inside the noise.
 */
const PLACEMENT_TOLERANCE = 1e-3;

// The traffic tests next door drive the network in isolation. None of them
// would notice the collider set drifting out of step with the vehicles it is
// meant to represent, which is the seam between the two halves and the one
// place a silent desync would put a van's body somewhere the van is not.
test("every traffic vehicle gets exactly one body, in the same order", () => {
  const sim = createSim("fwd", createFreeRoamWorld());
  assert.ok(sim.state.traffic, "the district has traffic");
  assert.equal(sim.trafficBodies.length, sim.state.traffic!.vehicles.length);
  sim.state.traffic!.vehicles.forEach((vehicle, i) => {
    const body = sim.trafficBodies[i]!;
    const at = body.translation();
    const spec = TRAFFIC_KINDS[vehicle.kind];
    assert.ok(Math.hypot(at.x - vehicle.x, at.z - vehicle.z) < PLACEMENT_TOLERANCE,
      `body ${i} is not where vehicle ${vehicle.id} is`);
    assert.ok(Math.abs(at.y - (vehicle.y + spec.height / 2)) < PLACEMENT_TOLERANCE,
      `body ${i} does not stand on the road`);
    // The collider has to be the vehicle's size, or traffic is a hazard of the
    // wrong shape: a lorry you can drive through the back half of.
    const collider = body.collider(0);
    assert.ok(collider, `body ${i} has no collider`);
    const extents = collider.halfExtents();
    assert.ok(Math.abs(extents.x - spec.width / 2) < PLACEMENT_TOLERANCE
      && Math.abs(extents.y - spec.height / 2) < PLACEMENT_TOLERANCE
      && Math.abs(extents.z - spec.length / 2) < PLACEMENT_TOLERANCE,
      `body ${i} is not ${vehicle.kind}-sized`);
  });
});

test("bodies follow the poses the tick left behind", () => {
  const sim = createSim("fwd", createFreeRoamWorld());
  for (let tick = 0; tick < 300; tick++) step(sim, NEUTRAL);
  let moved = 0;
  sim.state.traffic!.vehicles.forEach((vehicle, i) => {
    const at = sim.trafficBodies[i]!.translation();
    assert.ok(Math.hypot(at.x - vehicle.x, at.z - vehicle.z) < PLACEMENT_TOLERANCE,
      `body ${i} lagged vehicle ${vehicle.id} after 300 ticks`);
    if (vehicle.turns > 0) moved++;
  });
  assert.ok(moved > 0, "no traffic moved in five seconds");
});

test("traffic can be switched off, and then costs nothing", () => {
  const sim = createSim("fwd", createFreeRoamWorld(), { traffic: false });
  assert.equal(sim.state.traffic, null);
  assert.equal(sim.trafficBodies.length, 0);
  // Still drivable: the geometry checks run in exactly this configuration.
  for (let tick = 0; tick < 60; tick++) step(sim, NEUTRAL);
  assert.ok(Number.isFinite(sim.state.vehicle.x));
});

test("a world with no lane graph simply has no traffic", () => {
  const sim = createSim("fwd", BLACKGLASS_WORLD);
  assert.equal(BLACKGLASS_WORLD.traffic, undefined);
  assert.equal(sim.state.traffic, null);
  assert.equal(sim.trafficBodies.length, 0);
});

// Reset rebuilds the whole world, and it has to rebuild the same one: a reset
// that quietly turned traffic back on would change what a replay reproduces.
test("reset keeps the traffic choice, and puts traffic back at the start", () => {
  const on = createSim("fwd", createFreeRoamWorld());
  const before = on.state.traffic!.vehicles.map(v => `${v.lane}:${v.distance.toFixed(6)}`).join("|");
  for (let tick = 0; tick < 240; tick++) step(on, NEUTRAL);
  assert.notEqual(on.state.traffic!.vehicles.map(v => `${v.lane}:${v.distance.toFixed(6)}`).join("|"),
    before, "traffic did not move, so the reset check proves nothing");
  resetSim(on);
  assert.equal(on.state.traffic!.vehicles.map(v => `${v.lane}:${v.distance.toFixed(6)}`).join("|"), before);
  assert.equal(on.trafficBodies.length, on.state.traffic!.vehicles.length);

  const off = createSim("fwd", createFreeRoamWorld(), { traffic: false });
  resetSim(off);
  assert.equal(off.state.traffic, null, "reset switched traffic back on");
  assert.equal(off.trafficBodies.length, 0);
});
