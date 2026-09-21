import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import RAPIER from "@dimforge/rapier3d-compat";
import { arenaEvent, arenaRaceFor } from "../src/sim/arena-events.ts";
import { ALDER_VERSION, createAlderWorld } from "../src/sim/alder.ts";
import { ARENA_IDENTITY } from "../src/sim/arena.ts";
import { createLapRecorder, lapSession, recordTick, TRACK_LIMITS, LAP_CHANNELS, type LapSession, type LapTrack } from "../src/sim/lap-recorder.ts";
import { replayLapSession } from "../src/sim/lap-replay.ts";
import { createRivalDriver, rivalInput, RIVAL_REVISION } from "../src/sim/rival.ts";
import { carHandling, createSim, step, PHYSICS_VERSION, TICK_HZ, type VehicleState } from "../src/sim/sim.ts";
import type { RaceState } from "../src/sim/race.ts";
import { createLapSaver, lapSessionId } from "../src/recording/save-laps.ts";
import { lapsMiddleware } from "../scripts/laps-server.mjs";
await RAPIER.init();

test("a solo race is the same race with nobody else on the circuit", () => {
  assert.deepEqual(arenaRaceFor("arena-ridge-solo"), { layout: "ridge", solo: true });
  assert.deepEqual(arenaRaceFor("arena-ridge"), { layout: "ridge", solo: false });
  assert.equal(arenaRaceFor("arena-ridge-duo"), null);
  const solo = arenaEvent("ridge", 3, true), raced = arenaEvent("ridge", 3, false);
  assert.equal(solo.rival, null);
  assert.equal(solo.race.id, "arena-ridge-solo");
  assert.match(solo.race.name, /Solo$/);
  assert.deepEqual(solo.race.checkpoints.map(g => [g.x, g.z, g.radius]), raced.race.checkpoints.map(g => [g.x, g.z, g.radius]));
  assert.deepEqual(solo.start, raced.start);
  const sim = createSim("rwd", createAlderWorld(true, solo.start), { race: solo.race, traffic: false });
  try { assert.equal(sim.state.rival, null); assert.equal(sim.state.traffic, null); } finally { sim.world.free(); }
});

/** Two laps of Ridge, solo, the player driven along the centreline by the rival's own controller,
 *  in the car that line names (the Kestrel), so the planner and the tyres agree and the session
 *  records the car and revision it was actually driven in, as main.ts does. */
function drive(laps = 2, pedalAssist = 1) {
  const event = arenaEvent("ridge", laps, true);
  const line = arenaEvent("ridge", laps, false).rival!;
  const sim = createSim(carHandling(line.car!), createAlderWorld(true, event.start), { race: event.race, traffic: false, pedalAssist });
  const recorder = createLapRecorder(event.track);
  const driver = createRivalDriver();
  const completed: number[] = [];
  for (let tick = 0; tick < TICK_HZ * 200 && !sim.state.race!.finished; tick++) {
    const input = rivalInput(line, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, []);
    step(sim, input);
    const lap = recordTick(recorder, input, sim.state.vehicle, sim.state.race, TICK_HZ);
    if (lap) completed.push(tick);
  }
  const session = lapSession(recorder, { id: "2026-09-13-120000-arena-ridge-solo", recordedAt: "2026-09-13T12:00:00.000Z",
    world: sim.roadWorld.id, arena: ARENA_IDENTITY, rival: RIVAL_REVISION, physics: sim.state.physicsVersion, tickHz: TICK_HZ, race: event.race.id, layout: event.layout, solo: true,
    laps, car: line.car!, drivetrain: sim.state.drivetrain, carRevision: sim.state.handling.revision,
    ...(pedalAssist !== 1 ? { pedalAssist } : {}), start: event.start });
  const result = { event, sim, recorder, completed, session: JSON.parse(JSON.stringify(session)) as LapSession };
  sim.world.free();
  return result;
}

