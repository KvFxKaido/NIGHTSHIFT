import assert from "node:assert/strict";
import test from "node:test";
import { createGarageCutscene, advanceGarageCutscene, shotProgress, easeShot } from "../src/render/garage-cutscene.ts";
import { ALDER_GARAGE, ALDER_GARAGE_EXIT, createAlderWorld } from "../src/sim/alder.ts";
import { CHASE_CAMERAS } from "../src/render/camera.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, leaveGarage, step } from "../src/sim/sim.ts";

await RAPIER.init();

test("garage departure resets the player pose and momentum without restarting the world", () => {
  const sim = createSim("rwd", createAlderWorld());
  try {
    sim.state.tick = 120;
    const traffic = sim.state.traffic;
    sim.body.setTranslation({ x: 17, y: 2.5, z: 911 }, true);
    sim.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    sim.body.setLinvel({ x: 2, y: 0, z: 3 }, true);
    sim.body.setAngvel({ x: 0, y: 1, z: 0 }, true);
    leaveGarage(sim, ALDER_GARAGE_EXIT);
    assert.equal(sim.state.tick, 120);
    assert.equal(sim.state.traffic, traffic);
    assert.equal(sim.state.vehicle.heading, ALDER_GARAGE_EXIT.heading);
    assert.equal(sim.state.vehicle.x, ALDER_GARAGE_EXIT.x);
    assert.equal(sim.state.vehicle.z, ALDER_GARAGE_EXIT.z);
    assert.equal(sim.body.linvel().x, 0);
    assert.equal(sim.body.linvel().z, 0);
    assert.equal(sim.body.angvel().y, 0);
    step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    assert.ok(Math.abs(sim.state.vehicle.heading - ALDER_GARAGE_EXIT.heading) < 1e-6);
    assert.ok(Math.abs(sim.state.vehicle.x - ALDER_GARAGE_EXIT.x) < .01);
    assert.ok(Math.abs(sim.state.vehicle.z - ALDER_GARAGE_EXIT.z) < .01);
  } finally { sim.world.free(); }
});

test("shots finish on the same endpoint with uneven frame times", () => {
  for (const kind of ["enter", "exit"] as const) {
    const shot = createGarageCutscene(kind, true);
    assert.equal(advanceGarageCutscene(shot, -.1), false);
    assert.equal(shot.elapsed, 0);
    for (const dt of [.1, .2, .01, .9, 2]) advanceGarageCutscene(shot, dt);
    assert.equal(shotProgress(shot), 1);
    assert.equal(shot.elapsed, shot.duration);
    assert.equal(easeShot(shotProgress(shot)), 1);
  }
});

test("free-roam spawn faces out from the garage and leaves room for every chase camera", () => {
  assert.deepEqual(createAlderWorld().start, ALDER_GARAGE_EXIT);
  assert.equal(ALDER_GARAGE_EXIT.heading, Math.PI / 2);
  const face = ALDER_GARAGE.building.x - ALDER_GARAGE.building.depth / 2;
  for (const camera of Object.values(CHASE_CAMERAS)) {
    assert.ok(ALDER_GARAGE_EXIT.x + camera.distance < face - .5);
  }
  const raceStart = { x: 200, y: 4, z: 300, heading: .2, pitch: 0 };
  assert.deepEqual(createAlderWorld(true, raceStart).start, raceStart);
});
