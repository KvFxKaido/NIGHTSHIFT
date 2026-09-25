import assert from "node:assert/strict";
import test from "node:test";
import { ALDER_RACE } from "../src/sim/alder.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { authoredSprintFor } from "../src/sim/authored-sprints.ts";
import { recordedEvent } from "../src/sim/recorded-event.ts";
import { AUTHORED_RACES, generatedKind, raceListItems } from "../src/ui/race-list.ts";
import { raceActions } from "../src/ui/race-list-panel.ts";
import { decodeProgress, type StageRace } from "../src/settings/progress.ts";
import type { PlaylistEntry } from "../src/settings/playlist.ts";

// The race list shows the authored races, the Blacklist's won stages and the races the
// player kept, and says what each Race and Solo button starts.

const today = { generator: "generator-v1", world: "alder-test" };
const older = { generator: "generator-v0", world: "alder-test" };
const career = (wins: number, races: StageRace[], names: Record<string, { wins: number; races: StageRace[] }> = {}) =>
  decodeProgress(JSON.stringify({ version: 4, cash: 0, bulwarkOwned: false, names: { moth: { wins, races }, ...names } }));
const kept = (raceId: string, start: string | null, build = today): PlaylistEntry =>
  ({ race: { raceId, start, build, name: `Kept ${raceId}`, keptAt: 1 }, playable: build === today });

test("every authored entry starts a race the game knows, with the rival and solo", () => {
  assert.deepEqual(AUTHORED_RACES.map(item => item.title),
    ["Sound to Sky", "Ridge Circuit / Full", "Ridge Circuit / East", "Ridge Circuit / Ridge", "Wharf Arena / Full", "Wharf Arena / Short",
      "Uptown Circuit", "Uptown Circuit / Clear",
      "Jackson East to Mercer East"]);
  for (const item of AUTHORED_RACES) {
    const race = item.race!, solo = item.solo!;
    if (race.raceId === ALDER_RACE.id) {
      assert.equal(race.solo, false);
      assert.deepEqual(solo, { raceId: ALDER_RACE.id, start: null, solo: true }, "Sound to Sky goes solo by the solo flag");
      continue;
    }
    // An authored sprint (authored-sprints.ts) goes solo by the flag too, as a generated race does.
    if (authoredSprintFor(race.raceId)) {
      const withRival = recordedEvent(race.raceId)!, alone = recordedEvent(solo.raceId, undefined, { solo: solo.solo })!;
      assert.equal(race.solo, false);
      assert.deepEqual(solo, { raceId: race.raceId, start: null, solo: true }, `${item.title} goes solo by the solo flag`);
      assert.ok(withRival.rival && !alone.rival && alone.solo);
      continue;
    }
    const withRival = circuitEvent(race.raceId), alone = circuitEvent(solo.raceId);
    assert.ok(withRival && !withRival.solo && withRival.rival, `${item.title}: ${race.raceId} is not a raced circuit`);
    assert.ok(alone && alone.solo && !alone.rival, `${item.title}: ${solo.raceId} is not a solo circuit`);
    assert.equal(solo.solo, false, "a circuit carries solo in its id, not in a flag");
    assert.equal(alone.layout, withRival.layout);
    assert.equal(alone.traffic, withRival.traffic);
    assert.equal(item.removable, null);
  }
});

test("Moth's won stages are listed; her pending stage is not; kept races follow and can be removed", () => {
  const stages = [
    { raceId: "gen-15", start: "-4.5,875.0,0.000", build: today },
    { raceId: "gen-16-circuit", start: null, build: today },
    { raceId: "gen-17-unordered", start: null, build: today },
  ];
  const items = raceListItems(career(2, stages), [kept("gen-99", null)], today);
  const moth = items.filter(i => i.group === "blacklist");
  assert.deepEqual(moth.map(i => [i.title, i.detail]), [["Moth / First meeting", "Sprint · won"], ["Moth / Rematch", "Circuit · won"]]);
  assert.deepEqual(moth[0]!.race, { raceId: "gen-15", start: "-4.5,875.0,0.000", solo: false });
  assert.deepEqual(moth[0]!.solo, { raceId: "gen-15", start: "-4.5,875.0,0.000", solo: true });
  assert.equal(moth[0]!.removable, null, "career history is not the player's to delete from here");
  const keptItems = items.filter(i => i.group === "kept");
  assert.equal(keptItems.length, 1);
  assert.equal(keptItems[0]!.removable!.raceId, "gen-99");
  assert.deepEqual(items.map(i => i.group), [...AUTHORED_RACES.map(() => "authored"), "blacklist", "blacklist", "kept"]);
});