test("laps are cut where the race's gates cut them, every tick sampled, from the grid behind the line", () => {
  const { event, sim, recorder, completed, session } = drive();
  const race = sim.state.race!;
  assert.ok(race.finished);
  assert.equal(completed.length, 2);
  assert.equal(recorder.inputs.throttle.length, sim.state.tick, "the input log misses ticks");
  const [one, two] = session.recorded;
  assert.ok(one && two);
  assert.equal(one.standingStart, true); assert.equal(two.standingStart, false);
  assert.equal(one.startTick, 0); assert.equal(two.startTick, one.endTick);
  assert.equal(two.endTick, race.splits.at(-1));
  for (const lap of session.recorded) {
    assert.equal(lap.valid, true, `lap ${lap.lap}: ${lap.reasons.join(", ")}`);
    assert.equal(lap.gateTicks.length, event.track.gatesPerLap);
    assert.equal(lap.gateTicks.at(-1), lap.endTick);
    assert.equal(lap.seconds, (lap.endTick - lap.startTick) / TICK_HZ);
    for (const channel of LAP_CHANNELS) assert.equal(lap.samples[channel].length, lap.endTick - lap.startTick, `${channel} is not one sample a tick`);
    assert.deepEqual(lap.samples.tick, Array.from({ length: lap.endTick - lap.startTick }, (_, i) => lap.startTick + 1 + i));
    // Measured from the centreline, going forwards. The track is 14 m wide and the line gets 4.4 m from its centre; at
    // the bend 768 m round, the controller runs out to the edge: 6.97 m at full-line-v31, which sat at 99.6% of a bound
    // of 7, and 7.12 m at v32, 0.15 s a lap quicker. No wheel leaves the pavement in either and the laps are valid. This
    // checks that offsets are the centreline's, not how well the rival tracks; tests/rival-racing.test.ts does that.
    assert.ok(lap.samples.offset.every(offset => Math.abs(offset) < 7.5), `lap ${lap.lap} left the racing width`);
    const distance = lap.samples.distance;
    for (let i = 1; i < distance.length; i++) assert.ok(distance[i]! > distance[i - 1]! - 0.5, `lap ${lap.lap} ran backwards at sample ${i}`);
    // The finish gate is a 12 m circle round the line, so a lap ends up to 12 m short of it.
    assert.ok(distance.at(-1)! > recorder.length - 13 && distance.at(-1)! <= recorder.length, `lap ${lap.lap} ends at ${distance.at(-1)}`);
  }
  assert.ok(one.samples.distance[0]! < -8 && one.samples.distance[0]! > -16, `the grid is ${one.samples.distance[0]} m from the line`);
  assert.ok(two.samples.distance[0]! < 0 && two.samples.distance[0]! > -13);
  assert.ok(two.seconds < one.seconds, "a flying lap should beat the standing start");
});

test("a recording replays exactly, and one changed input or another build is caught", () => {
  const { session } = drive();
  assert.deepEqual(replayLapSession(session), { ok: true, laps: 2 });
  const nudged = structuredClone(session);
  const at = TICK_HZ * 20;
  nudged.inputs.steer[at] = nudged.inputs.steer[at]! > 0 ? -1 : 1;
  const result = replayLapSession(nudged);
  assert.equal(result.ok, false, "a changed input replayed identically");
  assert.match((result as { reason: string }).reason, /lap 1/);
  assert.match((replayLapSession({ ...session, physics: "four-wheel-v0" }) as { reason: string }).reason, /physics four-wheel-v0/);
  assert.match((replayLapSession({ ...session, world: "alder-old" }) as { reason: string }).reason, new RegExp(ALDER_VERSION));
  // A recording from before the circuit's current layout names no revision, or an older one.
  const { arena: _arena, ...unnamed } = session;
  assert.match((replayLapSession(unnamed as LapSession) as { reason: string }).reason, /circuit ridge-circuit-v1/);
  assert.equal(session.physics, PHYSICS_VERSION);
});

// The game drives the player with no pedal assist since 2026-09-20 (sim/pedal-assist.ts),
// so a lap has to say what its tyres forgave, or nothing recorded from then on replays.
test("a lap replays on the assist it was driven on, and one that claims another is caught", () => {
  const raw = drive(1, 0);
  assert.equal(raw.session.pedalAssist, 0);
  assert.deepEqual(replayLapSession(raw.session), { ok: true, laps: 1 });
  // The same inputs on the clamp are a different lap.
  const { pedalAssist: _assist, ...claimsTheClamp } = raw.session;
  assert.equal(replayLapSession(claimsTheClamp as LapSession).ok, false, "a lap driven with no assist replayed as one driven on the clamp");
  // And a session from before the field, or a drag since, names none and is driven on the clamp, as it was.
  const clamped = drive(1);
  assert.equal("pedalAssist" in clamped.session, false);
  assert.deepEqual(replayLapSession(clamped.session), { ok: true, laps: 1 });
  assert.equal(replayLapSession({ ...clamped.session, pedalAssist: 0 }).ok, false);
});

