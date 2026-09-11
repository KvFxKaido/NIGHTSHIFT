import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createInitialMenuState, transitionMenu } from "../src/ui/menu-state.ts";
import { MENU_ITEM_SELECTOR } from "../src/ui/menu.ts";

// Track selection is gone: the district is the game and free roam is how you
// meet it, so Drive goes straight from the title into the world.
test("title drives straight into the district", () => {
  assert.equal(transitionMenu(createInitialMenuState(), "start-track").screen, "playing");
});

test("pause resumes, backs out to the road, or opens the garage and returns", () => {
  const paused = transitionMenu({ screen: "playing", returnTo: "main" }, "pause-toggle");
  assert.equal(paused.screen, "pause");
  assert.equal(transitionMenu(paused, "resume").screen, "playing");
  assert.equal(transitionMenu(paused, "back").screen, "playing", "back from pause returns to driving");

  const garage = transitionMenu(paused, "open-garage");
  assert.equal(garage.returnTo, "pause");
  assert.equal(transitionMenu(garage, "back").screen, "pause");
});

test("garage is a main-menu branch", () => {
  const garage = transitionMenu(createInitialMenuState(), "open-garage");
  assert.equal(garage.screen, "garage");
  assert.equal(transitionMenu(garage, "back").screen, "main");
});

test("city map closes to its origin without restarting a drive", () => {
  for (const origin of ["main", "pause", "playing"] as const) {
    const map=transitionMenu({screen:origin,returnTo:"main"},"map-toggle");
    assert.deepEqual(map,{screen:"map",returnTo:origin});
    for (const close of ["map-toggle","back","pause-toggle"] as const) {
      assert.equal(transitionMenu(map,close).screen,origin);
    }
  }
  const garage={screen:"garage",returnTo:"playing"} as const;
  assert.deepEqual(transitionMenu(garage,"map-toggle"),garage);
  const controls={screen:"controls",returnTo:"pause"} as const;
  assert.deepEqual(transitionMenu(controls,"map-toggle"),controls);
});

// Regression: the audio sliders were added to the pause screen but not to the
// menu's navigable set, so a pad or arrow-key player could never land on them.
// Worse than unreachable — hunting for them cycled onto Track Select and threw
// the player out of their run. Any interactive control the menu cannot focus
// is the same bug waiting to happen, so hold the selector against the markup.
test("every interactive control in the menu markup is reachable by navigation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const screens = html.match(/<section[^>]*data-menu-screen[\s\S]*?<\/section>/g) ?? [];
  assert.ok(screens.length >= 3, `expected the menu screens, found ${screens.length}`);

  const reachable = (tag: string, attributes: string): boolean => {
    if (/\bdisabled\b/.test(attributes)) return true;
    if (tag === "button") return MENU_ITEM_SELECTOR.includes("button");
    const type = attributes.match(/\btype="([^"]+)"/)?.[1] ?? "text";
    return MENU_ITEM_SELECTOR.includes(`input[type="${type}"]`);
  };

  let checked = 0;
  for (const screen of screens) {
    const name = screen.match(/data-menu-screen="([^"]+)"/)?.[1] ?? "?";
    for (const [, tag, attributes] of screen.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)) {
      assert.ok(reachable(tag!, attributes!),
        `<${tag}> on the ${name} screen is focusable but not in MENU_ITEM_SELECTOR, ` +
        `so pad and keyboard navigation will skip it: ${attributes!.trim()}`);
      checked++;
    }
  }
  assert.ok(checked > 10, `expected to inspect the real menu controls, saw ${checked}`);
});

test("sliders are navigable and confirming on one cannot activate a button", () => {
  assert.match(MENU_ITEM_SELECTOR, /input\[type="range"\]/);
  assert.match(MENU_ITEM_SELECTOR, /button/);
  // Both halves must exclude disabled controls, or navigation lands on dead items.
  assert.equal(MENU_ITEM_SELECTOR.match(/:not\(\[disabled\]\)/g)?.length, 2);
});
