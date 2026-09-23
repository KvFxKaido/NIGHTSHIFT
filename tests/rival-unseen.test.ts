import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { drawAlderCourse, fieldAlderRival } from "../src/sim/alder-course.ts";
import { carHandling, createSim, step, TICK_HZ, UNSEEN_ROAD } from "../src/sim/sim.ts";

// The road out of sight (Shawn, 2026-09-23, driver-v4). Behind the player and out of their sight, the rival drives the
// road as if it were empty: never faster than its own clear-road self, and never somewhere the player can see it.
await RAPIER.init();
const course = drawAlderCourse("gen-7", null), route = fieldAlderRival(course.rival);
const HOLD = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };

/** The race, the player either parked at the first gate (ahead, out of sight) or on the grid (behind the rival). */
function race(traffic: boolean, player: "gate" | "grid", seconds: number, seed = 271828) {
  const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race: course.race, rival: route, traffic, trafficSeed: seed });
  const gate = course.race.checkpoints[0]!, rows: { pose: string; ghost: boolean; nearest: number }[] = [];
  try {
    for (let tick = 0; tick < seconds * TICK_HZ && !sim.state.rival!.race.finished; tick++) {
      if (player === "gate") {
        sim.body.setTranslation({ x: gate.x, y: sim.body.translation().y, z: gate.z }, true);
        sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      step(sim, HOLD);
      const r = sim.state.rival!.vehicle;
      const nearest = Math.min(Infinity, ...(sim.state.traffic?.vehicles ?? []).map(v => Math.hypot(v.x - r.x, v.z - r.z)));
      rows.push({ pose: `${r.x},${r.z},${r.speed},${r.heading}`, ghost: !!sim.state.rival!.ghost, nearest });
    }
    return rows;
  } finally { sim.world.free(); }
}

test("behind and out of sight, the rival in traffic is its clear-road self to the bit", () => {
  const busy = race(true, "gate", 45), clear = race(false, "gate", 45);
  const ghosted = busy.filter(row => row.ghost).length;
  assert.ok(ghosted > 20 * TICK_HZ, `it was a ghost for only ${ghosted} ticks; the test proves nothing`);
  const until = busy.findIndex((row, i) => i > 0 && busy[i - 1]!.ghost && !row.ghost);
  const end = until < 0 ? busy.length : until;
  for (let tick = 0; tick < end; tick++) assert.equal(busy[tick]!.pose, clear[tick]!.pose, `the rival left its clear-road self at tick ${tick}`);
});

test("ahead of the player the rival is never a ghost", () => {
  const rows = race(true, "grid", 40);
  assert.ok(rows.length > 30 * TICK_HZ, "the race ended early; the test proves nothing");
  assert.equal(rows.filter(row => row.ghost).length, 0, "a rival leading the player drove through traffic");
});

test("a ghost comes back solid only clear of traffic, and never inside a car", () => {
  // Through a whole race with the player at the first gate: every tick it turns solid, and every solid tick after.
  const rows = race(true, "gate", 90, 0);
  const back = rows.findIndex((row, i) => i > 0 && rows[i - 1]!.ghost && !row.ghost);
  assert.ok(back > 0, "it never came back solid; the test proves nothing");
  assert.ok(rows[back]!.nearest >= UNSEEN_ROAD.clear, `it came back solid ${rows[back]!.nearest.toFixed(1)} m from a car`);
});
