import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { SABLE } from "../src/sim/drift-yard.ts";
import { circuitEvent, circuitVenue } from "../src/sim/circuits.ts";
import { recordedEvent } from "../src/sim/recorded-event.ts";
import { createRace } from "../src/sim/race.ts";
import { RACING_LINE } from "../src/sim/racing-line.ts";
import { createLapRecorder, lapSession, recordTick, type LapSession } from "../src/sim/lap-recorder.ts";
import { recordedWorld, replayLapSession } from "../src/sim/lap-replay.ts";
import { createRivalDriver, rivalInput, sampleRivalPath, withExits } from "../src/sim/rival.ts";
import { NO_RIVAL } from "../src/sim/rival-revision.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { STADIUM, STADIUM_FLOOR, STADIUM_SOLIDS, STADIUM_VERSION, createStadiumWorld, inStadium, onStadiumPad } from "../src/sim/stadium.ts";
import { STADIUM_CIRCUIT, STADIUM_CIRCUIT_IDENTITY, STADIUM_LAYOUT_IDS, onStadiumCircuit, stadiumLap, type StadiumLayoutId } from "../src/sim/stadium-circuits.ts";
import { STADIUM_LAPS, stadiumEvent, stadiumRaceFor, stadiumRaceId } from "../src/sim/stadium-events.ts";

await RAPIER.init();

// The stadium's circuits (src/sim/stadium-circuits.ts, design/VENUES.md): two layouts on Ridge Circuit's construction,
// tight, a gate at every turn, raced in the venue.

