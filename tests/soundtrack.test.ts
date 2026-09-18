import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editedTitle, parseId3v1, parseId3v2, readTrackTags, scannedTitle } from "../scripts/music-tags.mjs";
import { loadSoundtrack, trackPath, type SoundtrackOptions } from "../src/audio/soundtrack.ts";
import { decodeMusicPreference, loadMusicPreference, MUSIC_KEY, saveMusicPreference } from "../src/settings/music-preference.ts";

// ID3 tags built by hand, one version and encoding at a time.
const synchsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
const latin1 = (text: string) => Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]);
const utf8 = (text: string) => Buffer.concat([Buffer.from([3]), Buffer.from(text, "utf8")]);
const utf16 = (text: string) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, "utf16le"), Buffer.from([0, 0])]);

function frame(version: 2 | 3 | 4, id: string, body: Buffer, flags = [0, 0]): Buffer {
  if (version === 2) {
    const size = Buffer.alloc(3); size.writeUIntBE(body.length, 0, 3);
    return Buffer.concat([Buffer.from(id, "latin1"), size, body]);
  }
  const size = version === 4 ? synchsafe(body.length) : Buffer.alloc(4);
  if (version === 3) size.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from(id, "latin1"), size, Buffer.from(flags), body]);
}

function tag(version: 2 | 3 | 4, frames: Buffer[], flags = 0, transform = (body: Buffer) => body): Buffer {
  const body = transform(Buffer.concat([...frames, Buffer.alloc(32)]));
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([version, 0, flags]), synchsafe(body.length), body]);
}

/** ID3 unsynchronisation: a zero after every 0xFF that a sync pattern could follow. */
function unsynchronise(b: Buffer): Buffer {
  const out: number[] = [];
  b.forEach((byte, i) => { out.push(byte); if (byte === 0xff && (i + 1 === b.length || b[i + 1] === 0 || b[i + 1]! >= 0xe0)) out.push(0); });
  return Buffer.from(out);
}

function id3v1(title: string, artist: string): Buffer {
  const b = Buffer.alloc(128);
  b.write("TAG", 0, "latin1"); b.write(title, 3, 30, "latin1"); b.write(artist, 33, 30, "latin1");
  return b;
}

test("ID3v2 titles and artists read in every version and encoding", () => {
  assert.deepEqual(parseId3v2(tag(3, [frame(3, "TIT2", utf16("Hell Shell")), frame(3, "TPE1", latin1("Young Nudy"))])),
    { title: "Hell Shell", artist: "Young Nudy" }, "v2.3, UTF-16 with a byte-order mark");
  assert.deepEqual(parseId3v2(tag(4, [frame(4, "TALB", utf8("GNX")), frame(4, "TIT2", utf8("GNX")), frame(4, "TPE1", utf8("Kendrick Lamar\0SZA"))])),
    { title: "GNX", artist: "Kendrick Lamar, SZA" }, "v2.4, UTF-8, two artists");
  assert.deepEqual(parseId3v2(tag(2, [frame(2, "TT2", latin1("Who Run It")), frame(2, "TP1", latin1("Three 6 Mafia"))])),
    { title: "Who Run It", artist: "Three 6 Mafia" }, "v2.2's three-letter frames");
  // The byte-order mark FF FE is exactly what unsynchronisation rewrites.
  assert.deepEqual(parseId3v2(tag(3, [frame(3, "TIT2", utf16("Numb Numb Juice"))], 0x80, unsynchronise)),
    { title: "Numb Numb Juice" }, "v2.3 unsynchronised tag");
  const body = utf16("Calvin Cambridge"), stored = unsynchronise(body);
  const withLength = Buffer.concat([synchsafe(body.length), stored]);
  assert.deepEqual(parseId3v2(tag(4, [frame(4, "TIT2", withLength, [0, 0x03])])),
    { title: "Calvin Cambridge" }, "v2.4 frame unsynchronised, with its data length");
  assert.deepEqual(parseId3v2(tag(4, [frame(4, "TIT2", utf8(""))])), {}, "an empty title is no title");
  assert.deepEqual(parseId3v2(Buffer.from("not a tag at all")), {});
  assert.deepEqual(parseId3v1(id3v1("Shittin' Me", "A$AP Rocky")), { title: "Shittin' Me", artist: "A$AP Rocky" });
});

