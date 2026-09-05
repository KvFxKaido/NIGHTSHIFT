import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  brakeDecelerationFor, DT, HANDLING, minimumTurnRadiusAtSpeed, resetSim, type Input,
} from "../src/sim/sim.ts";
import { angleDelta, FLAT_HEADING, FLAT_START, flatSim, flatStep } from "./helpers/handling.ts";

await RAPIER.init();
const radians = (degrees: number) => degrees * Math.PI / 180;

function maneuver(speed: number, input: Partial<Input> | ((tick: number) => Partial<Input>),
  seconds = 1, sideways = 0, stopNearRest = false) {
  const sim = flatSim(speed, sideways);
  let ticks = 0;
  let maxSlip = 0;
  let maxLoadStep = 0;
  let previousLoad = 0.5;
  try {
    for (; ticks < Math.round(seconds / DT); ticks++) {
      flatStep(sim, typeof input === "function" ? input(ticks) : input);
      const car = sim.state.vehicle;
      maxSlip = Math.max(maxSlip, Math.abs(car.slipAngle));
      maxLoadStep = Math.max(maxLoadStep, Math.abs(car.frontLoadFraction - previousLoad));
      previousLoad = car.frontLoadFraction;
      for (const axle of [car.frontAxle, car.rearAxle]) {
        assert.ok(Math.hypot(axle.longitudinalForce, axle.lateralForce) <= axle.gripLimit + 1e-6,
          "braking, drive and cornering must share the axle's finite grip budget");
      }
      if (stopNearRest && car.speed < 0.7) { ticks++; break; }
    }
    const car = sim.state.vehicle;
    const velocity = sim.body.linvel();
    return {
      seconds: ticks * DT, forwardTravel: car.x - FLAT_START.x, lateralTravel: car.z - FLAT_START.z,
      headingChange: Math.abs(angleDelta(car.heading, FLAT_HEADING)),
      travelTurn: Math.abs(angleDelta(Math.atan2(-velocity.x, -velocity.z), FLAT_HEADING)),
      speed: car.speed, forwardSpeed: car.forwardSpeed, lateralSpeed: car.lateralSpeed,
      slip: Math.abs(car.slipAngle), yaw: Math.abs(car.yawRate), maxSlip,
      frontLoad: car.frontLoadFraction, maxLoadStep,
    };
  } finally {
    sim.world.free();
  }
}

test("full braking from 100 km/h is firm without an anchor-like stop", (t) => {
  const stop = maneuver(100 / 3.6, { brake: 1 }, 5, 0, true);
  t.diagnostic(`Near-stop: ${stop.forwardTravel.toFixed(2)} m / ${stop.seconds.toFixed(2)} s`);
  // Finite traction and front brake bias replace the old unconstrained curve.
  // Stop before the existing shared brake/reverse input selects reverse.
  assert.ok(stop.speed < 0.7);
  assert.ok(stop.forwardTravel > 25 && stop.forwardTravel < 31);
  assert.ok(stop.seconds >= 1.8 && stop.seconds < 2.3);
  assert.ok(Math.abs(stop.lateralTravel) < 0.001);
});

test("a faster entry has a wider actual path and usable steering across the stick", () => {
  const fast = maneuver(30, { steer: 1 });
  const slow = maneuver(15, { steer: 1 });
  assert.ok(fast.forwardTravel > 25);
  assert.ok(slow.travelTurn / slow.forwardTravel > fast.travelTurn / fast.forwardTravel * 1.5);
  const quarter = maneuver(30, { steer: 0.25 });
  const half = maneuver(30, { steer: 0.5 });
  assert.ok(quarter.travelTurn > radians(3));
  assert.ok(half.travelTurn > quarter.travelTurn * 1.4);
  assert.ok(fast.travelTurn > half.travelTurn * 1.2);
  assert.ok(fast.maxSlip < radians(10), "full lock must not invent a sustained drift");
});