const distanceToWall = (x: number, z: number) => {
  let best = Infinity;
  for (let i = 1; i < STADIUM_FLOOR.length; i++) {
    const a = STADIUM_FLOOR[i - 1]!, b = STADIUM_FLOOR[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
};

test("each layout closes, keeps its length, and has a gate at every turn in order", () => {
  // Lengths are pinned: recordings depend on them. Moving the asphalt bumps STADIUM_CIRCUIT.revision.
  const expected: Record<StadiumLayoutId, { length: number; turns: number }> = { full: { length: 1913.7, turns: 12 }, short: { length: 1258.2, turns: 8 } };
  for (const id of STADIUM_LAYOUT_IDS) {
    const lap = stadiumLap(id);
    assert.ok(Math.abs(lap.length - expected[id].length) < .1, `${id} is ${lap.length.toFixed(1)} m`);
    assert.equal(lap.corners.length, expected[id].turns);
    assert.equal(lap.gates.length, expected[id].turns + 1, `${id}: a gate per turn and the finish`);
    for (let i = 1; i < lap.gates.length; i++) assert.ok(lap.gates[i]!.along > lap.gates[i - 1]!.along, `${id}: gate ${i} is out of order`);
    // Every turn's gate lies within its own arc.
    const arcs = [...lap.corners].sort((a, b) => a.from - b.from);
    arcs.forEach((corner, i) => assert.ok(lap.gates[i]!.along > corner.from && lap.gates[i]!.along < corner.to, `${id}: gate ${i} is not on ${corner.id}'s arc`));
    assert.equal(lap.gates.at(-1)!.along, lap.length);
  }
  assert.equal(STADIUM_CIRCUIT_IDENTITY, "stadium-circuits-v1");
});

test("the circuits clear the arena's walls by 5 m and anything standing by 3 m past the shoulder", () => {
  const reach = STADIUM_CIRCUIT.width / 2 + STADIUM_CIRCUIT.shoulder;
  // The venue holds no props (STADIUM_SOLIDS); Sable's parked car is what stands on its floor in free drive.
  const solids = [...STADIUM_SOLIDS.map((s, i) => ({ id: `solid-${i}`, ...s })), { id: "sable", x: SABLE.start.x, z: SABLE.start.z, width: 5, depth: 5 }];
  for (const id of STADIUM_LAYOUT_IDS) for (const p of stadiumLap(id).points) {
    assert.ok(inStadium(p.x, p.z), `${id} leaves the bowl at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    assert.ok(distanceToWall(p.x, p.z) - reach >= 5, `${id} is ${(distanceToWall(p.x, p.z) - reach).toFixed(1)} m from the wall at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    for (const s of solids) {
      const d = Math.hypot(Math.max(0, Math.abs(p.x - s.x) - s.width / 2), Math.max(0, Math.abs(p.z - s.z) - s.depth / 2));
      assert.ok(d - reach >= 3, `${id} passes ${s.id} ${(d - reach).toFixed(1)} m past the shoulder`);
    }
  }
});

test("the venue's floor is asphalt on the circuits, shoulders included, and dirt beside them", () => {
  const world = createStadiumWorld();
  const reach = STADIUM_CIRCUIT.width / 2 + STADIUM_CIRCUIT.shoulder;
  let dirt = 0;
  for (const id of STADIUM_LAYOUT_IDS) {
    const points = stadiumLap(id).points;
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length]!, l = Math.hypot(next.x - p.x, next.z - p.z);
      const nx = -(next.z - p.z) / l, nz = (next.x - p.x) / l;
      for (const offset of [0, reach - .1, -(reach - .1)]) {
        assert.equal(world.ground!(p.x + nx * offset, p.z + nz * offset), false, `${id} is dirt ${offset.toFixed(1)} m off its centre at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
      }
      // A metre past the shoulder is dirt, unless another stretch of asphalt or Sable's apron is there.
      const x = p.x + nx * (reach + 1), z = p.z + nz * (reach + 1);
      if (!onStadiumPad(x, z) && !onStadiumCircuit(x, z)) { assert.equal(world.ground!(x, z), true); dirt++; }
    });
  }
  assert.ok(dirt > 300, `only ${dirt} samples beside the circuits found dirt`);
  assert.equal(onStadiumCircuit(-900, 1029), false, "the west infield is paved");
});

test("each layout is a lapped stadium race whose rival line passes through every gate, from a grid on the asphalt", () => {
  for (const id of STADIUM_LAYOUT_IDS) {
    const event = stadiumEvent(id);
    assert.deepEqual(stadiumRaceFor(event.race.id), { layout: id, solo: false });
    assert.equal(event.race.id, stadiumRaceId(id));
    assert.equal(event.race.laps, STADIUM_LAPS);
    assert.equal(event.race.checkpoints.length, STADIUM_LAPS * stadiumLap(id).gates.length);
    assert.equal(circuitVenue(circuitEvent(event.race.id)!), "stadium");
    assert.equal(recordedEvent(event.race.id)?.venue, "stadium");
    assert.equal(recordedWorld(recordedEvent(event.race.id)!).id, STADIUM_VERSION);
    createRace(event.race);
    const rival = event.rival!;
    const race = withExits(event.race, rival);
    assert.equal(race.checkpoints.filter(g => !g.exit).length, 1, "only the finish has no arrow");
    const reach = STADIUM_CIRCUIT.width / 2 - RACING_LINE.edgeMargin;
    rival.gates.forEach((distance, i) => {
      const at = sampleRivalPath(rival, distance), gate = event.race.checkpoints[i]!;
      assert.ok(Math.hypot(at.x - gate.x, at.z - gate.z) <= reach + 1e-6 && reach < STADIUM_CIRCUIT.gateRadius, `${id}: gate ${i} (${gate.name}) is off the line`);
    });
    const line = stadiumLap(id).points[0]!;
    for (const slot of [event.start, rival.start]) {
      assert.equal(createStadiumWorld().ground!(slot.x, slot.z), false, `${id}: a grid slot is on dirt`);
      assert.ok(Math.hypot(slot.x - line.x, slot.z - line.z) < 14);
      assert.equal(slot.y, STADIUM.base);
    }
    const solo = stadiumEvent(id, 3, true);
    assert.equal(solo.rival, null);
    assert.equal(solo.race.id, stadiumRaceId(id, true));
    assert.deepEqual(solo.race.checkpoints.map(g => [g.x, g.z]), event.race.checkpoints.map(g => [g.x, g.z]));
  }
  assert.equal(stadiumRaceFor("stadium-long"), null);
  assert.equal(circuitVenue(circuitEvent("arena-full")!), null);
  assert.throws(() => stadiumEvent("full", 0));
});

// Measured 2026-09-25 with Moth's Kestrel on its racing line: Full 69.3 s, Short 47.9 s, flying. The limits leave
// about as much room as Ridge's do. What catches a rival driving badly is the rest: finishing, no resets or
// recoveries, never on the dirt.
test("the rival drives both layouts clean: finished, no resets, never on the dirt", () => {
  const limits: Record<StadiumLayoutId, number> = { full: 71, short: 49.5 };
  for (const id of STADIUM_LAYOUT_IDS) {
    const event = stadiumEvent(id, 2);
    const sim = createSim("awd", createStadiumWorld(event.start), { race: event.race, rival: event.rival!, traffic: false });
    try {
      // The player waits on Sable's apron between the east runs, well off both layouts.
      sim.body.setTranslation({ x: -300, y: STADIUM.base + .5, z: 1023 }, true);
      let dirt = 0;
      for (let tick = 0; tick < TICK_HZ * 300 && !sim.state.rival!.race.finished; tick++) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
        if (sim.state.rival!.vehicle.groundContact > 0) dirt++;
      }
      const rival = sim.state.rival!, per = event.race.gatesPerLap!;
      assert.ok(rival.race.finished, `${id}: the rival did not finish (gate ${rival.race.checkpoint})`);
      const flying = (rival.race.splits[per * 2 - 1]! - rival.race.splits[per - 1]!) / TICK_HZ;
      assert.ok(flying < limits[id], `${id}: flying lap ${flying.toFixed(1)} s`);
      assert.equal(rival.driver.resets, 0, `${id}: resets`);
      assert.equal(rival.driver.recoveries, 0, `${id}: recoveries`);
      assert.equal(dirt, 0, `${id}: on the dirt for ${dirt} ticks`);
    } finally { sim.world.free(); }
  }
});

test("a lap recorded in the stadium replays there, and is refused anywhere else", () => {
  // Two laps of Short, solo, the player driven along the rival's line by the rival's own controller, as
  // tests/lap-recorder.test.ts drives Ridge.
  const event = stadiumEvent("short", 2, true), line = stadiumEvent("short", 2, false).rival!;
  const sim = createSim(carHandling(line.car!), recordedWorld({ ...event, comparable: true }), { race: event.race, traffic: false });
  let session: LapSession;
  try {
    const recorder = createLapRecorder(event.track), driver = createRivalDriver();
    for (let tick = 0; tick < TICK_HZ * 200 && !sim.state.race!.finished; tick++) {
      const input = rivalInput(line, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, []);
      step(sim, input);
      recordTick(recorder, input, sim.state.vehicle, sim.state.race, TICK_HZ);
    }
    assert.ok(sim.state.race!.finished, "the scripted run did not finish");
    assert.equal(recorder.laps.length, 2);
    for (const lap of recorder.laps) assert.equal(lap.valid, true, `lap ${lap.lap}: ${lap.reasons.join(", ")}`);
    session = JSON.parse(JSON.stringify(lapSession(recorder, { id: "2026-09-25-120000-stadium-short-solo", recordedAt: "2026-09-25T12:00:00.000Z",
      world: sim.roadWorld.id, arena: STADIUM_CIRCUIT_IDENTITY, rival: NO_RIVAL, physics: sim.state.physicsVersion, tickHz: TICK_HZ,
      race: event.race.id, layout: event.layout, solo: true, laps: 2, car: line.car!, drivetrain: sim.state.drivetrain,
      carRevision: sim.state.handling.revision, start: event.start }))) as LapSession;
  } finally { sim.world.free(); }
  assert.equal(session.world, STADIUM_VERSION);
  assert.deepEqual(replayLapSession(session), { ok: true, laps: 2 });
  const elsewhere = replayLapSession({ ...session, world: "alder-somewhere" });
  assert.equal(elsewhere.ok, false);
  assert.match((elsewhere as { reason: string }).reason, /world/);
});