test("a kept race the Blacklist group already shows is listed once; the same seed from another start or build is not the same race", () => {
  const stages = [{ raceId: "gen-15", start: null, build: today }];
  const items = raceListItems(career(1, stages),
    [kept("gen-15", null), kept("gen-15", "-4.5,875.0,0.000"), kept("gen-15", null, older)], today);
  assert.equal(items.filter(i => i.group === "blacklist").length, 1);
  assert.deepEqual(items.filter(i => i.group === "kept").map(i => [i.race?.start ?? null, i.race === null]),
    [["-4.5,875.0,0.000", false], [null, true]]);
});

test("a course from another build is listed but cannot be started, kept or career", () => {
  const items = raceListItems(career(1, [{ raceId: "gen-15", start: null, build: older }]), [kept("gen-40", null, older)], today);
  for (const item of items.filter(i => i.group !== "authored")) {
    assert.equal(item.race, null, item.title);
    assert.equal(item.solo, null, item.title);
    assert.match(item.detail, /older version/);
  }
  assert.ok(items.find(i => i.group === "kept")!.removable, "an unplayable kept race can still be removed");
  // A migrated one-win profile has no course history to list.
  assert.equal(raceListItems(career(3, []), [], today).filter(i => i.group === "blacklist").length, 0);
  // An unversioned stage (build null) is never today's.
  assert.equal(raceListItems(career(1, [{ raceId: "gen-15", start: null, build: null }]), [], today).find(i => i.group === "blacklist")!.race, null);
});

// One stop per race (design/MENUS.md, 2026-09-25): a race's Race, Solo and Remove are
// face buttons, and its hints show only the ones it has. Nothing may offer a race that
// cannot start, or a removal the list will refuse.
test("a race offers A, X and Y only for what it can do", () => {
  const stages = [{ raceId: "gen-15", start: null, build: today }];
  const items = raceListItems(career(1, stages), [kept("gen-99", null), kept("gen-40", null, older)], today);
  const actions = (group: string, playable = true) =>
    raceActions(items.find(item => item.group === group && (item.race !== null) === playable)!);
  assert.deepEqual(actions("authored"), ["confirm", "action-x"], "a course: race and solo, never removed");
  assert.deepEqual(actions("blacklist"), ["confirm", "action-x"], "career history is not the player's to delete");
  assert.deepEqual(actions("kept"), ["confirm", "action-x", "action-y"], "a kept race: all three");
  assert.deepEqual(actions("kept", false), ["action-y"], "a kept race from another build: only removed");
  for (const item of items) {
    const can = raceActions(item);
    assert.equal(can.includes("confirm"), item.race !== null, `${item.title}: A must race exactly when it can`);
    assert.equal(can.includes("action-x"), item.solo !== null, `${item.title}: X must race solo exactly when it can`);
    assert.equal(can.includes("action-y"), item.removable !== null, `${item.title}: Y must remove exactly when it can`);
  }
});

test("every name's won generated stages list in ladder order under the name that raced them", () => {
  const moth = [
    { raceId: "gen-moth-1", start: null, build: today },
    { raceId: "gen-moth-2-circuit", start: null, build: today },
    { raceId: "gen-moth-3-unordered", start: null, build: today },
  ];
  const stray = [{ raceId: "gen-stray-4-unordered", start: null, build: today }, { raceId: "gen-stray-5-unordered", start: null, build: today }];
  const items = raceListItems(career(3, moth, { stray: { wins: 3, races: [...stray, { raceId: "gen-stray-6-unordered", start: null, build: today }] },
    rivet: { wins: 2, races: [] }, bollard: { wins: 0, races: [] } }), [], today).filter(i => i.group === "blacklist");
  assert.deepEqual(items.map(i => i.title), ["Moth / First meeting", "Moth / Rematch", "Moth / Pink slip",
    "Stray / First win", "Stray / Second win", "Stray / Pink slip"], "Rivet's drags store no course, so list nothing");
});

test("kinds read off the race id", () => {
  assert.equal(generatedKind("gen-1"), "Sprint");
  assert.equal(generatedKind("gen-1-circuit"), "Circuit");
  assert.equal(generatedKind("gen-1-unordered"), "Unordered");
});
