import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, resetSim, step, HANDLING, isDrivetrain, type Drivetrain, type Input } from "../src/sim/sim.ts";
import { flatSim, flatStep, FLAT_START, hasContact } from "./helpers/handling.ts";

await RAPIER.init();
const layouts: Drivetrain[] = ["awd", "fwd", "rwd"];

test("the default matches explicit FWD across a mixed run", () => {
  const implicit = createSim();
  const explicit = createSim("fwd");
  try {
    for (let tick = 0; tick < 1200; tick++) {
      const input: Input = {
        throttle: tick < 700 || tick >= 900 ? 1 : 0,
        brake: tick >= 700 && tick < 900 ? .5 : 0,
        steer: tick < 200 ? 0 : tick < 700 ? .7 : -.6,
        handbrake: tick >= 500 && tick < 530 ? 1 : 0,
      };
      step(implicit, input);
      step(explicit, input);
      assert.deepEqual(implicit.state, explicit.state);
    }
    assert.deepEqual(implicit.world.takeSnapshot(), explicit.world.takeSnapshot());
  } finally { implicit.world.free(); explicit.world.free(); }
});

test("FWD launches, reverses and returns to forward with its unchanged two-wheel traction", () => {
  const sim = flatSim(0, 0, "fwd");
  try {
    for (let tick = 0; tick < 60; tick++) flatStep(sim, { throttle: 1 });
    assert.ok(sim.state.vehicle.forwardSpeed > 6);
    for (let tick = 0; tick < 180; tick++) flatStep(sim, { brake: 1 });
    assert.equal(sim.state.vehicle.driveDirection, -1);
    assert.ok(sim.state.vehicle.forwardSpeed < -5);
    for (let tick = 0; tick < 180; tick++) flatStep(sim, { throttle: 1 });
    assert.equal(sim.state.vehicle.driveDirection, 1);
    assert.ok(sim.state.vehicle.forwardSpeed > 5);
  } finally { sim.world.free(); }
});

test("FWD is the default and unknown drivetrain names are rejected", () => {
  const sim = createSim();
  try {
    assert.equal(sim.state.drivetrain, "fwd");
    for (const value of ["4wd", "__proto__", null, undefined]) assert.equal(isDrivetrain(value), false);
    assert.throws(() => createSim("unknown" as Drivetrain), RangeError);
    assert.throws(() => resetSim(sim, "unknown" as Drivetrain), RangeError);
    step(sim, { throttle: 1, steer: 0, brake: 0, handbrake: 0 });
    assert.equal(sim.state.tick, 1, "invalid reset must not free the existing world");
  } finally { sim.world.free(); }
});

test("each drivetrain routes propulsion to the intended tyres, without global tuning changes", () => {
  const sims = layouts.map(layout => flatSim(30, 0, layout));
  try {
    sims.forEach((sim, index) => {
      flatStep(sim, { throttle: 0.5 });
      const wheels = sim.state.vehicle.wheels;
      const front = wheels["front-left"].longitudinalForce + wheels["front-right"].longitudinalForce;
      const rear = wheels["rear-left"].longitudinalForce + wheels["rear-right"].longitudinalForce;
      assert.ok(front + rear > 6_000);
      assert.ok(Math.abs(front / (front + rear) - HANDLING.frontDriveFraction[layouts[index]!]) < 1e-9);
      assert.equal(wheels["front-left"].longitudinalForce, wheels["front-right"].longitudinalForce);
      assert.equal(wheels["rear-left"].longitudinalForce, wheels["rear-right"].longitudinalForce);
      assert.equal(sim.state.drivetrain, layouts[index]);
    });
    assert.deepEqual(HANDLING.frontDriveFraction, { awd: 0.45, fwd: 1, rwd: 0 });
  } finally { sims.forEach(sim => sim.world.free()); }
});

test("without propulsion, braking, coasting and handbraking stay identical across layouts", () => {
  for (const input of [{ steer: 0.6 }, { steer: 0.6, brake: 0.5 }, { steer: 1, throttle: 1, handbrake: 1 }]) {
    const sims = layouts.map(layout => flatSim(30, 0, layout));
    try {
      for (let tick = 0; tick < 90; tick++) {
        for (const sim of sims) {
          sim.body.setTranslation(FLAT_START, true);
          flatStep(sim, input);
        }
        assert.deepEqual(sims[0]!.state.vehicle, sims[1]!.state.vehicle);
        assert.deepEqual(sims[0]!.state.vehicle, sims[2]!.state.vehicle);
      }
    } finally { sims.forEach(sim => sim.world.free()); }
  }
});

test("changing layout is a full reset and ordinary reset retains that layout", () => {
  const sim = flatSim(30);
  const fresh = createSim("rwd");
  try {
    for (let tick = 0; tick < 45; tick++) flatStep(sim, { steer: 1, handbrake: 1 });
    resetSim(sim, "rwd");
    assert.deepEqual(sim.state, fresh.state);
    assert.deepEqual(sim.world.takeSnapshot(), fresh.world.takeSnapshot());
    step(sim, { throttle: 1, steer: 0.5, handbrake: 0, brake: 0 });
    resetSim(sim);
    assert.deepEqual(sim.state, fresh.state);
  } finally { sim.world.free(); fresh.world.free(); }
});

test("each drivetrain replays collision and handbrake inputs tick-for-tick after reset", (t) => {
  const log: Input[] = Array.from({ length: 1_200 }, (_, tick) => ({
    throttle: tick < 700 || tick >= 900 ? 1 : 0,
    brake: tick >= 700 && tick < 900 ? 1 : 0,
    steer: tick < 200 ? 0 : tick < 700 ? 0.7 : -0.6,
    handbrake: tick >= 500 && tick < 530 ? 1 : 0,
  }));
  for (const layout of layouts) {
    const fresh = createSim(layout);
    const used = createSim(layout);
    let contacts = 0;
    try {
      for (const input of log) { step(used, input); if (hasContact(used)) contacts++; }
      assert.ok(contacts > 10, "fixture must include real contacts");
      resetSim(used);
      for (const input of log) {
        step(fresh, input); step(used, input);
        assert.deepEqual(used.state, fresh.state);
      }
      assert.deepEqual(used.world.takeSnapshot(), fresh.world.takeSnapshot());
      t.diagnostic(`${layout}: ${contacts} contact ticks; exact replay`);
    } finally { fresh.world.free(); used.world.free(); }
  }
});
