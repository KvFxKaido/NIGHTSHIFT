import assert from "node:assert/strict";
import test from "node:test";
import { createSaveStore, decodeSaves, loadSaveUrl, SAVES_KEY, type DriveSave } from "../src/settings/saves.ts";
import { defaultSettings } from "../src/settings/settings.ts";
import { safeSavePosition } from "../src/settings/save-position.ts";
import { BLACKGLASS_WORLD } from "../src/sim/road-world.ts";

const example: DriveSave = { id: "slot-1", name: "Hill runner", savedAt: 1234, world: "test-world",
  build: { car: "bulwark", drivetrain: "rwd", customization: defaultSettings().customization },
  position: { x: 100, z: 100, heading: .6 } };
function disk() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test("three named builds and positions round-trip independently across stores", () => {
  const storage = disk(), first = createSaveStore(() => storage), second = createSaveStore(() => storage);
  assert.deepEqual(first.list(), []); assert.equal(storage.data.size, 0);
  first.write(example);
  second.write({ ...example, id: "slot-2", name: "Wet streets", build: { ...example.build, car: "blender", drivetrain: "awd" } });
  first.write({ ...example, id: "slot-3", name: "Race save", position: null });
  first.write({ ...example, name: "Updated hill runner", savedAt: 5678 });
  const slots = second.list();
  assert.equal(slots.length, 3);
  assert.equal(slots.find(s => s.id === "slot-2")!.build.drivetrain, "awd");
  assert.equal(slots.find(s => s.id === "slot-3")!.position, null);
  assert.deepEqual(slots.find(s => s.id === "slot-1"), { ...example, name: "Updated hill runner", savedAt: 5678 });
});
test("invalid saves and storage failures never clobber existing slot data", () => {
  const storage = disk(), store = createSaveStore(() => storage);
  store.write(example);
  const before = storage.getItem(SAVES_KEY);
  assert.throws(() => store.write({ ...example, name: " " }));
  assert.throws(() => store.write({ ...example, position: { x: NaN, z: 0, heading: 0 } }));
  assert.equal(storage.getItem(SAVES_KEY), before);
  storage.data.set(SAVES_KEY, "broken-data");
  assert.throws(() => store.write(example));
  assert.equal(storage.getItem(SAVES_KEY), "broken-data");
  assert.throws(() => createSaveStore(() => { throw Error("blocked"); }).list());
  storage.data.set(SAVES_KEY, before!);
  const full = createSaveStore(() => ({ getItem: storage.getItem, setItem: () => { throw Error("quota"); } }));
  assert.throws(() => full.write({ ...example, name: "Cannot write" }));
  assert.equal(storage.getItem(SAVES_KEY), before);
});
test("malformed and unsupported slot payloads are rejected", () => {
  for (const value of [{ version: 2, slots: [] }, { version: 1, slots: [example, example] },
    { version: 1, slots: [{ ...example, build: { ...example.build, car: "missing" } }] },
    { version: 1, slots: [{ ...example, position: { x: 0, z: 0, heading: Infinity } }] }]) {
    assert.throws(() => decodeSaves(JSON.stringify(value)));
  }
});
test("loading a slot strips conflicting race, car and scripted-driving previews", () => {
  const url = new URL(loadSaveUrl("http://localhost:5173/?race=sound-to-sky&car=classic&drive=W600&freeze=1&drivetrain=awd", "slot-2"));
  assert.equal(url.search, "?world=seattle&scene=track&save=slot-2");
});
test("safe saved locations retain heading; stale, out-of-bounds and blocked saves return to the garage", () => {
  const world = { ...BLACKGLASS_WORLD, id: "test-world", solids: [{ x: 200, z: 200, width: 30, depth: 10, height: 10, rotation: .5 }] };
  const bounds = [0, 0, 1000, 1000];
  assert.equal(safeSavePosition(example, world, bounds)!.heading, .6);
  assert.equal(safeSavePosition({ ...example, world: "older" }, world, bounds), null);
  assert.equal(safeSavePosition({ ...example, position: null }, world, bounds), null);
  assert.equal(safeSavePosition({ ...example, position: { x: 200, z: 200, heading: 0 } }, world, bounds), null);
  assert.equal(safeSavePosition({ ...example, position: { x: -10, z: 200, heading: 0 } }, world, bounds), null);
});