test("normal braking tightens the travel path, not just the body's heading", () => {
  const coast = maneuver(30, { steer: 0.7 });
  for (const brake of [0.5, 1]) {
    const entry = maneuver(30, { steer: 0.7, brake });
    assert.ok(entry.speed < coast.speed);
    assert.ok(entry.travelTurn > coast.travelTurn);
    assert.ok(entry.travelTurn / entry.forwardTravel > coast.travelTurn / coast.forwardTravel);
    assert.ok(entry.maxSlip < radians(8), "service braking must retain stable rear grip");
  }
  const half = maneuver(30, { steer: 0.7, brake: 0.5 });
  const full = maneuver(30, { steer: 0.7, brake: 1 });
  assert.ok(half.speed > 20 && half.speed < 24);
  assert.ok(full.speed > 15 && full.speed < 20);
  assert.ok(half.speed > full.speed + 2);
});

test("cornering spends grip and lengthens stopping distance", () => {
  const straight = maneuver(30, { brake: 1 });
  const turning = maneuver(30, { steer: 1, brake: 1 });
  assert.ok(turning.speed > straight.speed, "ABS-style steering priority must cost braking force");
});

test("handbrake remains a distinct rear-rotation tool with a speed cost", () => {
  const coast = maneuver(30, { steer: 0.7 });
  const trail = maneuver(30, { steer: 0.7, brake: 0.5 });
  const handbrake = maneuver(30, { steer: 0.7, handbrake: 1 });
  assert.ok(handbrake.speed < coast.speed - 3);
  assert.ok(handbrake.headingChange > trail.headingChange * 1.5);
  assert.ok(handbrake.maxSlip > trail.maxSlip * 3);
  assert.ok(trail.travelTurn > handbrake.travelTurn * 0.85,
    "ordinary brakes must be competitive at changing travel direction");
  const recovered = maneuver(30, tick => tick < 30 ? { steer: 0.7, handbrake: 1 }
    : tick < 60 ? { steer: -0.5 } : {}, 2);
  assert.ok(recovered.slip < radians(3) && recovered.yaw < 0.1,
    "release and countersteer must catch the rear slide");
});

test("full gas and steering do not manufacture an unbounded power slide", () => {
  const powered = maneuver(30, { throttle: 1, steer: 1 });
  assert.ok(powered.speed > 30);
  assert.ok(powered.maxSlip < radians(8));
  assert.ok(Math.abs(powered.lateralSpeed) < 5);
  const released = maneuver(30, tick => tick < 60 ? { throttle: 1, steer: 1 } : {}, 2);
  assert.ok(released.slip < radians(1) && released.yaw < 0.05);
});

test("a sideways shove survives the first tick and then tyre forces settle it", () => {
  const first = maneuver(30, {}, DT, 9);
  assert.ok(first.lateralSpeed > 8, "finite tyre force cannot erase a 9 m/s shove in one tick");
  const settled = maneuver(30, {}, 1, 9);
  assert.ok(Math.abs(settled.lateralSpeed) < 0.2);
  assert.ok(settled.headingChange < radians(5));
  assert.ok(settled.speed < Math.hypot(30, 9));
  assert.ok(maneuver(0, {}, 2, 9).speed < 0.01, "pure sideways motion must also settle");
});

test("tyres and brakes dissipate energy without throttle, including low-speed yaw", () => {
  for (const forward of [-12, 0, 0.1, 8, 30]) {
    for (const steer of [-1, 0, 1]) {
      const sim = flatSim(forward, 3);
      sim.body.setAngvel({ x: 0, y: 1.5, z: 0 }, true);
      const energy = () => {
        const v = sim.body.linvel();
        return 0.5 * sim.body.mass() * (v.x ** 2 + v.z ** 2) +
          0.5 * sim.body.principalInertia().y * sim.body.angvel().y ** 2;
      };
      try {
        let previous = energy();
        for (let tick = 0; tick < 120; tick++) {
          // Handbrake cannot select reverse or apply engine force near rest.
          flatStep(sim, { steer, handbrake: 1 });
          const current = energy();
          assert.ok(Number.isFinite(current));
          assert.ok(current <= previous + 0.02,
            `passive tyres added energy at ${forward} m/s, steer ${steer}, tick ${tick}`);
          previous = current;
        }
      } finally { sim.world.free(); }
    }
  }
});

test("even a small brake pull sheds more speed than lifting alone", () => {
  const coast = maneuver(30, {}, 0.5);
  for (const brake of [0.01, 0.1, 0.25, 0.5, 1]) {
    assert.ok(maneuver(30, { brake }, 0.5).speed < coast.speed, `brake input ${brake}`);
  }
});

