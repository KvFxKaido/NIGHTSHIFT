import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  atCheckpoint, createRace, formatRaceTime, raceHolding, racePosition, stepRace, type RaceState,
} from "../src/sim/race.ts";
import { CRANE_TO_CREST, createRaceWorld, DISTRICT_RACES } from "../src/sim/events.ts";
import { createSim, step, TICK_HZ, type Input, type VehicleState } from "../src/sim/sim.ts";
import { DISTRICT_STREETS } from "../src/sim/district.ts";
import { pathLength } from "../src/sim/lanes.ts";
import { driveDistrictRoute } from "./helpers/district-driver.ts";

// The sim's physics is Rapier's WASM, which has to be loaded before a world
// can exist; the pure-rules tests above do not need it, the sim tests do.
await RAPIER.init();

const race = CRANE_TO_CREST;
const at = (index: number) => ({ x: race.checkpoints[index]!.x, z: race.checkpoints[index]!.z }) as VehicleState;
const away = { x: 9999, z: 9999 } as VehicleState;
const live = (): RaceState => ({ ...createRace(race), countdown: 0 });

test("checkpoints count only in order, and only once", () => {
  const state = live();
  // Driving through the LAST gate first is worth nothing.
  stepRace(race, state, at(2));
  assert.equal(state.checkpoint, 0);
  stepRace(race, state, at(0));
  assert.equal(state.checkpoint, 1);
  assert.deepEqual(state.next, { x: race.checkpoints[1]!.x, z: race.checkpoints[1]!.z });
  // Sitting in the gate you already took does not take it again.
  stepRace(race, state, at(0));
  assert.equal(state.checkpoint, 1);
  stepRace(race, state, away);
  stepRace(race, state, at(1));
  stepRace(race, state, at(2));
  assert.equal(state.finished, true);
  assert.equal(state.next, null);
  assert.equal(state.splits.length, race.checkpoints.length);
  for (let i = 1; i < state.splits.length; i++) assert.ok(state.splits[i]! > state.splits[i - 1]!);
  // Finished is final: the clock stops and nothing advances.
  const ticks = state.ticks;
  stepRace(race, state, at(0));
  assert.equal(state.ticks, ticks);
});

test("a gate is a radius, not a point", () => {
  const gate = race.checkpoints[0]!;
  assert.equal(atCheckpoint(race, 0, { x: gate.x + gate.radius - 0.01, z: gate.z }), true);
  assert.equal(atCheckpoint(race, 0, { x: gate.x + gate.radius + 0.01, z: gate.z }), false);
  assert.equal(atCheckpoint(race, 99, gate), false, "no such gate is never passed");
});

// Ignoring the throttle during the countdown is a sim rule, not presentation,
// so a replay of the input log honours the same flag drop.
test("the countdown holds the car, then lets it go", () => {
  const sim = createSim("fwd", createRaceWorld(race), { traffic: false, race });
  try {
    assert.equal(raceHolding(sim.state.race), true);
    const flat: Input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    for (let tick = 0; tick < race.countdownTicks; tick++) step(sim, flat);
    assert.ok(sim.state.vehicle.speed < 0.05, `moved ${sim.state.vehicle.speed.toFixed(2)} m/s under the flag`);
    assert.equal(sim.state.race!.countdown, 0);
    assert.equal(sim.state.race!.ticks, 0, "the clock starts when the flag drops, not before");
    for (let tick = 0; tick < 60; tick++) step(sim, flat);
    assert.ok(sim.state.vehicle.speed > 3, "the flag dropped and the car did not go");
    assert.equal(sim.state.race!.ticks, 60);
  } finally { sim.world.free(); }
});

test("a race replays tick for tick from the same inputs", () => {
  const script = (tick: number): Input => ({
    throttle: 1, brake: tick % 240 > 200 ? 0.6 : 0, steer: Math.sin(tick / 40) * 0.4, handbrake: 0,
  });
  const run = () => {
    const sim = createSim("fwd", createRaceWorld(race), { traffic: false, race });
    try {
      for (let tick = 0; tick < 600; tick++) step(sim, script(tick));
      return JSON.stringify(sim.state.race) + JSON.stringify(sim.state.vehicle);
    } finally { sim.world.free(); }
  };
  assert.equal(run(), run());
});

