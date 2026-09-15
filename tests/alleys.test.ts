import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step } from "../src/sim/sim.ts";
import { ALDER_STREETS, ALDER_BLOCKS, alderRouting, alderGeneratedRace, createAlderWorld, projectOntoAlder,
  alderHeight } from "../src/sim/alder.ts";
import { GENERATOR, generateRace, startApproach, nodePosition, degreesBetween } from "../src/sim/race-generator.ts";
import { buildRoutingGraph, route, measureLeg, type RoutingGraph, type LegClass } from "../src/sim/route-choice.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import alleys from "../assets/maps/alder/alleys.json" with { type: "json" };
await RAPIER.init();

// Authored alleys are placed where the generator's draw runs out of priced
// legs ahead. The first, Freight Cut, exists because every generated race
// began at a dead spot: from the grid the run up 1st Ave S had no alternative.

const graph = alderRouting();
const authored = ALDER_STREETS.filter(s => s.id.startsWith("sea-alley-"));
const world = createAlderWorld(true);
const approach = startApproach(ALDER_STREETS, world.start);
const crosses = (p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }, s: { x: number; z: number }) => {
  const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
};
/** What the generator could draw next from a junction reached on `arriving`, by class. */
function ahead(g: RoutingGraph, node: string, arriving: { x: number; z: number }): Record<LegClass, number> {
  const here = nodePosition(g, node), by: Record<LegClass, number> = { priced: 0, free: 0, even: 0, twin: 0, none: 0 };
  for (const to of g.choicePoints) {
    if (to === node) continue;
    const fastest = route(g, node, to);
    if (!isFinite(fastest.time) || fastest.time < GENERATOR.leg.min || fastest.time > GENERATOR.leg.max) continue;
    const there = nodePosition(g, to), span = Math.hypot(there.x - here.x, there.z - here.z) || 1;
    if (degreesBetween(arriving, { x: (there.x - here.x) / span, z: (there.z - here.z) / span }) > GENERATOR.flow.bearing) continue;
    if (degreesBetween(arriving, fastest.via[0]!.leaving) > GENERATOR.flow.turn) continue;
    by[measureLeg(g, node, to).kind]++;
  }
  return by;
}

test("every authored alley is an 8 m alley between two existing junctions that crosses no street and stands on no building", () => {
  assert.equal(authored.length, alleys.roads.length, "the builder wrote every authored alley");
  for (const alley of authored) {
    assert.equal(alley.kind, "alley");
    assert.equal(alley.points[0]!.width, 8);
    for (const end of [alley.from, alley.to]) {
      assert.ok(ALDER_STREETS.some(s => s.id !== alley.id && (s.from === end || s.to === end)), `${alley.name} ends at ${end}, which joins no other street`);
      assert.ok((graph.degree.get(end) ?? 0) >= 3, `${alley.name}'s end at ${graph.nodeName(end)} is not a junction`);
    }
    const a = alley.points[0]!, b = alley.points[alley.points.length - 1]!;
    for (const s of ALDER_STREETS) {
      if (s.id === alley.id) continue;
      for (let i = 1; i < s.points.length; i++) assert.ok(!crosses(a, b, s.points[i - 1]!, s.points[i]!), `${alley.name} crosses ${s.name} mid-block`);
    }
    for (const block of ALDER_BLOCKS) {
      assert.ok(segmentFootprintDistance(block, a, b) >= 8 / 2 + 2.8 - 1e-6, `a building stands in ${alley.name} at (${block.x}, ${block.z})`);
    }
    const m = graph.measures.get(alley.id)!;
    assert.equal(m.narrow, 1, "an alley is as narrow as the risk model knows");
  }
});

