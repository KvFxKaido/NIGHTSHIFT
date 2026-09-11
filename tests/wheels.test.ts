import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { DT, HANDLING, WHEEL_LAYOUT, frontWheelAngles, resetSim, wheelGripFor } from "../src/sim/sim.ts";
import { CAR_GEOMETRY, createCar } from "../src/render/car.ts";
import { updateWheelPresentation } from "../src/render/wheels.ts";
import { FLAT_START, flatSim, flatStep } from "./helpers/handling.ts";

await RAPIER.init();

function near(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
}

test("all four tyre forces are applied at separate wheel positions with real yaw torque", () => {
  const sim = flatSim(20);
  const calls: { force: RAPIER.Vector; point: RAPIER.Vector }[] = [];
  const apply = sim.body.addForceAtPoint.bind(sim.body);
  sim.body.addForceAtPoint = (force, point, wake) => {
    calls.push({ force: { ...force }, point: { ...point } });
    apply(force, point, wake);
  };
  try {
    flatStep(sim, { steer: 0.7, brake: 0.5 });
    assert.equal(calls.length, 4);
    assert.equal(new Set(calls.map(call => `${call.point.x}:${call.point.z}`)).size, 4);
    let torqueY = 0;
    calls.forEach(({ force, point }, index) => {
      const layout = WHEEL_LAYOUT[index]!;
      near(point.x, FLAT_START.x + layout.forward, 1e-5);
      near(point.z, FLAT_START.z + layout.right, 1e-5);
      torqueY += (point.z - FLAT_START.z) * force.x - (point.x - FLAT_START.x) * force.z;
    });
    near(sim.body.userTorque().y, torqueY, 0.01);
    assert.ok(Math.abs(torqueY) > 100, "forces at the wheels must generate turning torque");
    assert.ok(Math.abs(sim.state.vehicle.yawRate) > 0);
  } finally { sim.world.free(); }
});

test("four tyre loads conserve vehicle weight through braking and cornering", () => {
  const sim = flatSim(30);
  try {
    for (let tick = 0; tick < 45; tick++) {
      flatStep(sim, { brake: 0.5, steer: 0.7 });
      const tyres = Object.values(sim.state.vehicle.wheels);
      near(tyres.reduce((total, tyre) => total + tyre.loadFraction, 0), 1);
      near(tyres.reduce((total, tyre) => total + tyre.normalLoad, 0), HANDLING.mass * HANDLING.gravityAlongGrade);
      assert.ok(tyres.every(tyre => tyre.normalLoad > 0));
      for (const tyre of tyres) {
        assert.ok(Math.hypot(tyre.longitudinalForce / tyre.longitudinalGripLimit,
          tyre.lateralForce / tyre.gripLimit) <= 1 + 1e-6);
      }
    }
    const car = sim.state.vehicle;
    assert.ok(car.frontLoadFraction > 0.5, "braking loads the front");
    assert.ok(car.rightLoadFraction < 0.5, "right corner loads the outside left tyres");
    assert.ok(car.wheels["front-left"].normalLoad > car.wheels["front-right"].normalLoad + 100);
    assert.ok(car.wheels["rear-left"].normalLoad > car.wheels["rear-right"].normalLoad + 100);
    assert.ok(car.wheels["front-left"].normalLoad > car.wheels["rear-left"].normalLoad);
  } finally { sim.world.free(); }
});

test("load sensitivity gives a loaded tyre more force but less grip per unit load", () => {
  assert.equal(wheelGripFor(0), 0);
  near(wheelGripFor(0.25) * 4, HANDLING.mass * HANDLING.maxLateralAcceleration);
  assert.ok(wheelGripFor(0.35) > wheelGripFor(0.15));
  assert.ok(wheelGripFor(0.35) / 0.35 < wheelGripFor(0.15) / 0.15);
  assert.ok(wheelGripFor(0.35) + wheelGripFor(0.15) < wheelGripFor(0.25) * 2);
});

test("inside and outside front tyres steer around a common turn centre", () => {
  near(frontWheelAngles(0).left, 0);
  near(frontWheelAngles(0).right, 0);
  for (const centerAngle of [0.02, 0.15, HANDLING.maxSteeringAngle]) {
    const angles = frontWheelAngles(centerAngle);
    assert.ok(angles.right > centerAngle && centerAngle > angles.left);
    const wheelbase = HANDLING.frontAxleDistance + HANDLING.rearAxleDistance;
    near(wheelbase / Math.tan(angles.right) + HANDLING.halfTrack,
      wheelbase / Math.tan(angles.left) - HANDLING.halfTrack);
    const mirrored = frontWheelAngles(-centerAngle);
    near(mirrored.left, -angles.right);
    near(mirrored.right, -angles.left);
    assert.ok(Math.max(angles.left, angles.right) < CAR_GEOMETRY.maxSteerAngle,
      "actual front angles must remain inside the tested wheel/body clearance envelope");
  }
});

