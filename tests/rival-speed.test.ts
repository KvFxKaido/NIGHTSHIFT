import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, HANDLING } from "../src/sim/sim.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import type { CoursePoint } from "../src/sim/track.ts";
import type { RivalDefinition } from "../src/sim/rival.ts";
await RAPIER.init();

function speedCourse(coordinates: [number, number][], speedLimit?: number) {
  const points: CoursePoint[] = coordinates.map(([x, z]) => ({ x, z, y: 0, width: 24, zone: "boulevard" }));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along.at(-1)! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const start = { x: 0, y: 0, z: 0, heading: 0, pitch: 0 };
  const route: RivalDefinition = { id: "speed-check", start, points, along, gates: [along.at(-1)!], speedLimit };
  const end = points.at(-1)!;
  return createSim("fwd", { id: "speed-check", start: { ...start, x: 8 }, walls: [], project: (x, z) => projectOntoPath(points, x, z) }, {
    traffic: false, rival: route,
    race: { id: "speed-check", name: "Speed check", countdownTicks: 0, checkpoints: [{ id: "finish", name: "Finish", ...end, radius: 10 }] },
  });
}

test("racing rival can match the player's top speed on an unobstructed straight", () => {
  const sim = speedCourse([[0, 0], [0, -8000]]);
  try {
    for (let tick = 0; tick < 3000; tick++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    const player = sim.state.vehicle.speed, rival = sim.state.rival!.vehicle.speed;
    assert.ok(rival > HANDLING.topSpeed - 1, `rival only reached ${rival} m/s`);
    assert.ok(Math.abs(player - rival) < .5, `player ${player}, rival ${rival}`);
    assert.equal(sim.state.rival!.driver.resets, 0);
  } finally { sim.world.free(); }
});

test("high-speed rival brakes for a sharp corner beyond the old 100 m preview", () => {
  const sim = speedCourse([[0, 0], [0, -500], [500, -500]]);
  try {
    const rival = sim.state.rival!;
    sim.rivalBody!.setLinvel({ x: 0, y: 0, z: -HANDLING.topSpeed }, true);
    rival.vehicle.speed = rival.vehicle.forwardSpeed = HANDLING.topSpeed;
    let furthest = 0, cornerSpeed = 0, reachedExit = false, brakingFrom = 0;
    for (let tick = 0; tick < 2400 && !rival.race.finished; tick++) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const car = rival.vehicle;
      furthest = Math.max(furthest, sim.roadWorld.project(car.x, car.z).distance);
      if (Math.hypot(car.x, car.z + 500) < 20) cornerSpeed = Math.max(cornerSpeed, car.speed);
      if (!brakingFrom && rival.input.brake > 0) brakingFrom = 500 + car.z;
      reachedExit ||= car.x > 80;
    }
    assert.ok(reachedExit, "rival never drove through the corner");
    // It must start braking beyond what a 100 m preview could see.
    assert.ok(brakingFrom > 100, `braking began ${brakingFrom.toFixed(0)} m before the corner`);
    // 15.7 m/s at the 2026-09-12 cornering; 20.4 m/s since it was tuned to recorded
    // laps (RIVAL_CORNERING, 2026-09-13), still 2.9 m from the centreline at most.
    assert.ok(cornerSpeed > 0 && cornerSpeed < 23, `corner entry ${cornerSpeed} m/s`);
    assert.ok(furthest < 12, `left the carriageway by ${furthest} m`);
    assert.equal(rival.driver.resets, 0);
  } finally { sim.world.free(); }
});

test("explicit cruising speed limits still use gentle speed control", () => {
  const sim = speedCourse([[0, 0], [0, -8000]], 10);
  try {
    for (let tick = 0; tick < 600; tick++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    assert.ok(sim.state.rival!.vehicle.speed > 8 && sim.state.rival!.vehicle.speed < 12);
    assert.equal(sim.state.rival!.driver.targetSpeed, 10);
  } finally { sim.world.free(); }
});
