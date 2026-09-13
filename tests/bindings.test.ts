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
  bindings = rebind(bindings, "gamepad", "handbrake", 1);
  assert.deepEqual(decodeBindings(JSON.stringify({ version: 1, ...bindings })), bindings);
  assert.equal(defaults.keyboard.throttle, "KeyW");
  assert.throws(() => rebind(bindings, "keyboard", "reset", "KeyI"), /Already assigned/);
  assert.throws(() => rebind(bindings, "gamepad", "reset", 1), /Already assigned/);
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

test("old control saves gain a change-camera key without losing a remap already using V", () => {
  const legacy = JSON.parse(JSON.stringify({ version: 1, ...copyBindings() }));
  delete legacy.keyboard.cameraView;
  legacy.keyboard.telemetry = "KeyV";
  const migrated = decodeBindings(JSON.stringify(legacy));
  assert.equal(migrated.keyboard.telemetry, "KeyV", "the old remap survives");
  assert.notEqual(migrated.keyboard.cameraView, "KeyV");
  assert.ok(!Object.values({ ...migrated.keyboard, cameraView: undefined }).includes(migrated.keyboard.cameraView));
  assert.ok(!("cameraView" in migrated.gamepad), "the pad camera cycle is fixed to D-pad Up, not a binding");
  assert.deepEqual(decodeBindings(JSON.stringify({ version: 1, ...migrated })), migrated);
  // A save that never touched V gets the default.
  const untouched = JSON.parse(JSON.stringify({ version: 1, ...copyBindings() }));
  delete untouched.keyboard.cameraView;
  assert.equal(decodeBindings(JSON.stringify(untouched)).keyboard.cameraView, "KeyV");
});

test("remapped triggers keep analog pressure and the original button stops driving", () => {
  const bindings = rebind(copyBindings(), "gamepad", "throttle", 1);
  // Below the trigger curve's knee (input.ts, TRIGGER_KNEE) the pressure passes through exactly.
  assert.equal(mapGamepad(pad({1:.43,7:1}), bindings.gamepad).throttle, .43);
  assert.equal(mapGamepad(pad({7:1}), bindings.gamepad).throttle, 0);
});

test("map rebinding and saved maps reject fixed menu buttons without restricting driving controls", () => {
  const bindings = rebind(copyBindings(), "gamepad", "handbrake", 1);
  for (const button of [0, 1, 9, 12, 13, 14, 15]) {
    assert.throws(() => rebind(bindings, "gamepad", "map", button), /Menu/);
    const saved = { version: 1, ...bindings, gamepad: { ...bindings.gamepad, map: button } };
    assert.throws(() => decodeBindings(JSON.stringify(saved)), /Invalid/);
  }
  assert.equal(rebind(bindings, "gamepad", "handbrake", 0).gamepad.handbrake, 0);
  assert.equal(rebind(bindings, "gamepad", "handbrake", 1).gamepad.handbrake, 1);
  assert.throws(() => rebind(copyBindings(), "gamepad", "map", 5), /Already assigned/);
});

test("adding map controls preserves legacy bindings already using M or Select", () => {
  const legacy=JSON.parse(JSON.stringify({version:1,...copyBindings()}));
  delete legacy.keyboard.map;delete legacy.gamepad.map;
  delete legacy.keyboard.flash;delete legacy.gamepad.flash;
  legacy.keyboard.throttle="KeyM";legacy.gamepad.camera=8;
  const migrated=decodeBindings(JSON.stringify(legacy));
  assert.equal(migrated.keyboard.throttle,"KeyM");
  assert.equal(migrated.gamepad.camera,8);
  assert.notEqual(migrated.keyboard.map,"KeyM");
  assert.notEqual(migrated.gamepad.map,8);
  assert.ok(![0, 1, 9, 12, 13, 14, 15].includes(migrated.gamepad.map), "migration must leave menu buttons fixed");
  assert.deepEqual(decodeBindings(JSON.stringify({version:1,...migrated})),migrated);
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
    // Exercise a pre-map save that already uses Select, including when A is free.
    for (const handbrake of [0, 5]) {
      const legacy = JSON.parse(JSON.stringify({ version: 1, ...copyBindings() }));
      delete legacy.gamepad.map;
      delete legacy.gamepad.shiftUp; delete legacy.gamepad.shiftDown;
      delete legacy.keyboard.shiftUp; delete legacy.keyboard.shiftDown;
      legacy.gamepad.camera = 8;
      legacy.gamepad.handbrake = handbrake;
      const migrated = decodeBindings(JSON.stringify(legacy));
      input.setBindings(migrated);
      current = pad({ [migrated.gamepad.map]: 1 }); input.update();
      assert.deepEqual(input.consumeMenuCommands(), ["map"], "migrated map must not emit confirm or back");
      input.update(); assert.deepEqual(input.consumeMenuCommands(), []);
      current = pad(); input.update();
      for (const [button, command] of [[0, "confirm"], [1, "back"], [9, "pause"]] as const) {
        current = pad({ [button]: 1 }); input.update();
        assert.deepEqual(input.consumeMenuCommands(), [command]);
        current = pad(); input.update();
      }
    }
    input.setBindings(copyBindings());
    key("KeyM"); assert.deepEqual(input.consumeMenuCommands(), ["map"]);
    current = pad({8:1}); input.update(); assert.deepEqual(input.consumeMenuCommands(), ["map"]);
    input.update(); assert.deepEqual(input.consumeMenuCommands(), [], "held Select must not repeatedly toggle the map");
    current = pad(); input.update();
    key("KeyV"); assert.equal(input.consumeCameraCycle(), true);
    assert.equal(input.consumeCameraCycle(), false, "one press is one camera change");
    current = pad({12:1}); input.update(); assert.equal(input.consumeCameraCycle(), true, "D-pad Up changes camera");
    input.update(); assert.equal(input.consumeCameraCycle(), false, "a held D-pad must not keep cycling");
    current = pad(); input.update(); input.consumeMenuCommands();
    current = { ...pad(), axes: [0, -1, 0, 0] } as Gamepad; input.update();
    assert.equal(input.consumeCameraCycle(), false, "the left stick is steering and menu up, never the camera");
    current = pad(); input.update(); input.consumeMenuCommands();
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
