import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { alderDrivable, createAlderWorld } from "../src/sim/alder.ts";
import { drawAlderCourse, fieldAlderRival } from "../src/sim/alder-course.ts";
import { createLapRecorder, recordTick } from "../src/sim/lap-recorder.ts";
import { BLACKLIST_CORNERING, createRivalDriver, RIVAL_CORNERING, RIVAL_STREET_LINE, rivalInput, sampleDrivingPath, type RivalDefinition } from "../src/sim/rival.ts";
import { BLACKLIST } from "../src/settings/blacklist.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { streetCircuitEvent } from "../src/sim/street-circuit.ts";
import { laneRest, readStreetLine, STREET_LINE } from "../src/sim/street-line.ts";
import { createTraffic, TRAFFIC_KINDS } from "../src/sim/traffic.ts";
await RAPIER.init();

const bare = (route: RivalDefinition): RivalDefinition => { const { line: _line, ...rest } = route; return rest; };

test("a stopped car withdraws a committed corner and the refusal persists after it leaves", () => {
  const route = fieldAlderRival(drawAlderCourse("gen-7", null).rival), line = route.line!;
  const corner = line.corners[0]!;
  const k = line.dx.findIndex((dx, i) => i * line.spacing >= corner.from &&
    i * line.spacing <= corner.to && Math.hypot(dx, line.dz[i]!) > STREET_LINE.shift);
  assert.ok(k >= 0);
  const world = createAlderWorld(true), network = world.traffic!, traffic = createTraffic(network);
  const sim = createSim(carHandling("cinder", "rwd"), world, { traffic: false });
  try {
    const driver = createRivalDriver();
    driver.along = corner.from; driver.lineBlend = 1;
    const car = { ...sim.state.vehicle, speed: 12 };
    const blocker = { ...traffic.vehicles[0]!, x: line.x[k]!, z: line.z[k]!, speed: 0 };
    readStreetLine(route, driver, car, 0, network, []);
    assert.equal(driver.lineGo, true);
    readStreetLine(route, driver, car, STREET_LINE.every, network, [blocker]);
    assert.equal(driver.lineGo, false, "a car that may pull out must revoke the line");
    const refused = driver.lineRefused!;
    const remote = { ...blocker, x: 1e6, z: 1e6 };
    readStreetLine(route, driver, car, STREET_LINE.every * 2, network, [remote]);
    assert.equal(driver.lineGo, false, "the line cannot flicker back on immediately");
    readStreetLine(route, driver, car, refused, network, [remote]);
    assert.equal(driver.lineGo, true, "a clear corner can reopen after the cooldown");
    driver.along = line.corners.at(-1)!.to + 1;
    readStreetLine(route, driver, car, refused + STREET_LINE.every, network, []);
    assert.equal(driver.lineGo, false, "finishing the last window returns to the lane");
  } finally { sim.world.free(); }
});

test("gen-82 rejects the folded corner without moving route gates or leaving paved ground", () => {
  const original = drawAlderCourse("gen-82", null).rival, route = fieldAlderRival(original), line = route.line!;
  assert.equal(route.points, original.points);
  assert.equal(route.along, original.along);
  assert.equal(route.gates, original.gates);
  assert.equal(fieldAlderRival(route), route, "fielding twice must not draw a second line");
  for (let k = 0; k < line.dx.length; k++) {
    const shift = Math.hypot(line.dx[k]!, line.dz[k]!);
    assert.ok(Number.isFinite(shift) && shift <= STREET_LINE.widest, `invalid shift at station ${k}`);
    if (shift >= STREET_LINE.shift) assert.ok(alderDrivable(line.x[k]!, line.z[k]!), `unpaved station ${k}`);
  }
});

