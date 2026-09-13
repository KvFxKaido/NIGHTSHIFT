import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, HANDLING, type Input, type Sim } from "../src/sim/sim.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import type { CoursePoint } from "../src/sim/track.ts";
import type { RivalDefinition } from "../src/sim/rival.ts";
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
