import assert from "node:assert/strict";
import test from "node:test";
import { createProgressStore as createStore, decodeProgress, ownsCar, PROGRESS_KEY, type MothRace } from "../src/settings/progress.ts";
import { createSettingsStore } from "../src/settings/settings.ts";
import { createSaveStore } from "../src/settings/saves.ts";

const TEST_BUILD = { generator: "test-generator-v1", world: "test-world-v1" };
const createProgressStore = (storage: Parameters<typeof createStore>[0], legacy = false) => createStore(storage, TEST_BUILD, legacy);
const result = (race: MothRace) => ({ ...race, finished: true, disqualified: false, position: 1 });
function disk() {
  const data = new Map<string, string>();
  let writes = 0;
  return { data, get writes() { return writes; }, getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes++; data.set(key, value); } };
}

test("three distinct stages award cash, and only the pink slip grants the Kestrel", () => {
  const storage = disk();
  const store = createProgressStore(() => storage);
  assert.equal(storage.writes, 0);
  assert.ok(ownsCar(store.get(), "cinder"));
  assert.equal(ownsCar(store.get(), "bulwark"), false);
  // New stages draw toward Moth's turf, so their ids name it (src/sim/race-id.ts).
  for (const [index, id] of ["gen-moth-15", "gen-moth-16-circuit", "gen-moth-17-unordered"].entries()) {
    const race = store.challenge(15 + index, null)!;
    assert.equal(race.raceId, id);
    assert.equal(store.complete(result(race)), index === 2 ? "awarded" : "advanced");
    const reloaded = createProgressStore(() => storage);
    assert.equal(reloaded.get().mothWins, index + 1);
    assert.equal(ownsCar(reloaded.get(), "kestrel"), index === 2);
  }
  assert.equal(store.get().cash, 3000);
  assert.equal(store.get().mothRaces.length, 3);
  assert.equal(store.challenge(99, null), null, "retired Moth offers no new race");
});

test("loss, DQ, unfinished races and unaccepted courses do not advance or pay", () => {
  const storage = disk();
  const store = createProgressStore(() => storage);
  const race = store.challenge(15, "-4.5,875.0,0.000")!;
  const writes = storage.writes;
  for (const change of [{ finished: false }, { disqualified: true }, { position: 2 },
    { raceId: "ridge-circuit" }, { raceId: "gen-16" }, { start: null }]) {
    assert.equal(store.complete({ ...result(race), ...change }), "none");
  }
  assert.equal(store.get().mothWins, 0);
  assert.equal(store.get().cash, 0);
  assert.equal(storage.writes, writes);
  assert.deepEqual(createProgressStore(() => storage).challenge(90, null), race, "loss retains original route/start");
});

test("old wins cannot skip a stage or pay again, including from another tab", () => {
  const storage = disk();
  const first = createProgressStore(() => storage);
  const second = createProgressStore(() => storage);
  const race = first.challenge(15, null)!;
  assert.equal(first.complete(result(race)), "advanced");
  assert.equal(second.complete(result(race)), "recorded");
  const next = second.challenge(15, null)!;
  assert.equal(next.raceId, "gen-moth-15-circuit");
  assert.equal(first.complete(result(race)), "recorded");
  assert.equal(first.get().cash, 750);
  assert.equal(first.get().mothWins, 1);
});

test("reopening an accepted course can pay once, but the same link without acceptance cannot", () => {
  const storage = disk();
  const accepted = createProgressStore(() => storage).challenge(15, "-4.5,875.0,0.000")!;
  const linkedResult = result(JSON.parse(JSON.stringify(accepted)) as MothRace);
  const unacceptedStorage = disk();
  const unaccepted = createProgressStore(() => unacceptedStorage);
  assert.equal(unaccepted.complete(linkedResult), "none");
  assert.equal(unacceptedStorage.writes, 0);
  assert.equal(unaccepted.get().cash, 0);
  assert.equal(unaccepted.get().mothWins, 0);
  assert.equal(createProgressStore(() => storage).complete(linkedResult), "advanced");
  const reopened = createProgressStore(() => storage);
  assert.equal(reopened.complete(linkedResult), "recorded");
  assert.equal(reopened.get().cash, 750);
  assert.equal(reopened.get().mothWins, 1);
});

