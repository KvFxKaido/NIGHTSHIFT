import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_STREETS, alderRouting, createAlderWorld, projectOntoAlder } from "../src/sim/alder.ts";
import { circuitEvent, isCircuitRace } from "../src/sim/circuits.ts";
import { createLapRecorder, lapSession, recordTick, type LapSession } from "../src/sim/lap-recorder.ts";
import { replayLapSession } from "../src/sim/lap-replay.ts";
import { laneOffset } from "../src/sim/lanes.ts";
import { createRivalDriver, rivalInput, RIVAL_REVISION, sampleRivalPath } from "../src/sim/rival.ts";
import { STREET_CIRCUIT_IDENTITY, STREET_GATE_RADIUS, streetCircuitEvent, streetCircuitRaceFor, streetCircuitRaceId, UPTOWN, uptownLap } from "../src/sim/street-circuit.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { TRAFFIC_KINDS, TRAFFIC_REVISION } from "../src/sim/traffic.ts";
await RAPIER.init();

// Recordings are compared lap against lap, so the lap cannot move. If this fails
// because the city changed, bump UPTOWN.revision: old recordings are then refused
// rather than compared with a different circuit.
test("Uptown Circuit is pinned: its streets join, it closes, and its length has not moved", () => {
  const lap = uptownLap();
  assert.ok(Math.abs(lap.length - 2977.24) < 0.5, `the lap is ${lap.length.toFixed(2)} m`);
  assert.equal(STREET_CIRCUIT_IDENTITY, "uptown-v1");
  const first = lap.points[0]!, last = lap.points.at(-1)!;
  assert.deepEqual([first.x, first.z], [last.x, last.z], "the lap does not close on its line");
  for (let i = 1; i < lap.points.length; i++) assert.ok(Math.hypot(lap.points[i]!.x - lap.points[i - 1]!.x, lap.points[i]!.z - lap.points[i - 1]!.z) < 150, `a gap in the lap at point ${i}`);
  // Every point of the lap is on one of its streets' centrelines.
  const ids = new Set<string>(UPTOWN.drives.map(d => d.street));
  for (const p of lap.points) assert.ok(ALDER_STREETS.some(s => ids.has(s.id) && s.points.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 0.01)) || p === first || p === last, `(${p.x}, ${p.z}) is not a point of the loop's streets`);
  // The line is on Uptown Link's straight, 120 m past the hairpin.
  assert.ok(projectOntoAlder(first.x, first.z).distance < 0.01);
});

test("a gate at every turn of the loop, each at a junction, the line last", () => {
  const lap = uptownLap();
  const graph = alderRouting();
  const junctions = new Set(graph.drives.flatMap(d => [d.from, d.to]));
  assert.deepEqual(lap.gates.map(g => Math.round(g.turn)), [58, 72, 64, 80, 67, 84, 98, 79, 52, 129, 0]);
  for (const gate of lap.gates.slice(0, -1)) {
    assert.ok(junctions.has(`${gate.x.toFixed(1)},${gate.z.toFixed(1)}`) || [...junctions].some(j => { const [x, z] = j.split(",").map(Number); return Math.hypot(x! - gate.x, z! - gate.z) < 0.01; }), `${gate.name} is not at a junction`);
  }
  for (let i = 1; i < lap.gates.length; i++) assert.ok(lap.gates[i]!.along > lap.gates[i - 1]!.along, "gates out of lap order");
  assert.equal(lap.gates.at(-1)!.along, lap.length);
  const event = streetCircuitEvent(3, true, false);
  assert.equal(event.race.checkpoints.length, 3 * lap.gates.length);
  assert.ok(event.race.checkpoints.every(g => g.radius === STREET_GATE_RADIUS));
  // The rival's route passes through every gate, where its gates say.
  event.rival!.gates.forEach((along, i) => {
    const at = sampleRivalPath(event.rival!, along), gate = event.race.checkpoints[i]!;
    assert.ok(Math.hypot(at.x - gate.x, at.z - gate.z) < 0.01, `gate ${i + 1} is ${Math.hypot(at.x - gate.x, at.z - gate.z).toFixed(2)} m off the route`);
  });
});

