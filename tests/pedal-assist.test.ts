import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { ALDER_RIVAL } from "../src/sim/alder-rival.ts";
import { ALDER_RACE } from "../src/sim/alder.ts";
import { DT, carHandling, createSim, resetSim, step, type Input, type Sim } from "../src/sim/sim.ts";
import { flatSim, NEUTRAL } from "./helpers/handling.ts";

await RAPIER.init();

// The pedals, as a choice (2026-09-20). The tyre model gives cornering first call
// on a tyre's grip and the pedals what is left, clamped for nothing: from rest the
// Cinder pushes 7.6 m/s² at 45% throttle and at 100%, and full brake costs no
// steering. `SimOptions.pedalAssist` below 1 makes the excess cost grip, on the
// PLAYER'S car only, as a developer preview (?assist=). At 1 nothing may change.
const cinder = carHandling("cinder");
const mph = (metresPerSecond: number) => metresPerSecond * 2.23694;
const slip = (sim: Sim) => Math.atan2(sim.state.vehicle.lateralSpeed, Math.max(1, Math.abs(sim.state.vehicle.forwardSpeed)));
const withAssist = (assist: number, speed = 0): Sim => { const sim = flatSim(speed, 0, cinder); sim.pedalAssist = assist; return sim; };

function toSixty(assist: number, throttle: number): number {
  const sim = withAssist(assist);
  for (let tick = 1; tick <= 60 * 20; tick++) {
    step(sim, { ...NEUTRAL, throttle });
    if (mph(sim.state.vehicle.forwardSpeed) >= 60) return tick * DT;
  }
  return Infinity;
}

/** Settle into a steady 45 mph turn, hold the trigger 1.5 s with the steering unchanged, then lift and steer into the slide for 2 s. */
function cornerExit(assist: number, throttle: number): { peak: number; caught: number; exit: number } {
  let best = { peak: 0, caught: Infinity, exit: 0 };
  // The driver's countersteer has a sign this test should not have to know; the better of the two is the driver.
  for (const sign of [1, -1]) {
    const sim = withAssist(assist, 20);
    for (let tick = 0; tick < 90; tick++) step(sim, { ...NEUTRAL, steer: 0.45, throttle: 0.35 });
    let peak = 0;
    for (let tick = 0; tick < 90; tick++) { step(sim, { ...NEUTRAL, steer: 0.45, throttle }); peak = Math.max(peak, Math.abs(slip(sim))); }
    const exit = sim.state.vehicle.speed;
    for (let tick = 0; tick < 120; tick++) step(sim, { ...NEUTRAL, steer: Math.max(-1, Math.min(1, sign * slip(sim) * 4)), throttle: 0.15 });
    const caught = Math.abs(slip(sim));
    if (caught < best.caught) best = { peak, caught, exit };
  }
  return best;
}

function turnIn(assist: number, brake: number): number {
  const sim = withAssist(assist, 35.8), from = sim.state.vehicle.heading;
  for (let tick = 0; tick < 90; tick++) step(sim, { ...NEUTRAL, steer: 1, brake });
  return Math.abs(Math.atan2(Math.sin(sim.state.vehicle.heading - from), Math.cos(sim.state.vehicle.heading - from))) * 180 / Math.PI;
}

const SCRIPT: readonly Input[] = [
  ...Array.from({ length: 200 }, () => ({ ...NEUTRAL, throttle: 1 })),
  ...Array.from({ length: 120 }, () => ({ ...NEUTRAL, throttle: 1, steer: 0.7 })),
  ...Array.from({ length: 90 }, () => ({ ...NEUTRAL, brake: 1, steer: -0.8 })),
  ...Array.from({ length: 120 }, () => ({ ...NEUTRAL, throttle: 0.6, steer: -0.4 })),
];

test("at the default the pedals change nothing: the game is bit-identical with the option and without it", () => {
  const runs = [undefined, 1].map(pedalAssist => {
    const sim = createSim(cinder, createAlderWorld(true), { race: ALDER_RACE, rival: ALDER_RIVAL, traffic: true, pedalAssist });
    for (const input of SCRIPT) step(sim, input);
    return { state: JSON.stringify(sim.state), world: Buffer.from(sim.world.takeSnapshot()).toString("base64") };
  });
  assert.equal(runs[0]!.state, runs[1]!.state);
  assert.equal(runs[0]!.world, runs[1]!.world);
});

test("turned down, it is the player's car alone: the rival drives exactly as it did", () => {
  // The player sits on the handbrake, so the only way a rival's run could differ is the assist reaching it.
  const runs = [1, 0].map(pedalAssist => {
    const sim = createSim(cinder, createAlderWorld(true), { race: ALDER_RACE, rival: ALDER_RIVAL, traffic: false, pedalAssist });
    for (let tick = 0; tick < 60 * 20; tick++) step(sim, { ...NEUTRAL, handbrake: 1 });
    assert.ok(sim.state.rival!.vehicle.speed > 10, "the rival has to be driving for this to prove anything");
    return JSON.stringify(sim.state.rival);
  });
  assert.equal(runs[0], runs[1]);
});

