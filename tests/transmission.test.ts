import assert from "node:assert/strict";
import test from "node:test";
import { createTransmission, stepTransmission, TRANSMISSION } from "../src/sim/transmission.ts";
import { copyBindings, decodeBindings } from "../src/input/bindings.ts";

const gas = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
test("staging holds the car, launch timing is measured, and a clean launch delivers more drive", () => {
  const clean = createTransmission(), poor = createTransmission();
  for (let i = 0; i < 180; i++) {
    assert.equal(stepTransmission(clean, { ...gas, throttle: .52 }, 0, 180-i, 0, 1200, 1/60), 0);
    stepTransmission(poor, gas, 0, 180-i, 0, 1200, 1/60);
  }
  const cleanForce = stepTransmission(clean, gas, 0, 0, 9, 1200, 1/60);
  const poorForce = stepTransmission(poor, gas, 0, 0, 0, 1200, 1/60);
  assert.equal(clean.reactionTicks, 9);
  assert.equal(clean.feedback, "CLEAN LAUNCH");
  assert.equal(poor.feedback, "WHEELSPIN");
  assert.ok(cleanForce > poorForce);
});

test("shifts cut drive, held input shifts once, and unsafe downshifts are rejected", () => {
  const state = createTransmission();
  Object.assign(state, { launched: true, rpm: 7600 });
  assert.equal(stepTransmission(state, { ...gas, shiftUp: true }, 19, 0, 100, 1200, 1/60), 0);
  assert.equal(state.gear, 2);
  assert.equal(state.feedback, "PERFECT SHIFT");
  for (let i = 0; i < 60; i++) stepTransmission(state, { ...gas, shiftUp: true }, 19, 0, 100+i, 1200, 1/60);
  assert.equal(state.gear, 2);
  assert.ok(stepTransmission(state, gas, 19, 0, 161, 1200, 1/60) > 0);
  stepTransmission(state, { ...gas, shiftDown: true }, 30, 0, 162, 1200, 1/60);
  assert.equal(state.gear, 2);
  assert.equal(state.feedback, "DOWNSHIFT BLOCKED");
  state.gear = 1;
  assert.equal(stepTransmission(state, gas, 30, 0, 163, 1200, 1/60), 0);
  assert.equal(state.limiter, true);
  assert.ok(state.rpm >= TRANSMISSION.redline);
});

test("pre-gearbox saves keep every remap and allocate unique shift controls", () => {
  const legacy = JSON.parse(JSON.stringify({ version: 1, ...copyBindings() }));
  delete legacy.keyboard.shiftUp; delete legacy.keyboard.shiftDown;
  delete legacy.gamepad.shiftUp; delete legacy.gamepad.shiftDown;
  legacy.keyboard.handbrake = "ShiftLeft";
  legacy.gamepad.telemetry = 4;
  legacy.gamepad.handbrake = 5;
  const migrated = decodeBindings(JSON.stringify(legacy));
  assert.equal(migrated.keyboard.handbrake, "ShiftLeft");
  assert.equal(migrated.gamepad.telemetry, 4);
  assert.equal(migrated.gamepad.handbrake, 5);
  for (const map of [migrated.keyboard, migrated.gamepad]) assert.equal(new Set(Object.values(map)).size, Object.keys(map).length);
  assert.deepEqual(decodeBindings(JSON.stringify({ version: 1, ...migrated })), migrated);
});