/** A fake run along a track: position `distance` metres round the lap, on the centreline plus `offset`. */
function along(track: LapTrack, distance: number, offset = 0) {
  const points = track.points;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  let d = ((distance % length) + length) % length;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l) { const ux = (b.x - a.x) / l, uz = (b.z - a.z) / l; return { x: a.x + ux * d - uz * offset, z: a.z + uz * d + ux * offset, length }; }
    d -= l;
  }
  throw new Error("off the end");
}
function fakeLap(track: LapTrack, path: { distance: number; ground?: number }[]) {
  const recorder = createLapRecorder(track);
  const race: RaceState = { checkpoint: 0, collected: [], targetIndex: 0, countdown: 0, ticks: 0, splits: [], finished: false, next: null };
  const input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
  let finished = null;
  path.forEach((point, i) => {
    race.ticks = i + 1;
    if (i === path.length - 1) { race.splits = Array(track.gatesPerLap).fill(race.ticks); race.checkpoint = track.gatesPerLap; }
    const at = along(track, point.distance);
    const vehicle = { x: at.x, z: at.z, heading: 0, speed: 30, lateralSpeed: 0, yawRate: 0, groundContact: point.ground ?? 0 } as VehicleState;
    finished = recordTick(recorder, input, vehicle, race, TICK_HZ) ?? finished;
  });
  return finished as unknown as { valid: boolean; reasons: string[]; offTrackTicks: number; fullyOffTicks: number } | null;
}

test("track limits: off too long, fully off once, or running backwards invalidates a lap and says why", () => {
  const track = arenaEvent("east", 1, true).track;
  const clean = Array.from({ length: 400 }, (_, i) => ({ distance: i * 5 - 10 }));
  assert.deepEqual(fakeLap(track, clean)?.reasons, []);
  const brushed = clean.map((p, i) => ({ ...p, ground: i >= 100 && i < 100 + TRACK_LIMITS.offTrackTicks ? 0.5 : 0 }));
  assert.equal(fakeLap(track, brushed)?.valid, true, "a second on the grass with two wheels is within limits");
  const long = clean.map((p, i) => ({ ...p, ground: i >= 100 && i <= 100 + TRACK_LIMITS.offTrackTicks ? 0.5 : 0 }));
  assert.deepEqual(fakeLap(track, long)?.reasons, ["off the track too long"]);
  const off = clean.map((p, i) => ({ ...p, ground: i === 200 ? 1 : 0 }));
  assert.deepEqual(fakeLap(track, off)?.reasons, ["left the track"]);
  const spun = clean.map((p, i) => ({ distance: i < 150 ? p.distance : i < 160 ? p.distance - (i - 149) * 8 : p.distance - 80 }));
  assert.deepEqual(fakeLap(track, spun)?.reasons, ["went backwards"]);
});

test("the dev endpoint writes a session by its id, replaces it, and refuses anything else", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-laps-"));
  const server = createServer(lapsMiddleware(dir));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const body = (id: string, laps = 1) => ({ format: "nightshift-laps-v1", id, recorded: Array(laps).fill({}), inputs: { throttle: [] } });
  const put = (path: string, value: unknown, source = origin) => fetch(origin + path, { method: "PUT", body: JSON.stringify(value),
    headers: { "Content-Type": "application/json", Origin: source } });
  try {
    const id = lapSessionId(new Date(2026, 8, 13, 9, 5, 7), "arena-full-solo");
    assert.equal(id, "2026-09-13-090507-arena-full-solo");
    assert.equal((await put(`/__laps/${id}`, body(id))).status, 200);
    assert.equal((await put(`/__laps/${id}`, body(id, 2))).status, 200);
    assert.equal(JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")).recorded.length, 2, "the second save did not replace the first");
    assert.equal((await put(`/__laps/${id}`, body(id), "https://example.com")).status, 403);
    assert.equal((await put(`/__laps/..%2Fescape`, body("../escape"))).status, 400);
    assert.equal((await put(`/__laps/other`, body(id))).status, 400, "an id that does not match its address");
    assert.equal((await put(`/__laps/${id}`, { ...body(id), format: "something-else" })).status, 400);
    assert.equal((await fetch(`${origin}/__laps/${id}`)).status, 405);
    assert.deepEqual(await readdir(dir), [`${id}.json`]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true });
  }
});

test("the saver reports a save only when the endpoint confirms one, in the order they were made", async () => {
  const session = { id: "s", recorded: [{}, {}] } as unknown as LapSession;
  const page = createLapSaver(async () => new Response("<!doctype html>", { status: 200 }));
  assert.deepEqual(await page(session), { ok: false, error: "recordings save only under pnpm dev" });
  const refused = createLapSaver(async () => Response.json({ error: "Recording is too large" }, { status: 413 }));
  assert.deepEqual(await refused(session), { ok: false, error: "Recording is too large" });
  const order: number[] = [];
  let calls = 0;
  const slowFirst = createLapSaver(async () => {
    const call = ++calls;
    await new Promise(resolve => setTimeout(resolve, call === 1 ? 30 : 0));
    order.push(call);
    return Response.json({ saved: "s.json", laps: call });
  });
  const results = await Promise.all([slowFirst(session), slowFirst(session)]);
  assert.deepEqual(order, [1, 2]);
  assert.deepEqual(results, [{ ok: true, laps: 1 }, { ok: true, laps: 2 }]);
});
