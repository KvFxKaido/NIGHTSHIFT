import assert from "node:assert/strict";
import test from "node:test";
import { BLACKLIST, blacklistName, SABLE_DRIFT_TARGETS, sableDriftId, stagePayout } from "../src/settings/blacklist.ts";
import { createProgressStore, decodeProgress, ownsCar, PROGRESS_KEY, PROGRESS_VERSION, type RaceKey } from "../src/settings/progress.ts";
import { BLACKLIST_CRUISERS } from "../src/sim/alder-cruisers.ts";
import { HARBOR_DRAG, RIVET } from "../src/sim/drag-event.ts";
import { SABLE_DRIFTS, sableDriftFor } from "../src/sim/drift-event.ts";
import { SABLE } from "../src/sim/drift-yard.ts";
import { MOTH } from "../src/sim/encounter.ts";
import { parseGeneratedRaceId } from "../src/sim/race-id.ts";
import { rivalCard } from "../src/ui/rival-card.ts";
import { blacklistRows } from "../src/ui/blacklist-panel.ts";

// The Blacklist career (phase 2): ten names, one at a time from #10, three stages
// each in the name's signature race, rising pay, and the car on the pink slip.

const BUILD = { generator: "test-generator-v1", world: "test-world-v1" };
function disk() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const draws = () => true;
/** Stray beaten, as stored: a generated name keeps the course of every stage it won. */
const STRAY_BEATEN = { wins: 3, races: [1, 2, 3].map(seed => ({ raceId: `gen-stray-${seed}-unordered`, start: null, build: BUILD })) };
const won = (race: RaceKey & { build: typeof BUILD | null }) => ({ ...race, finished: true, disqualified: false, position: 1 });
const eventWin = (raceId: string) => ({ raceId, start: null, build: null, finished: true, disqualified: false, position: 1 });
/** Wins every stage of `id`, which must be the current name, the way main.ts would. */
function beat(store: ReturnType<typeof createProgressStore>, id: string) {
  for (let stage = 0; stage < 3; stage++) {
    const outcome = store.flashName(id, [100 + stage], null, draws);
    if ("race" in outcome) assert.equal(store.complete(won(outcome.race)), stage === 2 ? "awarded" : "advanced");
    else if ("event" in outcome) assert.equal(store.complete(eventWin(outcome.event)), stage === 2 ? "awarded" : "advanced");
    else assert.fail(`${id} stage ${stage}: ${outcome.none}`);
  }
}

test("the list is ten names in rank order, and each is the rival the sim and the cards know, in the car it cruises", () => {
  assert.deepEqual(BLACKLIST.map(name => [name.rank, name.id]), [[10, "moth"], [9, "stray"], [8, "rivet"], [7, "bollard"], [6, "deuce"],
    [5, "sable"], [4, "plumb"], [3, "crest"], [2, "wake"], [1, "tally"]]);
  assert.equal(blacklistName(MOTH.id)!.car, "kestrel");
  assert.equal(blacklistName(RIVET.id)!.car, RIVET.car);
  assert.equal(blacklistName(SABLE.id)!.car, "ns01", "the NS-01 Sable drives, under the id a player car can have");
  for (const cruiser of BLACKLIST_CRUISERS) {
    const name = blacklistName(cruiser.id)!;
    assert.equal(name.car, cruiser.car, `${cruiser.id} races in the car it cruises in`);
    assert.ok(name.stages.every(stage => stage.kind === cruiser.kind), `${cruiser.id}'s stages are its signature race`);
  }
  for (const name of BLACKLIST) assert.ok(rivalCard(name.id), `${name.id} has a contact card`);
  // Drag and drift stages name events the sim runs, at the targets the ladder shows.
  assert.ok(blacklistName("rivet")!.stages.every(stage => stage.event === HARBOR_DRAG.id));
  blacklistName("sable")!.stages.forEach((stage, index) => {
    assert.equal(stage.event, sableDriftId(index));
    assert.equal(sableDriftFor(stage.event)!.drift!.targetScore, SABLE_DRIFT_TARGETS[index]);
  });
  assert.equal(SABLE_DRIFTS[0]!.id, SABLE.eventId, "the yard's first drift is the one it always ran");
  assert.deepEqual(SABLE_DRIFT_TARGETS, [3000, 3600, 4200]);
});

