import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { arenaEvent } from "../src/sim/arena-events.ts";
import { ARENA, arenaLap } from "../src/sim/arena.ts";
import { projectOntoPathUnindexed } from "../src/sim/street-path.ts";
import { createAlderWorld } from "../src/sim/alder.ts";
import { createLapRecorder, recordTick } from "../src/sim/lap-recorder.ts";
import { HAIRPIN, RACING_LINE, STREET_RACING_LINE, withRacingLine } from "../src/sim/racing-line.ts";
import { createRivalDriver, RIVAL_STREET_LINE, rivalInput, sampleRivalPath, type RivalDefinition } from "../src/sim/rival.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { STREET_GATE_RADIUS, streetCircuitEvent } from "../src/sim/street-circuit.ts";
import type { CoursePoint } from "../src/sim/track.ts";
await RAPIER.init();

/** One lap of a layout's centreline from the rival's grid slot, before a line is drawn through it. */
function centreline(layout: "full" | "east" | "ridge"): RivalDefinition {
  const start = arenaEvent(layout, 1, false).rival!.start;
  const lap = arenaLap(layout);
  const points: CoursePoint[] = [start, ...lap.points, lap.points[0]!]
    .map(p => ({ x: p.x, z: p.z, y: 0, width: ARENA.width, zone: "boulevard" as const }));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  return { id: "centre", start, points, along, gates: [along.at(-1)!] };
}
function radiusAt(route: RivalDefinition, distance: number) {
  const a = sampleRivalPath(route, distance - 8), b = sampleRivalPath(route, distance), c = sampleRivalPath(route, distance + 8);
  const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
  const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  return cross < 1e-9 ? Infinity : ab * bc * ac / (2 * cross);
}

test("the line stays on the road, is the same every time, and keeps the route's gates in place", () => {
  const route = centreline("full");
  const line = withRacingLine(route);
  assert.deepEqual(withRacingLine(route), line, "the same route drew a different line");
  const limit = ARENA.width / 2 - RACING_LINE.edgeMargin;
  assert.equal(line.lateral!.length, line.points.length);
  for (let i = 0; i < line.points.length; i++) {
    const p = line.points[i]!;
    assert.ok(Math.abs(line.lateral![i]!) <= limit + 1e-9);
    assert.ok(projectOntoPathUnindexed(route.points, p.x, p.z).distance <= limit + 1e-6, `sample ${i} leaves the road`);
    if (i) assert.ok(line.along[i]! > line.along[i - 1]!);
  }
  assert.ok(Math.max(...line.lateral!.map(Math.abs)) > limit * 0.9, "the line never used the road's width");
  const end = line.points.at(-1)!, finish = route.points.at(-1)!;
  assert.equal(line.gates.length, 1);
  assert.equal(line.gates[0], line.along.at(-1));
  assert.ok(Math.hypot(end.x - finish.x, end.z - finish.z) < 1e-9, "the route's ends stay on the centre");
});

// Recorded laps (2026-09-13) drove T2 at a 39-41 m radius, the Jog at 25-26 and
// T9's tightening exit at 83-84, where the centreline is 25, 16 and 39. The line
// gets close: 37, 25 and 82. It widens every tight corner by at least 30%.
test("the line widens the corners the recorded laps widened", () => {
  const route = centreline("full"), line = withRacingLine(route), lap = arenaLap("full");
  // The route starts at the grid slot, a few metres behind the line.
  const lead = route.along[1]!;
  const expected: Record<string, number> = { t2: 35, "jog-in": 23, "main-straight": 75 };
  for (const [id, atLeast] of Object.entries(expected)) {
    const corner = lap.corners.find(c => c.id === id)!;
    const middle = lead + (corner.from + corner.to) / 2;
    let tightestCentre = Infinity, tightestLine = Infinity;
    for (let d = middle - 60; d <= middle + 60; d += 2) {
      tightestCentre = Math.min(tightestCentre, radiusAt(route, d));
      // The line is shorter than the centreline; find the same place on it.
      const here = sampleRivalPath(route, d);
      tightestLine = Math.min(tightestLine, radiusAt(line, projectOntoPathUnindexed(line.points, here.x, here.z).along));
    }
    assert.ok(tightestLine > tightestCentre * 1.3 && tightestLine > atLeast,
      `${id}: line radius ${tightestLine.toFixed(1)} m against the centreline's ${tightestCentre.toFixed(1)} m`);
  }
});

