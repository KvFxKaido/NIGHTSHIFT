import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { compareSession } from "../scripts/lap-compare.ts";
import { ALDER_VERSION, createAlderWorld } from "../src/sim/alder.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { createLapRecorder, lapSession, recordTick, type LapSession } from "../src/sim/lap-recorder.ts";
import { replayLapSession } from "../src/sim/lap-replay.ts";
import { generatorRevision } from "../src/sim/race-generator.ts";
import { GENERATED_LAYOUT, recordedEvent } from "../src/sim/recorded-event.ts";
import { createRivalDriver, rivalInput, RIVAL_REVISION, type RivalDefinition } from "../src/sim/rival.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { TRAFFIC_KINDS, TRAFFIC_REVISION } from "../src/sim/traffic.ts";
await RAPIER.init();

// Laps were recorded on the circuits only, and the career is generated races: whether a Blacklist name could worry the
// player was measurable from the rival's side and not from his (2026-09-20, Tally's gen-tally-7, read off a browser tab).
test("a race id resolves to what a recording of it is a recording of", () => {
  // A circuit is what it was, and says so in its id.
  for (const id of ["arena-full", "street-uptown-clear-solo"]) {
    const circuit = circuitEvent(id)!, event = recordedEvent(id)!;
    assert.deepEqual([event.identity, event.layout, event.solo, event.traffic, event.comparable], [circuit.identity, circuit.layout, circuit.solo, circuit.traffic, true]);
    assert.deepEqual([event.track.gatesPerLap, event.track.points.length, event.race.id], [circuit.track.gatesPerLap, circuit.track.points.length, circuit.race.id]);
  }
  // A generated race is one lap: every gate of it, measured along its rival's centreline route.
  const sprint = recordedEvent("gen-crest-23")!;
  assert.deepEqual([sprint.identity, sprint.layout, sprint.solo, sprint.traffic, sprint.comparable], [generatorRevision("gen-crest-23"), GENERATED_LAYOUT, false, true, true]);
  assert.equal(sprint.track.gatesPerLap, sprint.race.checkpoints.length);
  assert.equal(sprint.rival!.car, "skim");
  assert.ok(sprint.rival!.line, "the rival a recording replays against is the one the game fields, street line and all");
  assert.equal(sprint.track.points, (sprint.rival as RivalDefinition).points, "measured along the route, which stays the centreline");
  // Solo keeps the race and its arrows and fields nobody, as the game does it.
  const alone = recordedEvent("gen-crest-23", undefined, { solo: true })!;
  assert.equal(alone.rival, null);
  assert.ok(alone.race.checkpoints.slice(0, -1).every(gate => gate.exit), "a solo race lost its arrows");
  // Where the flash was is part of what the id draws.
  const flashed = recordedEvent("gen-bollard-186525", undefined, { start: "-380.2,-921.5,-2.217" })!, grid = recordedEvent("gen-bollard-186525")!;
  assert.ok(flashed.start && Math.hypot(flashed.start.x + 380.2, flashed.start.z + 921.5) < 8, "the flash's start was not used");
  assert.notDeepEqual(flashed.race.checkpoints.map(g => [g.x, g.z]), grid.race.checkpoints.map(g => [g.x, g.z]));
  // Laps that lie over each other, or gates in the driver's own order, cannot be compared along one route.
  assert.equal(recordedEvent("gen-crest-8-unordered")!.comparable, false);
  // And nothing else is recorded.
  for (const id of ["sound-to-sky", "harbor-quarter-drag", "sable-yard-drift"]) assert.equal(recordedEvent(id), null);
});

test("a generated sprint raced against its rival records as one lap, replays exactly, and compares gate by gate", () => {
  const event = recordedEvent("gen-crest-23")!;
  const { line: _line, ...route } = event.rival!;
  // Driven by the rival's planner in the rival's car, in traffic, against the rival: recorded as main.ts records it.
  const sim = createSim(carHandling(route.car!), createAlderWorld(true, event.start), { race: event.race, rival: event.rival!, traffic: true, pedalAssist: 0 });
  let session: LapSession | null = null;
  try {
    const recorder = createLapRecorder(event.track), driver = createRivalDriver();
    for (let tick = 0; tick < 200 * TICK_HZ && !session; tick++) {
      const traffic = sim.state.traffic!.vehicles.map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }));
      const input = rivalInput(route, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, traffic, sim.state.rival!.vehicle);
      step(sim, input);
      if (!recordTick(recorder, input, sim.state.vehicle, sim.state.race, TICK_HZ)) continue;
      session = JSON.parse(JSON.stringify(lapSession(recorder, { id: "2026-09-20-120000-gen-crest-23", recordedAt: "2026-09-20T12:00:00.000Z", world: sim.roadWorld.id,
        arena: event.identity, rival: RIVAL_REVISION, physics: sim.state.physicsVersion, tickHz: TICK_HZ, race: event.race.id, layout: event.layout, solo: false, traffic: true,
        trafficRevision: TRAFFIC_REVISION, laps: event.race.laps ?? 1, car: route.car!, drivetrain: sim.state.drivetrain, carRevision: sim.state.handling.revision, pedalAssist: 0,
        start: sim.roadWorld.start }))) as LapSession;
    }
  } finally { sim.world.free(); }
  assert.ok(session, "the sprint was not finished");
  assert.equal(session.world, ALDER_VERSION);
  assert.equal(session.recorded.length, 1);
  assert.equal(session.recorded[0]!.gateTicks.length, event.race.checkpoints.length, "one lap is every gate of the race");
  assert.deepEqual(replayLapSession(session), { ok: true, laps: 1 });
  // Another draw of the same seed is another race, and is refused by name rather than compared.
  assert.match((replayLapSession({ ...session, arena: "generator-v0" }) as { reason: string }).reason, /generator generator-v0/);
  assert.match((replayLapSession({ ...session, rival: "full-line-v1" }) as { reason: string }).reason, /raced rival full-line-v1/);
  // The player against the rival, from the one input log. Whoever finished second is let finish.
  const compared = compareSession(session);
  assert.equal(compared.playerReproduced, true);
  assert.equal(compared.laps.length, 1);
  assert.ok(compared.laps[0]!.you !== null && compared.laps[0]!.rival !== null, "both should have a time for the race");
  assert.equal(compared.corners.length, event.race.checkpoints.length);
  assert.ok(Math.abs(compared.gainedInCorners + compared.gainedElsewhere - (compared.laps[0]!.rival! - compared.laps[0]!.you!)) < 1e-6);
});
