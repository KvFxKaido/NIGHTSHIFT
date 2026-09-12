import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsStore, decodeSettings, defaultSettings, SETTINGS_KEY,
  SETTINGS_VERSION, settingsStatusMessage, withoutSettingsOverrides } from "../src/settings/settings.ts";
import type { PlayerCarId } from "../src/customization/cars.ts";
import { DEFAULT_LEVELS } from "../src/audio/audio-mix.ts";

function storage() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return { data, writes, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); data.set(key, value); } };
}
const example = { car: "cinder" as const,
  customization: { paint: "ice", wheels: "alloy", stance: "slammed" },
  audio: { ...DEFAULT_LEVELS } };

test("a fresh settings store uses defaults without writing on startup", () => {
  const disk = storage();
  const store = createSettingsStore(() => disk);
  assert.deepEqual(store.get(), { car: "cinder",
    customization: { paint: "signal", wheels: "graphite", stance: "street" }, audio: DEFAULT_LEVELS });
  assert.equal(store.status(), "ready");
  assert.equal(disk.writes.length, 0);
});

test("each garage category round-trips through a new store", () => {
  const disk = storage();
  const store = createSettingsStore(() => disk);
  for (const [category, value] of Object.entries(example.customization)) {
    store.update({ customization: { [category]: value } });
  }
  const reloaded = createSettingsStore(() => disk);
  assert.deepEqual(reloaded.get(), example);
  assert.equal(reloaded.status(), "saved");
  assert.deepEqual(JSON.parse(disk.getItem(SETTINGS_KEY)!), { version: SETTINGS_VERSION, ...example });
  assert.deepEqual([...new Set(disk.writes)], [SETTINGS_KEY]);
  const copy = reloaded.get();
  copy.customization.paint = "signal";
  assert.equal(reloaded.get().customization.paint, "ice", "callers cannot mutate the saved base");
});

test("malformed and unknown-version saves use safe defaults without overwriting the original", () => {
  for (const raw of ["{", "null", "[]", "42", JSON.stringify({ version: 999, ...example })]) {
    const disk = storage();
    disk.data.set(SETTINGS_KEY, raw);
    const store = createSettingsStore(() => disk);
    assert.deepEqual(store.get(), defaultSettings());
    assert.equal(store.status(), "recovered");
    assert.equal(disk.getItem(SETTINGS_KEY), raw);
    assert.equal(disk.writes.length, 0);
  }
});

test("invalid saved fields recover individually and unrelated saved fields survive", () => {
  const decoded = decodeSettings(JSON.stringify({ version: 1, drivetrain: "__proto__",
    customization: { paint: "ice", wheels: 3, stance: "slammed" }, vehicle: { speed: 100 } }));
  // Version 1 predates audio, so those levels default while the damaged wheels
  // report as recovered. The drivetrain is neither: it stopped being a setting
  // when it became a property of the body, so a stored one is simply dropped.
  assert.deepEqual(decoded.settings, { car: "cinder",
    customization: { paint: "ice", wheels: "graphite", stance: "slammed" }, audio: DEFAULT_LEVELS });
  assert.equal(decoded.status, "recovered");
  assert.ok(!("drivetrain" in decoded.settings), "a stored drivetrain must not leak back in");
});

test("blocked storage does not crash boot or discard choices during the session", () => {
  const denied = () => { throw new Error("Storage disabled"); };
  const store = createSettingsStore(denied);
  assert.equal(store.status(), "unavailable");
  store.update({ car: "bulwark" });
  store.update({ customization: { paint: "ice" } });
  assert.equal(store.get().car, "bulwark");
  assert.equal(store.get().customization.paint, "ice");
  assert.match(settingsStatusMessage(store.status(), ""), /session only/);
});

test("a quota failure reports unsaved choices and can recover on a later change", () => {
  const disk = storage();
  let fail = true;
  const store = createSettingsStore(() => ({ getItem: disk.getItem,
    setItem: (key, value) => { if (fail) throw new Error("QuotaExceededError"); disk.setItem(key, value); } }));
  store.update(example);
  assert.equal(store.status(), "unavailable");
  assert.deepEqual(store.get(), example);
  fail = false;
  store.update({ car: "bulwark" });
  assert.equal(store.status(), "saved");
  assert.deepEqual(createSettingsStore(() => disk).get(), { ...example, car: "bulwark" });
});

