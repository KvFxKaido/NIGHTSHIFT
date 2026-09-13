import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, HANDLING, type Input, type Sim } from "../src/sim/sim.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import type { CoursePoint } from "../src/sim/track.ts";
import { createRivalDriver, rivalInput, OFF_ROAD_MARGIN, type RivalDefinition } from "../src/sim/rival.ts";
await RAPIER.init();

// A racing rival wants to win (2026-09-13): it does not queue behind the
// player, does not move over for them, covers their side when they close, and
// does not lift for contact. A straight 24 m road isolates that from corners
// and traffic. The rival starts at x = 0 heading -Z; +X is its right-hand side.
const PARKED: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
function straight(player: { x: number; z: number }, width = 24): Sim {
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const along = [0, 8000];
  const start = { x: 0, y: 0, z: 0, heading: 0, pitch: 0 };
  const route: RivalDefinition = { id: "racing-check", start, points, along, gates: [8000] };
  const sim = createSim("fwd", { id: "racing-check", start: { ...start, ...player }, walls: [], project: (x, z) => projectOntoPath(points, x, z) }, {
    traffic: false, rival: route,
    race: { id: "racing-check", name: "Racing check", countdownTicks: 0, checkpoints: [{ id: "finish", name: "Finish", x: 0, z: -8000, y: 0, radius: 10 }] },
  });
  return sim;
}
/** Drive the player as a scripted racer: a fixed line and speed, heading -Z. */
function hold(sim: Sim, x: number, speed: number): void {
  const p = sim.body.translation();
  sim.body.setTranslation({ x, y: p.y, z: p.z }, true);
  sim.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  sim.body.setLinvel({ x: 0, y: 0, z: -speed }, true);
  sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
const launch = (sim: Sim, speed: number) => sim.rivalBody!.setLinvel({ x: 0, y: 0, z: -speed }, true);

test("behind a slower racing player it goes for the pass instead of queueing", () => {
  const sim = straight({ x: 0, z: -40 });
  try {
    launch(sim, 30);
    let passed = -1, slowest = Infinity;
    for (let tick = 0; tick < 900 && passed < 0; tick++) {
      hold(sim, 0, 18);
      step(sim, PARKED);
      const rival = sim.state.rival!.vehicle, player = sim.state.vehicle;
      if (rival.z > player.z) slowest = Math.min(slowest, rival.speed);
      if (rival.z < player.z - 6) passed = tick;
    }
    assert.ok(passed >= 0, "the rival never got past a player doing 18 m/s");
    // The old rival passed here too, by dodging the player as traffic; this
    // keeps that working. What it would not do is the next test.
    assert.ok(slowest > 24, `it slowed to ${slowest.toFixed(1)} m/s behind the player`);
  } finally { sim.world.free(); }
});

test("a player who blocks gets pressure, not patience", () => {
  // A 9 m street leaves too little room to dodge round the player as traffic.
  const sim = straight({ x: 0, z: -40 }, 9);
  try {
    launch(sim, 30);
    let brakedBehind = 0, closest = Infinity;
    for (let tick = 0; tick < 420; tick++) {
      // The player holds the middle of the street.
      hold(sim, 0, 18);
      step(sim, PARKED);
      const rival = sim.state.rival!.vehicle, player = sim.state.vehicle;
      const gap = rival.z - player.z;
      if (gap > 0 && gap < 40 && sim.state.rival!.input.brake > 0) brakedBehind++;
      closest = Math.min(closest, Math.hypot(rival.x - player.x, rival.z - player.z));
    }
    // The old rival braked to the blocker's speed and waited behind it.
    assert.equal(brakedBehind, 0, `it braked behind the blocker on ${brakedBehind} ticks`);
    assert.ok(closest < 5, `it never pressed the blocker (closest ${closest.toFixed(1)} m)`);
  } finally { sim.world.free(); }
});

test("a player stopped in the road is still avoided, not rammed", () => {
  const sim = straight({ x: 0, z: -220 });
  try {
    let contact = false, passed = false;
    for (let tick = 0; tick < 1800 && !passed; tick++) {
      step(sim, PARKED);
      sim.world.contactPair(sim.body.collider(0), sim.rivalBody!.collider(0), manifold => { if (manifold.numSolverContacts() > 0) contact = true; });
      passed = sim.state.rival!.vehicle.z < sim.state.vehicle.z - 10;
    }
    assert.ok(passed, "the rival never got past a parked player");
    assert.equal(contact, false, "the rival hit a parked player");
  } finally { sim.world.free(); }
});

test("alongside a racing player it holds its line and does not brake", () => {
  const sim = straight({ x: 3.4, z: 0 });
  try {
    launch(sim, 28);
    let widest = 0, braked = false;
    for (let tick = 0; tick < 240; tick++) {
      hold(sim, 3.4, sim.state.rival!.vehicle.speed);
      step(sim, PARKED);
      widest = Math.max(widest, Math.abs(sim.state.rival!.vehicle.x));
      if (sim.state.rival!.input.brake > 0) braked = true;
    }
    // The old rival moved about 3.8 m away and braked to let the player through.
    assert.ok(widest < 0.8, `it moved ${widest.toFixed(2)} m off its line for the player`);
    assert.equal(braked, false);
  } finally { sim.world.free(); }
});

test("ahead and being caught, it covers the player's side of the road", () => {
  for (const side of [1, -1]) {
    const sim = straight({ x: side * 3, z: 18 });
    try {
      launch(sim, 26);
      let toward = 0;
      for (let tick = 0; tick < 150; tick++) {
        hold(sim, side * 3, 34);
        step(sim, PARKED);
        toward = Math.max(toward, sim.state.rival!.vehicle.x * side);
      }
      assert.ok(toward > 1.2, `side ${side}: it moved only ${toward.toFixed(2)} m toward the player`);
    } finally { sim.world.free(); }
  }
});

test("it stays on the throttle through contact, and contact at speed launches nobody", () => {
  const sim = straight({ x: 2.3, z: 0 });
  try {
    sim.body.setLinvel({ x: 0, y: 0, z: -40 }, true);
    launch(sim, 40);
    let contactTicks = 0, liftedDuringContact = 0, fastest = 0, sideways = 0;
    for (let tick = 0; tick < 300; tick++) {
      // The player steers into the rival.
      step(sim, { throttle: 1, brake: 0, steer: tick < 120 ? -0.35 : 0, handbrake: 0 });
      let touching = false;
      sim.world.contactPair(sim.body.collider(0), sim.rivalBody!.collider(0), manifold => { if (manifold.numSolverContacts() > 0) touching = true; });
      const rival = sim.state.rival!.vehicle, player = sim.state.vehicle;
      if (touching) { contactTicks++; if (sim.state.rival!.input.throttle < 0.5) liftedDuringContact++; }
      fastest = Math.max(fastest, rival.speed, player.speed);
      sideways = Math.max(sideways, Math.abs(rival.lateralSpeed), Math.abs(player.lateralSpeed));
      assert.ok(Number.isFinite(rival.x + rival.z + player.x + player.z));
    }
    assert.ok(contactTicks > 0, "the cars never touched; the test proves nothing");
    assert.equal(liftedDuringContact, 0, `the rival lifted on ${liftedDuringContact} of ${contactTicks} contact ticks`);
    assert.ok(fastest < HANDLING.topSpeed + 1, `contact launched a car to ${fastest.toFixed(1)} m/s`);
    assert.ok(sideways < 12, `contact threw a car sideways at ${sideways.toFixed(1)} m/s`);
  } finally { sim.world.free(); }
});

// Traffic (2026-09-13): each car is judged by where it will be when the rival
// gets there. Measured on Sound to Sky with the player parked, the old loop
// lost 18.8 s to traffic (169.9 s empty, 188.7 s with traffic, 118 ticks of
// contact); this one loses 12.4 s (182.3 s, 30 ticks).
function decide(obstacles: { x: number; z: number; speed: number; heading: number; length?: number }[], width = 24, rivalX = 0) {
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "traffic-check", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 8000], gates: [8000] };
  const vehicle = { ...createSim("fwd").state.vehicle, x: rivalX, y: 0, z: -100, heading: 0, speed: 30, forwardSpeed: 30, lateralSpeed: 0 };
  // Out wide already, as it would be while passing: its avoidance says where it is.
  const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: rivalX };
  const input = rivalInput(route, { vehicle, driver, race: null }, obstacles.map(o => ({ y: 0, ...o })));
  return { input, driver };
}
const CROSSING_RIGHT = -Math.PI / 2; // travelling +X, across a line heading -Z

