import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  dialAngle, gaugeReading, launchMeter, minimapPixel, segmentWithinMinimap, tachReading, withinMinimap,
  SPEED_DIAL_MAX_MPH, SPEED_DIAL_STEP_MPH,
  GAUGE_REDLINE, GAUGE_START_DEGREES, GAUGE_SWEEP_DEGREES, GAUGE_CIRCUMFERENCE,
} from "../src/ui/hud-state.ts";
import { HANDLING } from "../src/sim/sim.ts";
import { REDLINE_RPM } from "../src/audio/audio-mix.ts";
import { TRANSMISSION } from "../src/sim/transmission.ts";
import { LAUNCH } from "../src/sim/launch.ts";

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

// Like MC3's, the dial is one 0-250 face for every car: a faster car is more
// needle, not a rescaled scale.
test("the speedometer is a fixed 0-250 face and the needle follows it", () => {
  assert.equal(SPEED_DIAL_MAX_MPH, 250);
  assert.equal(SPEED_DIAL_MAX_MPH % SPEED_DIAL_STEP_MPH, 0, "the numerals land on the end stop");
  assert.ok(SPEED_DIAL_MAX_MPH > HANDLING.topSpeed * 2.237, "no car in the game pins the needle");
  assert.equal(dialAngle(0), GAUGE_START_DEGREES);
  assert.equal(dialAngle(1), GAUGE_START_DEGREES + GAUGE_SWEEP_DEGREES);
  assert.equal(dialAngle(-1), dialAngle(0), "reverse cannot swing the needle below zero");
  assert.equal(dialAngle(3), dialAngle(1), "overspeed cannot wrap the needle past the end");
});

test("the tachometer ends one mark past the redline, so the red zone is a visible band", () => {
  for (const redline of [REDLINE_RPM, TRANSMISSION.redline]) {
    const idle = tachReading(900, redline);
    assert.equal(idle.maxThousands, 9, "8,200 rpm prints 0-9");
    assert.ok(idle.redlineRatio > 0.85 && idle.redlineRatio < 1, "the red band starts before the end stop");
    assert.equal(idle.redline, false);
    assert.equal(tachReading(redline, redline).redline, true);
    assert.equal(tachReading(20000, redline).ratio, 1, "the limiter cannot wrap the needle");
  }
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
// MC3's boost bar (design/HANDLING.md, "The burnout"): the right meter shows the
// launch charge while it is held and the boost draining after, and hides otherwise.
test("the right meter is the launch charge building, then the boost draining", () => {
  const launch = { heldTicks: 0, charge: 0, burnout: false, resolved: true, boostTicks: 0, quality: 0 };
  assert.equal(launchMeter(undefined), null);
  assert.equal(launchMeter(launch), null, "nothing held, nothing shown");
  assert.equal(launchMeter({ ...launch, heldTicks: 33, charge: .5, burnout: true }), .5, "a burnout half charged");
  assert.equal(launchMeter({ ...launch, heldTicks: 33, charge: .5, resolved: false }), .5, "held at the line");
  assert.equal(launchMeter({ ...launch, boostTicks: LAUNCH.boostTicks, quality: 1 }), 1, "full as it is let go");
  assert.ok(Math.abs(launchMeter({ ...launch, boostTicks: LAUNCH.boostTicks / 2, quality: .8 })! - .4) < 1e-9, "and draining");
});

test("index.html carries every element the cluster binds to", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["speed", "gear", "gauge-sweep", "gauge-ticks", "gauge-needle", "tacho-ticks", "tacho-needle",
    "tacho-red", "minimap", "race", "race-gate", "race-time", "meter-left", "meter-right"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.ok(html.includes('href="/src/ui/hud.css"'), "the cluster stylesheet is not linked");
  // The race readout is display:flex, and an author display wins over the
  // [hidden] attribute's display:none — so without this rule it showed GATE 1/3
  // in free roam on every screen, including three of Shawn's screenshots.
  const css = await readFile(new URL("../src/ui/hud.css", import.meta.url), "utf8");
  assert.ok(css.includes("#race[hidden] { display: none; }"), "the race readout cannot hide");
  // The meter arcs ship hidden until something feeds them (the right one is the
  // launch's, the left is reserved), and the rule has to be able to hide them.
  assert.ok(css.includes(".hud-meter[hidden] { display: none; }"), "the reserved meters cannot hide");
  for (const id of ["meter-left", "meter-right"]) {
    // A bare hidden attribute, not the aria-hidden it sits beside.
    assert.match(html, new RegExp(`<svg id="${id}"[^>]*\\shidden[\\s>]`), `#${id} ships visible with nothing feeding it`);
  }
  // The dial's static track has to match the arc the module sweeps along it.
  const arc = (GAUGE_CIRCUMFERENCE * GAUGE_SWEEP_DEGREES / 360).toFixed(1);
  assert.ok(html.includes(`stroke-dasharray="${arc} `), `the drawn track is not a ${arc} arc`);
});
