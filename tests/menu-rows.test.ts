import assert from "node:assert/strict";
import test from "node:test";
import { stepOption } from "../src/ui/menu-rows.ts";
import { hintGlyph, padGlyph } from "../src/ui/prompts.ts";

const PARTS = [{ id: "stock", label: "Stock" }, { id: "street", label: "Street" }, { id: "race", label: "Race" }];

// design/MENUS.md: a row's value changes in place with left / right and wraps,
// the way MC3's garage cycles a part.
test("a row steps through its options and wraps at both ends", () => {
  assert.equal(stepOption(PARTS, "stock", 1)!.id, "street");
  assert.equal(stepOption(PARTS, "race", 1)!.id, "stock", "right from the last wraps to the first");
  assert.equal(stepOption(PARTS, "stock", -1)!.id, "race", "left from the first wraps to the last");
  assert.equal(stepOption([], "stock", 1), null);
});

// A kit mixed from parts is not one of the kits. Stepping from it has to land
// somewhere definite, not skip an option or stay stuck on "Custom mix".
test("from a value that is not an option, right is the first option and left the last", () => {
  assert.equal(stepOption(PARTS, "mixed", 1)!.id, "stock");
  assert.equal(stepOption(PARTS, "mixed", -1)!.id, "race");
});

// The hint bar names buttons the way the pad prints them.
test("hint glyphs are the pad's own buttons, and the keyboard's keys with no pad", () => {
  const xbox = "Xbox Wireless Controller (STANDARD GAMEPAD)", dualshock = "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)";
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(button => padGlyph(button as 0, xbox)), ["A", "B", "X", "Y", "LB", "RB"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(button => padGlyph(button as 0, dualshock)), ["✕", "○", "□", "△", "L1", "R1"]);
  assert.equal(hintGlyph("action-x", dualshock), "□");
  assert.equal(hintGlyph("section-next", xbox), "RB");
  assert.equal(hintGlyph("back", null), "Esc");
  assert.equal(hintGlyph("section-prev", null), "Q");
  assert.equal(hintGlyph("turn", null), "", "the platform turns on the right stick only, so there is no key to name");
});