test("stage pay rises $250 a place from $750 at #10, the pink slip doubles, and Moth's pay is what it was", () => {
  assert.deepEqual([0, 1, 2].map(stage => stagePayout(10, stage)), [750, 750, 1500]);
  assert.deepEqual([0, 1, 2].map(stage => stagePayout(5, stage)), [2000, 2000, 4000]);
  assert.deepEqual([0, 1, 2].map(stage => stagePayout(1, stage)), [3000, 3000, 6000]);
});

test("only the current name races for a stage; names above race for nothing, beaten names are retired", () => {
  const storage = disk();
  const store = createProgressStore(() => storage, BUILD);
  assert.equal(store.current()!.id, "moth");
  assert.deepEqual(store.flashName("stray", [1], null, draws), { none: "not-yet" });
  assert.deepEqual(store.flashName("rivet", [1], null, draws), { none: "not-yet" });
  assert.equal(storage.data.size, 0, "a flash at a name above writes nothing");
  // A drag won while Rivet is not current pays nothing.
  assert.equal(store.complete(eventWin(HARBOR_DRAG.id)), "none");
  beat(store, "moth");
  assert.equal(store.current()!.id, "stray", "the next name opens as soon as the one below is beaten");
  assert.deepEqual(store.flashName("moth", [1], null, draws), { none: "retired" });
  const stray = store.flashName("stray", [7], null, draws);
  assert.ok("race" in stray);
  assert.deepEqual(parseGeneratedRaceId(stray.race.raceId), { seed: 7, kind: "unordered", rival: "stray" });
  assert.equal(store.get().cash, 3000);
  assert.ok(ownsCar(store.get(), "kestrel"));
  assert.equal(ownsCar(store.get(), "latch"), false);
});

test("drag and drift stages store no course, pay on the current stage's event, and Sable's targets rise", () => {
  const storage = disk();
  const store = createProgressStore(() => storage, BUILD);
  beat(store, "moth"); beat(store, "stray");
  assert.deepEqual(store.flashName("rivet", [1], null, draws), { event: HARBOR_DRAG.id, stage: 0 });
  assert.equal(store.complete({ ...eventWin(HARBOR_DRAG.id), position: 2 }), "none", "a lost drag pays nothing");
  assert.equal(store.complete(eventWin(HARBOR_DRAG.id)), "advanced");
  assert.equal(store.get().names.rivet!.wins, 1);
  assert.deepEqual(store.get().names.rivet!.races, []);
  assert.equal(store.complete(eventWin(HARBOR_DRAG.id)), "advanced");
  assert.equal(store.complete(eventWin(HARBOR_DRAG.id)), "awarded");
  assert.ok(ownsCar(store.get(), "hammer"));
  beat(store, "bollard"); beat(store, "deuce");
  assert.deepEqual(store.flashName("sable", [1], null, draws), { event: "sable-yard-drift", stage: 0 });
  assert.equal(store.complete(eventWin("sable-yard-drift-2")), "none", "the second target before the first pays nothing");
  assert.equal(store.complete(eventWin("sable-yard-drift")), "advanced");
  assert.deepEqual(store.flashName("sable", [1], null, draws), { event: "sable-yard-drift-2", stage: 1 });
  assert.equal(store.complete(eventWin("sable-yard-drift")), "none", "the first target again pays nothing");
  assert.equal(store.complete(eventWin("sable-yard-drift-2")), "advanced");
  assert.equal(store.complete(eventWin("sable-yard-drift-3")), "awarded");
  assert.ok(ownsCar(store.get(), "ns01"));
  assert.equal(store.current()!.id, "plumb");
});