test("a scanned title is Artist - Title from the tags, or the filename without them", () => {
  assert.equal(scannedTitle("GNX.mp3", { title: "GNX", artist: "Kendrick Lamar" }), "Kendrick Lamar - GNX");
  assert.equal(scannedTitle("track01.mp3", { title: "GNX" }), "GNX");
  assert.equal(scannedTitle("GNX.mp3", { artist: "Kendrick Lamar" }), "Kendrick Lamar - GNX");
  assert.equal(scannedTitle("Kendrick Lamar - GNX.mp3", { artist: "Kendrick Lamar" }), "Kendrick Lamar - GNX", "no artist twice");
  assert.equal(scannedTitle("Chief Keef - Status.mp3", {}), "Chief Keef - Status");
});

test("a title the player typed survives, and one the scan wrote follows the tags", () => {
  assert.equal(editedTitle({ file: "a.mp3", title: "Mine", scanned: "Artist - A" }, "a.mp3"), "Mine");
  assert.equal(editedTitle({ file: "a.mp3", title: "Artist - A", scanned: "Artist - A" }, "a.mp3"), null);
  // A manifest from before tags were read: its titles were the filenames.
  assert.equal(editedTitle({ file: "a.mp3", title: "a" }, "a.mp3"), null);
  assert.equal(editedTitle({ file: "a.mp3", title: "Mine" }, "a.mp3"), "Mine");
  assert.equal(editedTitle(undefined, "a.mp3"), null);
});

test("the scan names tracks from their tags and keeps hand edits across a rescan", async () => {
  const folder = await mkdtemp(join(tmpdir(), "nightshift-music-"));
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
  try {
    await writeFile(join(folder, "GNX.mp3"), Buffer.concat([tag(4, [frame(4, "TIT2", utf8("GNX")), frame(4, "TPE1", utf8("Kendrick Lamar"))]), audio]));
    await writeFile(join(folder, "Old Rip.mp3"), Buffer.concat([audio, id3v1("Menace", "Lloyd Banks")]));
    await writeFile(join(folder, "Chief Keef - Status.mp3"), audio);
    await writeFile(join(folder, "Mine.mp3"), Buffer.concat([tag(3, [frame(3, "TIT2", utf16("Tagged"))]), audio]));
    await writeFile(join(folder, "notes.txt"), "not music");
    // As the old scan left it: a filename title, and one the player typed.
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ version: 1, tracks: [
      { file: "GNX.mp3", title: "GNX" }, { file: "Mine.mp3", title: "Typed By Hand" }, { file: "Gone.mp3", title: "Gone" },
    ] }));
    const scan = async () => {
      execFileSync(process.execPath, ["scripts/scan-music.mjs", folder], { stdio: "pipe" });
      const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"));
      return Object.fromEntries(manifest.tracks.map((track: { file: string; title: string }) => [track.file, track.title]));
    };
    assert.deepEqual(await scan(), {
      "Chief Keef - Status.mp3": "Chief Keef - Status",
      "GNX.mp3": "Kendrick Lamar - GNX",
      "Mine.mp3": "Typed By Hand",
      "Old Rip.mp3": "Lloyd Banks - Menace",
    });
    // Edit one in the manifest, retag another, rescan: the edit stays, the retag shows.
    const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"));
    manifest.tracks.find((track: { file: string }) => track.file === "Old Rip.mp3").title = "Menace (typed)";
    await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(folder, "GNX.mp3"), Buffer.concat([tag(4, [frame(4, "TIT2", utf8("gnx")), frame(4, "TPE1", utf8("Kendrick Lamar"))]), audio]));
    const again = await scan();
    assert.equal(again["Old Rip.mp3"], "Menace (typed)");
    assert.equal(again["GNX.mp3"], "Kendrick Lamar - gnx");
    assert.deepEqual(await readTrackTags(join(folder, "notes.txt")), {});
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

/**
 * A media element that fails the way Chrome does: an unreadable file fires
 * `error` and then rejects play() with NotSupportedError, in that order; a
 * refused autoplay only rejects, with NotAllowedError. `outcome` decides per file.
 */