test("four races: traffic or clear, rival or solo, the same gates and grid, and arrows even solo", () => {
  assert.deepEqual(streetCircuitRaceFor("street-uptown"), { traffic: true, solo: false });
  assert.deepEqual(streetCircuitRaceFor("street-uptown-clear-solo"), { traffic: false, solo: true });
  assert.equal(streetCircuitRaceFor("street-uptown-solo-clear"), null);
  const variants = [[true, false], [true, true], [false, false], [false, true]] as const;
  const events = variants.map(([traffic, solo]) => streetCircuitEvent(3, traffic, solo));
  for (const [i, event] of events.entries()) {
    const [traffic, solo] = variants[i]!;
    assert.equal(event.race.id, streetCircuitRaceId(traffic, solo));
    assert.ok(isCircuitRace(event.race.id));
    assert.equal(circuitEvent(event.race.id)!.race.id, event.race.id);
    assert.equal(event.traffic, traffic); assert.equal(event.solo, solo); assert.equal(event.rival === null, solo);
    assert.deepEqual(event.start, events[0]!.start);
    assert.deepEqual(event.race.checkpoints.map(g => [g.x, g.z, g.exit]), events[0]!.race.checkpoints.map(g => [g.x, g.z, g.exit]));
    assert.ok(event.race.checkpoints.slice(0, -1).every(g => g.exit), `${event.race.id}: a gate has no arrow`);
  }
  // Grid: both cars in the lanes going the circuit's way, the player behind in the kerb lane.
  const event = events[0]!, lap = uptownLap();
  const kerb = laneOffset(lap.points[0]!.width, { direction: 1, index: 1 }), inner = laneOffset(lap.points[0]!.width, { direction: 1, index: 0 });
  assert.ok(Math.abs(projectOntoAlder(event.start.x, event.start.z).distance - kerb) < 0.05);
  assert.ok(Math.abs(projectOntoAlder(event.rival!.start.x, event.rival!.start.z).distance - inner) < 0.05);
  const sim = createSim("rwd", createAlderWorld(true, events[3]!.start), { race: events[3]!.race, traffic: false });
  try { assert.equal(sim.state.rival, null); assert.equal(sim.state.traffic, null); } finally { sim.world.free(); }
});

// Traffic is part of what replays: a session driven through it must reproduce
// tick for tick, or recordings in traffic are not evidence.
test("a lap driven through traffic replays exactly, and a changed input is caught", () => {
  const event = streetCircuitEvent(1, true, true);
  const line = streetCircuitEvent(1, true, false).rival!;
  // In the car the line names, so the planner and the tyres agree, recorded as main.ts records it.
  const sim = createSim(carHandling(line.car!), createAlderWorld(true, event.start), { race: event.race, traffic: true });
  let session: LapSession;
  try {
    assert.ok(sim.state.traffic, "no traffic on the street circuit");
    const recorder = createLapRecorder(event.track);
    const driver = createRivalDriver();
    for (let tick = 0; tick < TICK_HZ * 240 && !sim.state.race!.finished; tick++) {
      const traffic = sim.state.traffic!.vehicles.map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }));
      const input = rivalInput(line, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, traffic);
      step(sim, input);
      recordTick(recorder, input, sim.state.vehicle, sim.state.race, TICK_HZ);
    }
    assert.ok(sim.state.race!.finished, "the lap was not finished");
    session = JSON.parse(JSON.stringify(lapSession(recorder, { id: "2026-09-13-120000-street-uptown-solo", recordedAt: "2026-09-13T12:00:00.000Z",
      world: sim.roadWorld.id, arena: event.identity, rival: RIVAL_REVISION, physics: sim.state.physicsVersion, tickHz: TICK_HZ, race: event.race.id,
      layout: event.layout, solo: true, traffic: true, trafficRevision: TRAFFIC_REVISION, laps: 1, car: line.car!, drivetrain: sim.state.drivetrain, carRevision: sim.state.handling.revision, start: event.start }))) as LapSession;
  } finally { sim.world.free(); }
  assert.deepEqual(replayLapSession(session), { ok: true, laps: 1 });
  const nudged = structuredClone(session);
  nudged.inputs.steer[TICK_HZ * 30] = nudged.inputs.steer[TICK_HZ * 30]! > 0 ? -1 : 1;
  assert.equal(replayLapSession(nudged).ok, false, "a changed input replayed identically");
  assert.match((replayLapSession({ ...session, arena: "uptown-v0" }) as { reason: string }).reason, /circuit uptown-v0/);
  // A session in traffic replays only on the traffic that drove it, and says so.
  const { trafficRevision: _revision, ...older } = session;
  assert.match((replayLapSession(older as LapSession) as { reason: string }).reason, /from before traffic revisions/);
});
