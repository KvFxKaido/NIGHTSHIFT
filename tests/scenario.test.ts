import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { drawAlderCourse, fieldAlderRival } from "../src/sim/alder-course.ts";
import { arenaEvent } from "../src/sim/arena-events.ts";
import type { LapSession } from "../src/sim/lap-recorder.ts";
import { recordedEvent } from "../src/sim/recorded-event.ts";
import { openScenario, raceScenario, runScenario, sessionScenario } from "../src/sim/scenario.ts";
import { carHandling, createSim, step, type Input, type Sim } from "../src/sim/sim.ts";
await RAPIER.init();

// A scenario (src/sim/scenario.ts) is what a sim is stood up from, as data. The instruments that drive one alone
// built it by hand to 2026-09-28, and the golden master (scripts/golden.ts) is judged on those constructions: so the
// builders are held to them bit for bit here, in CI, where the golden master's baseline is local.

// The golden master's own input: throttle, part throttle, brakes, a swinging stick and a handbrake flick.
const pattern = (t: number): Input => ({
  throttle: t % 240 < 150 ? 1 : 0.3,
  brake: t % 240 >= 200 && t % 240 < 220 ? 0.8 : 0,
  steer: Math.sin(t / 37) * 0.8,
  handbrake: t % 300 >= 260 && t % 300 < 275 ? 1 : 0,
});
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
/** Drive `ticks` of the pattern and hash Rapier's snapshot and the state, as the golden master does; the world is freed. */
function driven(sim: Sim, ticks: number): string {
  try {
    for (let t = 0; t < ticks; t++) step(sim, pattern(t));
    return `${sha(sim.world.takeSnapshot())} ${sha(JSON.stringify(sim.state, (key, value) => key === "handling" ? undefined : value))}`;
  } finally { sim.world.free(); }
}

test("a generated race's scenario is the run the golden master built by hand: the course, its fielded rival, its start, seed 0's traffic", () => {
  const id = "gen-stray-5", course = drawAlderCourse(id, null);
  const byHand = driven(createSim("rwd", createAlderWorld(true, course.start ?? undefined), { race: course.race, rival: fieldAlderRival(course.rival) }), 240);
  const scenario = raceScenario(recordedEvent(id)!, carHandling(null, "rwd"));
  assert.equal(scenario.name, id);
  assert.equal(driven(openScenario(scenario), 240), byHand);
});

test("Ridge Circuit's scenario is its hand-built run: the layout's event from its start, no traffic, the rival on its line", () => {
  const event = arenaEvent("full");
  const byHand = driven(createSim("awd", createAlderWorld(true, event.start), { race: event.race, rival: event.rival!, traffic: false }), 240);
  assert.equal(driven(openScenario(raceScenario(recordedEvent("arena-full")!, carHandling(null, "awd"))), 240), byHand);
});

test("a session's scenario is its race in its car, against its traffic and on its pedals; absent is seed 0 and the clamp", () => {
  const event = recordedEvent("arena-full")!;
  const session = { race: "arena-full", car: "cinder", drivetrain: "rwd" } as LapSession;
  const plain = sessionScenario(session, event);
  assert.equal(plain.handling, carHandling("cinder", "rwd"));
  assert.equal(plain.world.start, event.start);
  assert.deepEqual([plain.options.race, plain.options.rival, plain.options.traffic, plain.options.trafficSeed, plain.options.pedalAssist],
    [event.race, event.rival, event.traffic, 0, 1]);
  const carried = sessionScenario({ ...session, trafficSeed: 314159, pedalAssist: 0 } as LapSession, event);
  assert.deepEqual([carried.options.trafficSeed, carried.options.pedalAssist], [314159, 0]);
  // The lap comparison's experiment: another driver for the same race, or nobody.
  const other = { ...event.rival!, id: "somebody-else" };
  assert.equal(sessionScenario(session, event, other).options.rival, other);
  assert.equal(sessionScenario(session, event, null).options.rival, undefined);
});

test("runScenario hands the body its sim and frees the world after, whatever the body does", () => {
  const scenario = raceScenario(recordedEvent("arena-full-solo")!, carHandling(null, "rwd"));
  assert.equal(runScenario(scenario, sim => { step(sim, pattern(0)); return sim.state.vehicle.speed; }), runScenario(scenario, sim => { step(sim, pattern(0)); return sim.state.vehicle.speed; }));
  let freed: Sim | null = null;
  assert.throws(() => runScenario(scenario, sim => { freed = sim; throw new Error("the body's own"); }), /the body's own/);
  // Rapier's compat wrapper drops its raw world on free: a second free is a no-op on nothing, a live world would still hold one.
  assert.equal((freed as unknown as { world: { raw?: unknown } }).world.raw, undefined);
});