test("two wins fund a Bulwark, purchase and selection persist, and duplicate clicks cost nothing", () => {
  const storage = disk();
  const store = createProgressStore(() => storage);
  assert.equal(store.buyBulwark(), "insufficient");
  store.complete(result(store.challenge(15, null)!));
  assert.equal(store.buyBulwark(), "insufficient");
  store.complete(result(store.challenge(16, null)!));
  assert.equal(store.buyBulwark(), "purchased");
  assert.equal(store.get().cash, 0);
  assert.ok(ownsCar(createProgressStore(() => storage).get(), "bulwark"));
  assert.equal(createProgressStore(() => storage).buyBulwark(), "owned");
  assert.equal(store.get().cash, 0);
  const settings = createSettingsStore(() => storage);
  settings.update({ car: "bulwark" });
  assert.equal(createSettingsStore(() => storage).get().car, "bulwark");
  store.complete(result(store.challenge(17, null)!));
  assert.equal(store.get().cash, 1500);
  assert.ok(ownsCar(store.get(), "kestrel"));
});

test("manual slots round-trip won cars without rolling back the career", () => {
  const storage = disk();
  const settings = createSettingsStore(() => storage);
  const saves = createSaveStore(() => storage);
  const { audio: _, ...oldBuild } = settings.get();
  saves.write({ id: "slot-1", name: "Before Moth", savedAt: 1, world: "alder", build: oldBuild, position: null });
  const store = createProgressStore(() => storage);
  for (let i = 0; i < 3; i++) store.complete(result(store.challenge(15 + i, null)!));
  settings.update({ car: "kestrel" });
  const { audio: __, ...build } = settings.get();
  saves.write({ id: "slot-2", name: "After Moth", savedAt: 2, world: "alder", build, position: null });
  assert.equal(saves.list()[1]!.build.car, "kestrel");
  settings.update(saves.list()[0]!.build);
  const restored = createProgressStore(() => storage).get();
  assert.equal(restored.cash, 3000);
  assert.ok(ownsCar(restored, "kestrel"));
});

test("one-win prototype ownership migrates without inventing payouts or race history", () => {
  const storage = disk();
  storage.data.set(PROGRESS_KEY, JSON.stringify({ version: 1, mothBeaten: true }));
  const store = createProgressStore(() => storage);
  assert.ok(ownsCar(store.get(), "kestrel"));
  assert.ok(ownsCar(store.get(), "bulwark"));
  assert.equal(store.get().mothWins, 3);
  assert.equal(store.get().cash, 0);
  assert.deepEqual(store.get().mothRaces, []);
  assert.equal(storage.writes, 0);
  assert.ok(ownsCar(createProgressStore(() => disk(), true).get(), "bulwark"), "legacy selected Bulwark is retained");
});

test("bad and future progress is never overwritten", () => {
  for (const raw of ["{", "null", '{"version":4,"mothBeaten":true}', '{"version":1,"mothBeaten":"yes"}',
    '{"version":2,"mothWins":2,"cash":1500,"bulwarkOwned":false,"mothRaces":[]}']) {
    const storage = disk();
    storage.data.set(PROGRESS_KEY, raw);
    const store = createProgressStore(() => storage);
    assert.ok(store.unavailable());
    assert.equal(store.challenge(15, null), null);
    assert.equal(store.buyBulwark(), "unavailable");
    assert.equal(store.complete(result({ raceId: "gen-15", start: null, build: TEST_BUILD })), "unavailable");
    assert.equal(storage.getItem(PROGRESS_KEY), raw);
    assert.equal(storage.writes, 0);
  }
  assert.equal(decodeProgress(null).mothWins, 0);
});

test("failed challenge, payout and purchase writes change neither cash nor ownership; retries recover", () => {
  const storage = disk();
  let blocked = true;
  const store = createProgressStore(() => ({ getItem: storage.getItem,
    setItem(key, value) { if (blocked) throw Error("Quota"); storage.setItem(key, value); } }));
  assert.equal(store.challenge(15, null), null);
  blocked = false;
  const race = store.challenge(15, null)!;
  blocked = true;
  assert.equal(store.complete(result(race)), "unavailable");
  assert.equal(store.get().cash, 0);
  blocked = false;
  assert.equal(store.complete(result(race)), "advanced");
  store.complete(result(store.challenge(16, null)!));
  blocked = true;
  assert.equal(store.buyBulwark(), "unavailable");
  assert.equal(store.get().cash, 1500);
  assert.equal(ownsCar(store.get(), "bulwark"), false);
  blocked = false;
  assert.equal(store.buyBulwark(), "purchased");
  assert.equal(store.get().cash, 0);
});

