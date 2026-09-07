import assert from "node:assert/strict";
import test from "node:test";
import {
  createInputController,
  mapCameraGamepad,
  mapGamepad,
  mapMenuHorizontal,
  mapMenuVertical,
} from "../src/input/input.ts";

function gamepad(axes: number[] = [0], values: Record<number, number> = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: (values[index] ?? 0) > 0.5,
    touched: (values[index] ?? 0) > 0,
    value: values[index] ?? 0,
  }));
  return { axes, buttons } as Gamepad;
}

test("standard triggers map to analog throttle and brake", () => {
  const input = mapGamepad(gamepad([0], { 6: 0.35, 7: 0.8 }));
  assert.equal(input.throttle, 0.8);
  assert.equal(input.brake, 0.35);
  for (const value of [0, 0.01, 0.25, 0.5, 0.75, 1]) {
    const partialPull = mapGamepad(gamepad([0], { 6: value, 7: value }));
    assert.equal(partialPull.throttle, value);
    assert.equal(partialPull.brake, value);
  }
});

test("left stick steering filters the inner five percent", () => {
  for (const axis of [-0.05, -0.03, -0.0001, 0, 0.0001, 0.03, 0.05]) {
    assert.equal(mapGamepad(gamepad([axis])).steer, 0);
  }
  assert.ok(mapGamepad(gamepad([0.1])).steer > 0.05);
  assert.ok(mapGamepad(gamepad([-0.1])).steer < -0.05);
});

test("steering ramps continuously and symmetrically outside the center buffer", () => {
  const justOutside = mapGamepad(gamepad([0.0501])).steer;
  assert.ok(justOutside > 0 && justOutside < 0.001);
  assert.ok(Math.abs(mapGamepad(gamepad([0.5])).steer - 0.45 / 0.95) < 0.000001);
  let previous = 0;
  for (let sample = 1; sample <= 100; sample++) {
    const axis = sample / 100;
    const right = mapGamepad(gamepad([axis])).steer;
    const left = mapGamepad(gamepad([-axis])).steer;
    assert.ok(right >= previous && right <= 1);
    assert.ok(Math.abs(right + left) < 0.000001, "left and right must be symmetric");
    previous = right;
  }
});

test("full stick still requests exactly the same lock as the D-pad", () => {
  assert.equal(mapGamepad(gamepad([-1])).steer, mapGamepad(gamepad([0], { 14: 1 })).steer);
  assert.equal(mapGamepad(gamepad([1])).steer, mapGamepad(gamepad([0], { 15: 1 })).steer);
  assert.equal(mapGamepad(gamepad([-1])).steer, -1);
  assert.equal(mapGamepad(gamepad([1])).steer, 1);
});

test("deliberate D-pad presses win over small stick offsets", () => {
  assert.equal(mapGamepad(gamepad([0], { 14: 1 })).steer, -1);
  assert.equal(mapGamepad(gamepad([0], { 15: 1 })).steer, 1);
  assert.equal(mapGamepad(gamepad([0.04], { 14: 1 })).steer, -1);
  assert.equal(mapGamepad(gamepad([-0.04], { 15: 1 })).steer, 1);
  assert.equal(mapGamepad(gamepad([0.04], { 14: 1, 15: 1 })).steer, 0);
});

test("the driving release gate adds no extra deadzone during play", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  let pad = gamepad([0.08], { 7: 0.8 });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [{ ...pad, connected: true, mapping: "standard" }] },
  });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} });
  const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  try {
    const controller = createInputController();
    controller.update();
    assert.deepEqual(controller.sample(), neutral, "held throttle must keep entry gated");
    assert.deepEqual(controller.sample(), neutral);

    pad = gamepad([0.08]);
    controller.update();
    assert.deepEqual(controller.sample(), neutral, "release frame clears the gate");
    assert.equal(controller.sample().steer, mapGamepad(pad).steer);
    assert.ok(controller.sample().steer > 0, "gate tolerance must not filter live steering");

    controller.armDrivingInputGate();
    pad = gamepad([0.4]);
    controller.update();
    assert.deepEqual(controller.sample(), neutral, "deliberately held steering must remain gated");
    assert.deepEqual(controller.sample(), neutral);

    pad = gamepad([0.06]);
    controller.update();
    assert.deepEqual(controller.sample(), neutral);
    assert.equal(controller.sample().steer, mapGamepad(pad).steer);
    assert.ok(controller.sample().steer > 0);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalListener) Object.defineProperty(globalThis, "addEventListener", originalListener);
    else Reflect.deleteProperty(globalThis, "addEventListener");
  }
});

