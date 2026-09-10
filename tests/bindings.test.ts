import assert from "node:assert/strict";
import test from "node:test";
import { copyBindings, decodeBindings, rebind } from "../src/input/bindings.ts";
import { createInputController, mapGamepad } from "../src/input/input.ts";
import { transitionMenu } from "../src/ui/menu-state.ts";

test("controls returns to its originating menu without resuming a paused run", () => {
  for (const origin of ["main", "pause"] as const) {
    const controls = transitionMenu({ screen: origin, returnTo: origin }, "open-controls");
    assert.equal(controls.screen, "controls");
    assert.equal(transitionMenu(controls, "back").screen, origin);
    assert.equal(transitionMenu(controls, "pause-toggle").screen, origin);
  }
});

test("bindings save and reload; duplicates, reserved controls and corrupt saves are rejected", () => {
  const defaults = copyBindings();
  let bindings = rebind(defaults, "keyboard", "throttle", "KeyI");
  bindings = rebind(bindings, "gamepad", "handbrake", 5);
  assert.deepEqual(decodeBindings(JSON.stringify({ version: 1, ...bindings })), bindings);
  assert.equal(defaults.keyboard.throttle, "KeyW");
  assert.throws(() => rebind(bindings, "keyboard", "reset", "KeyI"), /Already assigned/);
  assert.throws(() => rebind(bindings, "gamepad", "reset", 5), /Already assigned/);
  assert.throws(() => rebind(bindings, "keyboard", "throttle", "Escape"), /Menu keys/);
  assert.throws(() => rebind(bindings, "gamepad", "reset", 9), /Menu/);
  assert.throws(() => decodeBindings(JSON.stringify({ version: 1, ...bindings, keyboard: { ...bindings.keyboard, brake: "KeyI" } })), /Invalid/);
  assert.throws(() => decodeBindings('{'));
  assert.deepEqual(decodeBindings(null), defaults);
});

function pad(values: Record<number, number> = {}): Gamepad {
  return { axes: [0,0,0,0], buttons: Array.from({length:17}, (_, index) => ({value:values[index] ?? 0, pressed:(values[index] ?? 0) > .5, touched:false})), connected:true, mapping:"standard" } as Gamepad;
}

test("old control saves retain remaps and allocate an unused headlight control", () => {
  const legacy = JSON.parse(JSON.stringify({ version: 1, ...copyBindings() }));
  delete legacy.keyboard.flash; delete legacy.gamepad.flash;
  legacy.keyboard.reset = "KeyF"; legacy.gamepad.reset = 2;
  const migrated = decodeBindings(JSON.stringify(legacy));
  assert.equal(migrated.keyboard.reset, "KeyF");
  assert.equal(migrated.gamepad.reset, 2);
  assert.notEqual(migrated.keyboard.flash, "KeyF");
  assert.notEqual(migrated.gamepad.flash, 2);
  assert.deepEqual(decodeBindings(JSON.stringify({ version: 1, ...migrated })), migrated);
});

test("remapped triggers keep analog pressure and the original button stops driving", () => {
  const bindings = rebind(copyBindings(), "gamepad", "throttle", 5);
  assert.equal(mapGamepad(pad({5:.73,7:1}), bindings.gamepad).throttle, .73);
  assert.equal(mapGamepad(pad({7:1}), bindings.gamepad).throttle, 0);
});

test("capture consumes input, waits for controller release, and keeps menu confirm fixed", () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  let current = pad();
  Object.defineProperty(globalThis, "navigator", {configurable:true,value:{getGamepads:()=>[current]}});
  Object.defineProperty(globalThis, "addEventListener", {configurable:true,value:(name:string, fn:(event:KeyboardEvent)=>void)=>listeners.set(name,fn)});
  const key = (code:string) => listeners.get("keydown")!({code,repeat:false,preventDefault(){},stopImmediatePropagation(){}} as KeyboardEvent);
  try {
    const input = createInputController();
    key("KeyF"); assert.deepEqual(input.consumeMenuCommands(), ["flash"]);
    current = pad({2:1}); input.update(); assert.deepEqual(input.consumeMenuCommands(), ["flash"]);
    input.update(); assert.deepEqual(input.consumeMenuCommands(), [], "held headlights must not retrigger");
    current = pad(); input.update();
    let captured: string | number | null = null;
    input.beginCapture("keyboard", value => { captured = value; });
    key("KeyR");
    assert.equal(captured, "KeyR");
    assert.equal(input.consumeReset(), false);
    assert.deepEqual(input.consumeMenuCommands(), []);
    input.setBindings(rebind(input.bindings(), "keyboard", "throttle", "KeyI"));
    input.update(); input.sample();
    key("KeyW"); assert.equal(input.sample().throttle, 0);
    key("KeyI"); assert.equal(input.sample().throttle, 1);
    input.beginCapture("keyboard", value => { captured = value; });
    key("Escape"); assert.equal(captured, null);
    assert.deepEqual(input.consumeMenuCommands(), []);
    current = pad({0:1}); input.update(); input.consumeMenuCommands();
    input.beginCapture("gamepad", value => { captured = value; });
    input.update(); assert.equal(captured, null, "held confirm must not become a binding");
    current = pad(); input.update();
    current = pad({5:1}); input.update();
    assert.equal(captured, 5);
    assert.deepEqual(input.consumeMenuCommands(), []);
    current = pad(); input.update();
    current = pad({0:1}); input.update();
    assert.deepEqual(input.consumeMenuCommands(), ["confirm"]);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis,"navigator",oldNavigator); else Reflect.deleteProperty(globalThis,"navigator");
    if (oldListener) Object.defineProperty(globalThis,"addEventListener",oldListener); else Reflect.deleteProperty(globalThis,"addEventListener");
  }
});
