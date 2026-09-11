import assert from "node:assert/strict";
import test from "node:test";
import { padLabel } from "../src/ui/prompts.ts";

test("contextual controller hints use one family for face buttons, shifts and pause", () => {
  for (const name of ["DualSense Wireless Controller", "054c-09cc", "PlayStation Controller"]) {
    assert.equal(padLabel(0, name), "Cross");
    assert.equal(padLabel(5, name), "R1");
    assert.equal(padLabel(9, name), "Options");
  }
  for (const name of ["Xbox Controller", "Standard Gamepad", null]) {
    assert.equal(padLabel(0, name), "A");
    assert.equal(padLabel(5, name), "RB");
    assert.equal(padLabel(9, name), "Menu");
  }
});
