import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, HANDLING, type Drivetrain } from "../src/sim/sim.ts";
import type { RoadWorld } from "../src/sim/road-world.ts";

await RAPIER.init();

// An unlimited flat road isolates tyre response from kerbs, traffic and grades.
const road: RoadWorld = {
  id: "drivetrain-stability",
  start: { x: 0, y: 0.5, z: 0, heading: 0, pitch: 0 }, walls: [],
  project: () => ({ along: 0, segmentIndex: 0, distance: 0, height: 0,
    pitch: 0, ux: 0, uz: -1, width: 10000 }),
};

test("RWD can catch established slides after lifting without a second slide in the opposite direction", () => {
  for (const [speed, angle, yaw] of [[20, 22, 1.3], [30, 15, 0.9]] as const) for (const direction of [-1, 1]) {
    const sim = createSim("rwd", road, { traffic: false });
    // Seed an established slide independently of the power-on grip tune, so
    // preventing slide entry cannot accidentally make this recovery test pass.
    const radians = angle * Math.PI / 180;
    sim.body.setLinvel({ x: -direction * speed * Math.sin(radians), y: 0, z: -speed * Math.cos(radians) }, true);
    sim.body.setAngvel({ x: 0, y: -direction * yaw, z: 0 }, true);
    sim.state.vehicle.steering = direction;
    let oppositeSlip = 0;
    try {
      for (let tick = 0; tick < 120; tick++) {
        const steer = tick < 30 ? -direction : 0;
        step(sim, { throttle: 0, brake: 0, handbrake: 0, steer });
        const car = sim.state.vehicle;
        oppositeSlip = Math.max(oppositeSlip, car.slipAngle * direction);
        assert.ok(car.steeringAngle * car.steering >= 0, "driver still owns steering direction");
        assert.ok(Math.abs(car.steeringAngle) <= Math.abs(car.steering) * HANDLING.maxSteeringAngle + 1e-9);
        if (tick > 35) assert.equal(car.steeringAngle, 0, "no automatic steering after release");
      }
      assert.ok(oppositeSlip < 5 * Math.PI / 180, "countersteer must not trigger a large opposite slide");
      assert.ok(Math.abs(sim.state.vehicle.slipAngle) < 3 * Math.PI / 180);
      assert.ok(Math.abs(sim.state.vehicle.yawRate) < 0.1);
      assert.ok(sim.state.vehicle.speed > speed * 0.7, "recover while still moving");
    } finally { sim.world.free(); }
  }
});

test("RWD can add throttle while catching a slide and accelerate out without another spin", () => {
  for (const speed of [20, 30]) for (const heldTicks of [30, 45, 60]) {
    for (const direction of [-1, 1]) for (const gradual of [false, true]) {
      const sim = createSim("rwd", road, { traffic: false });
      sim.body.setLinvel({ x: 0, y: 0, z: -speed }, true);
      try {
        for (let tick = 0; tick < heldTicks; tick++) {
          step(sim, { throttle: 0, brake: 0, handbrake: 1, steer: direction });
        }
        const entrySpeed = sim.state.vehicle.speed;
        assert.ok(Math.abs(sim.state.vehicle.slipAngle) > 5 * Math.PI / 180);
        let oppositeSlip = 0;
        for (let tick = 0; tick < 120; tick++) {
          step(sim, { throttle: gradual ? Math.min(1, tick / 30) : 1, brake: 0,
            handbrake: 0, steer: tick < 30 ? -direction : 0 });
          const car = sim.state.vehicle;
          oppositeSlip = Math.max(oppositeSlip, car.slipAngle * direction);
          assert.ok(car.forwardSpeed > 0, "throttle must not turn recovery into a spin");
          for (const tyre of Object.values(car.wheels)) {
            assert.ok(Math.hypot(tyre.lateralForce / tyre.gripLimit,
              tyre.longitudinalForce / tyre.longitudinalGripLimit) <= 1 + 1e-6);
          }
        }
        assert.ok(oppositeSlip < 10 * Math.PI / 180);
        assert.ok(Math.abs(sim.state.vehicle.slipAngle) < 3 * Math.PI / 180);
        assert.ok(Math.abs(sim.state.vehicle.yawRate) < 0.1);
        assert.ok(sim.state.vehicle.speed > entrySpeed + 3, "throttle should regain speed during the exit");
      } finally { sim.world.free(); }
    }
  }
});

test("RWD settles after small highway steering inputs while the throttle stays down", () => {
  for (const mph of [85, 95, 110, 135]) for (const direction of [-1, 1]) {
    for (const heldTicks of [30, 180]) {
      const sim = createSim("rwd", road, { traffic: false });
      sim.body.setLinvel({ x: 0, y: 0, z: -mph / 2.23694 }, true);
      let peakSlip = 0;
      try {
        for (let tick = 0; tick < heldTicks + 180; tick++) {
          step(sim, { throttle: 1, brake: 0, handbrake: 0,
            steer: tick < heldTicks ? direction * 0.3 : 0 });
          const car = sim.state.vehicle, velocity = sim.body.linvel();
          const lateral = velocity.x * Math.cos(car.heading) - velocity.z * Math.sin(car.heading);
          peakSlip = Math.max(peakSlip, Math.abs(Math.atan2(lateral, car.forwardSpeed)));
          for (const tyre of Object.values(car.wheels)) {
            assert.ok(Math.hypot(tyre.lateralForce / tyre.gripLimit,
              tyre.longitudinalForce / tyre.longitudinalGripLimit) <= 1 + 1e-6);
          }
        }
        const label = `${mph} mph, ${direction}, ${heldTicks} ticks`;
        assert.ok(peakSlip < 5 * Math.PI / 180, `${label}: slip reached ${peakSlip * 180 / Math.PI} degrees`);
        assert.ok(Math.abs(sim.state.vehicle.yawRate) < 0.02, `${label}: yaw did not settle`);
        assert.ok(sim.state.vehicle.forwardSpeed > mph / 2.23694 * 0.9, `${label}: lost highway speed`);
      } finally { sim.world.free(); }
    }
  }
});

test("all drivetrains approach the shared governor while AWD retains its launch advantage", () => {
  const launchSpeeds: number[] = [];
  for (const drivetrain of ["fwd", "rwd", "awd"] as Drivetrain[]) {
    const sim = createSim(drivetrain, road, { traffic: false });
    try {
      for (let tick = 0; tick < 3600; tick++) {
        step(sim, { throttle: 1, brake: 0, handbrake: 0, steer: 0 });
        if (tick === 119) launchSpeeds.push(sim.state.vehicle.speed);
      }
      const mph = sim.state.vehicle.forwardSpeed * 2.23694;
      assert.ok(mph > 139 && mph < 141, `${drivetrain}: ${mph} mph on a long flat straight`);
    } finally { sim.world.free(); }
  }
  assert.ok(launchSpeeds[2]! > launchSpeeds[0]! * 1.5);
  assert.ok(launchSpeeds[2]! > launchSpeeds[1]! * 1.5);
});
