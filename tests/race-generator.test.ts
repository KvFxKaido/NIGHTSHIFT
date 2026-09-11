import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step } from "../src/sim/sim.ts";
import { createSeattleWorld, seattleGeneratedRace, seattleRouting, projectOntoSeattle, SEATTLE_STREETS,
  SEATTLE_RACE, SEATTLE_GARAGE, seattleHeight } from "../src/sim/seattle.ts";
import { GENERATOR, generateRace, startApproach, shortStreetName, degreesBetween, nodePosition } from "../src/sim/race-generator.ts";
import { legTable, routeLength, buildRoutingGraph } from "../src/sim/route-choice.ts";
import released from "../assets/maps/seattle/belltown-slice.json" with { type: "json" };
import { sampleRivalPath, withExits, EXIT_LOOKAHEAD } from "../src/sim/rival.ts";
import { SEATTLE_RIVAL } from "../src/sim/seattle-rival.ts";
await RAPIER.init();

// Generated races: flash a rival and the race is drawn from the city. The seed
// is the race's identity; the legs are chosen for the choice they offer; the
// rival's line is routed through the gates on the same graph.

const graph = seattleRouting();
const world = createSeattleWorld(true);
const approach = startApproach(SEATTLE_STREETS, world.start);
const draw = (seed: number) => generateRace(graph, seed, approach.node, approach.arriving, [approach.street.id]);

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
    let total = 0, at = approach.node, arrival = approach.arriving;
    const used = new Set<string>([approach.street.id]);
    for (const [i, leg] of generated.legs.entries()) {
      assert.equal(leg.from, at, `${label}: leg ${i} does not start where the last ended`);
      assert.ok(graph.choicePoints.includes(leg.to), `${label}: gate ${i} is not a choice point`);
      assert.ok(leg.time >= GENERATOR.leg.min && leg.time <= GENERATOR.leg.max, `${label}: leg ${i} takes ${leg.time.toFixed(0)} s`);
      assert.deepEqual(leg, legs.get(`${leg.from}|${leg.to}`), `${label}: leg ${i} is not the measured leg`);
      for (const d of leg.via) { assert.ok(!used.has(d.id), `${label}: ${d.id} driven twice`); used.add(d.id); }
      // Flow: the next gate is ahead or abeam of the heading this one is
      // reached on, and the leg does not leave the gate in a hairpin.
      const here = nodePosition(graph, at), there = nodePosition(graph, leg.to);
      const span = Math.hypot(there.x - here.x, there.z - here.z);
      const swing = degreesBetween(arrival, { x: (there.x - here.x) / span, z: (there.z - here.z) / span });
      assert.ok(swing <= GENERATOR.flow.bearing, `${label}: gate ${i + 1} lies ${swing.toFixed(0)}° off the arrival heading`);
      const turn = degreesBetween(arrival, leg.via[0]!.leaving);
      assert.ok(turn <= GENERATOR.flow.turn, `${label}: leg ${i} leaves its gate with a ${turn.toFixed(0)}° turn`);
      const gate = race.checkpoints[i]!;
      assert.equal(gate.id, leg.to);
      assert.equal(gate.radius, GENERATOR.gateRadius);
      total += leg.time; at = leg.to; arrival = leg.via[leg.via.length - 1]!.arriving;
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
    // The arrows: paired with the line, every gate but the finish points the
    // way the next leg's first street goes, read from the line itself. The
    // exact check walks the street's own points the lookahead distance in the
    // driven direction; the routing's first-segment direction is only held
    // loosely, because 4th Ave begins with a 4 m stub 12° off its line.
    const paired = withExits(race, rival);
    for (const [i, gate] of paired.checkpoints.entries()) {
      const following = generated.legs[i + 1];
      if (!following) { assert.equal(gate.exit, undefined, `${label}: the finish has an arrow`); continue; }
      assert.ok(gate.exit, `${label}: gate ${i + 1} has no arrow`);
      const drive = following.via[0]!, street = graph.streets.get(drive.id)!;
      const points = drive.reversed ? [...street.points].reverse() : street.points;
      let left = EXIT_LOOKAHEAD, k = 0, x = points[0]!.x, z = points[0]!.z;
      while (left > 0 && k < points.length - 1) {
        const dx = points[k + 1]!.x - x, dz = points[k + 1]!.z - z, run = Math.hypot(dx, dz);
        const t = Math.min(1, left / run);
        x += dx * t; z += dz * t; left -= run * t; k++;
      }
      const walked = Math.hypot(x - gate.x, z - gate.z);
      const along = gate.exit.x * (x - gate.x) / walked + gate.exit.z * (z - gate.z) / walked;
      assert.ok(along > 0.999, `${label}: gate ${i + 1}'s arrow is not along ${street.name} (cos ${along.toFixed(4)})`);
      const routed = gate.exit.x * drive.leaving.x + gate.exit.z * drive.leaving.z;
      assert.ok(routed > 0.95, `${label}: gate ${i + 1}'s arrow is ${(Math.acos(routed) * 180 / Math.PI).toFixed(0)}° off the routing's exit`);
    }
  }
});

