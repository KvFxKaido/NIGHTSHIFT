import assert from "node:assert/strict";
import test from "node:test";
import {
  PAINT_OPTIONS,
  STANCE_OPTIONS,
  WHEEL_OPTIONS,
  createDefaultCustomization,
  updateCustomization,
} from "../src/customization/customization.ts";

test("default customization references shipped options", () => {
  const defaults = createDefaultCustomization();
  assert.ok(PAINT_OPTIONS.some((option) => option.id === defaults.paint));
  assert.ok(WHEEL_OPTIONS.some((option) => option.id === defaults.wheels));
  assert.ok(STANCE_OPTIONS.some((option) => option.id === defaults.stance));
});

test("customization updates one visual category without mutating the old state", () => {
  const defaults = createDefaultCustomization();
  const customized = updateCustomization(defaults, "paint", "ultraviolet");
  assert.notEqual(customized, defaults);
  assert.equal(defaults.paint, "signal");
  assert.deepEqual(customized, { ...defaults, paint: "ultraviolet" });
});

test("unknown customization options are ignored", () => {
  const defaults = createDefaultCustomization();
  assert.equal(updateCustomization(defaults, "wheels", "not-a-wheel"), defaults);
});

test("lower stances progressively tuck the wheels behind the fenders", () => {
  const street = STANCE_OPTIONS.find((option) => option.id === "street")!;
  const low = STANCE_OPTIONS.find((option) => option.id === "low")!;
  const slammed = STANCE_OPTIONS.find((option) => option.id === "slammed")!;

  assert.ok(low.bodyOffset < street.bodyOffset);
  assert.ok(slammed.bodyOffset < low.bodyOffset);
  assert.ok(low.wheelInset > street.wheelInset);
  assert.ok(slammed.wheelInset > low.wheelInset);
});
