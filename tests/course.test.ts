import assert from "node:assert/strict";
import test from "node:test";
import { ALDER_STREETS, alderGeneratedRace, alderHeight } from "../src/sim/alder.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { turfFor } from "../src/sim/alder-turf.ts";
import { decodeStart, snapToLane } from "../src/sim/race-start.ts";
import { createProgressStore, PROGRESS_KEY } from "../src/settings/progress.ts";

// Not every generated course can be drawn. Moth's career accepted a stage before
// asking, handed it back on every flash, and its load threw every time
// (2026-09-15). A course is now drawn the way a load draws it before it is
// accepted or handed back, and a stage that cannot be drawn is replaced.

const MOTH_LOOP = "-4.5,875.0,0.000";
/** Heading south on Moth's loop, toward a junction at the map's southern edge: no seed draws a race from here. */
const DEAD_LANE = "210.5,897.0,-3.142";
const BUILD = { generator: "generator-test", world: "world-test" };
function disk() {
  const data = new Map<string, string>();
  let writes = 0;
  return { data, get writes() { return writes; }, getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes++; data.set(key, value); } };
}

test("a course draws as a load draws it: the id's turf, the start snapped again, the race", () => {
  const course = drawAlderCourse("gen-moth-15", MOTH_LOOP);
  const from = snapToLane(ALDER_STREETS, decodeStart(MOTH_LOOP)!, alderHeight)!;
  assert.deepEqual(course.start, from);
  assert.deepEqual(course.race, alderGeneratedRace(15, from, "sprint", turfFor("moth")).race);
  assert.deepEqual(drawAlderCourse("gen-15-circuit", null).race, alderGeneratedRace(15, undefined, "circuit").race, "no start is the grid");
  for (const [raceId, start, reason] of [["gen-nobody-15", null, /Unknown turf/], ["gen-15", "nowhere", /Unknown start/],
    ["sound-to-sky", null, /not a generated race/]] as const) {
    assert.throws(() => drawAlderCourse(raceId, start), reason);
    assert.equal(alderCourseDraws(raceId, start), false);
  }
});

test("no seed draws a race from the dead lane on Moth's loop, turf or not, of any kind", () => {
  for (const kind of ["", "-circuit", "-unordered"]) for (const turf of ["", "moth-"]) for (let seed = 1; seed <= 12; seed++) {
    assert.equal(alderCourseDraws(`gen-${turf}${seed}${kind}`, DEAD_LANE), false, `gen-${turf}${seed}${kind}`);
  }
  assert.throws(() => drawAlderCourse("gen-moth-7919-circuit", DEAD_LANE), /draws no race/);
  assert.ok(alderCourseDraws("gen-moth-7919-circuit", MOTH_LOOP), "the same seed draws from her loop proper");
});

test("a flash accepts only a course that draws, trying seeds in order, and says when none does", () => {
  const storage = disk(), store = createProgressStore(() => storage, BUILD);
  const asked: string[] = [];
  const drawsFrom = (ok: (raceId: string) => boolean) => (race: { raceId: string }) => { asked.push(race.raceId); return ok(race.raceId); };
  assert.deepEqual(store.flash([1, 2, 3], MOTH_LOOP, drawsFrom(() => false)), { none: "undrawable" });
  assert.deepEqual(asked, ["gen-moth-1", "gen-moth-2", "gen-moth-3"]);
  assert.equal(storage.writes, 0, "nothing undrawable is saved");
  const outcome = store.flash([1, 2, 3], MOTH_LOOP, drawsFrom(id => id === "gen-moth-2"));
  assert.ok("race" in outcome && outcome.race.raceId === "gen-moth-2");
  // A stage that draws is handed back as it was: losses retry it.
  asked.length = 0;
  const again = store.flash([9], null, drawsFrom(() => true));
  assert.ok("race" in again && again.race.raceId === "gen-moth-2" && again.race.start === MOTH_LOOP);
  assert.deepEqual(asked, ["gen-moth-2"], "only the pending stage was asked about");
});

test("the softlock: a saved stage that cannot be drawn is replaced at the next flash, keeping wins and cash", () => {
  const stuck = (races: unknown[]) => JSON.stringify({ version: 3, mothBeaten: false, mothWins: 1, cash: 750, bulwarkOwned: false, mothRaces: races });
  const won = { raceId: "gen-moth-15", start: MOTH_LOOP, build: BUILD };
  const dead = { raceId: "gen-moth-7919-circuit", start: DEAD_LANE, build: BUILD };
  const draws = (race: { raceId: string; start: string | null }) => alderCourseDraws(race.raceId, race.start);

  // Before: the old path hands the dead course back, and loading it throws.
  const before = disk();
  before.data.set(PROGRESS_KEY, stuck([won, dead]));
  assert.deepEqual(createProgressStore(() => before, BUILD).challenge(1, MOTH_LOOP), dead);
  assert.equal(draws(dead), false);

  // A flash from her loop replaces it with a course that draws.
  const storage = disk();
  storage.data.set(PROGRESS_KEY, stuck([won, dead]));
  const store = createProgressStore(() => storage, BUILD);
  const outcome = store.flash([1, 2, 3], MOTH_LOOP, draws);
  assert.ok("race" in outcome, JSON.stringify(outcome));
  assert.equal(outcome.race.raceId, "gen-moth-1-circuit");
  assert.equal(draws(outcome.race), true);
  const career = createProgressStore(() => storage, BUILD).get();
  assert.deepEqual([career.mothWins, career.cash, career.mothRaces[0]], [1, 750, won]);

  // A flash from the dead lane itself draws nothing, and drops the dead stage so the next flash elsewhere draws afresh.
  const nowhere = disk();
  nowhere.data.set(PROGRESS_KEY, stuck([won, dead]));
  assert.deepEqual(createProgressStore(() => nowhere, BUILD).flash([1, 2, 3], DEAD_LANE, draws), { none: "undrawable" });
  assert.deepEqual(createProgressStore(() => nowhere, BUILD).get().mothRaces, [won]);
  assert.equal(createProgressStore(() => nowhere, BUILD).get().cash, 750);

  // An outdated stage is still the garage's to replace, and a retired Moth still offers nothing.
  const outdated = disk();
  outdated.data.set(PROGRESS_KEY, stuck([won, { ...dead, build: { ...BUILD, generator: "older" } }]));
  assert.deepEqual(createProgressStore(() => outdated, BUILD).flash([1], MOTH_LOOP, draws), { none: "outdated" });
  const retired = disk();
  retired.data.set(PROGRESS_KEY, JSON.stringify({ version: 3, mothBeaten: true, mothWins: 3, cash: 3000, bulwarkOwned: false, mothRaces: [] }));
  assert.deepEqual(createProgressStore(() => retired, BUILD).flash([1], MOTH_LOOP, draws), { none: "retired" });
});