test("Freight Cut gives the start a choice: priced or even legs ahead from the grid, where there were none", () => {
  const without = buildRoutingGraph(ALDER_STREETS.filter(s => !s.id.startsWith("sea-alley-")), alderHeight, ALDER_BLOCKS);
  // Measured on the map before the alley: 0 priced, 0 even. Without the alley
  // but with its two displaced plots gone, one leg reads even; still no priced.
  const before = ahead(without, approach.node, approach.arriving), after = ahead(graph, approach.node, approach.arriving);
  assert.equal(before.priced, 0, `without the alley the grid has ${before.priced} priced legs ahead`);
  assert.ok(before.priced + before.even <= 1, `without the alley the grid has ${before.even} even legs ahead`);
  assert.ok(after.priced >= 1 && after.priced + after.even >= 3, `with the alley: ${JSON.stringify(after)}`);
});

test("the draw over 60 seeds: most first legs have a choice, and few draws are made where nothing priced or even is ahead", () => {
  let first = 0, dead = 0, drawn = 0, through = 0;
  const spots = new Map<string, Record<LegClass, number>>();
  for (let seed = 1; seed <= 60; seed++) {
    const race = generateRace(graph, seed, approach.node, approach.arriving, [approach.street.id]);
    let at = approach.node, arriving = approach.arriving, key = `${at}|start`;
    race.legs.forEach((leg, i) => {
      let s = spots.get(key); if (!s) { s = ahead(graph, at, arriving); spots.set(key, s); }
      if (s.priced + s.even === 0) dead++;
      drawn++;
      if (i === 0 && (leg.kind === "priced" || leg.kind === "even")) first++;
      if (leg.via.some(d => d.id.startsWith("sea-alley-"))) through++;
      const last = leg.via[leg.via.length - 1]!;
      at = leg.to; arriving = last.arriving; key = `${at}|${last.id}${last.reversed ? "r" : ""}`;
    });
  }
  // Measured 196 of 300 first legs and 59 of 1183 dead draws with Freight Cut; 0 and 382 without.
  // Since the pace calibration (2026-09-15): 198 and 50 of 1189 with it, 0 and 369 without.
  assert.ok(first >= 30, `only ${first} of 60 first legs have a choice`);
  assert.ok(dead / drawn < 0.15, `${dead} of ${drawn} draws made at a dead spot`);
  assert.ok(through >= 20, `only ${through} legs use an alley`);
});

test("the rival drives a generated race through Freight Cut to the finish in traffic", () => {
  let chosen: ReturnType<typeof alderGeneratedRace> | null = null, seed = 0;
  for (seed = 1; seed <= 30 && !chosen; seed++) {
    const candidate = alderGeneratedRace(seed);
    if (candidate.generated.legs.some(leg => leg.via.some(d => d.id === "sea-alley-0"))) chosen = candidate;
  }
  assert.ok(chosen, "no seed in 30 uses Freight Cut");
  const alley = authored.find(s => s.id === "sea-alley-0")!;
  const mid = { x: (alley.points[0]!.x + alley.points[alley.points.length - 1]!.x) / 2, z: (alley.points[0]!.z + alley.points[alley.points.length - 1]!.z) / 2 };
  const sim = createSim("fwd", world, { race: chosen!.race, rival: chosen!.rival, traffic: true });
  try {
    const parked = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    let furthest = 0, nearestToAlley = Infinity;
    for (let tick = 0; tick < 18000 && !sim.state.rival!.race.finished; tick++) {
      step(sim, parked);
      const car = sim.state.rival!.vehicle;
      furthest = Math.max(furthest, projectOntoAlder(car.x, car.z).distance);
      nearestToAlley = Math.min(nearestToAlley, Math.hypot(car.x - mid.x, car.z - mid.z));
    }
    const state = sim.state.rival!;
    assert.equal(state.race.finished, true, `seed ${seed - 1}: ${JSON.stringify({ checkpoint: state.race.checkpoint, driver: state.driver })}`);
    assert.equal(state.driver.resets, 0, "an 8 m alley must not need the fallback reset");
    assert.ok(nearestToAlley < 6, `the rival passed ${nearestToAlley.toFixed(1)} m from the middle of the alley`);
    assert.ok(furthest < 16, `rival strayed ${furthest.toFixed(1)} m from a centreline`);
  } finally { sim.world.free(); }
});