// In traffic the rival keeps its lane and takes a racing line one corner at a time, when traffic's own forecast shows the
// corner clear (2026-09-20). The line rides on the route as a shift from the lane: a position at stations along it.
test("a street line is a shift from the lane: nothing between corners, never off ground a car may be on, into a corner never outside its lane", () => {
  for (const route of [streetCircuitEvent(3, true, false).rival!, fieldAlderRival(drawAlderCourse("gen-39", null).rival)]) {
    const line = route.line!;
    assert.ok(line, `${route.id} carries no street line`);
    assert.ok(line.corners.length >= 5, `${route.id}: ${line.corners.length} corners`);
    assert.equal(route.lateral, undefined, "the route itself stays a centreline: its gates, distances and resets are the lane rival's");
    let deepest = 0;
    for (let k = 0; k < line.dx.length; k++) {
      const at = k * line.spacing, shift = Math.hypot(line.dx[k]!, line.dz[k]!), inside = line.corners.some(corner => at >= corner.from && at <= corner.to);
      if (!inside) { assert.equal(shift, 0, `${route.id}: shifted ${shift.toFixed(2)} m from its lane ${at} m along, between corners`); continue; }
      deepest = Math.max(deepest, shift);
      assert.ok(shift <= STREET_LINE.widest);
      if (shift >= STREET_LINE.shift) assert.ok(alderDrivable(line.x[k]!, line.z[k]!), `${route.id}: the line is on ground a car may not be on, ${at} m along`);
    }
    // It does leave the lane: by more than a carriageway's margin allows, which is the corner being cut.
    assert.ok(deepest > 6, `${route.id}: the line is never more than ${deepest.toFixed(1)} m from its lane`);
    // Into a corner it stays in its lane or inside it. The swing out that a racing line makes is itself a bend, in the
    // braking zone: with it, the rival braked 50 m earlier than in its lane and gave back on every straight what it
    // gained in every corner (gen-39: 5.9 s gained in the corners, 0.3 s over the race).
    for (const corner of line.corners) {
      const from = corner.from / line.spacing, to = corner.to / line.spacing;
      let apex = from;
      for (let k = from; k <= to; k++) if (Math.hypot(line.dx[k]!, line.dz[k]!) > Math.hypot(line.dx[apex]!, line.dz[apex]!)) apex = k;
      // A wide exit can be farther from the lane than the apex. Read the turn from the road, not that exit shift.
      const entry = sampleDrivingPath(route, corner.from), exit = sampleDrivingPath(route, corner.to);
      const inward = Math.sign(entry.ux * exit.uz - entry.uz * exit.ux);
      for (let k = from; k < from + (apex - from) / 2; k++) {
        const here = sampleDrivingPath(route, k * line.spacing), across = (line.dx[k]! * -here.uz + line.dz[k]! * here.ux) * inward;
        assert.ok(across > -1, `${route.id}: ${(-across).toFixed(1)} m outside its lane on the way into the corner at ${corner.from} m`);
      }
    }
    // A 20 m road has two lanes each way: its inner lane is nearer the centre
    // than the single lane on a 14 m local road. Width alone is not monotonic.
    assert.ok(laneRest(12) > 0 && laneRest(14) > laneRest(12));
    assert.ok(laneRest(20) > 0 && laneRest(20) < laneRest(14));
  }
});

test("with no corner given to it, a route carrying a line is driven exactly as the route without one", () => {
  const course = drawAlderCourse("gen-7", null), lined = fieldAlderRival(course.rival), plain = bare(lined);
  const drive = (route: RivalDefinition) => {
    const sim = createSim(carHandling(route.car!), createAlderWorld(true, course.start ?? undefined), { race: course.race, traffic: true });
    const driver = createRivalDriver(), trail: number[] = [];
    try {
      for (let tick = 0; tick < 45 * TICK_HZ; tick++) {
        const obstacles = sim.state.traffic!.vehicles.map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }));
        step(sim, rivalInput(route, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, obstacles, null));
        if (tick % 30 === 0) trail.push(sim.state.vehicle.x, sim.state.vehicle.z, sim.state.vehicle.speed);
      }
    } finally { sim.world.free(); }
    return trail;
  };
  // Nothing reads the forecast here, so no corner is ever go: this is the rival of every race before the line.
  assert.deepEqual(drive(lined), drive(plain));
});