test("Sound to Sky's gates carry the authored line's exits: east through Jackson, north up Harbor Way, none at Pike", () => {
  const paired = withExits(SEATTLE_RACE, SEATTLE_RIVAL);
  assert.equal(paired.checkpoints.length, 4);
  const [jackson, harbor, madison, pike] = paired.checkpoints;
  assert.ok(jackson!.exit && jackson!.exit.x > 0.99, `Jackson's gate leaves ${JSON.stringify(jackson!.exit)}`);
  assert.ok(harbor!.exit && harbor!.exit.z < -0.99, `Harbor Way's gate leaves ${JSON.stringify(harbor!.exit)}`);
  assert.ok(madison!.exit && madison!.exit.x > 0.8 && madison!.exit.z < -0.4, `Madison's gate leaves ${JSON.stringify(madison!.exit)}`);
  assert.equal(pike!.exit, undefined, "the finish has no arrow");
  // The definition itself is untouched: pairing is where the exits are read.
  assert.equal(SEATTLE_RACE.checkpoints[0]!.exit, undefined);
  // And the sim pairs them on creation.
  const sim = createSim("fwd", world, { race: SEATTLE_RACE, rival: SEATTLE_RIVAL, traffic: false });
  try {
    assert.deepEqual(sim.state.race!.next, { x: jackson!.x, z: jackson!.z, exit: jackson!.exit });
  } finally { sim.world.free(); }
});

test("the flow rule blocks the released seed-1 hairpin and hairpins on the expanded map", () => {
  // The map has two hairpin junctions — Yesler & James's Y (151°) and the
  // campus loop's Broad St & 5th Ave N (170°) — and 21 seeds in 600 reach one
  // once the bearing rule alone is on. The first is seed 1, at Broad & 5th.
  const releasedGraph = buildRoutingGraph(SEATTLE_STREETS.slice(0,released.roads.length),seattleHeight,
    [...released.buildings,SEATTLE_GARAGE.building]);
  const hairpins = (seeds: number, testedGraph = graph) => {
    const found: string[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      let arrival = approach.arriving;
      for (const leg of generateRace(testedGraph,seed,approach.node,approach.arriving,[approach.street.id]).legs) {
        const turn = degreesBetween(arrival, leg.via[0]!.leaving);
        if (turn > 135) found.push(`seed ${seed}: ${turn.toFixed(0)}° at ${testedGraph.nodeName(leg.from)}`);
        arrival = leg.via[leg.via.length - 1]!.arriving;
      }
    }
    return found;
  };
  const saved = GENERATOR.flow.turn;
  try {
    (GENERATOR.flow as { turn: number }).turn = 181;
    const loose = hairpins(100,releasedGraph);
    assert.ok(loose.some(h => h.startsWith("seed 1:") && h.includes("Broad St & 5Th Ave N")), `the map's hairpin is not where it was: ${loose.join("; ") || "none"}`);
  } finally {
    (GENERATOR.flow as { turn: number }).turn = saved;
  }
  assert.deepEqual(hairpins(100,releasedGraph), []);
  assert.deepEqual(hairpins(100), []);
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
    // Measured 39% against 26% with the flow rule (54% against 27% before it:
    // the priced corridors are few and the rule stops the draw turning back
    // for them); the map decides the level, the weighting decides the gap.
    assert.ok(weighted >= uniform + 0.1, `weighted ${(weighted * 100).toFixed(0)}% vs uniform ${(uniform * 100).toFixed(0)}%`);
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
