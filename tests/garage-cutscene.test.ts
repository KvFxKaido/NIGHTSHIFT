import assert from "node:assert/strict";
import test from "node:test";
import { createGarageCutscene, advanceGarageCutscene, shotProgress, easeShot } from "../src/render/garage-cutscene.ts";
import { ALDER_GARAGE, ALDER_GARAGE_EXIT, createAlderWorld } from "../src/sim/alder.ts";
import { CHASE_CAMERAS } from "../src/render/camera.ts";

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
