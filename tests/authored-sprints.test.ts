import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_STREETS, alderGround, createAlderWorld } from "../src/sim/alder.ts";
import { AUTHORED_SPRINT_IDS, authoredSprintFor } from "../src/sim/authored-sprints.ts";
import { recordedEvent } from "../src/sim/recorded-event.ts";
import { rivalRevision } from "../src/sim/rival-revision.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { AUTHORED_RACES } from "../src/ui/race-list.ts";

await RAPIER.init();

// gen-wake-42 changed course when the shoulders changed the world (2026-09-23), the morning's race gone. Shawn raced the
// new one, cut it, and asked for it to be official, with his first cut an official shortcut: it is pinned as data now.
test("an authored sprint is its pinned course, listed with the authored races, through its alley", () => {
  assert.deepEqual(AUTHORED_SPRINT_IDS, ["sprint-jackson-mercer"]);
  const sprint = authoredSprintFor("sprint-jackson-mercer")!, event = recordedEvent("sprint-jackson-mercer")!;
  assert.equal(event.race, sprint.race, "the race is the pinned one, not a draw");
  assert.equal(event.race.checkpoints.length, 4);
  assert.equal(event.race.checkpoints[2]!.name, "Pine East & Olive Way");
  assert.ok(Math.abs(sprint.route.along.at(-1)! - 4307) < 1, `its route is ${sprint.route.along.at(-1)!.toFixed(0)} m`);
  // Every point of Spruce Cut is on its route, in the order it is driven, and the third gate is where it comes out.
  const alley = ALDER_STREETS.find(street => street.name === "Spruce Cut")!;
  const at = alley.points.map(p => sprint.route.points.findIndex(q => q.x === p.x && q.z === p.z));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i === at[k - 1]! + 1)), `Spruce Cut is not on the route in order: ${at.join(", ")}`);
  assert.equal(sprint.route.along[at.at(-1)!], sprint.route.gates[2], "the alley ends at the third gate");
  // Fielded with its line and passing, in Wake's own car and nerve, and named for it.
  assert.ok(event.rival!.line && event.rival!.trafficPassing);
  assert.equal(event.rival!.car, "reign");
  assert.match(rivalRevision(event.rival!), / reign-r\d+ launch-0\.9 shoulder-5\.6 street-line-v\d+\.\w+\.\w+ skill-0\.96 pass-v\d+/);
  assert.equal(event.comparable, true);
  assert.ok(AUTHORED_RACES.some(item => item.race?.raceId === "sprint-jackson-mercer" && item.solo?.solo), "not in the race list with a solo button");
  // A solo race keeps its arrows, which come from the rival's route, and fields nobody.
  const solo = recordedEvent("sprint-jackson-mercer", undefined, { solo: true })!;
  assert.equal(solo.rival, null);
  assert.ok(solo.race.checkpoints.slice(0, -1).every(gate => gate.exit), "solo gates lost their arrows");
});

test("its rival drives it through Spruce Cut to the finish on clear streets, on the road", () => {
  const event = recordedEvent("sprint-jackson-mercer")!;
  const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true, event.start), { race: event.race, rival: event.rival!, traffic: false });
  try {
    let off = 0, inAlley = 0;
    const alley = ALDER_STREETS.find(street => street.name === "Spruce Cut")!, from = alley.points[0]!, to = alley.points.at(-1)!;
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 150 * TICK_HZ) {
      step(sim, { throttle: 0, brake: 1, steer: 0, handbrake: 1 });
      const car = sim.state.rival!.vehicle;
      if (alderGround(car.x, car.z)) off++;
      // Between the alley's two ends, within its own width of the line joining them.
      const ux = to.x - from.x, uz = to.z - from.z, length = Math.hypot(ux, uz), t = ((car.x - from.x) * ux + (car.z - from.z) * uz) / (length * length);
      if (t > 0.1 && t < 0.9 && Math.abs((car.x - from.x) * uz - (car.z - from.z) * ux) / length < 8) inAlley++;
    }
    const rival = sim.state.rival!;
    assert.ok(rival.race.finished, "the rival did not finish");
    assert.equal(rival.driver.resets, 0);
    assert.equal(off, 0, `${off} ticks on bare ground`);
    assert.ok(inAlley > 2 * TICK_HZ, `it spent ${(inAlley / TICK_HZ).toFixed(1)} s in Spruce Cut`);
  } finally { sim.world.free(); }
});
