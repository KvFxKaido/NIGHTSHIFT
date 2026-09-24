import assert from "node:assert/strict";
import test from "node:test";
import {
  createInputController,
  mapCameraGamepad,
  mapGamepad,
  triggerValue,
  TRIGGER_FULL,
  TRIGGER_KNEE,
  mapMenuHorizontal,
  mapMenuVertical,
  MENU_KEYS,
  MENU_PAD_BUTTONS,
  MENU_REPEAT,
} from "../src/input/input.ts";

function gamepad(axes: number[] = [0], values: Record<number, number> = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: (values[index] ?? 0) > 0.5,
    touched: (values[index] ?? 0) > 0,
    value: values[index] ?? 0,
  }));
  return { axes, buttons } as Gamepad;
}

test("shift taps survive between ticks, holds never repeat, and pause entry discards pending shifts", () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  let pad = gamepad();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [{ ...pad, id: "Xbox Controller", connected: true, mapping: "standard" }] } });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: (name: string, fn: (event: KeyboardEvent) => void) => listeners.set(name, fn) });
  const key = (type: string, code: string, repeat = false) => listeners.get(type)!({ code, repeat, preventDefault() {} } as KeyboardEvent);
  try {
    const controller = createInputController();
    controller.update(); controller.sample();
    assert.equal(controller.activeGamepadName(), null, "idle connected pad does not replace keyboard hints");
    key("keydown", "ShiftLeft"); key("keyup", "ShiftLeft");
    assert.equal(controller.sample().shiftUp, true);
    assert.equal(controller.sample().shiftUp, undefined);
    key("keydown", "ShiftLeft", true);
    assert.equal(controller.sample().shiftUp, undefined);
    pad = gamepad([0], { 4: 1 }); controller.update();
    assert.equal(controller.activeGamepadName(), "Xbox Controller");
    assert.equal(controller.sample().shiftDown, true);
    for (let i = 0; i < 30; i++) { controller.update(); assert.equal(controller.sample().shiftDown, undefined); }
    pad = gamepad(); controller.update();
    pad = gamepad([0], { 5: 1 }); controller.update();
    controller.armDrivingInputGate();
    controller.sample();
    assert.equal(controller.sample().shiftUp, undefined);
    key("keydown", "ControlLeft");
    assert.equal(controller.activeGamepadName(), null, "keyboard input restores keyboard hints");
    pad = gamepad([0], { 7: .3 }); controller.update();
    assert.equal(controller.activeGamepadName(), "Xbox Controller", "partial trigger pulls use controller hints");
    listeners.get("blur")!({} as KeyboardEvent);
    assert.equal(controller.sample().shiftDown, undefined);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    if (oldListener) Object.defineProperty(globalThis, "addEventListener", oldListener); else Reflect.deleteProperty(globalThis, "addEventListener");
  }
});

test("standard triggers map to analog throttle and brake", () => {
  const input = mapGamepad(gamepad([0], { 6: 0.35, 7: 0.85 }));
  assert.equal(input.throttle, triggerValue(0.85));
  assert.ok(input.throttle > 0.85 && input.throttle < 1, "past the knee the pull is stretched towards full");
  assert.equal(input.brake, 0.35);
  // Up to the knee a trigger delivers what it reads. That has to cover the throttle a
  // driver holds at the tyres' limit with no pedal assist, 0.2 to 0.7 and a little over:
  // with the knee at half travel the stretch sat on top of the upper half of it.
  assert.equal(TRIGGER_KNEE, 0.8);
  for (const value of [0, 0.01, 0.25, 0.42, 0.5, 0.65, 0.7, 0.8]) {
    const partialPull = mapGamepad(gamepad([0], { 6: value, 7: value }));
    assert.equal(partialPull.throttle, value);
    assert.equal(partialPull.brake, value);
  }
  assert.equal(mapGamepad(gamepad([0], { 6: 1, 7: 1 })).throttle, 1);
});

