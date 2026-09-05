import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  HANDLING,
  createSim,
  gradeAccelerationFor,
  minimumTurnRadiusAtSpeed,
  normalYawRateFor,
  resetSim,
  step,
  type Input,
} from "../src/sim/sim.ts";
import { COURSE, COURSE_SEGMENTS } from "../src/sim/track.ts";

await RAPIER.init();

const neutral: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

function scriptedRun() {
  const sim = createSim();
  for (let tick = 0; tick < 110; tick++) {
    step(sim, {
      throttle: 1,
      brake: 0,
      steer: tick >= 55 ? 0.35 : 0,
      handbrake: tick >= 82 && tick < 92 ? 1 : 0,
    });
  }
  return sim.state;
}

test("a recorded input sequence is deterministic", () => {
  assert.deepEqual(scriptedRun(), scriptedRun());
});

test("throttle accelerates the car along its starting direction", () => {
  const sim = createSim();
  for (let tick = 0; tick < 45; tick++) {
    step(sim, { ...neutral, throttle: 1 });
  }
  const startDirection = COURSE_SEGMENTS[0]!;
  const displacementX = sim.state.vehicle.x - COURSE.start.x;
  const displacementZ = sim.state.vehicle.z - COURSE.start.z;
  const forwardTravel = displacementX * startDirection.ux + displacementZ * startDirection.uz;
  const lateralTravel = displacementX * -startDirection.uz + displacementZ * startDirection.ux;
  assert.ok(sim.state.vehicle.speed > 10);
  assert.ok(forwardTravel > 0);
  assert.ok(Math.abs(lateralTravel) < 0.01);
});

test("steering rotates the car only after it is moving", () => {
  const sim = createSim();
  for (let tick = 0; tick < 35; tick++) step(sim, { ...neutral, steer: 1 });
  assert.ok(Math.abs(sim.state.vehicle.heading - COURSE.start.heading) < 0.000001);
  for (let tick = 0; tick < 45; tick++) step(sim, { ...neutral, throttle: 1, steer: 0.5 });
  assert.ok(Math.abs(sim.state.vehicle.heading - COURSE.start.heading) > 0.1);
});

test("reset restores the exact authored start state", () => {
  const sim = createSim();
  for (let tick = 0; tick < 50; tick++) step(sim, { ...neutral, throttle: 1, steer: -0.4 });
  resetSim(sim);
  assert.equal(sim.state.tick, 0);
  assert.equal(sim.state.vehicle.x, COURSE.start.x);
  assert.equal(sim.state.vehicle.y, COURSE.start.y);
  assert.equal(sim.state.vehicle.z, COURSE.start.z);
  assert.equal(sim.state.vehicle.heading, COURSE.start.heading);
  assert.equal(sim.state.vehicle.pitch, COURSE.start.pitch);
  assert.equal(sim.state.vehicle.speed, 0);
});

test("handbrake overrides throttle drive", () => {
  const withThrottle = createSim();
  const withoutThrottle = createSim();
  for (let tick = 0; tick < 55; tick++) {
    step(withThrottle, { ...neutral, throttle: 1 });
    step(withoutThrottle, { ...neutral, throttle: 1 });
  }

  step(withThrottle, { ...neutral, throttle: 1, handbrake: 1 });
  step(withoutThrottle, { ...neutral, handbrake: 1 });

  assert.deepEqual(withThrottle.state, withoutThrottle.state);
});

test("handbrake adds rear rotation while cornering", () => {
  const gripTurn = createSim();
  const handbrakeTurn = createSim();
  for (let tick = 0; tick < 45; tick++) {
    step(gripTurn, { ...neutral, throttle: 1 });
    step(handbrakeTurn, { ...neutral, throttle: 1 });
  }
  for (let tick = 0; tick < 12; tick++) {
    step(gripTurn, { ...neutral, steer: 0.7 });
    step(handbrakeTurn, { ...neutral, steer: 0.7, handbrake: 1 });
  }

  assert.ok(Math.abs(handbrakeTurn.state.vehicle.yawRate) > Math.abs(gripTurn.state.vehicle.yawRate));
});

test("normal steering is grip-limited as speed rises", () => {
  const citySpeed = 18;
  const topSpeedYawRate = normalYawRateFor(HANDLING.topSpeed);
  assert.ok(normalYawRateFor(citySpeed) > topSpeedYawRate * 2);
  assert.ok(minimumTurnRadiusAtSpeed(HANDLING.topSpeed) > 150);
  assert.ok(HANDLING.topSpeed * topSpeedYawRate <= HANDLING.maxLateralAcceleration + 0.000001);
});

test("grades cost speed uphill and return it downhill", () => {
  const grade = Math.atan(0.1);
  assert.ok(gradeAccelerationFor(grade) < 0);
  assert.ok(gradeAccelerationFor(-grade) > 0);
  assert.ok(Math.abs(gradeAccelerationFor(0)) < Number.EPSILON);
});