async function withFakeAudio(files: string[], outcome: (file: string) => "plays" | "unreadable" | "refused",
  body: (soundtrack: Awaited<ReturnType<typeof loadSoundtrack>>, loads: string[], end: () => Promise<void>) => Promise<void>,
  options: SoundtrackOptions = {}): Promise<void> {
  const loads: string[] = [];
  let element: EventTarget | null = null;
  class FakeAudio extends EventTarget {
    constructor() { super(); element = this; }
    preload = ""; src = "";
    play() {
      const file = decodeURIComponent(this.src.split("/").pop()!);
      loads.push(file);
      // Capped, so an endless skip fails the test instead of hanging it.
      if (loads.length > 100) return Promise.resolve();
      const result = outcome(file);
      if (result === "plays") { queueMicrotask(() => this.dispatchEvent(new Event("playing"))); return Promise.resolve(); }
      if (result === "unreadable") queueMicrotask(() => this.dispatchEvent(new Event("error")));
      return Promise.reject(new DOMException("no", result === "refused" ? "NotAllowedError" : "NotSupportedError"));
    }
    pause() {}
  }
  const saved = { Audio: globalThis.Audio, fetch: globalThis.fetch };
  Object.assign(globalThis, {
    Audio: FakeAudio,
    fetch: async () => ({ ok: true, json: async () => ({ version: 1, tracks: files.map(file => ({ file })) }) }),
  });
  try {
    const context = { createMediaElementSource: () => ({ connect() {} }) } as unknown as AudioContext;
    const soundtrack = await loadSoundtrack(context, {} as AudioNode, "http://localhost/", options);
    // The track playing now runs out.
    const end = async () => { element!.dispatchEvent(new Event("ended")); await Promise.resolve(); };
    await body(soundtrack, loads, end);
  } finally {
    Object.assign(globalThis, saved);
  }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

// A manifest older than a rename names files that are not there. The soundtrack
// used to skip on every error for as long as the game ran.
test("the soundtrack stops once every track has failed to load, and Play tries them again", async () => {
  let readable = false;
  await withFakeAudio(["a.mp3", "b.mp3", "c.mp3"], () => readable ? "plays" : "unreadable", async (soundtrack, loads) => {
    soundtrack.toggle(); await settle();
    assert.equal(loads.length, 3, `tried ${loads.length} loads for 3 missing files`);
    assert.equal(soundtrack.isPlaying(), false);
    assert.equal(soundtrack.failed(), true);
    soundtrack.toggle(); await settle();
    assert.equal(loads.length, 6, "Play goes round every track once more");
    readable = true;
    soundtrack.toggle(); await settle();
    assert.equal(soundtrack.isPlaying(), true);
    assert.equal(soundtrack.failed(), false, "a track that plays clears the failure");
  });
});

// One unreadable file used to silence the soundtrack: its rejected play()
// switched playback off after the error handler had moved to the next track.
test("an unreadable track is skipped and the music keeps playing", async () => {
  await withFakeAudio(["broken.mp3", "b.mp3", "c.mp3"], file => file === "broken.mp3" ? "unreadable" : "plays", async (soundtrack, loads) => {
    soundtrack.toggle(); await settle();
    for (let skip = 0; skip < 6; skip++) {
      assert.equal(soundtrack.isPlaying(), true, `stopped after ${loads.join(", ")}`);
      assert.notEqual(loads.at(-1), "broken.mp3", "left on the unreadable track");
      soundtrack.next(); await settle();
    }
    assert.ok(loads.includes("broken.mp3"), "never reached the unreadable track");
  });
});

test("a refused autoplay stops the soundtrack rather than skipping through it", async () => {
  await withFakeAudio(["a.mp3", "b.mp3"], () => "refused", async (soundtrack, loads) => {
    soundtrack.toggle(); await settle();
    assert.equal(soundtrack.isPlaying(), false);
    assert.equal(loads.length, 1);
    assert.equal(soundtrack.failed(), false, "refused is not missing");
  });
});

test("a track's filename is one URL path segment the dev server can serve", () => {
  // Measured against Vite 8's dev server: escaped, each of these came back as
  // the game's page instead of the file.
  for (const name of ["a&b.mp3", "A$AP.mp3", "a+b.mp3", "a,b.mp3", "a;b.mp3", "a=b.mp3", "a@b.mp3", "a:b.mp3"]) {
    const url = new URL(`assets/music/${trackPath(name)}`, "http://localhost/");
    assert.equal(url.pathname, `/assets/music/${name}`, `${name} is escaped`);
  }
  assert.equal(trackPath("WORTH SOMETHING (feat. Big Sean & Skilla Baby).mp3"), "WORTH%20SOMETHING%20(feat.%20Big%20Sean%20&%20Skilla%20Baby).mp3");
  // What a path cannot carry stays escaped.
  assert.equal(trackPath("a#b?c/d%e.mp3"), "a%23b%3Fc%2Fd%25e.mp3");
});

/** A seeded stand-in for Math.random, so a shuffle test draws the same orders every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

test("shuffle off plays the list in name order and comes round to the first", async () => {
  await withFakeAudio(["a.mp3", "b.mp3", "c.mp3", "d.mp3"], () => "plays", async (soundtrack, loads, end) => {
    assert.equal(soundtrack.isShuffled(), false);
    soundtrack.toggle(); await settle();
    for (let i = 0; i < 5; i++) await end();
    assert.deepEqual(loads, ["a.mp3", "b.mp3", "c.mp3", "d.mp3", "a.mp3", "b.mp3"]);
    soundtrack.previous(); assert.equal(loads.at(-1), "a.mp3");
    soundtrack.previous(); assert.equal(loads.at(-1), "d.mp3", "back from the first is the last");
  }, { shuffle: false });
});

// The soundtrack drew one order a session and repeated it, lap after lap.
test("shuffle plays every track once a lap, draws a new order each lap, and never one song twice running", async () => {
  const files = ["a.mp3", "b.mp3", "c.mp3", "d.mp3", "e.mp3"];
  await withFakeAudio(files, () => "plays", async (soundtrack, loads, end) => {
    assert.equal(soundtrack.isShuffled(), true, "shuffle is the default");
    soundtrack.toggle(); await settle();
    for (let i = 1; i < files.length * 60; i++) await end();
    const laps = Array.from({ length: 60 }, (_, lap) => loads.slice(lap * files.length, (lap + 1) * files.length));
    for (const lap of laps) assert.deepEqual([...lap].sort(), files, `a lap missed or repeated a track: ${lap}`);
    loads.forEach((file, i) => assert.notEqual(file, loads[i - 1], `${file} twice running at ${i}`));
    assert.ok(new Set(laps.map(lap => lap.join())).size > 30, "the laps are not being reshuffled");
  }, { pick: seeded(7) });
});

test("turning shuffle off or on keeps the playing track and changes only what follows it", async () => {
  const files = ["a.mp3", "b.mp3", "c.mp3", "d.mp3", "e.mp3"];
  await withFakeAudio(files, () => "plays", async (soundtrack, loads, end) => {
    soundtrack.toggle(); await settle();
    await end(); await end();
    const playing = loads.at(-1)!, loaded = loads.length;
    soundtrack.setShuffle(false);
    assert.equal(loads.length, loaded, "switching reloaded the track");
    assert.equal(soundtrack.nowPlaying()?.file, playing);
    await end();
    assert.equal(loads.at(-1), files[(files.indexOf(playing) + 1) % files.length], "off carries on in name order");
    soundtrack.setShuffle(true);
    const from = loads.at(-1)!;
    for (let i = 0; i < files.length - 1; i++) await end();
    assert.deepEqual([from, ...loads.slice(-(files.length - 1))].sort(), files, "a shuffle starts from the playing track");
  }, { shuffle: true, pick: seeded(3) });
});

test("the shuffle choice saves apart from settings and anything unreadable is shuffle on", () => {
  const disk = new Map<string, string>();
  const storage = { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => void disk.set(key, value) };
  assert.deepEqual(loadMusicPreference(() => storage), { shuffle: true }, "a fresh browser shuffles");
  assert.equal(saveMusicPreference(() => storage, { shuffle: false }), true);
  assert.deepEqual([...disk.keys()], [MUSIC_KEY]);
  assert.deepEqual(loadMusicPreference(() => storage), { shuffle: false });
  for (const raw of ["{", "null", '{"version":2,"shuffle":false}', '{"version":1,"shuffle":"no"}']) {
    assert.deepEqual(decodeMusicPreference(raw), { shuffle: true }, raw);
  }
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(saveMusicPreference(() => blocked, { shuffle: false }), false);
  assert.deepEqual(loadMusicPreference(() => blocked), { shuffle: true });
});