test("the whole list pays what the ladder says and hands over every car; then nobody is current", () => {
  const storage = disk();
  const store = createProgressStore(() => storage, BUILD);
  for (const name of BLACKLIST) beat(store, name.id);
  assert.equal(store.current(), null);
  const expected = BLACKLIST.reduce((sum, name) => sum + [0, 1, 2].reduce((s, stage) => s + stagePayout(name.rank, stage), 0), 0);
  assert.equal(store.get().cash, expected);
  for (const name of BLACKLIST) assert.ok(ownsCar(store.get(), name.car), name.car);
  // It survives a reload, in the current schema.
  const reloaded = createProgressStore(() => storage, BUILD);
  assert.equal(JSON.parse(storage.data.get(PROGRESS_KEY)!).version, PROGRESS_VERSION);
  assert.deepEqual(reloaded.get(), store.get());
  assert.ok(blacklistRows(reloaded.get()).every(row => row.standing === "beaten"));
});

test("a schema 3 profile becomes Moth's record, keeps its courses, and nobody else has started", () => {
  const storage = disk();
  const races = [{ raceId: "gen-moth-15", start: null, build: BUILD }, { raceId: "gen-16-circuit", start: null, build: BUILD }];
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 3, mothBeaten: false, mothWins: 1, cash: 750, bulwarkOwned: true, mothRaces: races }));
  const store = createProgressStore(() => storage, BUILD);
  const career = store.get();
  assert.deepEqual(career.names.moth, { wins: 1, races });
  assert.deepEqual([career.mothWins, career.mothBeaten, career.mothRaces], [1, false, races], "the Moth fields still read");
  assert.ok(BLACKLIST.slice(1).every(name => career.names[name.id]!.wins === 0 && career.names[name.id]!.races.length === 0));
  // The pending rematch is handed back, and winning it writes schema 4.
  const rematch = store.flashName("moth", [99], null, draws);
  assert.ok("race" in rematch);
  assert.equal(rematch.race.raceId, "gen-16-circuit");
  assert.equal(store.complete(won(rematch.race)), "advanced");
  assert.equal(JSON.parse(storage.data.get(PROGRESS_KEY)!).version, 4);
  assert.equal(store.get().cash, 1500);
});

test("a stored career that skips ahead of the list, or names a course for the wrong rival, is unreadable", () => {
  const profile = (names: object) => JSON.stringify({ version: 4, cash: 0, bulwarkOwned: false, names });
  assert.throws(() => decodeProgress(profile({ stray: { wins: 1, races: [{ raceId: "gen-stray-1-unordered", start: null, build: BUILD }] } })), /ahead/);
  assert.throws(() => decodeProgress(profile({ moth: { wins: 3, races: [] }, stray: { wins: 0, races: [{ raceId: "gen-moth-1-unordered", start: null, build: BUILD }] } })), /race/);
  assert.throws(() => decodeProgress(profile({ moth: { wins: 3, races: [] }, stray: STRAY_BEATEN, rivet: { wins: 0, races: [{ raceId: "gen-1", start: null, build: BUILD }] } })), /event/);
  assert.throws(() => decodeProgress(profile({ nobody: { wins: 0, races: [] } })), /Unknown name/);
  assert.throws(() => decodeProgress(profile({ moth: { wins: 3, races: [] }, stray: { wins: 2, races: [] } })), /Missing/);
  assert.equal(decodeProgress(profile({ moth: { wins: 3, races: [] }, stray: { wins: 0, races: [] } })).names.stray!.wins, 0);
});

test("the Blacklist screen reads #1 first, marks the current name, and says what each pays", () => {
  const rows = blacklistRows(decodeProgress(JSON.stringify({ version: 4, cash: 0, bulwarkOwned: false,
    names: { moth: { wins: 3, races: [] }, stray: STRAY_BEATEN, rivet: { wins: 1, races: [] } } })));
  assert.deepEqual(rows.map(row => row.id), [...BLACKLIST].reverse().map(name => name.id));
  const by = (id: string) => rows.find(row => row.id === id)!;
  assert.equal(by("moth").standing, "beaten");
  assert.equal(by("rivet").standing, "current");
  assert.equal(by("rivet").status, "1/3 wins · Next: Second win · 402 m drag · $1,250");
  assert.equal(by("bollard").standing, "ahead");
  assert.match(by("bollard").status, /until #8 Rivet is beaten/);
  assert.equal(by("tally").reward, "$12,000 + Vesper");
  assert.equal(by("moth").reward, "$3,000 + Kestrel");
  assert.equal(rows.filter(row => row.standing === "current").length, 1);
});