test("a car crossing the line ahead is ignored if it will be gone, slowed for if it will not", () => {
  // On the line now, 35 m ahead, clearing it at 10 m/s: 10 m clear by the time it arrives.
  const gone = decide([{ x: 0, z: -135, speed: 10, heading: CROSSING_RIGHT }]);
  assert.equal(gone.input.brake, 0, "it braked for a crossing car that will be long gone");
  assert.ok(gone.driver.targetSpeed > 29, `target ${gone.driver.targetSpeed}`);
  // 6.5 m off the line, 30 m ahead, arriving on it just as the rival does.
  const arriving = decide([{ x: -6.5, z: -130, speed: 7.5, heading: CROSSING_RIGHT }]);
  assert.ok(arriving.driver.targetSpeed < 25, `it did not slow for a car crossing into its path (target ${arriving.driver.targetSpeed})`);
});

test("a slower car ahead is passed with room, and queued behind only without it", () => {
  const room = decide([{ x: 0, z: -130, speed: 15, heading: 0 }]);
  assert.equal(room.input.brake, 0, "it braked behind a car it had room to pass");
  assert.notEqual(room.driver.avoidance, 0, "it did not start moving out to pass");
  // Both sides taken by cars beside it: nowhere to go.
  const boxed = decide([{ x: 0, z: -130, speed: 15, heading: 0 }, { x: 3.8, z: -100, speed: 30, heading: 0 }, { x: -3.8, z: -100, speed: 30, heading: 0 }]);
  assert.ok(boxed.driver.targetSpeed < 29, `boxed in, it kept a target of ${boxed.driver.targetSpeed}`);
});

