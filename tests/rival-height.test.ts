import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createRivalDriver, rivalInput, routeHeightAt, type RivalDefinition } from "../src/sim/rival.ts";
import { createSim } from "../src/sim/sim.ts";
import type { CoursePoint } from "../src/sim/track.ts";
await RAPIER.init();

// Traffic is judged by its height above the road, not by raw height (2026-09-16).
// Comparing raw heights hid a car on the same street whenever the road climbed or
// fell 3 m within the rival's look-ahead: on Queen Anne Climb an oncoming sedan was
// invisible until 54 m, and at top speed that is about a third of the city's streets.

const GRADE = .08;
/** A straight street heading -Z that climbs at 8%, like the steep end of Queen Anne. */
const points: CoursePoint[] = [0, 500, 1000, 1500, 2000].map(d => ({ x: 0, z: -d, y: d * GRADE, width: 12, zone: "boulevard" }));
const route: RivalDefinition = { id: "climb", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 500, 1000, 1500, 2000], gates: [2000] };

/** What the rival wants at 50 m/s, 200 m up the climb, given what is ahead of it. */
function wanted(obstacles: { x: number; y: number; z: number; speed: number; heading: number }[]) {
  const template = createSim("fwd");
  const vehicle = { ...template.state.vehicle, x: 0, z: -200, y: 200 * GRADE, heading: 0, speed: 50, forwardSpeed: 50, lateralSpeed: 0 };
  template.world.free();
  const driver = { ...createRivalDriver(), along: 200 };
  const input = rivalInput(route, { vehicle, driver, race: null }, obstacles);
  return { target: driver.targetSpeed, brake: input.brake };
}

test("the route's height is read along it, and a loop wraps", () => {
  assert.equal(routeHeightAt(route, 250), 250 * GRADE);
  assert.equal(routeHeightAt(route, -10), 0, "clamped before the start");
  assert.equal(routeHeightAt(route, 5000), 2000 * GRADE, "clamped past the end");
  const loop: RivalDefinition = { ...route, loop: true };
  assert.ok(Math.abs(routeHeightAt(loop, 2100) - routeHeightAt(loop, 100)) < 1e-9, "past the end of a loop is its start again");
});

test("an oncoming car 70 m up a climb is braked for, though it sits 5.6 m above the rival", () => {
  const clear = wanted([]);
  // 70 m ahead on an 8% grade: 5.6 m higher, which the raw 3 m filter used to throw away.
  // Oncoming in the rival's path, as the sedan on Queen Anne Climb was: a stopped car it
  // would pass instead, so only a car it cannot pass shows whether it was seen at all.
  const up = wanted([{ x: 0, y: 270 * GRADE, z: -270, speed: 15, heading: Math.PI }]);
  assert.ok(270 * GRADE - 200 * GRADE > 3, "the test must put the car past the old filter");
  assert.ok(up.target < clear.target - 5, `a car in the lane up the hill must slow it: ${up.target.toFixed(1)} vs ${clear.target.toFixed(1)} m/s clear`);
});

test("a car on a bridge over the road is still ignored, climbing or not", () => {
  const clear = wanted([]);
  const overhead = wanted([{ x: 0, y: 270 * GRADE + 8, z: -270, speed: 15, heading: Math.PI }]);
  assert.equal(overhead.target, clear.target, "8 m above the road where it is, it is not on this road");
  const under = wanted([{ x: 0, y: 270 * GRADE - 8, z: -270, speed: 15, heading: Math.PI }]);
  assert.equal(under.target, clear.target, "nor 8 m below it");
});
