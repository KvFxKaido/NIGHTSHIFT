import assert from "node:assert/strict";
import test from "node:test";
import {
  PAINT_OPTIONS,
  STANCE_OPTIONS,
  WHEEL_OPTIONS,
  createDefaultCustomization,
  updateCustomization,
  customizationOption, bodyPresetIsMixed,
  hslOf, isCustomizationValue, paintFromHsl, paintOf, PAINT_FINISH,
} from "../src/customization/customization.ts";

// Paint is a colour picker since 2026-09-24: a paint is `#rrggbb`, and the presets it replaced still read, with
// their own finishes, because saves, slots and links name them.
test("a paint is a picked colour or a named preset, and draws in its finish", () => {
  const defaults = createDefaultCustomization();
  assert.equal(updateCustomization(defaults, "paint", "#3a7bd5").paint, "#3a7bd5");
  for (const bad of ["#3A7BD5", "#fff", "3a7bd5", "#12345g", "blue", ""]) {
    assert.equal(updateCustomization(defaults, "paint", bad), defaults, `${bad} was taken as a paint`);
    assert.equal(isCustomizationValue("paint", bad), false);
  }
  assert.equal(isCustomizationValue("wheels", "#3a7bd5"), false, "only paint is a colour");
  assert.deepEqual(paintOf("#3a7bd5"), { color: 0x3a7bd5, ...PAINT_FINISH });
  const ice = PAINT_OPTIONS.find(option => option.id === "ice")!;
  assert.equal(paintOf("ice"), ice, "an old preset keeps its own finish");
  assert.equal(paintOf("chrome"), PAINT_OPTIONS[0], "an unknown paint draws as the first preset");
  assert.equal(customizationOption({ ...defaults, paint: "#3a7bd5" }, "paint"), "#3a7bd5");
});

test("the picker's hue, saturation and brightness reach every preset and give back what they were given", () => {
  for (const option of PAINT_OPTIONS) {
    const back = Number.parseInt(paintFromHsl(hslOf(option.color)).slice(1), 16);
    for (const shift of [16, 8, 0]) {
      assert.ok(Math.abs((back >> shift & 255) - (option.color >> shift & 255)) <= 1, `${option.id} came back as ${back.toString(16)}`);
    }
  }
  assert.equal(paintFromHsl({ h: 0, s: 100, l: 50 }), "#ff0000");
  assert.equal(paintFromHsl({ h: 360, s: 100, l: 50 }), "#ff0000", "hue wraps");
  assert.equal(paintFromHsl({ h: 210, s: 0, l: 50 }), "#808080", "no saturation is a grey, whatever the hue");
  assert.equal(paintFromHsl({ h: 120, s: 140, l: -5 }), "#000000", "out-of-range rows clamp");
  assert.deepEqual(hslOf(0xffffff), { h: 0, s: 0, l: 100 });
});

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

test("legacy kits resolve into slots and choosing a kit replaces a custom mix", () => {
  const oldStreet = { ...createDefaultCustomization(), bodyKit: "street" };
  for (const slot of ["front", "skirts", "rear", "spoiler"] as const) assert.equal(customizationOption(oldStreet, slot), "street");
  const mixed = updateCustomization(updateCustomization(oldStreet, "front", "race"), "spoiler", "none");
  assert.ok(bodyPresetIsMixed(mixed));
  assert.equal(customizationOption(mixed, "rear"), "street");
  const race = updateCustomization({ ...mixed, wheelDesign: "mesh", tint: "dark" }, "bodyKit", "race");
  assert.equal(bodyPresetIsMixed(race), false);
  assert.equal(race.spoiler, "wing");
  assert.equal(race.rear, "race");
  assert.equal(race.tint, "dark");
  assert.equal(race.wheelDesign, "mesh");
  const stock = updateCustomization(race, "bodyKit", "stock");
  for (const slot of ["front", "skirts", "rear", "spoiler"] as const) assert.equal(stock[slot], "stock");
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