// The claim is that the reference line completes the race through its gates.
// Execute it: drive the line with the real four-wheel sim and real colliders.
test("the inspection driver finishes Crane to Crest through every gate", () => {
  const result = driveDistrictRoute(race.route, undefined, { race });
  assert.equal(result.completed, true, JSON.stringify(result));
  assert.equal(result.contactTicks, 0);
  const state = result.race!;
  assert.equal(state.finished, true, `stopped at gate ${state.checkpoint} of ${race.checkpoints.length}`);
  assert.equal(state.splits.length, race.checkpoints.length);
  const seconds = state.splits.at(-1)! / TICK_HZ;
  assert.ok(seconds > 20 && seconds < 120, `finished in ${seconds.toFixed(1)} s`);
});

// Checkpoints are placed where route choice exists — the Midnight Club thesis
// as a gate on THIS race rather than an aspiration for the city. Same measure
// as the layout critique: close the key street on the best route between two
// gates and see what the detour costs.
test("most legs of every race have a real alternative route", () => {
  interface Edge { a: string; b: string; cost: number; id: string }
  const edges: Edge[] = DISTRICT_STREETS.map(s => ({ a: s.from, b: s.to, cost: pathLength(s.points), id: s.id }));
  const nodes = [...new Set(edges.flatMap(e => [e.a, e.b]))];
  const route = (from: string, to: string, banned?: string) => {
    const dist = new Map(nodes.map(n => [n, Infinity])); const prev = new Map<string, Edge>();
    dist.set(from, 0); const seen = new Set<string>();
    for (;;) {
      let best: string | null = null;
      for (const n of nodes) if (!seen.has(n) && dist.get(n)! < (best === null ? Infinity : dist.get(best)!)) best = n;
      if (best === null || dist.get(best) === Infinity || best === to) break;
      seen.add(best);
      for (const e of edges) {
        if (e.id === banned) continue;
        const other = e.a === best ? e.b : e.b === best ? e.a : null;
        if (other === null) continue;
        const c = dist.get(best)! + e.cost;
        if (c < dist.get(other)!) { dist.set(other, c); prev.set(other, e); }
      }
    }
    const via: string[] = [];
    for (let n = to; prev.has(n);) { const e = prev.get(n)!; via.push(e.id); n = e.a === n ? e.b : e.a; }
    return { cost: dist.get(to)!, via };
  };
  for (const candidate of DISTRICT_RACES) {
    const first = DISTRICT_STREETS.find(s => s.id === candidate.route.legs[0]!.street)!;
    const start = candidate.route.legs[0]!.reverse ? first.to : first.from;
    const gates = [start, ...candidate.checkpoints.map(c => c.id)];
    let real = 0;
    for (let i = 0; i < gates.length - 1; i++) {
      const base = route(gates[i]!, gates[i + 1]!);
      let worst = base.cost;
      for (const id of base.via) worst = Math.max(worst, route(gates[i]!, gates[i + 1]!, id).cost);
      if ((worst - base.cost) / base.cost < 0.25) real++;
    }
    assert.ok(real * 2 >= gates.length - 1,
      `${candidate.name}: only ${real} of ${gates.length - 1} legs have a real alternative`);
  }
});

test("position is the higher gate, then the nearer car, then the earlier finish", () => {
  const ahead = { ...live(), checkpoint: 2 }, behind = { ...live(), checkpoint: 1 };
  assert.equal(racePosition(race, { race: ahead, x: 0, z: 0 }, { race: behind, x: 0, z: 0 }), 1);
  assert.equal(racePosition(race, { race: behind, x: 0, z: 0 }, { race: ahead, x: 0, z: 0 }), 2);
  const gate = race.checkpoints[1]!;
  assert.equal(racePosition(race, { race: behind, x: gate.x + 5, z: gate.z }, { race: { ...behind }, x: gate.x + 50, z: gate.z }), 1);
  const early = { ...live(), finished: true, checkpoint: 3, splits: [1, 2, 3000] };
  const late = { ...live(), finished: true, checkpoint: 3, splits: [1, 2, 4000] };
  assert.equal(racePosition(race, { race: late, x: 0, z: 0 }, { race: early, x: 0, z: 0 }), 2);
  assert.equal(formatRaceTime(TICK_HZ * 65.25, TICK_HZ), "1:05.3");
});
