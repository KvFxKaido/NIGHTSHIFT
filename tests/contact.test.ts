import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { COURSE_WALLS } from "../src/sim/track.ts";

await RAPIER.init();

/* Recovering from a barrier is what drove the four-wheel rewrite. The old model
   assigned body velocity every tick, so Rapier's contact response was erased
   within ~200 ms and steering away started a slide instead of pushing off the
   wall. These gates hold the behaviour that replaced it. */

const BARRIERS = COURSE_WALLS.map((wall) => ({
  x: wall.x,
  z: wall.z,
  halfLength: wall.width / 2,
  axis: { x: Math.cos(wall.rotation), z: -Math.sin(wall.rotation) },
}));

/** Perpendicular distance to the closest barrier centreline. */
function nearestBarrierGap(x: number, z: number): number {
  let closest = Infinity;
  for (const barrier of BARRIERS) {
    const dx = x - barrier.x;
    const dz = z - barrier.z;
    const along = Math.max(
      -barrier.halfLength,
      Math.min(barrier.halfLength, dx * barrier.axis.x + dz * barrier.axis.z),
    );
    closest = Math.min(
      closest,
      Math.hypot(x - (barrier.x + barrier.axis.x * along), z - (barrier.z + barrier.axis.z * along)),
    );
  }
  return closest;
}

// The body touches while its centre is still ~1.5 m out, so a threshold below
// that can never fire no matter how hard the car is driven into the wall.
const CONTACT_GAP = 1.75;
const RECOVERY_SECONDS = 1.6;

/** Drive out to a barrier, then hold throttle and steer by `recoverSteer`. */
function barrierRecovery(recoverSteer: number) {
  // Fixed-input approach authored for AWD: FWD takes a different path and
  // never reaches this wall. Keep this historical contact fixture explicit.
  const sim = createSim("awd");
  let contactTick = -1;
  let contactSpeed = 0;
  let peakGap = 0;
  let speedAtEnd = 0;
  const trace: number[] = [];

  for (let tick = 0; tick < TICK_HZ * 8; tick++) {
    const car = sim.state.vehicle;
    const gap = nearestBarrierGap(car.x, car.z);
    if (contactTick < 0 && gap < CONTACT_GAP) {
      contactTick = tick;
      contactSpeed = car.speed;
    }
    if (contactTick >= 0) {
      const elapsed = tick - contactTick;
      if (elapsed <= RECOVERY_SECONDS * TICK_HZ) {
        peakGap = Math.max(peakGap, gap);
        speedAtEnd = car.speed;
        trace.push(Number(gap.toFixed(3)));
      }
    }
    step(sim, contactTick < 0
      // Accelerate, then run out to the barrier.
      ? { throttle: 1, brake: 0, steer: tick > 100 ? -1 : 0, handbrake: 0 }
      : { throttle: 1, brake: 0, steer: recoverSteer, handbrake: 0 });
  }
  return { contacted: contactTick >= 0, contactSpeed, peakGap, speedAtEnd, trace };
}

test("the car can drive itself off a barrier it is leaning on", () => {
  const away = barrierRecovery(1);
  assert.ok(away.contacted, "the setup must actually reach a barrier");
  // Under the old model the contact response was gone in ~200 ms and steering
  // away produced a slide, so the car never gained road. Four metres is well
  // clear of the ~1.4 m scrape distance and well under the road half-width.
  assert.ok(
    away.peakGap > 4,
    `steering away only reached ${away.peakGap.toFixed(2)} m from the barrier`,
  );
  // Pushing off must not cost all the momentum; the tyres are driving, not the
  // wall bouncing the car away.
  assert.ok(
    away.speedAtEnd > away.contactSpeed * 0.8,
    `recovery bled speed from ${away.contactSpeed.toFixed(1)} to ${away.speedAtEnd.toFixed(1)} m/s`,
  );
});

test("steering into the barrier keeps the car pinned against it", () => {
  const into = barrierRecovery(-1);
  assert.ok(into.contacted);
  // The control: same contact, opposite input. If this also escaped, the test
  // above would be measuring the wall bouncing the car rather than the tyres
  // pulling it off.
  assert.ok(
    into.peakGap < 2.5,
    `steering into the barrier still reached ${into.peakGap.toFixed(2)} m`,
  );
});

test("barrier contact and recovery replay identically", () => {
  // Rapier now integrates the car's motion, not just its collisions, so contact
  // is on the critical path for law 2 rather than beside it.
  assert.deepEqual(barrierRecovery(1).trace, barrierRecovery(1).trace);
});