test("flooring it from rest is slower than the right amount, once the tyres stop forgiving it", () => {
  // Forgiven: everything past about half the trigger is the same push, so more is never slower.
  assert.ok(toSixty(1, 1) <= toSixty(1, 0.6) + 1e-9);
  assert.ok(Math.abs(toSixty(1, 1) - toSixty(1, 0.8)) < 1e-9, "at the default the top of the trigger is dead below 60 mph");
  // Not forgiven: a spinning tyre pushes less, and the best launch is short of the floor.
  for (const assist of [0.5, 0]) {
    assert.ok(toSixty(assist, 1) > toSixty(assist, 0.6) + 0.2, `assist ${assist}: floored ${toSixty(assist, 1)} s, 60% ${toSixty(assist, 0.6)} s`);
    assert.ok(toSixty(assist, 1) > toSixty(assist, 0.8), "and it is a gradient, not a cliff");
  }
  // Below the tyres' limit nothing is lost at any setting.
  assert.ok(Math.abs(toSixty(0, 0.3) - toSixty(1, 0.3)) < 1e-9);
});

test("out of a corner, more trigger is more angle, and every slide is caught", () => {
  const forgiven = [0.5, 0.7, 1].map(throttle => cornerExit(1, throttle));
  assert.ok(Math.max(...forgiven.map(run => run.peak)) < 8 * Math.PI / 180, "at the default the Cinder stays planted");
  assert.ok(Math.abs(forgiven[1]!.peak - forgiven[2]!.peak) < 1e-9, "and 70% and 100% are the same corner");
  for (const assist of [0.5, 0.25, 0]) {
    const runs = [0.5, 0.7, 1].map(throttle => cornerExit(assist, throttle));
    assert.ok(runs[0]!.peak < runs[1]!.peak && runs[1]!.peak < runs[2]!.peak, `assist ${assist}: ${runs.map(run => (run.peak * 180 / Math.PI).toFixed(1)).join(" < ")} degrees`);
    assert.ok(runs[2]!.exit < runs[0]!.exit, "flooring it costs speed out of the corner");
    // Being caught is every car's floor (tests/helpers/handling.ts): lift, steer into it, and it comes back.
    for (const run of runs) assert.ok(run.caught < 3 * Math.PI / 180, `assist ${assist}: still ${(run.caught * 180 / Math.PI).toFixed(1)} degrees sideways after the driver's two seconds`);
  }
  // The knob itself is a gradient: each step down swings further under the same foot.
  const floored = [1, 0.75, 0.5, 0.25, 0].map(assist => cornerExit(assist, 1).peak);
  for (let i = 1; i < floored.length; i++) assert.ok(floored[i]! > floored[i - 1]!);
  assert.ok(floored.at(-1)! < 45 * Math.PI / 180, "fully off is a slide, not a spin");
});

test("burying the brake costs turn-in, once the tyres stop forgiving it", () => {
  const forgiven = [0, 0.5, 1].map(brake => turnIn(1, brake));
  assert.ok(Math.max(...forgiven) - Math.min(...forgiven) < 2, `at the default the brake does not touch the steering: ${forgiven.map(turn => turn.toFixed(0)).join(", ")} degrees`);
  for (const assist of [0.5, 0]) {
    const turns = [0.5, 0.8, 1].map(brake => turnIn(assist, brake));
    assert.ok(turns[0]! > turns[1]! && turns[1]! > turns[2]!, `assist ${assist}: ${turns.map(turn => turn.toFixed(0)).join(" > ")} degrees`);
  }
});

test("a reset keeps the assist, and the feedback reports the excess at any setting", () => {
  const sim = withAssist(0.3);
  resetSim(sim);
  assert.equal(sim.pedalAssist, 0.3);
  // The feedback is what the pedals ask against what the tyres have, whatever the tyres then do about it.
  for (const assist of [1, 0]) {
    const car = withAssist(assist);
    let gentle = 0, floored = 0;
    for (let tick = 0; tick < 30; tick++) { step(car, { ...NEUTRAL, throttle: 0.3 }); gentle = Math.max(gentle, car.pedalFeedback.spin); }
    for (let tick = 0; tick < 30; tick++) { step(car, { ...NEUTRAL, throttle: 1 }); floored = Math.max(floored, car.pedalFeedback.spin); }
    assert.equal(gentle, 0);
    assert.ok(floored > 0.9);
  }
});
