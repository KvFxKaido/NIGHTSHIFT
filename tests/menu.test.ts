import assert from "node:assert/strict";
import test from "node:test";
import { createInitialMenuState, transitionMenu } from "../src/ui/menu-state.ts";

test("title routes through track selection into play", () => {
  const trackSelect = transitionMenu(createInitialMenuState(), "open-track-select");
  assert.equal(trackSelect.screen, "track-select");
  assert.equal(transitionMenu(trackSelect, "start-track").screen, "playing");
});

test("pause can resume or return through track selection", () => {
  const paused = transitionMenu({ screen: "playing", returnTo: "main" }, "pause-toggle");
  assert.equal(paused.screen, "pause");
  assert.equal(transitionMenu(paused, "resume").screen, "playing");

  const trackSelect = transitionMenu(paused, "open-track-select");
  assert.equal(trackSelect.returnTo, "pause");
  assert.equal(transitionMenu(trackSelect, "back").screen, "pause");
});

test("garage is a main-menu branch", () => {
  const garage = transitionMenu(createInitialMenuState(), "open-garage");
  assert.equal(garage.screen, "garage");
  assert.equal(transitionMenu(garage, "back").screen, "main");
});