test("brake strength is progressive, bounded, and responds on the first tick", () => {
  assert.equal(brakeDecelerationFor(-1), 0);
  assert.equal(brakeDecelerationFor(0), 0);
  assert.equal(brakeDecelerationFor(1), HANDLING.brakeDeceleration);
  assert.equal(brakeDecelerationFor(2), HANDLING.brakeDeceleration);
  assert.ok(brakeDecelerationFor(0.5) < HANDLING.brakeDeceleration * 0.4);
  let previous = 0;
  for (let sample = 1; sample <= 100; sample++) {
    const deceleration = brakeDecelerationFor(sample / 100);
    assert.ok(deceleration > previous && deceleration <= HANDLING.brakeDeceleration);
    previous = deceleration;
  }
  assert.ok(maneuver(30, { brake: 0.25 }, DT).speed < maneuver(30, {}, DT).speed);
});

test("full service brake wins over held throttle and overlap blends progressively", () => {
  assert.deepEqual(
    maneuver(15, { throttle: 1, brake: 1, steer: 0.5 }, 0.5),
    maneuver(15, { brake: 1, steer: 0.5 }, 0.5),
  );
  const light = maneuver(15, { throttle: 1, brake: 0.25 }, 0.5);
  const half = maneuver(15, { throttle: 1, brake: 0.5 }, 0.5);
  const firm = maneuver(15, { throttle: 1, brake: 0.75 }, 0.5);
  assert.ok(light.speed > half.speed && half.speed > firm.speed);
  assert.ok(half.speed > maneuver(15, { brake: 0.5 }, 0.5).speed);
});

test("low-speed steering, reverse and returning to forward remain controllable", () => {
  assert.ok(minimumTurnRadiusAtSpeed(8) > 8 && minimumTurnRadiusAtSpeed(8) < 9);
  const reverse = flatSim();
  try {
    for (let tick = 0; tick < 120; tick++) flatStep(reverse, { brake: 1, steer: 0.5 });
    assert.equal(reverse.state.vehicle.driveDirection, -1);
    assert.ok(reverse.state.vehicle.forwardSpeed < -5);
    assert.ok(angleDelta(reverse.state.vehicle.heading, FLAT_HEADING) > radians(20));
    for (let tick = 0; tick < 120; tick++) flatStep(reverse, { throttle: 1 });
    assert.equal(reverse.state.vehicle.driveDirection, 1);
    assert.ok(reverse.state.vehicle.forwardSpeed > 5);
  } finally { reverse.world.free(); }

  const spin = flatSim(0, 9);
  try {
    flatStep(spin, { brake: 1 });
    assert.equal(spin.state.vehicle.driveDirection, 1, "a sideways spin must not engage reverse");
  } finally { spin.world.free(); }
});

test("axle loading follows braking and releases smoothly on throttle", () => {
  const brake = maneuver(30, { brake: 0.5 }, 0.4);
  const powered = maneuver(30, { throttle: 1 }, 0.4);
  assert.ok(brake.frontLoad > 0.5);
  assert.ok(powered.frontLoad < 0.5);
  assert.ok(brake.headingChange < 1e-6, "weight transfer alone must not steer");
  const sequence = (tick: number) => ({ steer: 0.7, brake: tick < 24 ? 0.5 : 0, throttle: tick >= 24 ? 1 : 0 });
  const result = maneuver(30, sequence);
  assert.ok(result.frontLoad < 0.5);
  assert.ok(result.maxLoadStep <= HANDLING.loadResponse * DT + 1e-6);
  assert.deepEqual(result, maneuver(30, sequence));
});

test("reset clears steering, gear, axle forces and load history", () => {
  const sim = flatSim(30);
  try {
    for (let tick = 0; tick < 20; tick++) flatStep(sim, { brake: 0.5, steer: 0.7 });
    assert.ok(sim.state.vehicle.frontLoadFraction > 0.5);
    resetSim(sim);
    const car = sim.state.vehicle;
    assert.equal(car.frontLoadFraction, 0.5);
    assert.equal(car.yawRate, 0);
    assert.equal(car.steeringAngle, 0);
    assert.equal(car.driveDirection, 1);
    assert.equal(car.frontAxle.lateralForce, 0);
    assert.equal(car.rearAxle.longitudinalForce, 0);
    assert.equal(sim.state.tick, 0);
  } finally { sim.world.free(); }
});