test("preview callbacks cannot write preferences or pollute the next menu edit", () => {
  const disk = storage();
  const store = createSettingsStore(() => disk);
  store.update(example);
  const before = disk.getItem(SETTINGS_KEY);
  store.preview(() => {
    assert.equal(store.update({ car: "bulwark", customization: { paint: "signal" } }), false);
    store.preview(() => store.update({ customization: { stance: "street" } }));
  });
  assert.equal(disk.getItem(SETTINGS_KEY), before);
  store.update({ customization: { wheels: "white" } });
  assert.deepEqual(store.get(), { ...example, customization: { ...example.customization, wheels: "white" } });
  assert.throws(() => store.preview(() => { throw new Error("bad link"); }), /bad link/);
  assert.equal(store.update({ car: "bulwark" }), true, "preview suppression ends even when a link throws");
});

test("two open tabs merge deliberate field changes instead of clobbering each other", () => {
  const disk = storage();
  const first = createSettingsStore(() => disk);
  const second = createSettingsStore(() => disk);
  first.update({ car: "bulwark" });
  second.update({ customization: { paint: "ice" } });
  first.update({ customization: { stance: "low" } });
  assert.deepEqual(createSettingsStore(() => disk).get(), { car: "bulwark",
    customization: { paint: "ice", wheels: "graphite", stance: "low" }, audio: DEFAULT_LEVELS });
});

test("invalid user changes cannot get stored", () => {
  const disk = storage();
  const store = createSettingsStore(() => disk);
  assert.throws(() => store.update({ car: "4wd" as PlayerCarId }), RangeError);
  assert.throws(() => store.update({ customization: { stance: "underground" } }), RangeError);
  assert.equal(disk.writes.length, 0);
});

test("saving a choice removes only its URL override so refresh honors the saved value", () => {
  const href = "http://localhost:5173/?scene=garage&paint=signal&wheels=alloy&drivetrain=awd&freeze=1#car";
  const next = new URL(withoutSettingsOverrides(href, ["paint"]));
  assert.equal(next.searchParams.get("scene"), "garage");
  assert.equal(next.searchParams.get("paint"), null);
  // Drivetrain is a developer override now rather than a saved preference, so
  // saving a garage choice must not clear a handling comparison someone set up.
  assert.equal(next.searchParams.get("drivetrain"), "awd");
  assert.equal(next.searchParams.get("wheels"), "alloy");
  assert.equal(next.searchParams.get("freeze"), "1");
  assert.equal(next.hash, "#car");
  assert.match(settingsStatusMessage("saved", "?paint=signal"), /Preview/);
  assert.equal(settingsStatusMessage("saved", "?scene=garage"), "Saved on this browser.");
});


test("version 2 saves retain appearance and audio when car selection is added", () => {
  const { car, ...old } = example;
  const audio = { master: .2, engine: .3, music: .4 };
  const result = decodeSettings(JSON.stringify({ version: 2, ...old, audio }));
  assert.equal(result.status, "saved");
  assert.deepEqual(result.settings, { ...example, audio });
});

test("car choice persists, merges across tabs and rejects invalid models", () => {
  const disk = storage();
  const first = createSettingsStore(() => disk);
  const second = createSettingsStore(() => disk);
  first.update({ car: "bulwark" });
  second.update({ customization: { paint: "ice" } });
  const reloaded = createSettingsStore(() => disk);
  assert.equal(reloaded.get().car, "bulwark");
  assert.equal(reloaded.get().customization.paint, "ice");
  assert.throws(() => first.update({ car: "unknown" as "bulwark" }), RangeError);
  const recovered = decodeSettings(JSON.stringify({ version: SETTINGS_VERSION, ...example, car: "unknown" }));
  assert.equal(recovered.settings.car, "cinder");
  assert.equal(recovered.settings.customization.paint, example.customization.paint);
  assert.equal(recovered.status, "recovered");
  assert.match(settingsStatusMessage("saved", "?car=bulwark"), /Preview/);
  assert.equal(new URL(withoutSettingsOverrides("http://localhost/?car=bulwark&scene=garage", ["car"])).search, "?scene=garage");
});

// The NS-01 became the car Sable drives, so it is no longer a garage choice.
// A stored setting that still names it is a migration, not damage: reporting
// recovery would leave decodeSaves short of "saved", and it throws on that,
// taking every save slot with it rather than just the stale one.
test("a retired car migrates to its replacement without reporting recovery", () => {
  const stored = decodeSettings(JSON.stringify({ version: SETTINGS_VERSION, ...example, car: "blender" }));
  assert.equal(stored.settings.car, "cinder", "an NS-01 save did not migrate");
  assert.notEqual(stored.status, "recovered", "migration must not read as damage");
  assert.equal(stored.settings.customization.paint, example.customization.paint,
    "the rest of the build survived");
  // An unknown car is still damage, and still falls back to the default.
  const damaged = decodeSettings(JSON.stringify({ version: SETTINGS_VERSION, ...example, car: "ns-99" }));
  assert.equal(damaged.settings.car, defaultSettings().car);
  assert.equal(damaged.status, "recovered");
});
