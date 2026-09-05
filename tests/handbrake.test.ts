import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { DT, HANDLING, steeringAngleFor, type Drivetrain, type Input } from "../src/sim/sim.ts";
import { FLAT_START, flatSim, flatStep } from "./helpers/handling.ts";

await RAPIER.init();
const degrees = (radians: number) => radians * 180 / Math.PI;
const layouts: Drivetrain[] = ["awd", "fwd", "rwd"];

// Long-hold tests used to require automatic recovery even with neutral input.
// That is deliberately no longer the contract: the driver owns countersteering.
// Keep force/finite-state checks, short-pull recovery and explicit input ownership.
test("handbrake slides never replace the driver's requested steering", () => {
  for (const layout of layouts) for (const speed of [15, 30, 45, 60]) {
    for (const side of [-1, 1]) for (const holdTicks of [15, 30, 60, 90]) {
      const sim = flatSim(speed, 0, layout);
      try {
        for (let tick = 0; tick < holdTicks + 120; tick++) {
          sim.body.setTranslation(FLAT_START, true);
          const input: Partial<Input> = tick < holdTicks
            ? { steer: side, handbrake: 1 }
            : { steer: tick < holdTicks + 30 ? -side * 0.5 : 0, throttle: 0.5 };
          const previousSteering = sim.state.vehicle.steering;
          const target = input.steer!;
          const delta = target - previousSteering;
          const rotation = sim.body.rotation();
          const heading = Math.atan2(2 * rotation.w * rotation.y, 1 - 2 * rotation.y ** 2);
          const velocity = sim.body.linvel();
          const forward = -velocity.x * Math.sin(heading) - velocity.z * Math.cos(heading);
          const lateral = velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading);
          const frontLateral = lateral - sim.body.angvel().y * HANDLING.frontAxleDistance;
          flatStep(sim, input);
          const car = sim.state.vehicle;
          assert.ok(car.steering >= Math.min(previousSteering, target) - 1e-12 &&
            car.steering <= Math.max(previousSteering, target) + 1e-12, "move toward the input, never past it");
          const moved = Math.abs(car.steering - previousSteering);
          assert.ok(moved >= Math.min(Math.abs(delta), HANDLING.steeringResponse * DT) - 1e-12);
          assert.ok(moved <= Math.min(Math.abs(delta), HANDLING.countersteerResponse * DT) + 1e-12);
          assert.equal(Math.sign(car.steeringAngle), Math.sign(car.steering),
            `${layout}: automatic opposite steering at tick ${tick}`);
          const normalAngle = steeringAngleFor(forward, car.steering);
          assert.ok(Math.abs(car.steeringAngle) >= Math.abs(normalAngle) - 1e-12,
            "never suppress the driver's ordinary steering");
          assert.ok(Math.abs(car.steeringAngle) <= Math.abs(car.steering) * HANDLING.maxSteeringAngle + 1e-12);
          if (target * lateral <= 0 || target * frontLateral <= 0 || forward <= HANDLING.countersteerMinSpeed) {
            assert.ok(Math.abs(car.steeringAngle - normalAngle) < 1e-12, "extra range needs an explicit countersteer request");
          }
          for (const tyre of Object.values(car.wheels)) {
            assert.ok(Math.hypot(tyre.lateralForce, tyre.longitudinalForce) <= tyre.gripLimit + 1e-6);
          }
          assert.ok([car.speed, car.slipAngle, car.yawRate].every(Number.isFinite));
        }
      } finally { sim.world.free(); }
    }
  }
});

test("releasing the stick centres the wheels even while the car is still sliding", () => {
  const sim = flatSim(30);
  try {
    for (let tick = 0; tick < 60; tick++) {
      sim.body.setTranslation(FLAT_START, true);
      flatStep(sim, { steer: 1, handbrake: 1 });
      assert.ok(sim.state.vehicle.steeringAngle > 0, "full right must never become automatic left");
    }
    for (let tick = 0; tick < Math.ceil(1 / (HANDLING.steeringReturnResponse * DT)); tick++) {
      sim.body.setTranslation(FLAT_START, true);
      flatStep(sim);
    }
    assert.ok(Math.abs(degrees(sim.state.vehicle.slipAngle)) > 10, "fixture must still be sliding");
    assert.equal(sim.state.vehicle.steering, 0);
    assert.equal(sim.state.vehicle.steeringAngle, 0);
    assert.equal(sim.state.vehicle.wheels["front-left"].steeringAngle, 0);
    assert.equal(sim.state.vehicle.wheels["front-right"].steeringAngle, 0);
  } finally { sim.world.free(); }
});

test("a short handbrake pull can still be caught with deliberate countersteer", (t) => {
  for (const layout of layouts) for (const side of [-1, 1]) {
    const sim = flatSim(30, 0, layout);
    let peakSlip = 0;
    try {
      for (let tick = 0; tick < 150; tick++) {
        sim.body.setTranslation(FLAT_START, true);
        flatStep(sim, tick < 30 ? { steer: side * 0.7, handbrake: 1 }
          : tick < 60 ? { steer: -side * 0.5 } : {});
        peakSlip = Math.max(peakSlip, Math.abs(degrees(sim.state.vehicle.slipAngle)));
      }
      const car = sim.state.vehicle;
      assert.ok(peakSlip > 5 && peakSlip < 15, "retain useful rear rotation");
      assert.ok(Math.abs(degrees(car.slipAngle)) < 3 && Math.abs(car.yawRate) < 0.1);
      assert.ok(car.speed > 15, "catch the slide while moving, not by stopping");
      if (layout === "awd" && side === 1) t.diagnostic(`Short pull: peak slip ${peakSlip.toFixed(2)} degrees, recovered at ${car.speed.toFixed(2)} m/s`);
    } finally { sim.world.free(); }
  }
});

