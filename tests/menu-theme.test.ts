import test from "node:test";
import assert from "node:assert/strict";
import { createMenuTheme, decodeTheme, loadMenuTheme, THEME_FADE } from "../src/audio/menu-theme.ts";
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

/**
 * A Web Audio context that records what the theme asks of it: the buffer
 * sources it starts, where each started, and the loop each was given.
 */
function themeFixture(t: test.TestContext, duration = 120) {
  const ramps: number[] = [];
  const started: { offset: number; loop: boolean; loopStart: number; loopEnd: number }[] = [];
  const state = { live: 0, decoded: 0, resumed: 0, state: "running" as AudioContextState };
  class FakeSource {
    buffer: unknown = null; loop = false; loopStart = 0; loopEnd = 0; onended = null;
    connect() {} disconnect() { state.live--; }
    start(_when: number, offset: number) {
      state.live++;
      started.push({ offset, loop: this.loop, loopStart: this.loopStart, loopEnd: this.loopEnd });
    }
    stop() {}
  }
  const context = {
    currentTime: 0,
    get state() { return state.state; },
    createGain: () => ({ gain: { value: 0, cancelAndHoldAtTime() {}, linearRampToValueAtTime(value: number) { ramps.push(value); } }, connect() {} }),
    createBufferSource: () => new FakeSource(),
    decodeAudioData: async () => { state.decoded++; return { duration } as AudioBuffer; },
    resume: async () => { state.resumed++; state.state = "running"; },
  };
  let ok = true;
  t.mock.method(globalThis, "fetch", async () => ({ ok, arrayBuffer: async () => new ArrayBuffer(8) }));
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { context: context as unknown as AudioContext, ramps, started, state, settle,
    fail: () => { ok = false; }, at: (time: number) => Object.assign(context, { currentTime: time }) };
}

test("the loop belongs to the buffer source, playing the intro once and turning at the config's points", async t => {
  const f = themeFixture(t);
  const theme = createMenuTheme(f.context, {} as AudioNode, decodeTheme({ file: "a.wav", start: 0, loopStart: 6.3158, loopEnd: 119.99 }), "http://localhost/");
  theme.setActive(true);
  await f.settle();
  assert.deepEqual(f.started, [{ offset: 0, loop: true, loopStart: 6.3158, loopEnd: 119.99 }],
    "the intro must play once, then the source's own loop carries it");
  assert.equal(theme.status().playing, true);
  // Time inside the loop is carried round it, not run off the end of the file.
  f.at(130);
  const time = theme.status().time;
  assert.ok(time >= 6.3158 && time <= 119.99, `time ran past the loop: ${time}`);
  assert.ok(Math.abs(time - (6.3158 + (130 - 119.99) % (119.99 - 6.3158))) < 1e-6);
});

test("menu navigation never restarts the intro; exit fades before stopping and return resumes", async t => {
  const f = themeFixture(t);
  const theme = createMenuTheme(f.context, {} as AudioNode, decodeTheme({ file: "a.wav", volume: .8, loopStart: 10, loopEnd: 30 }), "http://localhost/");
  theme.setActive(true);
  await f.settle();
  assert.equal(f.started.length, 1);
  theme.setActive(true);
  assert.equal(f.started.length, 1, "a second menu page restarted the theme");
  f.at(24);
  theme.setActive(false);
  assert.equal(f.state.live, 1, "the theme stopped before its fade finished");
  f.at(24 + THEME_FADE);
  theme.update();
  assert.equal(f.state.live, 0);
  theme.setActive(true);
  // It plays on through the fade, so it resumes where the sound actually stopped.
  assert.equal(f.started.at(-1)!.offset, 24 + THEME_FADE, "the theme restarted the intro instead of resuming");
  assert.deepEqual(f.ramps, [.8, 0, .8]);
  // A drive begun and abandoned inside the fade keeps the same source playing.
  theme.setActive(false);
  theme.setActive(true);
  f.at(40);
  theme.update();
  assert.equal(f.state.live, 1, "a rapid return let the pending stop through");
  assert.equal(f.started.length, 2);
});

test("a theme that will not load stays silent, and a suspended context is resumed on retry", async t => {
  const f = themeFixture(t);
  const empty = createMenuTheme(f.context, {} as AudioNode, null, "http://localhost/");
  empty.setActive(true);
  await f.settle();
  assert.equal(f.started.length, 0, "no config, no source");
  assert.equal(empty.status().playing, false);

  const blocked = themeFixture(t);
  Object.assign(blocked.state, { state: "suspended" });
  const theme = createMenuTheme(blocked.context, {} as AudioNode, decodeTheme({ file: "a.wav" }), "http://localhost/");
  theme.setActive(true);
  await blocked.settle();
  theme.retry();
  assert.equal(blocked.state.resumed, 1, "a suspended context was never resumed");

  const broken = themeFixture(t);
  broken.fail();
  const missing = createMenuTheme(broken.context, {} as AudioNode, decodeTheme({ file: "gone.wav" }), "http://localhost/");
  missing.setActive(true);
  await broken.settle();
  assert.equal(missing.status().failed, true);
  assert.equal(broken.started.length, 0);
  missing.retry();
  assert.equal(broken.started.length, 0, "a failed theme kept retrying");
});

test("local config takes precedence, missing override uses default, explicit null disables", async t => {
  const f = themeFixture(t);
  let local: unknown = { file: "personal.mp3", title: "Personal" };
  let missing = false;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const override = url.toString().includes("theme.local.json");
    return { ok: !override || !missing, json: async () => override ? local : { file: "default.mp3", title: "Default" },
      arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const load = () => loadMenuTheme(f.context, {} as AudioNode, "http://localhost/");
  assert.equal((await load()).status().title, "Personal");
  missing = true;
  assert.equal((await load()).status().title, "Default");
  missing = false; local = { file: null };
  assert.equal((await load()).status().title, null);
});
