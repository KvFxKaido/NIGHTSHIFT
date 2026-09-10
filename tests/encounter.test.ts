import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { SEATTLE_ENCOUNTER, canChallenge } from "../src/sim/encounter.ts";
import { createSim, resetSim, step } from "../src/sim/sim.ts";
import { createSeattleWorld, SEATTLE_RACE } from "../src/sim/seattle.ts";
await RAPIER.init();

test("challenge requires a nearby opponent at the same height and a cruising speed", () => {
  const opponent = SEATTLE_ENCOUNTER;
  const player = { ...opponent, z: opponent.z + 20, speed: 5 };
  assert.equal(canChallenge(player, opponent, false), true);
  assert.equal(canChallenge({ ...player, z: opponent.z + 33 }, opponent, false), false);
  assert.equal(canChallenge({ ...player, y: opponent.y + 4 }, opponent, false), false);
  assert.equal(canChallenge({ ...player, speed: 12 }, opponent, false), false);
  assert.equal(canChallenge(player, null, false), false);
  assert.equal(canChallenge(player, opponent, true), false);
});

test("Seattle encounter fits on the road, stays parked in traffic, and resets reproducibly", () => {
  const road = createSeattleWorld();
  const sim = createSim("fwd", road, { encounter: SEATTLE_ENCOUNTER });
  try {
    const projection = road.project(SEATTLE_ENCOUNTER.x, SEATTLE_ENCOUNTER.z);
    assert.ok(projection.distance + .92 < projection.width / 2);
    let overlaps = 0;
    sim.world.intersectionsWithShape(sim.encounterBody!.translation(), sim.encounterBody!.rotation(),
      new RAPIER.Cuboid(1, .4, 2.2), () => { overlaps++; return true; }, undefined, undefined, undefined, sim.encounterBody!);
    assert.equal(overlaps, 0, "parked car must clear buildings, player and initial traffic");
    const initial = JSON.stringify(sim.state);
    const snapshot = sim.world.takeSnapshot();
    for (let tick = 0; tick < 7200; tick++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    assert.ok(Math.hypot(sim.state.encounter!.x - SEATTLE_ENCOUNTER.x, sim.state.encounter!.z - SEATTLE_ENCOUNTER.z) < .1);
    assert.equal(sim.state.race, null);
    assert.equal(sim.state.rival, null);
    resetSim(sim);
    assert.equal(JSON.stringify(sim.state), initial);
    assert.deepEqual(sim.world.takeSnapshot(), snapshot);
  } finally { sim.world.free(); }
});

test("race mode rejects a duplicate waiting opponent", () => {
  assert.throws(() => createSim("fwd", createSeattleWorld(true), { race: SEATTLE_RACE, encounter: SEATTLE_ENCOUNTER }), /free roam/);
});
