import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { HANDLING, createSim, maxCorneringSpeed, step } from "../src/sim/sim.ts";
import { COURSE_POINTS, COURSE_SEGMENTS, cornerRadiusAt } from "../src/sim/track.ts";
import { hasContact } from "./helpers/handling.ts";

await RAPIER.init();

const cumulativeDistance = [0];
for (const segment of COURSE_SEGMENTS) {
  cumulativeDistance.push(cumulativeDistance[cumulativeDistance.length - 1]! + segment.length);
}
const lapLength = cumulativeDistance[cumulativeDistance.length - 1]!;

function nearestTrackPosition(x: number, z: number) {
  let nearest = { distance: Number.POSITIVE_INFINITY, progress: 0, width: 0 };
  for (const segment of COURSE_SEGMENTS) {
    const start = COURSE_POINTS[segment.index]!;
    const dx = segment.ux * segment.length;
    const dz = segment.uz * segment.length;
    const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / (segment.length ** 2)));
    const distance = Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
    if (distance < nearest.distance) {
      nearest = {
        distance,
        progress: cumulativeDistance[segment.index]! + segment.length * t,
        width: segment.width,
      };
    }
  }
  return nearest;
}

function pointAtDistance(distance: number) {
  const wrapped = ((distance % lapLength) + lapLength) % lapLength;
  let segmentIndex = 0;
  while (
    segmentIndex < COURSE_SEGMENTS.length - 1 &&
    cumulativeDistance[segmentIndex + 1]! < wrapped
  ) {
    segmentIndex++;
  }
  const segment = COURSE_SEGMENTS[segmentIndex]!;
  const start = COURSE_POINTS[segmentIndex]!;
  const distanceAlongSegment = wrapped - cumulativeDistance[segmentIndex]!;
  return {
    x: start.x + segment.ux * distanceAlongSegment,
    z: start.z + segment.uz * distanceAlongSegment,
    segmentIndex,
  };
}

function driveLap(paced: boolean) {
  const sim = createSim();
  let previousProgress = 0;
  let completedLaps = 0;
  let lowestElevation = sim.state.vehicle.y;
  let highestElevation = sim.state.vehicle.y;
  let contactTicks = 0;

  try {
    for (let tick = 0; tick < 60 * 100; tick++) {
      lowestElevation = Math.min(lowestElevation, sim.state.vehicle.y);
      highestElevation = Math.max(highestElevation, sim.state.vehicle.y);
      const track = nearestTrackPosition(sim.state.vehicle.x, sim.state.vehicle.z);
      if (track.distance > track.width * 0.5 - 1.1) {
        return {
          completed: false,
          stayedOnRoad: false,
          seconds: tick / 60,
          elevationRange: highestElevation - lowestElevation,
          contactTicks,
        };
      }
      if (track.progress < previousProgress - lapLength * 0.5) completedLaps++;
      previousProgress = track.progress;
      if (completedLaps > 0) {
        return {
          completed: true,
          stayedOnRoad: true,
          seconds: tick / 60,
          elevationRange: highestElevation - lowestElevation,
          contactTicks,
        };
      }

      const lookAhead = 14 + sim.state.vehicle.speed * 0.55;
      const target = pointAtDistance(track.progress + lookAhead);
      const desiredHeading = Math.atan2(
        -(target.x - sim.state.vehicle.x),
        -(target.z - sim.state.vehicle.z),
      );
      const headingError = Math.atan2(
        Math.sin(desiredHeading - sim.state.vehicle.heading),
        Math.cos(desiredHeading - sim.state.vehicle.heading),
      );
      // Wheel angle now drives the tyre model; there is no fixed input notch
      // that commands peak yaw. The same path follower uses the full input range.
      const steer = Math.max(
        -1,
        Math.min(1, -headingError * 3),
      );

      let throttle = 1;
      let brake = 0;
      if (paced) {
        let targetSpeed = HANDLING.topSpeed;
        for (let distance = lookAhead; distance < lookAhead + 105; distance += 10) {
          const sample = pointAtDistance(track.progress + distance);
          targetSpeed = Math.min(
            targetSpeed,
            maxCorneringSpeed(cornerRadiusAt(sample.segmentIndex)) * 0.78,
          );
        }
        if (sim.state.vehicle.speed > targetSpeed + 1) {
          throttle = 0;
          brake = Math.min(1, (sim.state.vehicle.speed - targetSpeed) / 9);
        } else {
          throttle = Math.min(1, (targetSpeed - sim.state.vehicle.speed) / 6 + 0.25);
        }
      }

      step(sim, { throttle, brake, steer, handbrake: 0 });
      if (hasContact(sim)) contactTicks++;
    }
    return {
      completed: false,
      stayedOnRoad: true,
      seconds: 100,
      elevationRange: highestElevation - lowestElevation,
      contactTicks,
    };
  } finally { sim.world.free(); }
}

test("a paced reference driver can complete a clean Blackglass lap", (t) => {
  const result = driveLap(true);
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.completed, true);
  assert.equal(result.stayedOnRoad, true);
  assert.equal(result.contactTicks, 0, "a clean lap must not rely on bouncing off barriers");
  assert.ok(result.seconds < 90);
  assert.ok(result.elevationRange > 23.5);
});

test("a throttle-pinned reference driver cannot complete a clean lap", () => {
  const result = driveLap(false);
  assert.equal(result.completed, false);
  assert.equal(result.stayedOnRoad, false);
});
