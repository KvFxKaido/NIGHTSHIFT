import assert from "node:assert/strict";
import test from "node:test";
import { createDistrictBanner, DISTRICT_HOLD, DISTRICT_SETTLE } from "../src/ui/district-banner.ts";

const FRAME = 1 / 60;
/** Drive `seconds` in `here`, returning every name shown along the way. */
function drive(banner: ReturnType<typeof createDistrictBanner>, here: string | null, seconds: number): Set<string> {
  const shown = new Set<string>();
  for (let t = 0; t < seconds; t += FRAME) { const name = banner.update(here, FRAME); if (name) shown.add(name); }
  return shown;
}

test("a neighbourhood is named once the car has stayed in it, and only for a while", () => {
  const banner = createDistrictBanner();
  assert.deepEqual([...drive(banner, "sodo", DISTRICT_SETTLE * 0.9)], [], "named before it settled");
  assert.deepEqual([...drive(banner, "sodo", DISTRICT_SETTLE)], ["sodo"]);
  drive(banner, "sodo", DISTRICT_HOLD);
  assert.equal(banner.update("sodo", FRAME), null, "the name stayed up past its hold");
  assert.deepEqual([...drive(banner, "sodo", 10)], [], "the same neighbourhood was named again");
});

// A border street is a boundary polygon edge: the car is in one neighbourhood
// on one side of its centreline and the other on the other side.
test("driving along a border street names neither side", () => {
  const banner = createDistrictBanner();
  drive(banner, "belltown", DISTRICT_SETTLE + DISTRICT_HOLD + 1);
  const shown = new Set<string>();
  for (let i = 0; i < 40; i++) for (const name of drive(banner, i % 2 ? "belltown" : "alder-center", DISTRICT_SETTLE * 0.5)) shown.add(name);
  assert.deepEqual([...shown], []);
  assert.deepEqual([...drive(banner, "alder-center", DISTRICT_SETTLE + FRAME)], ["alder-center"]);
});

test("leaving every neighbourhood names nothing, and coming back names it again", () => {
  const banner = createDistrictBanner();
  drive(banner, "madrona-ridge", DISTRICT_SETTLE + DISTRICT_HOLD + 1);
  assert.deepEqual([...drive(banner, null, 5)], []);
  assert.deepEqual([...drive(banner, "madrona-ridge", DISTRICT_SETTLE + FRAME)], ["madrona-ridge"]);
});
