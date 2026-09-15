import assert from "node:assert/strict";
import test from "node:test";
import { ALDER_STREETS, alderGeneratedRace, alderHeight, alderRouting } from "../src/sim/alder.ts";
import { ALDER_TURFS, TURF_RADIUS, turfFor } from "../src/sim/alder-turf.ts";
import { ALDER_CRUISE } from "../src/sim/encounter.ts";
import { GENERATOR, turfShare } from "../src/sim/race-generator.ts";
import { generatedRaceId, parseGeneratedRaceId } from "../src/sim/race-id.ts";
import { snapToLane } from "../src/sim/race-start.ts";
import { routeLength } from "../src/sim/route-choice.ts";

// A rival's turf leans its generated races toward home (design/PROCEDURAL_RACES.md,
// step 2). The id names the turf, a draw without one is untouched, and the lean is
// soft: it shows in the share of a race inside the turf, not in every race.

test("a generated race id names its seed, its variant and, if any, the turf it leans toward", () => {
  for (const id of [{ seed: 15, kind: "sprint", rival: null }, { seed: 0, kind: "circuit", rival: "moth" },
    { seed: 999_999_999, kind: "unordered", rival: "stray" }] as const) {
    assert.deepEqual(parseGeneratedRaceId(generatedRaceId(id)), id);
  }
  assert.equal(generatedRaceId({ seed: 15, kind: "sprint", rival: null }), "gen-15", "a draw with no turf keeps the id it always had");
  assert.equal(generatedRaceId({ seed: 15, kind: "circuit", rival: "moth" }), "gen-moth-15-circuit");
  for (const bad of ["gen-circuit-5", "gen-unordered-5-circuit", "gen-15-drift", "gen-Moth-1", "gen-1234567890", "gen-moth-", "gen--1", "sound-to-sky", "gen-m-1"]) {
    assert.equal(parseGeneratedRaceId(bad), null, bad);
  }
  assert.throws(() => generatedRaceId({ seed: -1, kind: "sprint", rival: null }));
  assert.throws(() => generatedRaceId({ seed: 1, kind: "sprint", rival: "Moth" }));
});

test("nine turfs come from the map, one per Blacklist name but Tally, each near a street and named for its id", () => {
  assert.deepEqual(ALDER_TURFS.map(t => t.id), ["moth", "stray", "rivet", "bollard", "deuce", "sable", "plumb", "crest", "wake"]);
  assert.equal(turfFor("tally"), null, "the whole city is no pull");
  assert.equal(turfFor("moth"), ALDER_TURFS[0]);
  for (const turf of ALDER_TURFS) {
    assert.equal(turf.radius, TURF_RADIUS);
    assert.deepEqual(parseGeneratedRaceId(generatedRaceId({ seed: 1, kind: "sprint", rival: turf.id }))?.rival, turf.id);
    let nearest = Infinity;
    for (const street of ALDER_STREETS) for (const p of street.points) nearest = Math.min(nearest, Math.hypot(p.x - turf.centre.x, p.z - turf.centre.z));
    // Measured 2026-09-15: Plumb's Madrona Ridge label is the farthest, 146 m from a street vertex.
    assert.ok(nearest < 200, `${turf.id}'s centre is ${nearest.toFixed(0)} m from any street`);
  }
  // Moth's turf is centred on the loop she cruises.
  const moth = turfFor("moth")!;
  const xs = ALDER_CRUISE.points.map(p => p.x), zs = ALDER_CRUISE.points.map(p => p.z);
  assert.ok(moth.centre.x >= Math.min(...xs) && moth.centre.x <= Math.max(...xs) && moth.centre.z >= Math.min(...zs) && moth.centre.z <= Math.max(...zs));
});

test("Moth's turf leans her draws home from where she cruises, without failing a draw or touching the plain one", () => {
  const graph = alderRouting(), moth = turfFor("moth")!;
  const s = ALDER_CRUISE.start;
  const from = snapToLane(ALDER_STREETS, { x: s.x, z: s.z, heading: s.heading }, alderHeight)!;
  const share = (event: ReturnType<typeof alderGeneratedRace>) => {
    let metres = 0, inside = 0;
    for (const leg of event.generated.legs) { const m = routeLength(graph, leg.via); metres += m; inside += m * turfShare(graph, leg, moth); }
    return inside / metres;
  };
  let plain = 0, leaning = 0, changed = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const a = alderGeneratedRace(seed, from), b = alderGeneratedRace(seed, from, "sprint", moth);
    assert.equal(a.race.id, `gen-${seed}`);
    assert.equal(b.race.id, `gen-moth-${seed}`);
    assert.deepEqual(b, alderGeneratedRace(seed, from, "sprint", moth), "a turf draw is deterministic");
    plain += share(a) / 40; leaning += share(b) / 40;
    if (JSON.stringify(a.race.checkpoints) !== JSON.stringify(b.race.checkpoints)) changed++;
  }
  // Measured at pull 10: 34.1% -> 39.9%, 18 of 40 seeds drawing another race.
  assert.ok(leaning >= plain + 0.03, `inside Moth's turf: ${(plain * 100).toFixed(1)}% plain, ${(leaning * 100).toFixed(1)}% leaning`);
  assert.ok(changed >= 10 && changed <= 36, `${changed} of 40 seeds drew another race: a lean, not a takeover`);
  // With no pull the turf changes nothing but the name.
  const saved = GENERATOR.turf.pull;
  try {
    (GENERATOR.turf as { pull: number }).pull = 0;
    for (let seed = 1; seed <= 10; seed++) {
      assert.deepEqual(alderGeneratedRace(seed, from, "sprint", { ...moth, id: "nopull" }).race.checkpoints, alderGeneratedRace(seed, from).race.checkpoints);
    }
  } finally { (GENERATOR.turf as { pull: number }).pull = saved; }
});
