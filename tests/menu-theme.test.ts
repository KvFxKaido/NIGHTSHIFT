import test from "node:test";
import assert from "node:assert/strict";
import { createMenuTheme, decodeTheme, loadMenuTheme } from "../src/audio/menu-theme.ts";
import { createInitialMenuState, transitionMenu, usesMenuTheme } from "../src/ui/menu-state.ts";

test("theme config keeps the whole intro by default and rejects paths or invalid timing", () => {
  assert.deepEqual(decodeTheme({ file: "FWU.mp3" }), {
    file: "FWU.mp3", title: "Menu theme", volume: 1, start: 0, loopStart: null, loopEnd: null,
  });
  for (const file of [null, "", "../song.mp3", "folder/song.mp3", "C:\\song.mp3"]) assert.equal(decodeTheme({ file }), null);
  const config = decodeTheme({ file: "song.mp3", start: NaN, loopStart: 12, loopEnd: 3, volume: 4 })!;
  assert.equal(config.start, 0);
  assert.equal(config.loopEnd, null);
  assert.equal(config.volume, 1);
});

test("front-end pages retain the theme while every in-drive overlay retains the radio", () => {
  const main = createInitialMenuState();
  assert.equal(usesMenuTheme(main), true);
  for (const event of ["open-garage", "open-options", "open-saves", "open-races", "open-blacklist", "map-toggle"] as const) {
    assert.equal(usesMenuTheme(transitionMenu(main, event)), true, event);
    const paused = transitionMenu({ screen: "playing", returnTo: "main" }, "pause-toggle");
    assert.equal(usesMenuTheme(transitionMenu(paused, event)), false, event);
  }
  for (const screen of ["playing", "pause", "results"] as const) assert.equal(usesMenuTheme({ screen, returnTo: "main" }), false);
  assert.equal(usesMenuTheme({ screen: "garage", returnTo: "playing" }), false);
  assert.equal(usesMenuTheme({ screen: "controls", returnTo: "pause", submenu: "options" }), false);
});

function audioFixture(t: test.TestContext) {
  let element: FakeAudio;
  class FakeAudio extends EventTarget {
    src = "";
    currentTime = 0;
    duration = 100;
    paused = true;
    ended = false;
    plays = 0;
    reject: string | null = null;
    constructor() { super(); element = this; }
    async play() { this.plays++; if (this.reject) throw { name: this.reject }; this.paused = false; }
    pause() { this.paused = true; }
  }
  const original = globalThis.Audio;
  Object.assign(globalThis, { Audio: FakeAudio });
  t.after(() => { Object.assign(globalThis, { Audio: original }); });
  const ramps: number[] = [];
  const context = {
    currentTime: 0,
    createGain: () => ({ gain: { value: 0, cancelAndHoldAtTime() {}, linearRampToValueAtTime(value: number) { ramps.push(value); } }, connect() {} }),
    createMediaElementSource: () => ({ connect() {} }),
  };
  return { context: context as unknown as AudioContext, element: () => element!, ramps };
}

test("menu navigation never restarts the intro; exit fades before pausing and return resumes", async t => {
  const f = audioFixture(t);
  const theme = createMenuTheme(f.context, {} as AudioNode, decodeTheme({ file: "a.mp3", volume: .8 }), "http://localhost/");
  theme.setActive(true);
  f.element().dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.element().currentTime, 0);
  f.element().currentTime = 24;
  theme.setActive(true);
  assert.equal(f.element().plays, 1);
  theme.setActive(false);
  assert.equal(f.element().paused, false, "fade before pause");
  Object.assign(f.context, { currentTime: 1 });
  theme.update();
  assert.equal(f.element().paused, true);
  theme.setActive(true);
  assert.equal(f.element().currentTime, 24);
  assert.deepEqual(f.ramps, [.8, 0, .8]);
  theme.setActive(false);
  theme.setActive(true);
  Object.assign(f.context, { currentTime: 3 });
  theme.update();
  assert.equal(f.element().paused, false, "rapid return cancels pending pause");
});

test("optional repeat section preserves the first intro and loops only at its end", t => {
  const f = audioFixture(t);
  const theme = createMenuTheme(f.context, {} as AudioNode, decodeTheme({ file: "a.mp3", loopStart: 10, loopEnd: 30 }), "http://localhost/");
  f.element().dispatchEvent(new Event("loadedmetadata"));
  theme.setActive(true);
  assert.equal(f.element().currentTime, 0);
  f.element().currentTime = 31;
  theme.update();
  assert.equal(f.element().currentTime, 10);
  f.element().currentTime = 100;
  f.element().dispatchEvent(new Event("ended"));
  assert.equal(f.element().currentTime, 10);
});

test("missing audio stays silent, blocked playback retries, and unreadable tracks do not retry forever", async t => {
  const f = audioFixture(t);
  const empty = createMenuTheme(f.context, {} as AudioNode, null, "http://localhost/");
  empty.setActive(true);
  assert.equal(f.element().plays, 0);
  const theme = createMenuTheme(f.context, {} as AudioNode, decodeTheme({ file: "a.mp3", start: 1000 }), "http://localhost/");
  f.element().dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.element().currentTime, 0);
  f.element().reject = "NotAllowedError";
  theme.setActive(true);
  await Promise.resolve(); await Promise.resolve();
  f.element().reject = null;
  theme.retry();
  assert.equal(f.element().plays, 2);
  f.element().dispatchEvent(new Event("error"));
  theme.setActive(false); theme.setActive(true); theme.retry();
  assert.equal(f.element().plays, 2);
  assert.equal(theme.status().failed, true);
});

test("local config takes precedence, missing override uses default, explicit null disables", async t => {
  const f = audioFixture(t);
  let local: unknown = { file: "personal.mp3", title: "Personal" };
  let missing = false;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const override = url.toString().includes("theme.local.json");
    return { ok: !override || !missing, json: async () => override ? local : { file: "default.mp3", title: "Default" } };
  });
  const load = () => loadMenuTheme(f.context, {} as AudioNode, "http://localhost/");
  assert.equal((await load()).status().title, "Personal");
  missing = true;
  assert.equal((await load()).status().title, "Default");
  missing = false; local = { file: null };
  assert.equal((await load()).status().title, null);
});
