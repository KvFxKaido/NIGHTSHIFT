import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_STREETS, alderGeneratedRace, alderHeight, createAlderWorld } from "../src/sim/alder.ts";
import { BLACKLIST_CRUISERS, cruiserFor } from "../src/sim/alder-cruisers.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { turfFor } from "../src/sim/alder-turf.ts";
import { ALDER_CRUISE, MOTH, nearbyChallenge } from "../src/sim/encounter.ts";
import { generatedRaceId } from "../src/sim/race-id.ts";
import { encodeStart, headingOf, snapToLane } from "../src/sim/race-start.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { CAR_DRIVETRAIN } from "../src/customization/cars.ts";
import { rivalCard } from "../src/ui/rival-card.ts";
await RAPIER.init();

// The Blacklist on the map (phase 1): every name but Moth, Rivet and Sable cruises
// a loop in its turf, and a flash draws a race of its type there, in its own car.

const cruisers = () => BLACKLIST_CRUISERS.map(c => ({ id: c.id, name: c.name, route: c.route }));

test("seven names cruise, each with its own car, card and a loop inside its turf that shares no street", () => {
  assert.deepEqual(BLACKLIST_CRUISERS.map(c => c.id), ["stray", "bollard", "deuce", "plumb", "crest", "wake", "tally"]);
  const streetsOf = (points: readonly { x: number; z: number }[]) => new Set(ALDER_STREETS
    .filter(s => s.points.some((p, i) => i > 0 && points.some(q => Math.hypot(q.x - (p.x + s.points[i - 1]!.x) / 2, q.z - (p.z + s.points[i - 1]!.z) / 2) < 4))).map(s => s.id));
  const claimed = new Map<string, string>();
  for (const id of streetsOf(ALDER_CRUISE.points)) claimed.set(id, "moth");
  for (const cruiser of BLACKLIST_CRUISERS) {
    assert.ok(CAR_DRIVETRAIN[cruiser.car], `${cruiser.id}'s car ${cruiser.car} has no drivetrain`);
    assert.equal(cruiser.route.drivetrain, CAR_DRIVETRAIN[cruiser.car]);
    const card = rivalCard(cruiser.id);
    assert.ok(card && card.name === cruiser.name && card.car === cruiser.carName, `${cruiser.id} has no matching card`);
    const length = cruiser.route.along.at(-1)!;
    assert.ok(length > 1400 && length < 3000, `${cruiser.id}'s loop is ${length.toFixed(0)} m`);
    assert.ok(cruiser.route.loop);
    const first = cruiser.route.points[0]!, last = cruiser.route.points.at(-1)!;
    assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < .1, `${cruiser.id}'s loop does not close`);
    const turf = turfFor(cruiser.id);
    if (turf) {
      const outside = cruiser.route.points.filter(p => Math.hypot(p.x - turf.centre.x, p.z - turf.centre.z) > turf.radius + 5);
      assert.equal(outside.length, 0, `${cruiser.id} leaves its turf at ${outside.slice(0, 2).map(p => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(" ")}`);
    } else assert.equal(cruiser.id, "tally", "only Tally's turf is the whole city");
    for (const id of streetsOf(cruiser.route.points)) {
      assert.ok(!claimed.has(id) || claimed.get(id) === cruiser.id, `${cruiser.id} and ${claimed.get(id)} both cruise ${id}`);
      claimed.set(id, cruiser.id);
    }
  }
  assert.equal(cruiserFor("moth"), null, "Moth is the encounter, not a cruiser");
});

