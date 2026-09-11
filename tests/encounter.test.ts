import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_ENCOUNTER, ALDER_CRUISE, canChallenge } from "../src/sim/encounter.ts";
import { createSim, resetSim, step, RIVAL_RESET_TICKS } from "../src/sim/sim.ts";
import { sampleRivalPath } from "../src/sim/rival.ts";
import { createAlderWorld, ALDER_RACE } from "../src/sim/alder.ts";
await RAPIER.init();

test("challenge requires a nearby opponent at the same height and a cruising speed", () => {
  const opponent = ALDER_ENCOUNTER;
  const player = { ...opponent, z: opponent.z + 20, speed: 5 };
  assert.equal(canChallenge(player, opponent, false), true);
  assert.equal(canChallenge({ ...player, z: opponent.z + 33 }, opponent, false), false);
  assert.equal(canChallenge({ ...player, y: opponent.y + 4 }, opponent, false), false);
  assert.equal(canChallenge({ ...player, speed: 12 }, opponent, false), false);
  assert.equal(canChallenge(player, null, false), false);
  assert.equal(canChallenge(player, opponent, true), false);
});

test("Port Alder encounter fits on the road, stays parked in traffic, and resets reproducibly", () => {
  const road = createAlderWorld();
  const sim = createSim("fwd", road, { encounter: ALDER_ENCOUNTER });
  try {
    const projection = road.project(ALDER_ENCOUNTER.x, ALDER_ENCOUNTER.z);
    assert.ok(projection.distance + .92 < projection.width / 2);
    let overlaps = 0;
    sim.world.intersectionsWithShape(sim.encounterBody!.translation(), sim.encounterBody!.rotation(),
      new RAPIER.Cuboid(1, .4, 2.2), () => { overlaps++; return true; }, undefined, undefined, undefined, sim.encounterBody!);
    assert.equal(overlaps, 0, "parked car must clear buildings, player and initial traffic");
    const initial = JSON.stringify(sim.state);
    const snapshot = sim.world.takeSnapshot();
    for (let tick = 0; tick < 7200; tick++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    assert.ok(Math.hypot(sim.state.encounter!.x - ALDER_ENCOUNTER.x, sim.state.encounter!.z - ALDER_ENCOUNTER.z) < .1);
    assert.equal(sim.state.race, null);
    assert.equal(sim.state.rival, null);
    resetSim(sim);
    assert.equal(JSON.stringify(sim.state), initial);
    assert.deepEqual(sim.world.takeSnapshot(), snapshot);
  } finally { sim.world.free(); }
});

test("race mode rejects a duplicate waiting opponent", () => {
  assert.throws(() => createSim("fwd", createAlderWorld(true), { race: ALDER_RACE, encounter: ALDER_ENCOUNTER }), /free roam/);
});

test("the local cruise is a closed road route through the garage neighborhood", () => {
  const road = createAlderWorld();
  assert.deepEqual(ALDER_CRUISE.points[0], ALDER_CRUISE.points.at(-1));
  for (let along = 0; along < ALDER_CRUISE.along.at(-1)!; along += 2) {
    const point = sampleRivalPath(ALDER_CRUISE, along);
    const on = road.project(point.x, point.z);
    assert.ok(on.distance + 1 < on.width / 2, `off road at ${along}`);
  }
});

test("cruising rival drives two local laps in traffic and reset restores the driver", () => {
  const sim = createSim("fwd", createAlderWorld(), { encounterRoute: ALDER_CRUISE });
  try {
    const initial = JSON.stringify(sim.state);
    let laps = 0, previous = 0, east = false, south = false, maxSpeed = 0;
    for (let tick = 0; tick < 21000 && laps < 2; tick++) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const car = sim.state.encounter!, along = sim.state.encounterDriver!.along;
      if (previous > ALDER_CRUISE.along.at(-1)! - 15 && along < 15) laps++;
      previous = along;
      east ||= car.x > 200; south ||= car.z > 990;
      maxSpeed = Math.max(maxSpeed, car.speed);
      assert.ok(Number.isFinite(car.x + car.z + car.speed));
    }
    assert.equal(laps, 2, JSON.stringify(sim.state.encounterDriver));
    assert.ok(east && south, "must cruise the block rather than circle near the garage");
    assert.ok(maxSpeed < 12, `must remain catchable at cruising speed: ${maxSpeed}`);
    assert.equal(sim.state.race, null);
    assert.equal(sim.state.rival, null);
    resetSim(sim);
    assert.equal(JSON.stringify(sim.state), initial);
    assert.equal(sim.encounterRoute, ALDER_CRUISE);
  } finally { sim.world.free(); }
});

test("a stuck cruising rival rejoins locally without overlapping another car", () => {
  const sim = createSim("fwd", createAlderWorld(), { encounterRoute: ALDER_CRUISE, traffic: false });
  try {
    // Force the recovery deadline at the initial route position.
    sim.state.encounterDriver!.noProgressTicks = RIVAL_RESET_TICKS;
    step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    assert.equal(sim.state.encounterDriver!.resets, 1);
    const car = sim.state.encounter!;
    assert.ok(Math.hypot(car.x - ALDER_ENCOUNTER.x, car.z - ALDER_ENCOUNTER.z) < 30);
    let overlaps = 0;
    sim.world.intersectionsWithShape(sim.encounterBody!.translation(), sim.encounterBody!.rotation(),
      new RAPIER.Cuboid(1, .4, 2.2), () => { overlaps++; return true; }, undefined, undefined, undefined, sim.encounterBody!);
    assert.equal(overlaps, 0);
  } finally { sim.world.free(); }
});