test("legacy Bulwark grant is persisted before a different car can be saved", () => {
  const storage = disk();
  const first = createProgressStore(() => storage, true);
  assert.ok(ownsCar(first.get(), "bulwark"));
  assert.equal(storage.writes, 1);
  const settings = createSettingsStore(() => storage);
  settings.update({ car: "cinder" });
  assert.ok(ownsCar(createProgressStore(() => storage).get(), "bulwark"));
});

test("failed legacy migration remains pending until ownership is safely written", () => {
  const storage = disk();
  let blocked = true;
  const store = createProgressStore(() => ({ getItem: storage.getItem,
    setItem(key, value) { if (blocked) throw Error("Quota"); storage.setItem(key, value); } }), true);
  assert.equal(storage.getItem(PROGRESS_KEY), null);
  assert.equal(store.preserveLegacyOwnership(), false);
  blocked = false;
  assert.equal(store.preserveLegacyOwnership(), true);
  assert.ok(ownsCar(createProgressStore(() => storage).get(), "bulwark"));
});

test("generator and world mismatches cannot retry or pay; explicit replacement preserves winnings", () => {
  for (const build of [{ ...TEST_BUILD, generator: "next" }, { ...TEST_BUILD, world: "next" }]) {
    const storage = disk();
    const old = createProgressStore(() => storage);
    old.complete(result(old.challenge(15, null)!));
    const unfinished = old.challenge(16, null)!;
    const current = createStore(() => storage, build);
    assert.ok(current.outdatedChallenge());
    assert.equal(current.challenge(18, null), null);
    assert.equal(current.complete(result(unfinished)), "incompatible");
    assert.equal(current.get().cash, 750);
    assert.equal(current.get().mothWins, 1);
    assert.ok(current.discardOutdatedChallenge());
    assert.equal(current.get().mothRaces.length, 1);
    assert.deepEqual(current.get().mothRaces[0]!.build, TEST_BUILD, "completed history keeps original build");
    const fresh = current.challenge(18, null)!;
    assert.deepEqual(fresh.build, build);
    assert.equal(current.complete(result(fresh)), "advanced");
    assert.equal(current.get().cash, 1500);
  }
});

test("unversioned schema-2 courses remain unknown, and failed replacement preserves them", () => {
  const storage = disk();
  const old = createProgressStore(() => storage);
  old.challenge(15, null);
  const data = { version: 2, ...old.get() };
  storage.data.set(PROGRESS_KEY, JSON.stringify(data));
  const unknown = createProgressStore(() => storage);
  assert.equal(unknown.get().mothRaces[0]!.build, null);
  assert.ok(unknown.outdatedChallenge());
  const before = storage.getItem(PROGRESS_KEY);
  const blocked = createStore(() => ({ getItem: storage.getItem, setItem() { throw Error("Quota"); } }), TEST_BUILD);
  assert.equal(blocked.discardOutdatedChallenge(), false);
  assert.equal(storage.getItem(PROGRESS_KEY), before);
  assert.ok(blocked.outdatedChallenge());
});

test("stages accepted before turfs keep their plain ids: they load, retry and pay as the races they were", () => {
  const storage = disk();
  storage.data.set(PROGRESS_KEY, JSON.stringify({ version: 3, mothBeaten: false, mothWins: 1, cash: 750, bulwarkOwned: false,
    mothRaces: [{ raceId: "gen-15", start: null, build: TEST_BUILD }, { raceId: "gen-16-circuit", start: null, build: TEST_BUILD }] }));
  const store = createProgressStore(() => storage);
  assert.equal(store.unavailable(), false);
  assert.deepEqual(store.challenge(99, null), { raceId: "gen-16-circuit", start: null, build: TEST_BUILD }, "a pending plain stage retries as itself");
  assert.equal(store.complete(result({ raceId: "gen-16-circuit", start: null, build: TEST_BUILD })), "advanced");
  assert.equal(store.challenge(40, null)!.raceId, "gen-moth-40-unordered", "the next stage drawn is a turf draw");
  // A stage names a variant and, if any, Moth's turf; another variant or turf is not her stage.
  for (const raceId of ["gen-15-circuit", "gen-stray-15", "gen-mothx-15", "gen-moth-15-drift"]) {
    const bad = disk();
    bad.data.set(PROGRESS_KEY, JSON.stringify({ version: 3, mothBeaten: false, mothWins: 0, cash: 0, bulwarkOwned: false,
      mothRaces: [{ raceId, start: null, build: TEST_BUILD }] }));
    assert.ok(createProgressStore(() => bad).unavailable(), raceId);
  }
});
