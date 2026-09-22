import assert from "node:assert/strict";
import test from "node:test";
import { createAlderWorld } from "../src/sim/alder.ts";
import { DT } from "../src/sim/sim.ts";
import { createTraffic, stepTraffic, type TrafficVehicleState } from "../src/sim/traffic.ts";

// A race from the grid met the same cars in the same places on every attempt (2026-09-22, Shawn, the third restart
// against Wake): the sim starts at tick 0 and traffic had no seed. A seed per attempt moves both where traffic starts
// and which way it turns.
const network = createAlderWorld(true).traffic!;

test("a seed moves where traffic starts, and nothing the renderer sized itself by at load", () => {
  const zero = createTraffic(network);
  // Seed 0 is the traffic every run had, to the byte: the golden master hashes the state as JSON.
  assert.deepEqual(createTraffic(network, undefined, 0), zero);
  assert.ok(!JSON.stringify(zero).includes("seed"), "a vehicle at seed 0 carries a seed field");
  const seeds = [1, 1000, 271828, 0xffffffff];
  const layouts = seeds.map(seed => createTraffic(network, undefined, seed));
  for (const [i, layout] of layouts.entries()) {
    // The renderer builds one instanced slot per vehicle by kind, once: a restart must fill the same slots.
    assert.equal(layout.vehicles.length, zero.vehicles.length, `seed ${seeds[i]}: another vehicle count`);
    assert.deepEqual(layout.vehicles.map(v => v.kind), zero.vehicles.map(v => v.kind), `seed ${seeds[i]}: an id changed kind`);
    // Somewhere else, nearly all of them, and inside its lane's window like seed 0's: never on a junction.
    const moved = layout.vehicles.filter((v, id) => v.lane !== zero.vehicles[id]!.lane || Math.abs(v.distance - zero.vehicles[id]!.distance) > 1).length;
    assert.ok(moved > layout.vehicles.length * 0.9, `seed ${seeds[i]}: only ${moved} of ${layout.vehicles.length} vehicles start elsewhere`);
    for (const v of layout.vehicles) {
      const lane = network.lanes[v.lane]!;
      assert.ok(v.distance > lane.entry && v.distance < lane.length - lane.entry, `seed ${seeds[i]}: #${v.id} starts inside a junction`);
      assert.equal(v.seed, seeds[i]);
    }
    // The same seed is the same traffic.
    assert.deepEqual(createTraffic(network, undefined, seeds[i]), layout);
  }
  assert.notDeepEqual(layouts[1]!.vehicles.map(v => [v.lane, v.distance]), layouts[2]!.vehicles.map(v => [v.lane, v.distance]));
});

test("a seed changes which way traffic turns, not only where it starts", () => {
  // The same start, one unsalted and one salted: after a minute they are on different lanes.
  const plain = createTraffic(network);
  const salted = { vehicles: plain.vehicles.map(v => ({ ...structuredClone(v), seed: 1000 })) as TrafficVehicleState[] };
  for (let tick = 0; tick < 60 * 60; tick++) { stepTraffic(network, plain, DT); stepTraffic(network, salted, DT); }
  const apart = plain.vehicles.filter((v, id) => v.lane !== salted.vehicles[id]!.lane).length;
  assert.ok(apart > plain.vehicles.length / 3, `only ${apart} of ${plain.vehicles.length} vehicles took other turns`);
});

// The forecast and the indicators under a seed are held to what is driven in tests/traffic-intent.test.ts, beside seed 0.
