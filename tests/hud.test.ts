import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  gaugeReading, minimapPixel, segmentWithinMinimap, withinMinimap,
  GAUGE_REDLINE, GAUGE_SWEEP_DEGREES, GAUGE_CIRCUMFERENCE,
} from "../src/ui/hud-state.ts";

test("the dial reports transmission state and clamps its sweep", () => {
  assert.deepEqual(gaugeReading(0, 0, 70), { mph: 0, ratio: 0, gear: "N", redline: false });
  assert.equal(gaugeReading(6, -6, 70).gear, "R", "rolling backwards reads R, not D");
  assert.equal(gaugeReading(30, 30, 70).gear, "D");
  assert.equal(gaugeReading(30, 30, 70).mph, 67);
  // A downhill overspeed must not wrap the arc back past its own start.
  const over = gaugeReading(120, 120, 70);
  assert.equal(over.ratio, 1);
  assert.equal(over.redline, true);
  assert.equal(gaugeReading(70 * GAUGE_REDLINE - 0.01, 30, 70).redline, false);
  // The sweep never exceeds the drawn arc, whatever the dash offset is set to.
  assert.ok(GAUGE_CIRCUMFERENCE * (GAUGE_SWEEP_DEGREES / 360) * over.ratio < GAUGE_CIRCUMFERENCE);
});

// A heading-up map that puts the road behind you at the top is worse than no
// map at all, so pin the orientation rather than trusting the trigonometry.
test("the minimap is heading-up: forward is up, the car's right is right", () => {
  const camera = { x: 10, z: -20, heading: 0, range: 200, radius: 80 };
  const here = minimapPixel(camera, 10, -20);
  assert.ok(Math.hypot(here.x, here.y) < 1e-9, "the car is the centre of its own map");

  // Heading 0 drives toward -Z, and the driver's right hand points toward +X.
  const ahead = minimapPixel(camera, 10, -120);
  assert.ok(ahead.y < -30 && Math.abs(ahead.x) < 1e-9, JSON.stringify(ahead));
  const right = minimapPixel(camera, 110, -20);
  assert.ok(right.x > 30 && Math.abs(right.y) < 1e-9, JSON.stringify(right));

  // Turn the car a quarter turn and the same world point swings to the far side.
  const turned = { ...camera, heading: Math.PI / 2 };
  const swung = minimapPixel(turned, 10, -120);
  assert.ok(swung.x > 30 && Math.abs(swung.y) < 1e-6, JSON.stringify(swung));
});

test("the minimap scales to its disc and drops what is off it", () => {
  const camera = { x: 0, z: 0, heading: 0, range: 200, radius: 80 };
  assert.equal(minimapPixel(camera, 0, -200).y, -80, "the range lands on the rim");
  assert.equal(withinMinimap(camera, 0, -180), true);
  assert.equal(withinMinimap(camera, 0, -220), false);
  assert.equal(withinMinimap(camera, 0, -260, 1.35), true, "a looser margin keeps the near miss");
});

// Culling whole segments rather than their endpoints. Endpoint culling hides
// road in two ways: a segment reaching in from off-map is drawn only from its
// first inside vertex, and one spanning the disc with both ends outside is
// dropped altogether. Neither reproduces on today's 47 m authored segments, so
// only a test keeps it from reappearing the day someone authors a long straight.
test("a street segment is drawn whenever any part of it crosses the disc", () => {
  const camera = { x: 0, z: 0, heading: 0, range: 200, radius: 80 };
  assert.equal(segmentWithinMinimap(camera, 0, -600, 0, -100), true, "outside in to inside");
  assert.equal(segmentWithinMinimap(camera, 0, -100, 0, -600), true, "inside out to outside");
  assert.equal(segmentWithinMinimap(camera, -900, 0, 900, 0), true,
    "both ends outside, but it runs straight through the middle");
  assert.equal(segmentWithinMinimap(camera, -900, 900, 900, 900), false, "clear of the disc entirely");
  assert.equal(segmentWithinMinimap(camera, 300, 300, 300, 300), false, "a degenerate segment is a point");
  // The nearest approach is what counts, not either endpoint's distance.
  assert.equal(segmentWithinMinimap(camera, -400, -150, 400, -150), true);
  assert.equal(segmentWithinMinimap(camera, -400, -250, 400, -250), false);
});

// The HUD module reaches into the page by id. If the markup and the module
// disagree the cluster silently stops updating, which no unit test of the
// arithmetic above would catch.
test("index.html carries every element the cluster binds to", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["speed", "gear", "gauge-sweep", "gauge-ticks", "minimap", "race", "race-gate", "race-time"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.ok(html.includes('href="/src/ui/hud.css"'), "the cluster stylesheet is not linked");
  // The dial's static track has to match the arc the module sweeps along it.
  const arc = (GAUGE_CIRCUMFERENCE * GAUGE_SWEEP_DEGREES / 360).toFixed(1);
  assert.ok(html.includes(`stroke-dasharray="${arc} `), `the drawn track is not a ${arc} arc`);
});
