import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step } from "../src/sim/sim.ts";
import { ALDER_STREETS, alderGeneratedRace, alderHeight, createAlderWorld, projectOntoAlder } from "../src/sim/alder.ts";
import { snapToLane, encodeStart, decodeStart, forwardOf, headingOf, START, type Pose } from "../src/sim/race-start.ts";
import { startApproach } from "../src/sim/race-generator.ts";
import type { Street } from "../src/sim/street-path.ts";
await RAPIER.init();

// A generated race starts where you flashed: the pose is snapped to its lane,
// carried in the URL, and the generator's origin is the junction ahead of it.

const flat = () => 0;
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;
/** A straight street running north (towards -z) from (0, 0) to (0, -200), 20 m wide. */
const northStreet: Street = { id: "t-north", name: "Test St", from: "0,0", to: "0,-200", added: true, kind: "arterial",
  points: [{ x: 0, z: 0, y: 0, width: 20, zone: "old-quarter" }, { x: 0, z: -200, y: 0, width: 20, zone: "old-quarter" }] };

test("a pose snaps to the right-hand lane of its street, facing the way it was going", () => {
  // Drifting east of the centreline, heading roughly north: lane is east (+x), heading exactly north.
  const north = snapToLane([northStreet], { x: 2, z: -100, heading: 0.1 }, flat)!;
  assert.ok(near(north.x, START.laneOffset) && near(north.z, -100) && near(north.heading, 0), JSON.stringify(north));
  // Facing south instead: the other lane, the other way.
  const south = snapToLane([northStreet], { x: 2, z: -100, heading: Math.PI - 0.2 }, flat)!;
  assert.ok(near(south.x, -START.laneOffset) && near(south.z, -100) && near(Math.abs(south.heading), Math.PI), JSON.stringify(south));
  // The forward of the snapped heading runs along the street.
  const f = forwardOf(north.heading);
  assert.ok(near(f.x, 0) && near(f.z, -1));
  assert.ok(near(headingOf(0, -1), 0));
});

test("no street within reach means no start, and a pose near the junction ahead backs up to clear it", () => {
  assert.equal(snapToLane([northStreet], { x: 40, z: -100, heading: 0 }, flat), null);
  const late = snapToLane([northStreet], { x: 0, z: -195, heading: 0 }, flat)!;
  assert.ok(near(late.z, -200 + START.clearance), `backed up to z ${late.z}`);
  const early = snapToLane([northStreet], { x: 0, z: -5, heading: Math.PI }, flat)!;
  assert.ok(near(early.z, -START.clearance), `backed up to z ${early.z}`);
});

test("the URL carries the start: encode, decode and snap again give the pose back", () => {
  const raw: Pose = { x: -25.7, z: 300.2, heading: 0.31 };
  const snapped = snapToLane(ALDER_STREETS, raw, alderHeight)!;
  const text = encodeStart(snapped);
  assert.match(text, /^-?\d+\.\d,-?\d+\.\d,-?\d+\.\d{3}$/);
  const back = snapToLane(ALDER_STREETS, decodeStart(text)!, alderHeight)!;
  assert.ok(Math.hypot(back.x - snapped.x, back.z - snapped.z) < 0.1 && Math.abs(back.heading - snapped.heading) < 2e-3,
    `round trip moved the start by ${Math.hypot(back.x - snapped.x, back.z - snapped.z).toFixed(2)} m`);
  for (const bad of ["", "1,2", "a,b,c", "1,2,3,4", "NaN,0,0", "9999,0,0", "0,0,9"]) assert.equal(decodeStart(bad), null, bad);
});