test("full manual countersteer catches longer city-speed slides without automatic steering", (t) => {
  for (const layout of layouts) for (const side of [-1, 1]) for (const hold of [45, 60]) {
    const sim = flatSim(30, 0, layout);
    let peakSlip = 0;
    let firstCounterTick = 0;
    let oneSecondSlip = 0;
    try {
      for (let tick = 0; tick < hold + 120; tick++) {
        sim.body.setTranslation(FLAT_START, true);
        flatStep(sim, tick < hold ? { steer: side, handbrake: 1 }
          : tick < hold + 30 ? { steer: -side } : {});
        const car = sim.state.vehicle;
        peakSlip = Math.max(peakSlip, Math.abs(degrees(car.slipAngle)));
        if (tick >= hold && !firstCounterTick && car.steeringAngle * side < 0) firstCounterTick = tick - hold + 1;
        if (tick === hold + 59) oneSecondSlip = Math.abs(degrees(car.slipAngle));
        if (tick >= hold + 35) assert.equal(car.steeringAngle, 0, "no automatic catch after the driver releases");
        for (const tyre of Object.values(car.wheels)) {
          assert.ok(Math.hypot(tyre.lateralForce, tyre.longitudinalForce) <= tyre.gripLimit + 1e-6);
        }
      }
      assert.ok(firstCounterTick > 0 && firstCounterTick <= 3);
      assert.ok(peakSlip > 10 && peakSlip < (hold === 45 ? 22 : 32));
      assert.ok(Math.abs(degrees(sim.state.vehicle.slipAngle)) < 3);
      assert.ok(Math.abs(sim.state.vehicle.yawRate) < 0.1);
      assert.ok(sim.state.vehicle.speed > (hold === 45 ? 16 : 10), "recover without coming to a stop");
      if (layout === "awd" && side === 1) t.diagnostic(`${hold / 60} s pull + full countersteer: peak ${peakSlip.toFixed(2)} degrees; ${oneSecondSlip.toFixed(2)} degrees at 1 s; ${sim.state.vehicle.speed.toFixed(2)} m/s at 2 s`);
    } finally { sim.world.free(); }
  }
});

test("brief highway-speed handbraking can be caught without a large opposite overshoot", () => {
  for (const layout of layouts) for (const side of [-1, 1]) {
    const sim = flatSim(45, 0, layout);
    let peakSlip = 0;
    try {
      for (let tick = 0; tick < 150; tick++) {
        sim.body.setTranslation(FLAT_START, true);
        flatStep(sim, tick < 30 ? { steer: side * 0.7, handbrake: 1 }
          : tick < 60 ? { steer: -side } : {});
        peakSlip = Math.max(peakSlip, Math.abs(degrees(sim.state.vehicle.slipAngle)));
      }
      assert.ok(peakSlip < 12);
      assert.ok(Math.abs(degrees(sim.state.vehicle.slipAngle)) < 3);
      assert.ok(Math.abs(sim.state.vehicle.yawRate) < 0.1);
      assert.ok(sim.state.vehicle.speed > 25);
    } finally { sim.world.free(); }
  }
});

test("long handbrake pulls dissipate energy within the tyre force budget", (t) => {
  const sim = flatSim(30);
  let peakSlip = 0;
  const energy = () => {
    const velocity = sim.body.linvel();
    return 0.5 * sim.body.mass() * (velocity.x ** 2 + velocity.z ** 2)
      + 0.5 * sim.body.principalInertia().y * sim.body.angvel().y ** 2;
  };
  let previousEnergy = energy();
  try {
    for (let tick = 0; tick < 180; tick++) {
      sim.body.setTranslation(FLAT_START, true);
      flatStep(sim, tick < 60 ? { steer: 1, handbrake: 1 } : tick < 90 ? { steer: -0.5 } : {});
      peakSlip = Math.max(peakSlip, Math.abs(degrees(sim.state.vehicle.slipAngle)));
      const currentEnergy = energy();
      assert.ok(Number.isFinite(currentEnergy) && currentEnergy <= previousEnergy + 0.01);
      previousEnergy = currentEnergy;
      for (const tyre of Object.values(sim.state.vehicle.wheels)) {
        assert.ok(Math.hypot(tyre.lateralForce, tyre.longitudinalForce) <= tyre.gripLimit + 1e-6);
      }
    }
    // No assertion requiring a spin, or pretending this is a good recovery.
    // The old <25-degree / >12 m/s automatic-catch gate is explicitly retired.
    t.diagnostic(`KNOWN LIMITATION: one-second full-lock pull with only half countersteer, peak slip ${peakSlip.toFixed(2)} degrees, speed ${sim.state.vehicle.speed.toFixed(2)} m/s after two seconds of recovery`);
  } finally { sim.world.free(); }
});