// Pinned behind a truck (2026-09-13). On Uptown Circuit in traffic the rival,
// already 3.8 m right of its route, came up behind a box truck in the inner lane
// (2.6 m right, 11 m/s) and pushed it at full throttle for 42 s: the loop measured
// the truck from the car but compared it with an offset from the route, so it saw
// the truck 5 m out of its path. Here, the same shape on a 20 m street.
test("a slower car in its way is slowed for and passed even when the rival is already out wide", () => {
  const truck = { x: 2.6, z: -106.2, speed: 11, heading: 0, length: 7.2 };
  const pinned = decide([truck], 20, 3.8);
  assert.ok(pinned.driver.targetSpeed < 15, `on the truck's bumper it kept a target of ${pinned.driver.targetSpeed.toFixed(1)} m/s`);
  assert.ok(Math.abs(pinned.driver.avoidance - 3.8) > 0.01, "it did not move to pass");
  // With the truck well ahead, it moves over to a gap beside it rather than following.
  const room = decide([{ ...truck, z: -140 }], 20, 3.8);
  assert.ok(room.driver.targetSpeed > 29, `with room to pass it slowed to ${room.driver.targetSpeed.toFixed(1)} m/s`);
  assert.ok(Math.abs(room.driver.avoidance - 3.8) > 0.01, "with room to pass it did not move over");
});

// The lost-car cap (2026-09-13). A rival is held to 10 m/s until it is back
// where it should be. It used to mean more than 5 m from its route. On a racing
// line that fired in a recorded race: abandoning a re-pass at 95 mph, the rival
// drifted 6.5 m from its line (still 4 m inside a 14 m road's edge) and braked
// to 59 mph in the kink after the Drop. On a line it now means off the road.
test("a rival wide of its racing line but on the road is not treated as lost", () => {
  const line = -2.5, width = 14;
  const points: CoursePoint[] = [[line, 0], [line, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "line-check", start: { x: line, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 8000], gates: [8000], lateral: [line, line] };
  const race = { checkpoint: 0, collected: [], targetIndex: 0, countdown: 0, ticks: 1, splits: [], finished: false, next: null };
  const at = (x: number) => {
    const vehicle = { ...createSim("awd").state.vehicle, x, y: 0, z: -1000, heading: 0, speed: 42, forwardSpeed: 42, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 1000, progressMark: 1000 };
    rivalInput(route, { vehicle, driver, race }, []);
    return driver.targetSpeed;
  };
  // 6.5 m right of the line is 4 m right of the road's centre: wide, on the asphalt.
  assert.ok(at(line + 6.5) > 30, `a rival on the road was treated as lost (target ${at(line + 6.5)} m/s)`);
  // Past the carriageway and its shoulder is lost, and still held back.
  assert.ok(at(width / 2 + OFF_ROAD_MARGIN + 0.5) <= 10, "a rival off the road kept its speed");
  // A street centreline keeps its 5 m rule.
  const street: RivalDefinition = { ...route, id: "street-check", lateral: undefined };
  const vehicle = { ...createSim("awd").state.vehicle, x: line + 5.5, y: 0, z: -1000, heading: 0, speed: 42, forwardSpeed: 42, lateralSpeed: 0 };
  const driver = { ...createRivalDriver(), along: 1000, progressMark: 1000 };
  rivalInput(street, { vehicle, driver, race }, []);
  assert.ok(driver.targetSpeed <= 10, `5.5 m off a street centreline, it kept a target of ${driver.targetSpeed} m/s`);
});