test("in traffic it takes the corners the forecast gives it: quicker, never touching anything while off its lane, and the same every time", () => {
  const event = streetCircuitEvent(1, true, false);
  const race = (rival: RivalDefinition) => {
    // The player is parked at Wharf Garage, across the city.
    const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race: event.race, rival, traffic: true });
    let onLine = 0, touchingOnLine = 0, offPavement = 0, furthest = 0;
    try {
      while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 200 * TICK_HZ) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
        const r = sim.state.rival!, car = r.vehicle, blend = r.driver.lineBlend ?? 0;
        if (blend > 0.5) onLine++;
        if (car.groundContact > 0) offPavement++;
        furthest = Math.max(furthest, blend);
        const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
        if (blend > 0.05 && sim.state.traffic!.vehicles.some(v => Math.abs((v.x - car.x) * fx + (v.z - car.z) * fz) < 2.1 + TRAFFIC_KINDS[v.kind].length / 2
          && Math.abs((v.x - car.x) * -fz + (v.z - car.z) * fx) < 0.95 + TRAFFIC_KINDS[v.kind].width / 2)) touchingOnLine++;
      }
      const r = sim.state.rival!;
      return { ticks: r.race.finished ? r.race.ticks : Infinity, onLine, touchingOnLine, offPavement, furthest, resets: r.driver.resets + r.driver.unseenResets, x: r.vehicle.x };
    } finally { sim.world.free(); }
  };
  const lined = race(event.rival!), again = race(event.rival!), lane = race(bare(event.rival!));
  assert.deepEqual(again, lined, "the same race came out differently");
  assert.ok(Number.isFinite(lined.ticks) && Number.isFinite(lane.ticks), "a lap was not finished");
  assert.equal(lane.furthest, 0);
  assert.ok(lined.furthest === 1 && lined.onLine > 15 * TICK_HZ, `on its line for ${(lined.onLine / TICK_HZ).toFixed(1)} s of the lap`);
  assert.deepEqual([lined.touchingOnLine, lined.offPavement, lined.resets], [0, 0, 0]);
  // 8 to 9 s a lap over the three-lap race; a first lap from the grid a little less.
  assert.ok(lined.ticks < lane.ticks - 5 * TICK_HZ, `${(lined.ticks / TICK_HZ).toFixed(2)} s with the line against ${(lane.ticks / TICK_HZ).toFixed(2)} s in its lane`);
});

// One number drove every name's corners until 2026-09-20. Shawn raced Uptown in traffic, "wasn't worried about losing",
// and asked for the per-driver numbers rather than catch-up: a better driver uses more of the grip the car always had.
test("each Blacklist name takes a line's corners at its own share of the grip, climbing the list, and only a line's corners", () => {
  assert.deepEqual(Object.keys(BLACKLIST_CORNERING).sort(), BLACKLIST.map(name => name.id).sort());
  const byRank = [...BLACKLIST].sort((a, b) => b.rank - a.rank);
  for (let i = 1; i < byRank.length; i++) {
    assert.ok(BLACKLIST_CORNERING[byRank[i]!.id]! > BLACKLIST_CORNERING[byRank[i - 1]!.id]!, `${byRank[i]!.name} corners no harder than ${byRank[i - 1]!.name}`);
  }
  // Never below what any rival does in its lane, never more grip than the tyres have.
  for (const share of Object.values(BLACKLIST_CORNERING)) assert.ok(share > RIVAL_CORNERING.speedFactor && share <= 1);
  const wake = drawAlderCourse("gen-wake-42", null).rival, fielded = fieldAlderRival(wake);
  assert.equal(wake.skill, BLACKLIST_CORNERING.wake);
  assert.equal(fielded.line!.cornering, BLACKLIST_CORNERING.wake);
  // It is the driver's, not the route's: the lane's corners stay every rival's (`cornering` would move them too).
  assert.equal(fielded.cornering, undefined);
  // A race with nobody's name on it, and the circuits, keep the one number. Uptown / Clear's pace is pinned elsewhere.
  const plain = drawAlderCourse("gen-7", null).rival;
  assert.equal("skill" in plain, false);
  assert.equal(fieldAlderRival(plain).line!.cornering, RIVAL_STREET_LINE.speedFactor);
  assert.equal(streetCircuitEvent(3, true, false).rival!.line!.cornering, RIVAL_STREET_LINE.speedFactor);
  assert.equal(streetCircuitEvent(3, false, false).rival!.cornering, RIVAL_STREET_LINE.speedFactor);
});

test("the three highest names' own cars hold their share on a driven lap of a clear street line", () => {
  // The ones nearest their limit: Wake's Reign puts a wheel off at 0.99 and is given 0.96.
  const event = streetCircuitEvent(1, false, false);
  for (const name of [...BLACKLIST].sort((a, b) => a.rank - b.rank).slice(0, 3)) {
    const rival: RivalDefinition = { ...event.rival!, car: name.car, cornering: BLACKLIST_CORNERING[name.id]! };
    const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race: event.race, rival, traffic: false });
    try {
      const recorder = createLapRecorder(event.track);
      let offPavement = 0;
      while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 150 * TICK_HZ) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
        const r = sim.state.rival!;
        recordTick(recorder, r.input, r.vehicle, r.race, TICK_HZ);
        if (r.vehicle.groundContact > 0) offPavement++;
      }
      const driver = sim.state.rival!.driver;
      assert.equal(recorder.laps.length, 1, `${name.name} did not finish the lap`);
      assert.deepEqual([recorder.laps[0]!.reasons, offPavement, driver.resets + driver.unseenResets, driver.recoveries], [[], 0, 0, 0],
        `${name.name}'s ${name.carName} at ${BLACKLIST_CORNERING[name.id]}`);
    } finally { sim.world.free(); }
  }
});
