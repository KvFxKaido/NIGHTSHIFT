import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { arenaEvent } from "../src/sim/arena-events.ts";
import { ARENA, arenaLap } from "../src/sim/arena.ts";
import { projectOntoPathUnindexed } from "../src/sim/street-path.ts";
import { RACING_LINE, withRacingLine } from "../src/sim/racing-line.ts";
import { createRivalDriver, rivalInput, sampleRivalPath, type RivalDefinition } from "../src/sim/rival.ts";
import { createSim } from "../src/sim/sim.ts";
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