// Recorded on 2026-09-13: this pad's throttle trigger never read more than
// 231/255 or 232/255 in two sessions, so the car never had full throttle.
test("a trigger that tops out short of 1 still reaches full, and the curve stays continuous", () => {
  for (const raw of [231 / 255, 232 / 255, TRIGGER_FULL, 0.95, 1]) {
    assert.equal(mapGamepad(gamepad([0], { 6: raw, 7: raw, 0: raw })).throttle, 1, `${raw} is not full throttle`);
    assert.equal(mapGamepad(gamepad([0], { 6: raw })).brake, 1);
  }
  let previous = -1;
  for (let i = 0; i <= 1000; i++) {
    const value = triggerValue(i / 1000);
    assert.ok(value >= previous, `the curve falls at ${i / 1000}`);
    assert.ok(value - previous < 0.01 || previous < 0, `the curve jumps at ${i / 1000}`);
    assert.ok(value >= i / 1000 && value <= 1);
    previous = value;
  }
  assert.ok(Math.abs(triggerValue(TRIGGER_KNEE + 1e-9) - TRIGGER_KNEE) < 1e-6);
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

test("full stick requests full lock", () => {
  assert.equal(mapGamepad(gamepad([-1])).steer, -1);
  assert.equal(mapGamepad(gamepad([1])).steer, 1);
});

// D-pad Left / Right steered until 2026-09-18; they skip the soundtrack now.
test("the D-pad does not steer: the stick does, whatever the D-pad holds", () => {
  assert.equal(mapGamepad(gamepad([0], { 14: 1 })).steer, 0);
  assert.equal(mapGamepad(gamepad([0], { 15: 1 })).steer, 0);
  assert.equal(mapGamepad(gamepad([0.5], { 14: 1 })).steer, mapGamepad(gamepad([0.5])).steer);
  assert.equal(mapGamepad(gamepad([-1], { 15: 1 })).steer, -1);
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

/** A controller on a fake pad and fake keyboard, with the menu repeat's clock in the test's hands. */
function menuHarness(run: (h: { controller: ReturnType<typeof createInputController>; setPad(pad: Gamepad): void;
  key(code: string, repeat?: boolean): void; release(code: string): void; at(ms: number): string[] }) => void): void {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  let pad = gamepad([0, 0]), clock = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [{ ...pad, id: "Xbox Controller", connected: true, mapping: "standard" }] } });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: (name: string, fn: (event: KeyboardEvent) => void) => listeners.set(name, fn) });
  try {
    const controller = createInputController(undefined, () => clock);
    run({
      controller,
      setPad: next => { pad = next; },
      key: (code, repeat = false) => listeners.get("keydown")!({ code, repeat, preventDefault() {}, target: null } as unknown as KeyboardEvent),
      release: code => listeners.get("keyup")!({ code } as KeyboardEvent),
      at: ms => { clock = ms; controller.update(); return controller.consumeMenuCommands(); },
    });
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    if (originalListener) Object.defineProperty(globalThis, "addEventListener", originalListener); else Reflect.deleteProperty(globalThis, "addEventListener");
  }
}

// design/MENUS.md: a list or a row of options is walked by holding, not by
// tapping every stop. The press moves at once; the hold repeats after a delay.
test("a held menu direction moves once, then repeats after the delay at the interval", () => {
  menuHarness(({ setPad, at }) => {
    at(0);
    setPad(gamepad([0, 0], { 13: 1 }));
    assert.deepEqual(at(1000), ["down"], "the press moves at once");
    assert.deepEqual(at(1000 + MENU_REPEAT.delay - 1), [], "nothing before the delay");
    assert.deepEqual(at(1000 + MENU_REPEAT.delay), ["down"], "the first repeat is at the delay");
    assert.deepEqual(at(1000 + MENU_REPEAT.delay + MENU_REPEAT.interval - 1), []);
    assert.deepEqual(at(1000 + MENU_REPEAT.delay + MENU_REPEAT.interval), ["down"], "then one every interval");
    setPad(gamepad([0, 0])); assert.deepEqual(at(2000), [], "releasing sends nothing");
    // The stick counts the same as the D-pad, and sideways has its own clock.
    setPad(gamepad([0.9, 0])); assert.deepEqual(at(2001), ["right"]);
    setPad(gamepad([0.9, -0.9])); assert.deepEqual(at(2002), ["up"], "a second direction starts its own hold");
    assert.deepEqual(at(2001 + MENU_REPEAT.delay), ["right"], "the first keeps its own clock");
  });
});

