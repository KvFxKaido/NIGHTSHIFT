import assert from "node:assert/strict";
import test from "node:test";
import { arenaEvent } from "../src/sim/arena-events.ts";
import { drawAlderCourse, fieldAlderRival } from "../src/sim/alder-course.ts";
import { CAR_TUNES } from "../src/sim/car-handling.ts";
import { BLACKLIST_CORNERING, RIVAL_STEERING, type RivalDefinition } from "../src/sim/rival.ts";
import { rivalDifference, rivalRevision, rivalRevisionParts, RIVAL_REVISIONS } from "../src/sim/rival-revision.ts";
import { STREET_CIRCUIT_LINE, streetCircuitEvent } from "../src/sim/street-circuit.ts";
import { STREET_LINE, withStreetLine } from "../src/sim/street-line.ts";
import { TRAFFIC_PASS } from "../src/sim/traffic-pass.ts";

// One string named every rival to 2026-09-21, "full-line-v1" to "v32" in eight days, and each bump refused every raced
// recording there was: Ridge Circuit's for a street line in traffic, everybody's for one name's car. A rival is named
// now by what THAT race's rival is made of, so a change refuses what it moved.
const ridge = () => arenaEvent("ridge", 3, false).rival!, clear = () => streetCircuitEvent(3, false, false).rival!, uptown = () => streetCircuitEvent(3, true, false).rival!;
const wake = () => fieldAlderRival(drawAlderCourse("gen-wake-42", null).rival);
const kinds = (route: RivalDefinition) => rivalRevisionParts(route).map(part => part.replace(/[-.][0-9a-f.]+$|-r\d+$|-[\d.]+$/, ""));

test("a rival is named by what its own race uses, and by nothing else", () => {
  // Every raced rival has the driver and its car. A route that is a line has the line; only a street route in traffic
  // has the line's reader and the pass planner; only a name has a share of the grip.
  const { driver, streetLine, pass } = RIVAL_REVISIONS;
  assert.deepEqual(kinds(ridge()), [driver, "kestrel", "line"]);
  assert.deepEqual(kinds(clear()), [driver, "kestrel", "cornering", "line"]);
  assert.deepEqual(kinds(uptown()), [driver, "kestrel", streetLine, pass]);
  assert.deepEqual(kinds(wake()), [driver, "reign", "launch", streetLine, "skill", pass]);
  assert.ok(rivalRevision(wake()).includes(` reign-r${CAR_TUNES.reign!.revision} `) && rivalRevision(wake()).includes(` skill-${BLACKLIST_CORNERING.wake}`));
  // The same race names the same rival every time it is drawn, and another race another.
  assert.equal(rivalRevision(wake()), rivalRevision(wake()));
  assert.notEqual(rivalRevision(wake()), rivalRevision(fieldAlderRival(drawAlderCourse("gen-wake-43", null).rival)));
});

test("a change renames the rivals it moves and leaves the rest", () => {
  const before = { ridge: rivalRevision(ridge()), clear: rivalRevision(clear()), uptown: rivalRevision(uptown()), wake: rivalRevision(wake()) };
  const moved = () => Object.entries({ ridge: ridge(), clear: clear(), uptown: uptown(), wake: wake() }).filter(([name, route]) => rivalRevision(route) !== before[name as keyof typeof before]).map(([name]) => name);
  const during = <T extends object>(table: T, change: Partial<T>, read: () => void) => { const was = { ...table }; Object.assign(table, change); try { read(); } finally { Object.assign(table, was); } };
  // A street line drawn differently is another rival only where that line is driven: Wake's race, not Ridge Circuit.
  const bare = drawAlderCourse("gen-wake-42", null).rival, redrawn = withStreetLine(bare, STREET_CIRCUIT_LINE, bare.skill!, { bendTangent: 100 });
  assert.notEqual(rivalRevision(redrawn), before.wake);
  const token = RIVAL_REVISIONS.streetLine;
  assert.match(rivalDifference(before.wake, redrawn)!, new RegExp(`^raced another rival: ${token}\\.\\w+\\.\\w+ -> ${token}\\.\\w+\\.\\w+$`));
  // One name's share of the grip is that name's races.
  assert.match(rivalDifference(before.wake, { ...wake(), skill: 0.9 })!, /^raced another rival: skill-0\.96 -> skill-0\.9$/);
  // The reader's and the planner's own numbers reach the routes that have them.
  during(STREET_LINE, { refuse: STREET_LINE.refuse + 1 } as never, () => assert.deepEqual(moved(), ["uptown", "wake"]));
  during(TRAFFIC_PASS, { rejoinGap: TRAFFIC_PASS.rejoinGap + 1 } as never, () => assert.deepEqual(moved(), ["uptown", "wake"]));
  // The driver's numbers reach everybody, whether or not anyone bumped its token: a table is its own witness.
  during(RIVAL_STEERING, { slip: 0.9 } as never, () => assert.deepEqual(moved(), ["ridge", "clear", "uptown", "wake"]));
  during(RIVAL_REVISIONS, { driver: "driver-v0" } as never, () => assert.deepEqual(moved(), ["ridge", "clear", "uptown", "wake"]));
  during(RIVAL_REVISIONS, { pass: "pass-v0" } as never, () => assert.deepEqual(moved(), ["uptown", "wake"]));
  assert.deepEqual(moved(), []);
});

// A session is recorded in a browser and replayed here, and the two do not draw the same line to the bit: Chrome 152 and
// Node 24 differ in the last place of Math.atan2(0.3, 1.7) and Math.tanh(0.7). Hashed exactly, Ridge Circuit's line was
// 7d0eedc2 in the game and 44e03770 in `pnpm laps --verify`, and every raced recording would have been refused.
test("a line is named to the millimetre: another runtime's last bit is the same rival, a moved line is not", () => {
  const route = ridge(), named = rivalRevision(route);
  const nudged = (by: number): RivalDefinition => ({ ...route, lateral: route.lateral!.map(offset => offset + by), points: route.points.map(p => ({ ...p, x: p.x + by })) });
  assert.equal(rivalRevision(nudged(1e-12)), named, "a difference in the sixteenth digit renamed the rival");
  assert.notEqual(rivalRevision(nudged(0.005)), named, "a line 5 mm from where it was is the same rival");
  // Replay compares positions at a centimetre, so the name is finer than anything replay can see.
  const wakes = wake(), line = wakes.line!;
  assert.equal(rivalRevision({ ...wakes, line: { ...line, dx: line.dx.map(shift => shift === 0 ? 0 : shift + 1e-12) } }), rivalRevision(wakes));
  assert.notEqual(rivalRevision({ ...wakes, line: { ...line, dx: line.dx.map(shift => shift === 0 ? 0 : shift + 0.005) } }), rivalRevision(wakes));
});

test("a rival's car is part of its name, by the car's own revision", () => {
  // Eleven of the 32 single revisions were one name's car being tuned. The tune's revision is the rival's now, so
  // bumping it (which the fingerprint test in car-handling.test.ts already demands) refuses that car's races alone.
  const raced = rivalRevision(wake());
  assert.ok(raced.includes(` reign-r${CAR_TUNES.reign!.revision} `));
  assert.match(rivalDifference(raced.replace(`reign-r${CAR_TUNES.reign!.revision}`, `reign-r${CAR_TUNES.reign!.revision - 1}`), wake())!, /^raced another rival: reign-r\d+ -> reign-r\d+$/);
  assert.match(rivalDifference(raced, { ...wake(), car: "vesper" })!, /reign-r\d+ -> vesper-r\d+/);
  assert.equal(rivalDifference(raced, wake()), null);
});