/** A pose part-way along a named street, facing along it (or back). */
function poseOn(name: string, t: number, reverse = false): Pose {
  const street = ALDER_STREETS.find(s => s.name === name)!;
  const p = street.points, a = p[0]!, b = p[p.length - 1]!;
  const seg = Math.min(p.length - 2, Math.floor(t * (p.length - 1)));
  const s0 = p[seg]!, s1 = p[seg + 1]!;
  const dx = (reverse ? s0.x - s1.x : s1.x - s0.x), dz = (reverse ? s0.z - s1.z : s1.z - s0.z), l = Math.hypot(dx, dz);
  void a; void b;
  return { x: (s0.x + s1.x) / 2 + 1.5, z: (s0.z + s1.z) / 2, heading: headingOf(dx / l, dz / l) };
}
const starts: [string, Pose][] = [
  ["Pike St downtown, eastbound", poseOn("Pike St", 0.5)],
  ["Queen Anne Climb, uphill", poseOn("Queen Anne Climb", 0.4)],
  ["Freight Cut, the alley", poseOn("Freight Cut", 0.5)],
  ["4th Ave S, southbound", poseOn("4Th Ave S", 0.5, true)],
];

test("races draw from anywhere: the first leg leaves the junction ahead of the start and the rival starts beside it", () => {
  for (const [label, pose] of starts) {
    const from = snapToLane(ALDER_STREETS, pose, alderHeight);
    assert.ok(from, `${label}: no lane`);
    const approach = startApproach(ALDER_STREETS, from!);
    for (let seed = 1; seed <= 5; seed++) {
      const { race, rival, generated } = alderGeneratedRace(seed, from!);
      assert.ok(race.checkpoints.length >= 3, `${label} seed ${seed}: ${race.checkpoints.length} gates`);
      assert.equal(generated.legs[0]!.from, approach.node, `${label} seed ${seed}: the first leg does not leave the junction ahead`);
      assert.ok(Math.hypot(rival.start.x - from!.x, rival.start.z - from!.z) < 9, `${label} seed ${seed}: rival starts ${Math.hypot(rival.start.x - from!.x, rival.start.z - from!.z).toFixed(1)} m away`);
      const first = rival.points[0]!;
      assert.ok(Math.hypot(first.x - rival.start.x, first.z - rival.start.z) < 0.5, `${label} seed ${seed}: the rival's line does not begin at its start`);
      // The rival is ahead of the start, in the start's own frame.
      const f = forwardOf(from!.heading);
      assert.ok((rival.start.x - from!.x) * f.x + (rival.start.z - from!.z) * f.z > 5, `${label} seed ${seed}: the rival is not ahead`);
    }
  }
  // The grid still draws the same race it did: no start means the grid.
  assert.deepEqual(alderGeneratedRace(7).race.checkpoints, alderGeneratedRace(7, createAlderWorld(true).start).race.checkpoints);
});

test("the rival drives a race that starts on Queen Anne Climb to the finish in traffic", () => {
  const from = snapToLane(ALDER_STREETS, poseOn("Queen Anne Climb", 0.4), alderHeight)!;
  const { race, rival } = alderGeneratedRace(2, from);
  const world = createAlderWorld(true, from);
  assert.deepEqual(world.start, from);
  const sim = createSim("fwd", world, { race, rival, traffic: true });
  try {
    // Placed at the start before a tick runs; parked on a hill for five minutes it may creep.
    assert.ok(Math.hypot(sim.state.vehicle.x - from.x, sim.state.vehicle.z - from.z) < 1, "the player was not placed at the start");
    assert.ok(Math.abs(sim.state.vehicle.heading - from.heading) < 1e-6, "the player does not face the way the start does");
    const parked = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    let furthest = 0;
    for (let tick = 0; tick < 18000 && !sim.state.rival!.race.finished; tick++) {
      step(sim, parked);
      const car = sim.state.rival!.vehicle;
      furthest = Math.max(furthest, projectOntoAlder(car.x, car.z).distance);
    }
    const state = sim.state.rival!;
    assert.equal(state.race.finished, true, JSON.stringify({ checkpoint: state.race.checkpoint, driver: state.driver }));
    assert.equal(state.driver.resets, 0, "a race from the hill must not need the fallback reset");
    assert.ok(furthest < 16, `rival strayed ${furthest.toFixed(1)} m from a centreline`);
  } finally { sim.world.free(); }
});
