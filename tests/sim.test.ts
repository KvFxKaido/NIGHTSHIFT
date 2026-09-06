import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  HANDLING,
  createSim,
  gradeAccelerationFor,
  minimumTurnRadiusAtSpeed,
  steeringAngleFor,
  resetSim,
  step,
  type Input,
} from "../src/sim/sim.ts";
import { COURSE, COURSE_SEGMENTS } from "../src/sim/track.ts";
import { FLAT_HEADING, flatSim, flatStep } from "./helpers/handling.ts";

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

test("AWD reference throttle accelerates the car along its starting direction", () => {
  const sim = createSim("awd");
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

test("AWD reference full throttle reaches and holds the 140 mph limit on level ground", (t) => {
  const sim = createSim("awd");
  const heading = -Math.PI / 2;
  sim.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
  sim.body.collider(0).setCollisionGroups(0);
  let reachedLimitAt: number | null = null;

  try {
    for (let tick = 0; tick < 60 * 20; tick++) {
      // Reuse the same flat boulevard patch as an endless straight. Preserve
      // velocity each tick so the real engine curve and drag still decide speed.
      sim.body.setTranslation({ x: -80, y: 0.5, z: -210 }, true);
      step(sim, { ...neutral, throttle: 1 });
      const car = sim.state.vehicle;
      assert.ok(Math.abs(car.pitch) < 0.000001, "top-speed run must remain level");
      assert.ok(car.speed <= HANDLING.topSpeed + 0.0001, "speed limiter must hold");
      if (reachedLimitAt === null && car.speed >= HANDLING.topSpeed - 0.01) {
        reachedLimitAt = (tick + 1) / 60;
      }
    }
    const mph = sim.state.vehicle.speed / 0.44704;
    t.diagnostic(`Level-ground terminal speed: ${mph.toFixed(1)} mph; limit reached at ${reachedLimitAt ?? "never"} s`);
    assert.ok(mph >= 139 && mph <= 141, `expected about 140 mph, got ${mph.toFixed(1)}`);
    assert.notEqual(reachedLimitAt, null, "engine must overcome drag and reach the configured cap");
    assert.ok(sim.state.vehicle.speed >= HANDLING.topSpeed - 0.01);
  } finally {
    sim.world.free();
  }
});

test("AWD reference low and mid-speed acceleration stays lively within the tyre traction limit", () => {
  for (const speed of [0, 15, 30]) {
    const sim = createSim("awd");
    try {
      sim.body.setTranslation({ x: -80, y: 0.5, z: -210 }, true);
      sim.body.setRotation({ x: 0, y: Math.sin(-Math.PI / 4), z: 0, w: Math.cos(-Math.PI / 4) }, true);
      sim.body.setLinvel({ x: speed, y: 0, z: 0 }, true);
      sim.body.collider(0).setCollisionGroups(0);
      step(sim, { ...neutral, throttle: 1 });

      // Launch is now traction-limited, not the old engine curve written into
      // velocity. Retain strong pull throughout the original 0–30 m/s range.
      const acceleration = (sim.state.vehicle.forwardSpeed - speed) * 60;
      assert.ok(acceleration > 8, `acceleration at ${speed} m/s: ${acceleration}`);
      assert.ok(acceleration <= HANDLING.maxLateralAcceleration + 0.001);
    } finally {
      sim.world.free();
    }
  }
});

test("steering rotates the car only after it is moving", () => {
  // The authored start samples a slight downhill pitch. Isolate a truly flat
  // patch here so grade-induced creeping is not confused with steering at rest.
  const sim = flatSim();
  try {
    for (let tick = 0; tick < 180; tick++) flatStep(sim, { steer: 1 });
    assert.ok(Math.abs(sim.state.vehicle.heading - FLAT_HEADING) < 0.000001);
    assert.equal(sim.state.vehicle.speed, 0);
    for (let tick = 0; tick < 45; tick++) flatStep(sim, { throttle: 1, steer: 0.5 });
    assert.ok(Math.abs(sim.state.vehicle.heading - FLAT_HEADING) > 0.1);
  } finally {
    sim.world.free();
  }
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

test("handbrake adds rear rotation in the short AWD launch-and-turn reference", () => {
  // This timing was authored at AWD's launch speed. All-layout, equal-entry-
  // speed handbrake/recovery coverage lives in handbrake.test.ts.
  const gripTurn = createSim("awd");
  const handbrakeTurn = createSim("awd");
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

test("the steering-angle assist and planning envelope remain speed-sensitive", () => {
  const citySpeed = 18;
  assert.ok(steeringAngleFor(citySpeed) > steeringAngleFor(HANDLING.topSpeed) * 2);
  assert.ok(minimumTurnRadiusAtSpeed(HANDLING.topSpeed) > 150);
  assert.equal(steeringAngleFor(citySpeed, -0.5), -steeringAngleFor(citySpeed, 0.5));
});

test("grades cost speed uphill and return it downhill", () => {
  const grade = Math.atan(0.1);
  assert.ok(gradeAccelerationFor(grade) < 0);
  assert.ok(gradeAccelerationFor(-grade) > 0);
  assert.ok(Math.abs(gradeAccelerationFor(0)) < Number.EPSILON);
});
