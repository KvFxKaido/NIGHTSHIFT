import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  gaugeReading, launchMeter, minimapPixel, nitrousArc, segmentWithinMinimap, speedDigits, tachAngle, tachReading, withinMinimap,
  ARC_BAR_LENGTH, ARC_CURVE_LENGTH, GAUGE_REDLINE, SEGMENT_SHAPES, TACH_START_DEGREES, TACH_SWEEP_DEGREES,
} from "../src/ui/hud-state.ts";
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
});

// MCLA's cluster (Shawn's mockup, 2026-09-26): the speed is printed, not a needle, and the tachometer sweeps from its
// lower left round the top.
test("the tachometer sweeps 230 degrees from its lower left and cannot wrap", () => {
  assert.equal(tachAngle(0), TACH_START_DEGREES);
  assert.equal(tachAngle(1), TACH_START_DEGREES + TACH_SWEEP_DEGREES);
  assert.equal(TACH_START_DEGREES + TACH_SWEEP_DEGREES, 370, "it ends just past three o'clock");
  assert.equal(tachAngle(-1), tachAngle(0), "reverse cannot swing the needle below zero");
  assert.equal(tachAngle(3), tachAngle(1), "the limiter cannot wrap the needle past the end");
});

test("the speed plate prints three digits, the leading zeros ghosted", () => {
  assert.deepEqual(speedDigits(0), ["", "", "abcdef"], "standing still is a dim 88 and a lit 0");
  assert.deepEqual(speedDigits(88), ["", "abcdefg", "abcdefg"]);
  assert.deepEqual(speedDigits(140), ["bc", "fgbc", "abcdef"]);
  assert.deepEqual(speedDigits(87.6), ["", "abcdefg", "abcdefg"], "rounded as the reading is");
  assert.equal(speedDigits(1234).length, 3, "never more digits than the plate has");
  for (const lit of speedDigits(890)) for (const segment of lit) assert.ok(segment in SEGMENT_SHAPES, `no shape for segment ${segment}`);
});

// One meter in two pieces: it has to fill the curve before any of the bar, and meet at the join.
test("the nitrous arc fills up the curve, then along the bar", () => {
  const share = ARC_CURVE_LENGTH / (ARC_CURVE_LENGTH + ARC_BAR_LENGTH);
  assert.deepEqual(nitrousArc(0), { curve: 0, bar: 0 });
  assert.deepEqual(nitrousArc(1), { curve: 1, bar: 1 });
  assert.deepEqual(nitrousArc(share), { curve: 1, bar: 0 }, "the curve is full exactly where the bar begins");
  const half = nitrousArc(0.5);
  assert.equal(half.curve, 1);
  assert.ok(Math.abs(half.bar * ARC_BAR_LENGTH + ARC_CURVE_LENGTH - 0.5 * (ARC_CURVE_LENGTH + ARC_BAR_LENGTH)) < 1e-9, "half the charge is half the arc's length");
  assert.deepEqual(nitrousArc(2), nitrousArc(1), "an overcharge cannot run past the end");
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

// The nitrous arc until Surge exists (design/HANDLING.md, "The burnout"; MC3's right-hand boost bar to 2026-09-26):
// the launch charge while it is held and the boost draining after, and empty otherwise.
test("the nitrous arc is the launch charge building, then the boost draining", () => {
  const launch = { heldTicks: 0, charge: 0, burnout: false, resolved: true, boostTicks: 0, quality: 0 };
  assert.equal(launchMeter(undefined), null);
  assert.equal(launchMeter(launch), null, "nothing held, nothing shown");
  assert.equal(launchMeter({ ...launch, heldTicks: 33, charge: .5, burnout: true }), .5, "a burnout half charged");
  assert.equal(launchMeter({ ...launch, heldTicks: 33, charge: .5, resolved: false }), .5, "held at the line");
  assert.equal(launchMeter({ ...launch, boostTicks: LAUNCH.boostTicks, quality: 1 }), 1, "full as it is let go");
  assert.ok(Math.abs(launchMeter({ ...launch, boostTicks: LAUNCH.boostTicks / 2, quality: .8 })! - .4) < 1e-9, "and draining");
});

// The HUD module reaches into the page by id. If the markup and the module
// disagree the cluster silently stops updating, which no unit test of the
// arithmetic above would catch.
test("index.html carries every element the cluster binds to", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["speed", "gear", "cluster-dial", "nitrous-curve", "nitrous-bar", "nitrous-tanks", "tach-ticks", "tach-needle",
    "tach-red", "speed-digits", "street-plate", "street-name", "minimap", "race", "race-gate", "race-time", "meter-left"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.ok(html.includes('href="/src/ui/hud.css"'), "the cluster stylesheet is not linked");
  // The race readout is display:flex, and an author display wins over the
  // [hidden] attribute's display:none — so without this rule it showed GATE 1/3
  // in free roam on every screen, including three of Shawn's screenshots.
  const css = await readFile(new URL("../src/ui/hud.css", import.meta.url), "utf8");
  assert.ok(css.includes("#race[hidden] { display: none; }"), "the race readout cannot hide");
  // The left meter ships hidden until something feeds it, and the rule has to be able to hide it.
  assert.ok(css.includes(".hud-meter[hidden] { display: none; }"), "the reserved meter cannot hide");
  // A bare hidden attribute, not the aria-hidden it sits beside.
  assert.match(html, /<svg id="meter-left"[^>]*\shidden[\s>]/, "#meter-left ships visible with nothing feeding it");
  // Inside an SVG the attribute alone hides nothing: the tanks (Surge's, not built) and the street plate off every
  // street rely on this rule.
  assert.ok(css.includes("#cluster-dial [hidden] { display: none; }"), "the cluster's hidden pieces cannot hide");
  assert.match(html, /<g id="nitrous-tanks" hidden>/, "the tanks ship visible with no Surge to count");
  // The drawn arc has to be the one nitrousArc splits: 145 degrees of a 90-unit radius ending at (118, 30), and a
  // bar from there to 400.
  assert.ok(html.includes('d="M66.4 193.7 A90 90 0 0 1 118 30"'), "the curve is not the arc nitrousArc measures");
  assert.ok(Math.abs(ARC_CURVE_LENGTH - 90 * (270 - 125) * Math.PI / 180) < 1e-9);
  assert.ok(html.includes('d="M118 30 L400 30"') && ARC_BAR_LENGTH === 400 - 118, "the bar is not the length nitrousArc splits by");
});