test("left and right tyres have independent local speeds and brake response during yaw", () => {
  const sim = flatSim();
  sim.body.setAngvel({ x: 0, y: 1, z: 0 }, true);
  try {
    flatStep(sim);
    const tyres = sim.state.vehicle.wheels;
    assert.ok(tyres["rear-left"].longitudinalSpeed < 0);
    assert.ok(tyres["rear-right"].longitudinalSpeed > 0);
    assert.ok(tyres["rear-left"].longitudinalForce > 0);
    assert.ok(tyres["rear-right"].longitudinalForce < 0);
    assert.ok(sim.state.vehicle.yawRate < 1);
    for (const tyre of Object.values(tyres)) near(tyre.rollingDistance, tyre.longitudinalSpeed * DT);
  } finally { sim.world.free(); }
});

test("AWD axle drive stays balanced when cornering leaves unequal inside/outside grip", () => {
  const sim = flatSim(30, 0, "awd");
  try {
    for (let tick = 0; tick < 60; tick++) {
      flatStep(sim, { throttle: 1, steer: 0.8 });
      const tyres = sim.state.vehicle.wheels;
      near(tyres["front-left"].longitudinalForce, tyres["front-right"].longitudinalForce);
      near(tyres["rear-left"].longitudinalForce, tyres["rear-right"].longitudinalForce);
    }
    const tyres = sim.state.vehicle.wheels;
    assert.ok(tyres["rear-left"].gripLimit > tyres["rear-right"].gripLimit + 100);
    assert.ok(tyres["rear-left"].longitudinalForce > 0);
  } finally { sim.world.free(); }
});

test("the handbrake brakes both rear tyres without cutting front tyre grip", () => {
  const sim = flatSim(30);
  try {
    flatStep(sim, { throttle: 1, handbrake: 1 });
    for (const layout of WHEEL_LAYOUT) {
      const tyre = sim.state.vehicle.wheels[layout.id];
      assert.ok(tyre.longitudinalForce < 0, "handbrake overrides engine drive");
      near(tyre.gripLimit, wheelGripFor(tyre.loadFraction) * (layout.front ? 1 : HANDLING.handbrakeRearGrip));
    }
    const tyres = sim.state.vehicle.wheels;
    assert.ok(Math.abs(tyres["rear-left"].longitudinalForce) > Math.abs(tyres["front-left"].longitudinalForce) * 5);
    near(tyres["rear-left"].longitudinalForce, tyres["rear-right"].longitudinalForce);
  } finally { sim.world.free(); }
});

test("mirrored turns swap wheel loads, slip and steering without a left/right bias", () => {
  const left = flatSim(25);
  const right = flatSim(25);
  try {
    for (let tick = 0; tick < 45; tick++) {
      flatStep(left, { throttle: 0.5, steer: -0.7 });
      flatStep(right, { throttle: 0.5, steer: 0.7 });
    }
    const a = left.state.vehicle;
    const b = right.state.vehicle;
    near(a.forwardSpeed, b.forwardSpeed, 0.001);
    near(a.lateralSpeed, -b.lateralSpeed, 0.001);
    near(a.yawRate, -b.yawRate, 0.001);
    near(a.rightLoadFraction, 1 - b.rightLoadFraction, 0.0001);
    for (const axle of ["front", "rear"] as const) {
      near(a.wheels[`${axle}-left`].normalLoad, b.wheels[`${axle}-right`].normalLoad, 0.1);
      near(a.wheels[`${axle}-left`].slipAngle, -b.wheels[`${axle}-right`].slipAngle, 0.001);
    }
  } finally { left.world.free(); right.world.free(); }
});

test("the renderer draws each wheel's steering and rolling distance without changing simulation", () => {
  const sim = flatSim(12);
  const view = createCar();
  try {
    near(CAR_GEOMETRY.axleZ, HANDLING.frontAxleDistance);
    near(CAR_GEOMETRY.axleZ, HANDLING.rearAxleDistance);
    near(CAR_GEOMETRY.halfTrack, HANDLING.halfTrack);
    near(CAR_GEOMETRY.tireRadius, HANDLING.wheelRadius);
    for (let tick = 0; tick < 30; tick++) flatStep(sim, { steer: 0.8 });
    const saved = structuredClone(sim.state);
    updateWheelPresentation(view, sim.state.vehicle);
    updateWheelPresentation(view, sim.state.vehicle);
    WHEEL_LAYOUT.forEach((layout, index) => {
      const tyre = sim.state.vehicle.wheels[layout.id];
      assert.equal(view.wheelPivots[index]!.name, `wheel-${layout.id}`);
      near(view.wheelPivots[index]!.rotation.y, -tyre.steeringAngle);
      near(view.allWheels[index]!.rotation.x, -tyre.rollingDistance / HANDLING.wheelRadius);
    });
    assert.notEqual(view.frontWheels[0]!.rotation.y, view.frontWheels[1]!.rotation.y);
    assert.notEqual(view.allWheels[0]!.rotation.x, view.allWheels[1]!.rotation.x);
    assert.deepEqual(sim.state, saved);
    resetSim(sim);
    assert.equal(sim.state.vehicle.rightLoadFraction, 0.5);
    assert.equal(sim.state.vehicle.lateralAcceleration, 0);
    for (const tyre of Object.values(sim.state.vehicle.wheels)) {
      assert.equal(tyre.rollingDistance, 0);
      assert.equal(tyre.steeringAngle, 0);
      assert.equal(tyre.loadFraction, 0.25);
    }
  } finally { sim.world.free(); }
});
