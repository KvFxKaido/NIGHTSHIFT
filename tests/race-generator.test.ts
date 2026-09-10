import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step } from "../src/sim/sim.ts";
import { createSeattleWorld, seattleGeneratedRace, seattleRouting, projectOntoSeattle, SEATTLE_STREETS,
  SEATTLE_RACE } from "../src/sim/seattle.ts";
import { GENERATOR, generateRace, startApproach, shortStreetName } from "../src/sim/race-generator.ts";
import { legTable, routeLength } from "../src/sim/route-choice.ts";
import { sampleRivalPath } from "../src/sim/rival.ts";
await RAPIER.init();

// Generated races: flash a rival and the race is drawn from the city. The seed
// is the race's identity; the legs are chosen for the choice they offer; the
// rival's line is routed through the gates on the same graph.

const graph = seattleRouting();
const world = createSeattleWorld(true);
const approach = startApproach(SEATTLE_STREETS, world.start);
const draw = (seed: number) => generateRace(graph, seed, approach.node, [approach.street.id]);

test("a seed draws the same race every time, and different seeds draw different races", () => {
  assert.deepEqual(draw(42), draw(42));
  assert.deepEqual(seattleGeneratedRace(42).rival, seattleGeneratedRace(42).rival);
  const ids = new Set(Array.from({ length: 30 }, (_, i) => draw(i + 1).definition.checkpoints.map(c => c.id).join(">")));
  assert.ok(ids.size >= 24, `only ${ids.size} distinct races in 30 seeds`);
  assert.notEqual(draw(7).definition.id, SEATTLE_RACE.id);
});

test("every drawn race is a legal race: gates at junctions, legs in range, no street twice, a line that fits", () => {
  const legs = legTable(graph);
  for (let seed = 1; seed <= 60; seed++) {
    const { race, rival, generated } = seattleGeneratedRace(seed);
    const label = `seed ${seed} (${race.name})`;
    assert.ok(race.checkpoints.length >= GENERATOR.gates.min && race.checkpoints.length <= GENERATOR.gates.max, label);
    assert.equal(race.id, `gen-${seed}`);
    assert.match(race.name, /^\S.* to \S.*$/, label);
    let total = 0, at = approach.node;
    const used = new Set<string>([approach.street.id]);
    for (const [i, leg] of generated.legs.entries()) {
      assert.equal(leg.from, at, `${label}: leg ${i} does not start where the last ended`);
      assert.ok(graph.choicePoints.includes(leg.to), `${label}: gate ${i} is not a choice point`);
      assert.ok(leg.time >= GENERATOR.leg.min && leg.time <= GENERATOR.leg.max, `${label}: leg ${i} takes ${leg.time.toFixed(0)} s`);
      assert.deepEqual(leg, legs.get(`${leg.from}|${leg.to}`), `${label}: leg ${i} is not the measured leg`);
      for (const d of leg.via) { assert.ok(!used.has(d.id), `${label}: ${d.id} driven twice`); used.add(d.id); }
      const gate = race.checkpoints[i]!;
      assert.equal(gate.id, leg.to);
      assert.equal(gate.radius, GENERATOR.gateRadius);
      total += leg.time; at = leg.to;
    }
    assert.ok(total >= GENERATOR.total.min && total <= GENERATOR.total.max, `${label}: ${total.toFixed(0)} s`);
    // The rival's line: no repeated vertex (a 700 m straight is one segment —
    // Harbor Way has three points), through every gate in order, road past
    // the finish. Continuity between streets is the join check in the builder.
    for (let i = 1; i < rival.points.length; i++) {
      const gap = Math.hypot(rival.points[i]!.x - rival.points[i - 1]!.x, rival.points[i]!.z - rival.points[i - 1]!.z);
      assert.ok(gap > 0.01, `${label}: repeated vertex at point ${i}`);
    }
    for (const [i, along] of rival.gates.entries()) {
      const on = sampleRivalPath(rival, along), gate = race.checkpoints[i]!;
      assert.ok(Math.hypot(on.x - gate.x, on.z - gate.z) < 0.2, `${label}: line misses gate ${i}`);
      if (i) assert.ok(along > rival.gates[i - 1]!, `${label}: gates out of order along the line`);
    }
    assert.ok(rival.along[rival.along.length - 1]! >= rival.gates[rival.gates.length - 1]! + 8, `${label}: no road past the finish`);
    // The line is the legs' streets, plus the approach before the first gate
    // and one street past the finish: never shorter than the legs it drives.
    const driven = routeLength(graph, generated.legs.flatMap(l => [...l.via]));
    assert.ok(rival.along[rival.along.length - 1]! >= driven - 1, `${label}: line ${rival.along[rival.along.length - 1]!.toFixed(0)} m shorter than its legs ${driven.toFixed(0)} m`);
  }
});

test("the draw prefers legs with a priced or even choice: well ahead of a uniform draw", () => {
  const share = () => {
    let choice = 0, legs = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const leg of draw(seed).legs) { legs++; if (leg.kind === "priced" || leg.kind === "even") choice++; }
    }
    return choice / legs;
  };
  const weighted = share();
  const saved = { ...GENERATOR.weight };
  try {
    for (const key of Object.keys(GENERATOR.weight)) (GENERATOR.weight as Record<string, number>)[key] = key === "sweetSpot" ? 0 : 1;
    const uniform = share();
    // Measured 54% against 27% on the first slice; the map decides the level,
    // the weighting decides the gap.
    assert.ok(weighted >= uniform + 0.15, `weighted ${(weighted * 100).toFixed(0)}% vs uniform ${(uniform * 100).toFixed(0)}%`);
  } finally {
    Object.assign(GENERATOR.weight, saved);
  }
});

test("street names shorten to the word a driver would say", () => {
  assert.equal(shortStreetName("S Jackson St & 4Th Ave S"), "Jackson");
  assert.equal(shortStreetName("Western Ave & Madison St"), "Western");
  assert.equal(shortStreetName("Harbor Way & Alaskan Way"), "Harbor");
  assert.equal(shortStreetName("1St Ave S"), "1St");
});

test("the rival drives a generated race to the finish in normal traffic", () => {
  const { race, rival } = seattleGeneratedRace(3);
  const sim = createSim("fwd", world, { race, rival, traffic: true });
  try {
    const parked = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    let furthest = 0;
    for (let tick = 0; tick < 18000 && !sim.state.rival!.race.finished; tick++) {
      step(sim, parked);
      const car = sim.state.rival!.vehicle;
      furthest = Math.max(furthest, projectOntoSeattle(car.x, car.z).distance);
      assert.ok(Number.isFinite(car.x + car.z + car.speed));
    }
    const state = sim.state.rival!;
    assert.equal(state.race.finished, true, JSON.stringify({ checkpoint: state.race.checkpoint, driver: state.driver }));
    assert.equal(state.race.splits.length, race.checkpoints.length);
    assert.ok(state.race.ticks > 3600, "the AI must actually drive the route");
    assert.equal(state.driver.resets, 0, "a generated line should never need the fallback reset");
    assert.ok(furthest < 16, `rival strayed ${furthest.toFixed(1)} m from a centreline`);
  } finally { sim.world.free(); }
});
