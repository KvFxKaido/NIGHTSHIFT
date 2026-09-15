import assert from "node:assert/strict";
import test from "node:test";
import { createPlaylistStore, decodePlaylist, PLAYLIST_KEY } from "../src/settings/playlist.ts";

// The playlist keeps generated races the player chose. A course is only the
// same race on the generator and world that drew it, so entries carry both and
// an entry from another build is kept, marked unplayable, never redrawn.

const v1 = { generator: "generator-v1", world: "alder-test" };
const v2 = { generator: "generator-v2", world: "alder-test" };
const pike = { raceId: "gen-1234", start: "-234.2,-611.6,-1.083" };
function disk() {
  const data = new Map<string, string>();
  let writes = 0;
  return { data, get writes() { return writes; }, getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes++; data.set(key, value); } };
}

test("a kept race round-trips, and keeping it again changes nothing", () => {
  const storage = disk(), store = createPlaylistStore(() => storage, v1);
  assert.deepEqual(store.list(), []);
  assert.equal(storage.writes, 0, "reading an empty list writes nothing");
  assert.equal(store.has(pike), false);
  assert.equal(store.keep(pike, "Pike to Denny", 1000), "kept");
  assert.equal(store.keep({ raceId: "gen-77-circuit", start: null }, "Holgate Circuit", 2000), "kept");
  const writes = storage.writes;
  assert.equal(store.keep(pike, "Pike to Denny", 3000), "already");
  assert.equal(storage.writes, writes);
  const reloaded = createPlaylistStore(() => storage, v1).list()!;
  assert.deepEqual(reloaded.map(e => [e.race.raceId, e.race.start, e.race.name, e.race.keptAt, e.playable]),
    [["gen-1234", pike.start, "Pike to Denny", 1000, true], ["gen-77-circuit", null, "Holgate Circuit", 2000, true]]);
  assert.ok(store.has(pike));
  // The same seed from another start is another race.
  assert.equal(store.has({ ...pike, start: null }), false);
});

test("a race kept on another generator stays listed but unplayable, and is a different course from today's draw", () => {
  const storage = disk();
  createPlaylistStore(() => storage, v1).keep(pike, "Pike to Denny", 1000);
  const bumped = createPlaylistStore(() => storage, v2);
  const [old] = bumped.list()!;
  assert.equal(old!.playable, false);
  assert.deepEqual(old!.race.build, v1);
  assert.equal(bumped.has(pike), false, "the old entry does not stand for this build's draw of the seed");
  assert.equal(bumped.keep(pike, "Pike to Madison", 2000), "kept", "the new draw is kept beside it, not over it");
  assert.deepEqual(bumped.list()!.map(e => e.playable), [false, true]);
  assert.equal(bumped.remove({ ...pike, build: v1 }), "removed");
  assert.deepEqual(bumped.list()!.map(e => e.race.name), ["Pike to Madison"]);
  assert.equal(bumped.remove({ ...pike, build: v1 }), "missing");
});

test("two stores on one disk both keep what they kept", () => {
  const storage = disk(), a = createPlaylistStore(() => storage, v1), b = createPlaylistStore(() => storage, v1);
  assert.equal(a.keep(pike, "Pike to Denny", 1), "kept");
  assert.equal(b.keep({ raceId: "gen-9-unordered", start: null }, "Jackson Scatter", 2), "kept");
  assert.equal(a.list()!.length, 2);
});

test("only generated courses with a readable start and a name are kept", () => {
  const storage = disk(), store = createPlaylistStore(() => storage, v1);
  for (const [course, name] of [
    [{ raceId: "sound-to-sky", start: null }, "Sound to Sky"],
    [{ raceId: "gen-12-drift", start: null }, "Nope"],
    [{ raceId: "gen-12", start: "nowhere" }, "Nope"],
    [{ raceId: "gen-12", start: null }, "   "],
  ] as const) assert.equal(store.keep(course, name, 1), "unavailable", JSON.stringify(course));
  assert.equal(storage.writes, 0);
});

test("unreadable or future playlists are reported and never overwritten", () => {
  const good = JSON.stringify({ version: 1, races: [{ ...pike, build: v1, name: "Pike to Denny", keptAt: 1 }] });
  for (const raw of ["{", "null", JSON.stringify({ version: 2, races: [] }), JSON.stringify({ version: 1, races: {} }),
    JSON.stringify({ version: 1, races: [{ ...pike, build: { generator: "", world: "w" }, name: "x", keptAt: 1 }] }),
    JSON.stringify({ version: 1, races: [...JSON.parse(good).races, ...JSON.parse(good).races] })]) {
    const storage = disk();
    storage.data.set(PLAYLIST_KEY, raw);
    const store = createPlaylistStore(() => storage, v1);
    assert.equal(store.list(), null, raw);
    assert.equal(store.keep({ raceId: "gen-5", start: null }, "Five", 1), "unavailable");
    assert.equal(store.remove({ ...pike, build: v1 }), "unavailable");
    assert.equal(storage.getItem(PLAYLIST_KEY), raw);
    assert.equal(storage.writes, 0);
  }
  assert.equal(decodePlaylist(good).length, 1);
});

test("a failed write keeps nothing and a retry keeps it", () => {
  const storage = disk();
  let blocked = true;
  const store = createPlaylistStore(() => ({ getItem: storage.getItem,
    setItem(key: string, value: string) { if (blocked) throw Error("Quota"); storage.setItem(key, value); } }), v1);
  assert.equal(store.keep(pike, "Pike to Denny", 1), "unavailable");
  assert.deepEqual(store.list(), []);
  blocked = false;
  assert.equal(store.keep(pike, "Pike to Denny", 1), "kept");
  blocked = true;
  assert.equal(store.remove({ ...pike, build: v1 }), "unavailable");
  assert.equal(store.list()!.length, 1);
});