test("missing controller axes remain neutral", () => {
  const neutral = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  assert.deepEqual(mapGamepad(null), neutral);
  assert.deepEqual(mapGamepad(gamepad([])), neutral);
});

test("A maps to the handbrake", () => {
  assert.equal(mapGamepad(gamepad([0], { 0: 1 })).handbrake, 1);
});

test("right stick maps to camera look with its own deadzone", () => {
  assert.deepEqual(mapCameraGamepad(gamepad([0, 0, 0.12, -0.1])), { x: 0, y: 0 });
  const look = mapCameraGamepad(gamepad([0, 0, 0.65, -0.72]));
  assert.ok(look.x > 0.5);
  assert.ok(look.y < -0.6);
});

test("left stick and D-pad map to vertical menu navigation", () => {
  assert.equal(mapMenuVertical(gamepad([0, 0.1])), 0);
  assert.equal(mapMenuVertical(gamepad([0, -0.5])), 0);
  assert.equal(mapMenuVertical(gamepad([0, -0.8])), -1);
  assert.equal(mapMenuVertical(gamepad([0, 0.8])), 1);
  assert.equal(mapMenuVertical(gamepad([0, 0], { 12: 1 })), -1);
  assert.equal(mapMenuVertical(gamepad([0, 0], { 13: 1 })), 1);
});

test("left stick and D-pad map to horizontal menu navigation", () => {
  assert.equal(mapMenuHorizontal(gamepad([0.1, 0])), 0);
  assert.equal(mapMenuHorizontal(gamepad([-0.5, 0])), 0);
  assert.equal(mapMenuHorizontal(gamepad([-0.8, 0])), -1);
  assert.equal(mapMenuHorizontal(gamepad([0.8, 0])), 1);
  assert.equal(mapMenuHorizontal(gamepad([0, 0], { 14: 1 })), -1);
  assert.equal(mapMenuHorizontal(gamepad([0, 0], { 15: 1 })), 1);
});

// A pad whose triggers rest slightly above zero used to jam the driving gate
// shut forever: the neutrality test demanded throttle < 0.01 on a raw analog
// value. Menus kept working, because they read button presses and a 0.65 axis
// threshold, so the car simply ignored the controller for the whole run.
test("a resting trigger offset cannot jam the driving gate shut", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  let pad = gamepad([0], { 7: 0.04, 6: 0.03 });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [{ ...pad, connected: true, mapping: "standard" }] },
  });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} });
  try {
    const controller = createInputController();
    controller.update();
    controller.armDrivingInputGate();
    assert.equal(controller.sample().throttle, 0, "the arming frame is always swallowed");
    assert.equal(controller.isDrivingGated(), false, "resting trigger noise still counts as released");

    // The delivered value is never filtered: the tolerance governs the gate only.
    pad = gamepad([0], { 7: 0.04 });
    controller.update();
    assert.equal(controller.sample().throttle, 0.04);

    // A trigger genuinely held down must still hold the gate shut.
    controller.armDrivingInputGate();
    pad = gamepad([0], { 7: 0.8 });
    controller.update();
    assert.equal(controller.sample().throttle, 0);
    assert.equal(controller.isDrivingGated(), true, "a real pull is not resting noise");
    pad = gamepad([0]);
    controller.update();
    controller.sample();
    assert.equal(controller.isDrivingGated(), false, "releasing opens the gate");
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalListener) Object.defineProperty(globalThis, "addEventListener", originalListener);
    else Reflect.deleteProperty(globalThis, "addEventListener");
  }
});