// Steering is the menu's directions (the stick, and the arrows on a keyboard), so a direction held hard over when a
// menu comes up, pausing mid-corner or pulling into the garage, used to walk that menu at once: the repeat's clock had
// been running since the corner. It counts once it has been let go (Push review on #13).
test("a direction held from driving does not walk a menu that opens under it until it is let go", () => {
  menuHarness(({ controller, setPad, key, release, at }) => {
    controller.setMenuActive(false);
    at(0);
    setPad(gamepad([-0.9, 0]));
    assert.deepEqual(at(10), [], "full lock is steering, not a menu direction");
    assert.deepEqual(at(10 + MENU_REPEAT.delay * 2), []);
    controller.setMenuActive(true);
    assert.deepEqual(at(2000), [], "held into the menu, it does not move it");
    assert.deepEqual(at(2000 + MENU_REPEAT.delay * 3), [], "nor repeat");
    setPad(gamepad([0, 0])); assert.deepEqual(at(3000), []);
    setPad(gamepad([-0.9, 0])); assert.deepEqual(at(3010), ["left"], "let go and pushed again, it moves");
    assert.deepEqual(at(3010 + MENU_REPEAT.delay), ["left"], "and repeats");
    setPad(gamepad([0, 0])); at(4000);
    // The keyboard's own repeat: an arrow held from driving walks nothing; one pressed in the menu walks it.
    controller.setMenuActive(false);
    key("ArrowLeft"); assert.deepEqual(at(4100), []);
    controller.setMenuActive(true);
    key("ArrowLeft", true); key("ArrowLeft", true); assert.deepEqual(at(4200), [], "held from driving");
    release("ArrowLeft"); key("ArrowLeft"); key("ArrowLeft", true);
    assert.deepEqual(at(4300), ["left", "left"], "pressed in the menu");
  });
});

test("the face buttons and shoulders are fixed menu commands, and so are their keys", () => {
  menuHarness(({ setPad, key, at }) => {
    at(0);
    for (const [button, command] of [[MENU_PAD_BUTTONS.actionX, "action-x"], [MENU_PAD_BUTTONS.actionY, "action-y"],
      [MENU_PAD_BUTTONS.sectionPrev, "section-prev"], [MENU_PAD_BUTTONS.sectionNext, "section-next"]] as const) {
      setPad(gamepad([0, 0], { [button]: 1 }));
      assert.ok(at(10).includes(command), `pad button ${button} is ${command}`);
      setPad(gamepad([0, 0])); at(20);
    }
    key(MENU_KEYS.sectionPrev); key(MENU_KEYS.actionX); key(MENU_KEYS.actionY);
    assert.deepEqual(at(30), ["section-prev", "action-x", "action-y"]);
    // E is also Enter Wharf Garage on the street; in a menu it is the next section.
    key(MENU_KEYS.sectionNext);
    assert.deepEqual(at(40).sort(), ["interact", "section-next"]);
    // The keyboard's own repeat walks a menu with a held arrow, and only an arrow.
    key("ArrowDown"); key("ArrowDown", true); key("ArrowDown", true); key(MENU_KEYS.actionX, true);
    assert.deepEqual(at(50), ["down", "down", "down"]);
  });
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

// Every neutrality threshold is a cliff, and a pad can rest on the wrong side
// of it. Raising the trigger tolerance from 0.01 to 0.12 fixed one controller
// and moved the cliff: a stick resting at 0.15 maps to 0.105 steer, over the
// 0.10 the gate wants, so the gate never opened and the car ignored the pad for
// the whole run — while the menus, on their 0.65 threshold, worked perfectly.
// Reproduced in the browser at a 0.20 rest: full throttle held, speed 0.00.
test("no resting offset can hold the driving gate shut for a whole run", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  // A worn stick and a sticky trigger: both rest past the gate's tolerance and
  // neither will ever read neutral, however long the player waits.
  let pad = gamepad([0.2], { 7: 0.18 });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [{ ...pad, connected: true, mapping: "standard" }] },
  });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} });
  try {
    const controller = createInputController();
    controller.update();
    controller.armDrivingInputGate();
    assert.equal(controller.isDrivingGated(), true, "a pad past tolerance is gated at first");

    // One second of a fixed 60 Hz tick. The gate is worth a few frames, not a run.
    let opened = -1;
    for (let sample = 0; sample < 60; sample++) {
      controller.update();
      controller.sample();
      if (!controller.isDrivingGated()) { opened = sample; break; }
    }
    assert.ok(opened >= 0, "the gate never opened: this pad can never drive");
    assert.ok(opened < 40, `the gate held for ${opened} samples, most of a second`);

    // And once open it delivers the pad, unfiltered, offsets and all.
    controller.update();
    const delivered = controller.sample();
    assert.equal(delivered.throttle, 0.18);
    assert.equal(delivered.steer, mapGamepad(pad).steer);

    // A genuinely released pad still opens the gate at once rather than waiting
    // out the deadline — the fast path has to stay the common one.
    controller.armDrivingInputGate();
    pad = gamepad([0]);
    controller.update();
    controller.sample();
    assert.equal(controller.isDrivingGated(), false, "a released pad opens the gate immediately");
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalListener) Object.defineProperty(globalThis, "addEventListener", originalListener);
    else Reflect.deleteProperty(globalThis, "addEventListener");
  }
});