test("path sampling finds the same segment a scan from the start would", () => {
  const line = withRacingLine(centreline("ridge"));
  const scan = (distance: number) => {
    distance = Math.max(0, Math.min(line.along.at(-1)!, distance));
    let i = 0;
    while (i < line.points.length - 2 && line.along[i + 1]! < distance) i++;
    return i;
  };
  for (let d = -10; d < line.along.at(-1)! + 10; d += 0.73) assert.equal(sampleRivalPath(line, d).index, scan(d), `at ${d.toFixed(2)} m`);
  for (const d of line.along) assert.equal(sampleRivalPath(line, d).index, scan(d));
});

test("passing on a racing line never aims the rival off the road", () => {
  // A straight 14 m road whose line sits at its right-hand limit, and a slower
  // player just left of it: the pass wants the right, where there is no room.
  const limit = ARENA.width / 2 - RACING_LINE.edgeMargin;
  const points: CoursePoint[] = [[limit, 0], [limit, -2000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width: ARENA.width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "edge", start: { x: limit, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 2000], gates: [2000], lateral: [limit, limit] };
  const vehicle = { ...createSim("awd").state.vehicle, x: limit, z: -100, heading: 0, speed: 30, forwardSpeed: 30 };
  const driver = { ...createRivalDriver(), along: 100, progressMark: 100 };
  const race = { checkpoint: 0, collected: [], targetIndex: 0, countdown: 0, ticks: 1, splits: [], finished: false, next: null };
  let moved = false;
  for (let tick = 0; tick < 240; tick++) {
    rivalInput(route, { vehicle, driver, race }, [], { x: limit - 1, y: 0, z: -110, speed: 18, heading: 0 });
    const aim = limit + driver.avoidance;
    moved ||= driver.avoidance !== 0;
    assert.ok(Math.abs(aim) <= ARENA.width / 2 - 2.2 + 1e-9, `tick ${tick}: aiming ${aim.toFixed(2)} m from the centre of a 14 m road`);
  }
  assert.ok(moved, "the rival never tried to pass; the test proves nothing");
});

// A street's corners are single vertices: right angles and one hairpin on Uptown Circuit. Drawn with RACING_LINE
// (2026-09-20) a corner came out as a 23 m arc on one lap and a 4 m spike on the next, by where the solver's coarse
// nodes landed on it, and the rival orbited the spike at full lock: what read as "lap 1 is broken".
test("a street's line is sound at every corner of every lap, the hairpin included", () => {
  // The race in traffic has the centreline; the clear race's rival is this line, drawn once already.
  const event = streetCircuitEvent(3, true, false), route = event.rival!, line = withRacingLine(route, STREET_RACING_LINE);
  const perLap = event.race.gatesPerLap!;
  assert.deepEqual(withRacingLine(route, STREET_RACING_LINE), line, "the same route drew a different line");
  assert.deepEqual(streetCircuitEvent(3, false, false).rival!.points, line.points, "Uptown / Clear's rival is not on this line");
  // A line through a line doubles the offsets, and was once written up as the solver leaving the road.
  assert.throws(() => withRacingLine(line, STREET_RACING_LINE), /already carries a racing line/);
  // No spike anywhere: a 15 m arc turns 15 degrees a sample, and the kinks were 118 to 166.
  for (let i = 1; i < line.points.length - 1; i++) {
    const o = line.points[i - 1]!, p = line.points[i]!, q = line.points[i + 1]!;
    const turn = Math.abs(Math.atan2((p.x - o.x) * (q.z - p.z) - (p.z - o.z) * (q.x - p.x), (p.x - o.x) * (q.x - p.x) + (p.z - o.z) * (q.z - p.z))) * 180 / Math.PI;
    assert.ok(turn < 45, `the line turns ${turn.toFixed(0)} degrees at one sample, ${line.along[i]!.toFixed(0)} m along`);
    assert.ok(line.along[i]! > line.along[i - 1]!);
  }
  const tightest = (gate: number) => {
    let radius = Infinity;
    for (let d = -60; d <= 60; d++) radius = Math.min(radius, radiusAt(line, gate + d));
    return radius;
  };
  let hairpins = 0;
  for (let g = 0; g < perLap - 1; g++) {
    const laps = [0, 1, 2].map(lap => tightest(line.gates[lap * perLap + g]!));
    // The tightest is the 98 degree turn from Harrison Terrace onto Broadway, at 15 m. The car's own circle at full lock is 8.4.
    for (const [lap, radius] of laps.entries()) assert.ok(radius > 12, `gate ${g + 1}, lap ${lap + 1}: the line pinches to ${radius.toFixed(1)} m`);
    // The same corner is the same corner on every lap, or near it: the solver may settle either side of a following bend.
    assert.ok(Math.min(...laps) > Math.max(...laps) * 0.7, `gate ${g + 1}: ${laps.map(r => r.toFixed(1)).join(", ")} m over three laps`);
    // Still a gate the line takes: a hairpin's line runs inside its vertex, and must stay within reach of the gate there.
    const v = route.along.findIndex(a => Math.abs(a - route.gates[g]!) < 1e-6);
    const before = route.points[v - 1]!, vertex = route.points[v]!, after = route.points[v + 1]!, at = sampleRivalPath(line, line.gates[g]!);
    const from = Math.hypot(at.x - vertex.x, at.z - vertex.z);
    assert.ok(from < STREET_GATE_RADIUS - 4, `gate ${g + 1}: the line passes ${from.toFixed(1)} m from a gate ${STREET_GATE_RADIUS} m wide`);
    const turn = Math.abs(Math.atan2((vertex.x - before.x) * (after.z - vertex.z) - (vertex.z - before.z) * (after.x - vertex.x),
      (vertex.x - before.x) * (after.x - vertex.x) + (vertex.z - before.z) * (after.z - vertex.z))) * 180 / Math.PI;
    if (turn <= HAIRPIN.from) continue;
    hairpins++;
    // Rounded, so its line runs well inside the vertex, over the asphalt the two legs share.
    assert.ok(from > HAIRPIN.gateReach / 2, `the hairpin's line passes only ${from.toFixed(1)} m inside its vertex`);
    assert.ok(Math.min(...laps) > 14, `the hairpin's line is a ${Math.min(...laps).toFixed(1)} m arc`);
  }
  assert.equal(hairpins, 1, "Uptown has one hairpin; if this is 0 the rounding is not being tested");
});

test("the rival drives a street's line from the grid: a clean first lap, no reset, no reverse, no wheel off the pavement", () => {
  // Uptown / Clear as the game fields it: the street line at RIVAL_STREET_LINE's 0.88.
  const event = streetCircuitEvent(2, false, false), line = event.rival!;
  assert.equal(line.cornering, RIVAL_STREET_LINE.speedFactor);
  // The player is parked at Wharf Garage, across the city, so nothing here is contact.
  const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race: event.race, rival: line, traffic: false });
  try {
    const recorder = createLapRecorder(event.track);
    let offPavement = 0, slowest = Infinity;
    for (let tick = 0; tick < 240 * TICK_HZ && !sim.state.rival!.race.finished; tick++) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const rival = sim.state.rival!;
      recordTick(recorder, rival.input, rival.vehicle, rival.race, TICK_HZ);
      if (rival.vehicle.groundContact > 0) offPavement++;
      if (rival.race.ticks > 10 * TICK_HZ) slowest = Math.min(slowest, rival.vehicle.speed);
    }
    const driver = sim.state.rival!.driver, [first, second] = recorder.laps;
    assert.equal(recorder.laps.length, 2, "the rival did not finish");
    assert.deepEqual([first!.reasons, second!.reasons], [[], []]);
    assert.deepEqual([driver.resets, driver.unseenResets, driver.recoveries, offPavement], [0, 0, 0, 0]);
    // A standing start costs about two seconds. On the old line lap 1 was 7.5 s behind, and 16 with tighter margins.
    assert.ok(first!.seconds - second!.seconds < 4, `lap 1 ${first!.seconds.toFixed(2)} s against lap 2's ${second!.seconds.toFixed(2)}`);
    // At a spike it orbited at 14.5 mph; the hairpin's line is driven at about 30.
    assert.ok(slowest > 10, `it slowed to ${(slowest * 2.23694).toFixed(1)} mph`);
    // Its pace is a decision (Shawn, 2026-09-20): 1:27.07, against his 1:27.53 and 1:26.47 racing it. Lane arcs lap in
    // 1:35.18 and a plan of 1.00 in 1:24.80, so a lap outside this is a different rival: look at RIVAL_STREET_LINE.
    assert.ok(second!.seconds > 86 && second!.seconds < 88.5, `a flying lap of ${second!.seconds.toFixed(2)} s`);
  } finally { sim.world.free(); }
});