test("a flash anywhere along a cruiser's loop draws its race, and the race is raced in its car", () => {
  for (const cruiser of BLACKLIST_CRUISERS) {
    const { points, along } = cruiser.route;
    for (let d = 40; d < along.at(-1)! - 40; d += 180) {
      let i = 1; while (along[i]! < d) i++;
      const a = points[i - 1]!, b = points[i]!, l = Math.hypot(b.x - a.x, b.z - a.z) || 1, t = (d - along[i - 1]!) / l;
      const pose = snapToLane(ALDER_STREETS, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: headingOf((b.x - a.x) / l, (b.z - a.z) / l) }, alderHeight);
      assert.ok(pose, `${cruiser.id} at ${d.toFixed(0)} m is off every street`);
      const start = encodeStart(pose!);
      assert.ok([1, 2, 3, 4, 5, 6, 7, 8].some(seed => alderCourseDraws(generatedRaceId({ seed: seed * 7919, kind: cruiser.kind, rival: cruiser.id }), start)),
        `no ${cruiser.kind} for ${cruiser.id} from ${start}`);
    }
  }
  const stray = drawAlderCourse("gen-stray-12-unordered", null);
  assert.equal(stray.rival.drivetrain, "fwd", "Stray's Latch");
  assert.equal(stray.race.kind, "unordered");
  // Tally's turf is the whole city: her race is the plain draw of its seed, under her name, in her Vesper.
  const tally = drawAlderCourse("gen-tally-12-unordered", null), plain = alderGeneratedRace(12, undefined, "unordered");
  assert.equal(tally.race.id, "gen-tally-12-unordered");
  assert.equal(tally.rival.id, "gen-tally-12-unordered-driver");
  assert.equal(tally.rival.drivetrain, "rwd");
  assert.deepEqual(tally.race.checkpoints, plain.race.checkpoints);
  assert.throws(() => drawAlderCourse("gen-nobody-12", null), /Unknown turf/);
});

test("all seven cruise in traffic beside Moth, around each other, and a replay of the tick log reproduces them", () => {
  const parked = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  const run = (ticks: number) => {
    const sim = createSim("rwd", createAlderWorld(false), { traffic: true, encounterRoute: ALDER_CRUISE, cruisers: cruisers() });
    const travelled = new Map(sim.state.cruisers.map(c => [c.id, 0]));
    const last = new Map(sim.state.cruisers.map(c => [c.id, c.driver.along]));
    for (let tick = 0; tick < ticks; tick++) {
      step(sim, parked);
      sim.state.cruisers.forEach((c, i) => {
        const loop = sim.cruiserDefinitions[i]!.route.along.at(-1)!;
        let d = c.driver.along - last.get(c.id)!; if (d < -loop / 2) d += loop; if (d > loop / 2) d -= loop;
        travelled.set(c.id, travelled.get(c.id)! + d); last.set(c.id, c.driver.along);
        assert.ok(Number.isFinite(c.vehicle.x + c.vehicle.z + c.vehicle.speed), `${c.id} went non-finite at tick ${tick}`);
      });
    }
    const snapshot = JSON.stringify({ cruisers: sim.state.cruisers, moth: sim.state.encounter });
    const result = { sim: { cruisers: sim.state.cruisers.map(c => ({ id: c.id, resets: c.driver.resets })) }, travelled, snapshot };
    sim.world.free();
    return result;
  };
  const first = run(3600), second = run(3600);
  for (const c of first.sim.cruisers) {
    assert.equal(c.resets, 0, `${c.id} needed a reset`);
    // Measured 2026-09-15: about 640 m a minute at the 10 m/s cruise, in traffic.
    assert.ok(first.travelled.get(c.id)! > 450, `${c.id} cruised only ${first.travelled.get(c.id)!.toFixed(0)} m in 60 s`);
  }
  assert.equal(second.snapshot, first.snapshot, "the same ticks cruise the same way");
});

test("a flash reaches a cruiser as it reaches Moth, nearest first, and never in a race", () => {
  const sim = createSim("rwd", createAlderWorld(false), { traffic: false, encounterRoute: ALDER_CRUISE, cruisers: cruisers() });
  try {
    for (let i = 0; i < 2; i++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    for (const cruiser of sim.state.cruisers) {
      const beside = { ...cruiser.vehicle, x: cruiser.vehicle.x + 6, speed: 0 };
      assert.equal(nearbyChallenge(beside, sim.state.encounter, sim.state.parkedRivals, false, sim.state.cruisers), cruiser.id);
      assert.equal(nearbyChallenge(beside, sim.state.encounter, sim.state.parkedRivals, true, sim.state.cruisers), null);
    }
    const moth = { ...sim.state.encounter!, x: sim.state.encounter!.x + 6, speed: 0 };
    assert.equal(nearbyChallenge(moth, sim.state.encounter, sim.state.parkedRivals, false, sim.state.cruisers), MOTH.id);
    assert.throws(() => createSim("rwd", createAlderWorld(true), { race: alderGeneratedRace(1).race, cruisers: cruisers() }), /free roam/);
  } finally { sim.world.free(); }
});
