import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { carHandling, createSim, step, steadyWheelAngleFor, HANDLING, type Input, type Sim } from "../src/sim/sim.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import type { CoursePoint } from "../src/sim/track.ts";
import { passingOffset } from "../src/sim/traffic-pass.ts";
import { createRivalDriver, rivalInput, sampleDrivingPath, OFF_ROAD_MARGIN, RIVAL_LANE, RIVAL_RACING, RIVAL_STEERING, RIVAL_STREET_CORNERS, RIVAL_TRAFFIC_FRAME, type RivalDefinition, type RivalSpeedWhy } from "../src/sim/rival.ts";
import { laneOffset } from "../src/sim/lanes.ts";
await RAPIER.init();

// A racing rival wants to win (2026-09-13): it does not queue behind the
// player, does not move over for them, covers their side when they close, and
// does not lift for contact. A straight 24 m road isolates that from corners
// and traffic. The rival starts at x = 0 heading -Z; +X is its right-hand side.
const PARKED: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
function straight(player: { x: number; z: number }, width = 24, rivalX = 0): Sim {
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const along = [0, 8000];
  const start = { x: rivalX, y: 0, z: 0, heading: 0, pitch: 0 };
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

// It passes the player only through a lane it can use (driver-v10, 2026-09-26): in both of Shawn's recorded races of
// gen-crest-223734 its move on him was the side he was not covering, the oncoming lane, with a car coming in it.
test("behind a racing player it does not pull out into a lane with a car coming the other way", () => {
  const sim = straight({ x: 1, z: -120 });
  try {
    const route: RivalDefinition = { id: "racing-check", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 },
      points: [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width: 24, zone: "boulevard" })), along: [0, 8000], gates: [8000] };
    // The rival at 40 m/s, the player 20 m on at 30 m/s and `playerX` right: the side they are not covering is the left.
    // A sedan 150 m on at `sedanX` at 15 m/s, coming towards it: met in 2.6 s, before a pass that takes 2.8.
    const drive = (sedanX: number | null, playerX = 1) => {
      const vehicle = { ...sim.state.rival!.vehicle, x: 0, y: 0, z: -100, heading: 0, speed: 40, forwardSpeed: 40, lateralSpeed: 0 };
      const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: ownSide(24) };
      const player = { x: playerX, y: 0, z: -120, heading: 0, speed: 30 };
      const sedan = sedanX === null ? [] : [{ id: 9, x: sedanX, y: 0, z: -250, heading: Math.PI, speed: 15, length: 4.4 }];
      for (let tick = 0; tick < 60; tick++) rivalInput(route, { vehicle, driver, race: sim.state.rival!.race }, sedan, player);
      return { aim: driver.avoidance, wants: driver.targetSpeed };
    };
    // From its own side, 1.6 m right on 24 m: a second of it.
    assert.ok(drive(null).aim < -1.5, `with the lane clear it went only ${drive(null).aim.toFixed(2)} m left; the test proves nothing`);
    assert.ok(drive(-3.8).aim > ownSide(24) + 1, `with a car coming in the left lane it went ${drive(-3.8).aim.toFixed(2)} m, not right past the player`);
    // A car in the next lane over, 2.5 m outside the one it would pass in, does not block it (2.6 m did, in Shawn's race).
    assert.ok(drive(-6.3).aim < -1.5, `a car in the far lane kept it at ${drive(-6.3).aim.toFixed(2)} m`);
    // The player 2 m right leaves too little room on that side: held behind them, no faster than them by more than 2 m/s
    // and half a m/s a metre past 8 m back (it hit Shawn from behind at 105 mph to his 78, held and flat out).
    const held = drive(-3.8, 2);
    assert.ok(Math.abs(held.aim - ownSide(24)) < .5, `held, it still moved to ${held.aim.toFixed(2)} m`);
    assert.ok(held.wants <= 30 + 2 + (20 - 8) * .5 + 1e-9, `held behind a player doing 30 m/s it wanted ${held.wants.toFixed(1)}`);
  } finally { sim.world.free(); }
});

// The same race, the second time (2026-09-26, 41 s): with a lane clear it closed on Shawn flat out, 101 mph to his 77,
// its aim flipping side each time either car twitched across the other, and hit him from behind still in his line.
test("behind a racing player it keeps the side it has taken, and in their line closes no faster than it can stop", () => {
  const sim = straight({ x: 1, z: -120 });
  try {
    const route: RivalDefinition = { id: "racing-check", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 },
      points: [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width: 24, zone: "boulevard" })), along: [0, 8000], gates: [8000] };
    // The rival at 40 m/s at `rivalX`, heading `heading` (positive turns it left, -X), aiming at `aim`; the player 20 m
    // on at `playerX`, 30 m/s. The car does not move: this is what it asks for over half a second from there.
    const drive = (rivalX: number, aim: number, playerX: number, heading = 0) => {
      const vehicle = { ...sim.state.rival!.vehicle, x: rivalX, y: 0, z: -100, heading, speed: 40, forwardSpeed: 40, lateralSpeed: 0 };
      const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: aim };
      const player = { x: playerX, y: 0, z: -120, heading: 0, speed: 30 };
      for (let tick = 0; tick < 30; tick++) rivalInput(route, { vehicle, driver, race: sim.state.rival!.race }, [], player);
      return { aim: driver.avoidance, wants: driver.targetSpeed };
    };
    // Aiming left of them already, its car a little right of theirs: read from the car, the player was on its left and
    // it turned back right.
    const kept = drive(1.5, -1.5, 0.8);
    assert.ok(kept.aim < -2.5, `leaning left of the player it went back to ${kept.aim.toFixed(2)} m`);
    // In their line and not moving out of it: no faster than it can shed at 5 m/s^2 before it is 6 m behind them.
    const inLine = drive(0.5, -1.5, 0.8);
    const limit = 30 + Math.sqrt(2 * RIVAL_RACING.inLineDecel * (20 - RIVAL_RACING.inLineGap));
    assert.ok(inLine.wants <= limit + 1e-9, `in the player's line, 20 m back and closing at 10 m/s, it wanted ${inLine.wants.toFixed(1)} m/s`);
    // Moving out of it at 0.2 rad, 8 m/s across, it is out long before it gets there: not held.
    const leaving = drive(0.5, -1.5, 0.8, 0.2);
    assert.ok(leaving.wants > limit + 5, `sliding out past them it was held to ${leaving.wants.toFixed(1)} m/s`);
    // Out of their line it is not held: past 2.2 m across it is not closing on them but passing.
    assert.ok(drive(-1.6, -1.5, 0.8).wants > limit + 5, "2.4 m across from them it was held");
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

// Where the rival rests on a street: its own side of it (RIVAL_LANE).
const ownSide = (width: number) => RIVAL_LANE.share * laneOffset(width, { direction: 1, index: 0 }, width > 14 ? "collector" : "local");

test("on a street it keeps to its own side of the road", () => {
  for (const width of [12, 16, 24]) {
    // The player parked far behind is no part of it.
    const sim = straight({ x: 0, z: 400 }, width);
    try {
      launch(sim, 20);
      for (let tick = 0; tick < 600; tick++) step(sim, PARKED);
      const x = sim.state.rival!.vehicle.x, line = ownSide(width);
      // Half-way to the middle of the inner lane going its way: 1.4 m right on a 12 m street, 1.1 m on 16, 1.6 m on 24.
      assert.ok(line > 1, `width ${width}: its own side is only ${line.toFixed(2)} m right; the test proves nothing`);
      assert.ok(Math.abs(x - line) < 0.35, `width ${width}: it rests ${x.toFixed(2)} m right of the centreline, not ${line.toFixed(2)}`);
    } finally { sim.world.free(); }
  }
});

test("alongside a racing player it holds its line and does not brake", () => {
  const line = ownSide(24);
  const sim = straight({ x: line - 3.4, z: 0 }, 24, line);
  try {
    launch(sim, 28);
    let widest = 0, braked = false;
    for (let tick = 0; tick < 240; tick++) {
      hold(sim, line - 3.4, sim.state.rival!.vehicle.speed);
      step(sim, PARKED);
      widest = Math.max(widest, Math.abs(sim.state.rival!.vehicle.x - line));
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

// Street corners, rounded (2026-09-13). The rival planned and steered every
// junction from the centreline's sharp corner: a right angle was always the 7 m/s
// floor, and it ran wide out of it into the oncoming lane. It now drives an arc
// within its own side of the street (RIVAL_STREET_CORNERS).
const cornerRoute = (turn: 1 | -1, width = 16): RivalDefinition => {
  const points: CoursePoint[] = [[0, 0], [0, -100], [turn * 100, -100]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  return { id: `corner-${turn}`, start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 100, 200], gates: [200] };
};
// Where the rival's own line is at a distance along the route: the driving path, moved out to its side.
const ownLine = (route: RivalDefinition, along: number, width = 16) => {
  const at = sampleDrivingPath(route, along), side = ownSide(width);
  return { x: at.x - at.uz * side, z: at.z + at.ux * side, at };
};

test("a street corner is rounded within the rival's own side of the street", () => {
  const width = 16, room = width / 2 - RIVAL_STREET_CORNERS.kerbMargin;
  for (const turn of [1, -1] as const) {
    const route = cornerRoute(turn, width), label = turn > 0 ? "right" : "left";
    // The path is continuous and points the way it runs.
    let previous = sampleDrivingPath(route, 60);
    for (let d = 60.1; d < 140; d += 0.1) {
      const here = sampleDrivingPath(route, d), step = Math.hypot(here.x - previous.x, here.z - previous.z);
      assert.ok(step <= 0.1 + 1e-9, `${label}: the path jumps ${step.toFixed(3)} m at ${d.toFixed(1)} m`);
      assert.ok(Math.hypot((here.x - previous.x) / step - here.ux, (here.z - previous.z) / step - here.uz) < 0.01, `${label}: the path does not point the way it runs at ${d.toFixed(1)} m`);
      previous = here;
    }
    const apex = sampleDrivingPath(route, 100);
    assert.ok(Math.hypot(apex.x, apex.z + 100) > 3, `${label}: the corner is not rounded; the test proves nothing`);
    if (turn > 0) {
      // A right turn cuts in towards the kerb from its own side, and keeps the margin at the apex.
      const line = ownLine(route, 100, width);
      assert.ok(line.x <= room + 1e-6 && line.z + 100 <= room + 1e-6, `right: its line at the apex is ${line.x.toFixed(2)} m in, the kerb margin is at ${room}`);
    } else {
      // A left turn is back on its own side of the new street by the edge of the junction.
      for (let d = 100 + width / 2; d <= 140; d += 0.5) {
        const line = ownLine(route, d, width);
        assert.ok(-(line.z + 100) >= -1e-6, `left: ${d - 100} m past the corner its line is ${(line.z + 100).toFixed(2)} m into the oncoming half`);
      }
    }
  }
});

test("a right-angle street corner is planned above the old floor, and progress runs round the arc", () => {
  const route = cornerRoute(1);
  const at = (along: number, speed: number) => {
    const on = sampleDrivingPath(route, along);
    const vehicle = { ...createSim("fwd").state.vehicle, x: on.x, y: 0, z: on.z, heading: Math.atan2(-on.ux, -on.uz), speed, forwardSpeed: speed, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: Math.max(0, along - 10), progressMark: Math.max(0, along - 10) };
    rivalInput(route, { vehicle, driver, race: null }, []);
    return driver;
  };
  // Mid-corner at 10 m/s: the centreline's corner held it to 7 m/s here.
  assert.ok(at(100, 10).targetSpeed > 10, `mid-corner it planned ${at(100, 10).targetSpeed.toFixed(1)} m/s`);
  // Driven round the arc, its progress follows the arc: it used to jump from one leg of the corner to the other.
  let previous = -Infinity;
  for (let d = 80; d <= 120; d++) {
    const along = at(d, 10).along;
    assert.ok(Math.abs(along - d) < 1.5, `${d} m round the corner its progress read ${along.toFixed(1)} m`);
    assert.ok(along > previous, `its progress went backwards at ${d} m`);
    previous = along;
  }
});

// Round a corner (2026-09-13). A car's offset is measured across the route at the
// aim point, where every other offset in the traffic loop is. It used to be across
// the nearest segment, which at a corner is still the street being left: on a
// generated race (seed 17) a truck stopped just round a right turn, dead in the
// rival's path, read as 5 m to one side, and the rival drove into it. Since corners
// are rounded, the same mistake brakes for a truck beside the arc it will drive.
test("a car stopped just round a corner is judged against the path the rival will drive", () => {
  const route = cornerRoute(1);
  const at = (truck: { x: number; z: number }[]) => {
    // 5 m short of the corner and turning into it, right onto a street heading +X.
    const on = sampleDrivingPath(route, 95);
    const vehicle = { ...createSim("fwd").state.vehicle, x: 2, y: 0, z: -95, heading: Math.atan2(-on.ux, -on.uz), speed: 12, forwardSpeed: 12, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 95, progressMark: 95, avoidance: ownSide(16) };
    rivalInput(route, { vehicle, driver, race: null }, truck.map(t => ({ y: 0, speed: 0, heading: -Math.PI / 2, length: 7.2, ...t })));
    return driver.targetSpeed;
  };
  const clear = at([]);
  assert.ok(clear > 10, `with the street clear it slowed to ${clear.toFixed(1)} m/s; the test proves nothing`);
  // Stopped on the arc, 8 m round the corner.
  const blocked = at([{ x: 8, z: -97 }]);
  assert.ok(blocked < 2, `it kept a target of ${blocked.toFixed(1)} m/s into a truck stopped in its path`);
  // Stopped on the new street's centreline, 4 m outside the arc the rival drives.
  const beside = at([{ x: 9, z: -100 }]);
  assert.ok(beside > 10, `it slowed to ${beside.toFixed(1)} m/s for a truck beside its path`);
});

// Pulling out into an oncoming car (2026-09-13). On Uptown, queued behind traffic
// crawling to a hairpin, the rival pulled out to pass into the path of a car 41 m
// away closing at 35 m/s: the side was clear where that car was, not where it
// would be once the rival was alongside the queue.
test("it does not pull out to pass into the path of an oncoming car", () => {
  const slow = { x: 0, z: -140, speed: 5, heading: 0 };
  const beside = { x: 5.5, z: -100, speed: 30, heading: 0 };
  const passing = decide([slow, beside]);
  assert.ok(passing.driver.avoidance < -0.01, "with the left clear it did not move out to pass; the test proves nothing");
  const oncoming = { x: -3.2, z: -170, speed: 15, heading: Math.PI };
  const held = decide([slow, beside, oncoming]);
  assert.ok(held.driver.avoidance > -0.01, `it pulled out ${held.driver.avoidance.toFixed(2)} m into an oncoming car's path`);
  assert.ok(held.driver.targetSpeed < 29, `with nowhere to pass it kept a target of ${held.driver.targetSpeed.toFixed(1)} m/s`);
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
  // A street's centreline counts the same way (2026-09-13): 5 m from it used to be lost,
  // and on the larger street arcs that braked the rival to 22 mph mid-bend at 95 mph.
  const street: RivalDefinition = { ...route, id: "street-check", lateral: undefined };
  const onStreet = (x: number) => {
    const vehicle = { ...createSim("awd").state.vehicle, x, y: 0, z: -1000, heading: 0, speed: 42, forwardSpeed: 42, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 1000, progressMark: 1000 };
    rivalInput(street, { vehicle, driver, race }, []);
    return driver.targetSpeed;
  };
  assert.ok(onStreet(line + 5.5) > 30, `5.5 m off a street centreline, on the road, it was held to ${onStreet(line + 5.5)} m/s`);
  assert.ok(onStreet(line + width / 2 + OFF_ROAD_MARGIN + 0.5) <= 10, "off a street it kept its speed");
  // A shoulder is road (2026-09-23, Port Alder's 5.6 m of asphalt past each carriageway): on it a rival is not lost,
  // and past it, it is.
  const shouldered: RivalDefinition = { ...street, id: "shoulder-check", shoulder: 5.6 };
  const onShoulder = (x: number) => {
    const vehicle = { ...createSim("awd").state.vehicle, x, y: 0, z: -1000, heading: 0, speed: 42, forwardSpeed: 42, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 1000, progressMark: 1000 };
    rivalInput(shouldered, { vehicle, driver, race }, []);
    return driver.targetSpeed;
  };
  const shoulder = line + width / 2 + OFF_ROAD_MARGIN + 0.5;
  assert.ok(onShoulder(shoulder) > 30, `on the shoulder it was held to ${onShoulder(shoulder).toFixed(1)} m/s, as lost`);
  assert.ok(onShoulder(shoulder + 5.6) <= 10, "past the shoulder it kept its speed");
});

/** A street route through `raw`, resampled as given, 16 m wide unless told. */
const streetRoute = (id: string, raw: [number, number][], width = 16): RivalDefinition => {
  const points: CoursePoint[] = raw.map(([x, z]) => ({ x, z, y: 0, width, zone: "boulevard" }));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  return { id, start: { x: 1, y: 0, z: 0, heading: 0, pitch: 0 }, points, along, gates: [along.at(-1)!] };
};

// Straight runs, not segments (2026-09-13). A route is resampled about every 29 m,
// and an arc limited to 45% of the segment beside its corner held every right angle
// on Uptown Circuit to a 12.6 m arc. A leg is now the straight run to the next corner.
test("a corner on a resampled route gets the arc its straight runs allow", () => {
  const raw: [number, number][] = [];
  for (let z = 0; z > -100; z -= 29) raw.push([0, z]);
  raw.push([0, -100]);
  for (let x = 29; x < 100; x += 29) raw.push([x, -100]);
  raw.push([100, -100]);
  const apex = (route: RivalDefinition) => { const at = sampleDrivingPath(route, 100); return Math.hypot(at.x, at.z + 100); };
  const long = cornerRoute(1), resampled = streetRoute("resampled", raw);
  assert.ok(apex(long) > 6, `the corner on long segments is only ${apex(long).toFixed(2)} m from its apex; the test proves nothing`);
  assert.ok(Math.abs(apex(resampled) - apex(long)) < 0.01, `resampled every 29 m its arc is ${apex(resampled).toFixed(2)} m from the corner, not ${apex(long).toFixed(2)}`);
});

// Steering feedforward on streets (2026-09-13). Error-only steering held a fast arc
// only by being off it: on a 35 degree bend at up to 52 m/s, 2.9 m off its line.
test("on a fast street bend it holds its arc", () => {
  const raw: [number, number][] = [];
  for (let z = 0; z >= -600; z -= 29) raw.push([0, z]);
  raw.push([0, -600]);
  const bend = 35 * Math.PI / 180;
  for (let k = 29; k <= 600; k += 29) raw.push([Math.sin(bend) * k, -600 - Math.cos(bend) * k]);
  const route = streetRoute("bend", raw), end = raw.at(-1)!;
  const sim = createSim("fwd", { id: "bend", start: { ...route.start, x: -40, z: 300 }, walls: [], project: (x, z) => projectOntoPath(route.points, x, z) }, {
    traffic: false, rival: route, race: { id: "bend", name: "Bend", countdownTicks: 0, checkpoints: [{ id: "f", name: "F", x: end[0], z: end[1], y: 0, radius: 10 }] } });
  try {
    let worst = 0, fastest = 0;
    for (let t = 0; t < 60 * 40 && !sim.state.rival!.race.finished; t++) {
      step(sim, PARKED);
      const rival = sim.state.rival!, d = rival.driver.along;
      if (d < 480 || d > 720) continue;
      const on = sampleDrivingPath(route, d), side = ownSide(16);
      worst = Math.max(worst, Math.hypot(rival.vehicle.x - (on.x - on.uz * side), rival.vehicle.z - (on.z + on.ux * side)));
      fastest = Math.max(fastest, rival.vehicle.speed);
    }
    assert.ok(fastest > 40, `it took the bend at only ${fastest.toFixed(1)} m/s; the test proves nothing`);
    assert.ok(worst < 2, `through the bend it ran ${worst.toFixed(2)} m off its line`);
  } finally { sim.world.free(); }
});

// The wheel a fast bend takes (2026-09-20). A rival rear-ended an oncoming van at 120 mph in gen-78: a 21 degree bend,
// drawn as a 414 m arc, 56% of the grip at 130 mph and so planned flat, ran it 5 m wide into the other lane. The
// feedforward steered for the turn's geometry, 0.41 degrees, where the tyres need 1.5 for it at that speed: the fronts
// are softer than the rears, and lighter under power. At 30 mph the difference is 3% of the lock and at 130 a third.
/** Two 21.3 degree bends the same way, 173 m apart, after a run long enough to be flat out, on a 20 m street. */
const fastBends = () => {
  const raw: [number, number][] = [], runUp = 1500, between = 173, bend = 21.3 * Math.PI / 180;
  for (let z = 0; z > -runUp; z -= 29) raw.push([0, z]);
  raw.push([0, -runUp]);
  for (let k = 29; k < between; k += 29) raw.push([Math.sin(bend) * k, -runUp - Math.cos(bend) * k]);
  raw.push([Math.sin(bend) * between, -runUp - Math.cos(bend) * between]);
  for (let k = 29; k <= 400; k += 29) raw.push([Math.sin(bend) * between + Math.sin(2 * bend) * k, -runUp - Math.cos(bend) * between - Math.cos(2 * bend) * k]);
  return { route: streetRoute("fast-bends", raw, 20), runUp, between, end: raw.at(-1)! };
};

test("the steady-turn wheel angle is the car's own: what it says a turn takes is what the car takes to make it", () => {
  const road: CoursePoint[] = [{ x: 0, z: 6000, y: 0, width: 9000, zone: "boulevard" }, { x: 0, z: -6000, y: 0, width: 9000, zone: "boulevard" }];
  // Flat out, where it is furthest out: measured 0 to 3% on rear drive (the Cinder), 1 to 9% high on all four (Moth's
  // Kestrel) and 5 to 17% high on front drive (the shared fixture), and closer on part throttle. What is left goes with
  // the throttle on a driven front axle and is not in the model; an account of it that fitted one drivetrain moved the
  // other two twice as far. High means turning in early, which the heading error takes back out.
  for (const [car, within] of [["fwd", 0.2], [carHandling("kestrel"), 0.12], [carHandling("cinder", "rwd"), 0.06]] as const) for (const steer of [0.3, 0.6, 0.9]) {
    const sim = createSim(car, { id: "pad", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, walls: [], project: (x, z) => projectOntoPath(road, x, z) }, { traffic: false });
    try {
      for (let t = 0; t < 60 * 40; t++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      for (let t = 0; t < 60 * 6; t++) step(sim, { throttle: 1, brake: 0, steer, handbrake: 0 });
      const state = sim.state.vehicle, name = `${sim.state.handling.drivetrain} at ${state.speed.toFixed(1)} m/s`;
      const said = Math.abs(steadyWheelAngleFor(state.speed, state.yawRate / state.speed, state.frontLoadFraction, sim.state.handling, Math.max(0, state.longitudinalAcceleration)));
      const wheel = Math.abs(state.steeringAngle), geometry = Math.atan((HANDLING.frontAxleDistance + HANDLING.rearAxleDistance) * Math.abs(state.yawRate) / state.speed);
      assert.ok(state.speed > 50, `${name}; the test proves nothing`);
      assert.ok(Math.abs(said / wheel - 1) < within, `${name} the car holds this turn on ${(wheel * 57.3).toFixed(2)} degrees of wheel; the model says ${(said * 57.3).toFixed(2)}`);
      // The geometry alone, which is what the rival steered for, is a third of it.
      assert.ok(geometry < wheel * 0.45, `${name} the turn's geometry is ${(geometry * 57.3).toFixed(2)} of the ${(wheel * 57.3).toFixed(2)} degrees`);
    } finally { sim.world.free(); }
  }
});

test("flat out through a gentle bend it holds its lane", () => {
  const { route, runUp, between, end } = fastBends();
  const drive = (steering: Partial<typeof RIVAL_STEERING>) => {
    const shipped = { ...RIVAL_STEERING };
    Object.assign(RIVAL_STEERING, steering);
    const sim = createSim("fwd", { id: "fast-bends", start: { ...route.start, x: -60, z: 300 }, walls: [], project: (x, z) => projectOntoPath(route.points, x, z) }, {
      traffic: false, rival: route, race: { id: "fast-bends", name: "Fast bends", countdownTicks: 0, checkpoints: [{ id: "f", name: "F", x: end[0], z: end[1], y: 0, radius: 12 }] } });
    try {
      let widest = 0, fastest = 0;
      for (let t = 0; t < 60 * 60 && !sim.state.rival!.race.finished; t++) {
        step(sim, PARKED);
        const rival = sim.state.rival!, d = rival.driver.along;
        if (d < runUp - 100 || d > runUp + between + 100) continue;
        const on = sampleDrivingPath(route, d), side = ownSide(20);
        widest = Math.max(widest, Math.hypot(rival.vehicle.x - (on.x - on.uz * side), rival.vehicle.z - (on.z + on.ux * side)));
        fastest = Math.max(fastest, rival.vehicle.speed);
      }
      return { widest, fastest, finished: sim.state.rival!.race.finished };
    } finally { sim.world.free(); Object.assign(RIVAL_STEERING, shipped); }
  };
  const before = drive({ slip: 0 }), now = drive({});
  assert.ok(before.fastest > 60, `it reached the bends at only ${before.fastest.toFixed(1)} m/s; the test proves nothing`);
  assert.ok(before.widest > 5, `steering for the geometry alone it ran only ${before.widest.toFixed(2)} m wide; the test proves nothing`);
  // A 20 m street's lane rests 1.3 m from its centre, and the oncoming lane's near edge is 1.7 m the other side.
  assert.ok(now.finished && now.widest < 2, `through the bends it ran ${now.widest.toFixed(2)} m off its lane`);
});

// The brake that started that crash. The van kept to the oncoming lane, 2.7 m the other side of the centreline, and the
// rival meant to pass it 4 m away. Read from the aim point, whose frame is turned from the road under a car 100 m on by
// the bend between them, a car following its lane is a car crossing into this one's path.
test("an oncoming car keeping to its lane round a bend is not braked for, and one in this car's lane is", () => {
  const { route, runUp } = fastBends(), side = ownSide(20);
  const ask = (across: number, frame: boolean) => {
    const shipped = RIVAL_TRAFFIC_FRAME.on;
    (RIVAL_TRAFFIC_FRAME as { on: boolean }).on = frame;
    try {
      const driver = createRivalDriver();
      driver.along = driver.progressMark = runUp - 20; driver.avoidance = side;
      const here = sampleDrivingPath(route, driver.along), there = sampleDrivingPath(route, driver.along + 100);
      const car = { ...createSim("fwd").state.vehicle, y: 0, lateralSpeed: 0, x: here.x - here.uz * side, z: here.z + here.ux * side, heading: Math.atan2(-here.ux, -here.uz), speed: 55, forwardSpeed: 55 };
      // Oncoming: facing back down the road where it is, `across` metres right of the centreline there.
      const van = { x: there.x - there.uz * across, z: there.z + there.ux * across, y: 0, heading: Math.atan2(there.ux, there.uz), speed: 16, length: 5.2 };
      const input = rivalInput(route, { vehicle: car, driver, race: null }, [van]);
      return { brake: input.brake, target: driver.targetSpeed };
    } finally { (RIVAL_TRAFFIC_FRAME as { on: boolean }).on = shipped; }
  };
  const clear = ask(-2.7, true), was = ask(-2.7, false), headOn = ask(side, true), alone = ask(-400, true);
  assert.ok(was.target < 60, `read from the aim point the van did not slow it (${was.target.toFixed(1)} m/s); the test proves nothing`);
  // Exactly what the bend alone allows, with nobody on the road.
  assert.ok(clear.target === alone.target && clear.brake === 0, `it slowed to ${clear.target.toFixed(1)} m/s for a van in the other lane, from ${alone.target.toFixed(1)}`);
  // 100 m off is as far as anything slows it: what matters is that the one in its way still does.
  assert.ok(headOn.target < 60, `a van coming up its own lane left it at ${headOn.target.toFixed(1)} m/s`);
});

// A committed pass owns the forecast, so while one is on the car looks only 26 m ahead at 105 mph: the path is clear.
// It is clear of a car that is ON it (gen-46: drifting the other way as the pull-out began, 2.2 m short of its path
// where it should have been clear of a sedan that had all but stopped, and into it at 91 mph).
test("off the path of its pass, it looks as far ahead as it would with no pass", () => {
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width: 16, zone: "boulevard" }));
  const route: RivalDefinition = { id: "pass-check", start: { x: 0, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 8000], gates: [8000], trafficPassing: true };
  const ask = (carX: number) => {
    const vehicle = { ...createSim("fwd").state.vehicle, x: carX, y: 0, z: -100, heading: 0, speed: 45, forwardSpeed: 45, lateralSpeed: 0 };
    // Twenty metres into a 60 m pull-out to 4 m right of the centreline, round a sedan stopped 70 m on.
    const pass = { target: 7, from: 80, out: 140, back: 260, to: 320, initial: 1.1, offset: 4, nextRead: Infinity, speed: 45, started: 0 };
    const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: 1.1, trafficPass: pass };
    const sedan = { id: 7, kind: "sedan" as const, x: 1.1, y: 0, z: -170, heading: 0, speed: 0, length: 4.6 };
    rivalInput(route, { vehicle, driver, race: null }, [sedan], null, { tick: 1, network: null as never, vehicles: [] });
    return { target: driver.targetSpeed, planned: passingOffset(route, pass, 100) };
  };
  const on = ask(ask(0).planned), short = ask(ask(0).planned - 1.5);
  assert.ok(on.planned > 1.1 && on.planned < 2.5, `the pass puts it ${on.planned.toFixed(2)} m across here`);
  assert.equal(on.target, 45, "on its path it braked for the car its pass clears");
  assert.ok(short.target < 40, `1.5 m short of its path, 70 m from a stopped car at 45 m/s, it kept ${short.target.toFixed(1)} m/s`);
});

// A car going its way is dodged only when it is in the way (driver-v6, 2026-09-25). Dodged whenever it was within 5 m,
// the side of it nearest the rival's line moved the rival TOWARDS an SUV standing at a bar in the outer lane, 4.5 m clear
// of it, to pass at 3.2; it ran past that at 105 mph and hit the SUV at 110 (gen-19, seed 1000).
test("a stopped car beside its line does not draw it across, and one in its way is still dodged", () => {
  const width = 16, line = ownSide(width);
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "dodge", start: { x: line, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 8000], gates: [8000] };
  // Resting on its own side at 45 m/s, an SUV `beside` metres to its right 60 m on, standing or going its way at
  // `speed` turned `heading` from the road; the rival's aim after a second.
  const aim = (beside: number, speed = 0, heading = 0) => {
    const vehicle = { ...createSim("fwd").state.vehicle, x: line, y: 0, z: -100, heading: 0, speed: 45, forwardSpeed: 45, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: line };
    const suv = { id: 142, kind: "suv" as const, x: line + beside, y: 0, z: -160, heading, speed, length: 4.7 };
    for (let tick = 0; tick < 60; tick++) rivalInput(route, { vehicle, driver, race: null }, [suv], null);
    return driver.avoidance - line;
  };
  assert.ok(Math.abs(aim(4.5)) < .05, `an SUV 4.5 m to its right drew it ${aim(4.5).toFixed(2)} m towards it`);
  assert.ok(aim(2) < -1, `an SUV 2 m to its right moved it only ${(-aim(2)).toFixed(2)} m away`);
  // Read where it will be (driver-v7): 4.5 m off now at 10 m/s, 7 degrees in towards the line, 1.2 m/s across; about 1.6 s
  // out, it will be 2.6 m off, in the way (Uptown at seed 1000, a box truck finishing its turn, at 117 mph).
  assert.ok(aim(4.5, 10, .12) < -.3, `an SUV coming across towards its line moved it only ${(-aim(4.5, 10, .12)).toFixed(2)} m away`);
});

// Round a left turn in its lane it stays on its own side (driver-v9, 2026-09-25). Steering for an aim 12 m on round the
// arc, on top of the feedforward, turned it in early and cut it 2.7 m inside, across the middle into the street's oncoming
// lane, where a car stood at its bar (gen-13, seed 314159).
test("round a left turn in its lane it keeps to its own side of the middle", () => {
  const width = 16, line = ownSide(width);
  // North, then a left turn west: facing -Z, +X is its right.
  const points: CoursePoint[] = [[0, 0], [0, -200], [-200, -200]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "left-turn", start: { x: line, y: 0, z: -40, heading: 0, pitch: 0 }, points, along: [0, 200, 400], gates: [400], car: "cinder" };
  const drive = (chord: number) => {
    const shipped = RIVAL_STEERING.chord;
    (RIVAL_STEERING as { chord: number }).chord = chord;
    const sim = createSim(carHandling("cinder", "rwd"), { id: "left-turn", start: route.start, walls: [], project: (x, z) => projectOntoPath(points, x, z) }, { traffic: false });
    try {
      const driver = createRivalDriver(); driver.avoidance = line; driver.along = driver.progressMark = 40;
      let inside = 0;
      for (let t = 0; t < 60 * 12 && driver.along < 330; t++) {
        const car = sim.state.vehicle;
        step(sim, rivalInput(route, { vehicle: car, driver, race: null }, [], null));
        const p = sampleDrivingPath(route, driver.along), across = (car.x - p.x) * -p.uz + (car.z - p.z) * p.ux;
        if (driver.along > 150 && driver.along < 260) inside = Math.min(inside, across);
      }
      return inside;
    } finally { sim.world.free(); (RIVAL_STEERING as { chord: number }).chord = shipped; }
  };
  const cut = drive(0), kept = drive(1);
  assert.ok(cut < -0.5, `steering for the chord it crossed only to ${cut.toFixed(2)} m; the test proves nothing`);
  assert.ok(kept > -0.25, `it went ${(-kept).toFixed(2)} m over the middle round a left turn`);
});

// Why it wants the speed it does (2026-09-25): `rivalInput` names the rule that brought its target lowest, for the
// slowdown census (`pnpm rival:census`) and rival-scene, in an object outside the sim's state.
test("it names the rule that holds it below its plan, and the car that did", () => {
  const width = 16, line = ownSide(width);
  const points: CoursePoint[] = [[0, 0], [0, -8000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width, zone: "boulevard" }));
  const route: RivalDefinition = { id: "why", start: { x: line, y: 0, z: 0, heading: 0, pitch: 0 }, points, along: [0, 8000], gates: [8000] };
  const ask = (hazards: { id: number; kind: "sedan"; x: number; y: number; z: number; heading: number; speed: number; length: number }[]) => {
    const vehicle = { ...createSim("fwd").state.vehicle, x: line, y: 0, z: -100, heading: 0, speed: 45, forwardSpeed: 45, lateralSpeed: 0 };
    const driver = { ...createRivalDriver(), along: 100, progressMark: 100, avoidance: line };
    const why: RivalSpeedWhy = { plan: 0, target: 0, by: "none" };
    rivalInput(route, { vehicle, driver, race: null }, hazards, null, undefined, why);
    return { ...why, wanted: driver.targetSpeed };
  };
  const clear = ask([]);
  assert.ok(clear.by === "top" || clear.by === "corner", `with nothing about it was held by ${clear.by}`);
  assert.equal(clear.target, clear.wanted);
  // A sedan crossing its road 30 m on at 8 m/s, timed to be in its path when it gets there.
  const held = ask([{ id: 5, kind: "sedan", x: line + 4.6, y: 0, z: -130, heading: Math.PI / 2, speed: 8, length: 4.4 }]);
  assert.equal(held.by, "crossing");
  assert.equal(held.id, 5);
  assert.ok(held.target < held.plan - 10 && held.target === held.wanted, `target ${held.target.toFixed(1)} against a plan of ${held.plan.toFixed(1)}`);
});

// Where it will be, not where it means to be (2026-09-22). Shawn's second legit race against Wake: he passed her into
// the bend at 2400 m, she moved back right behind him, and 24 m ahead of her was a sedan doing 31 mph. She chose to go
// round it on the left, which moves `intent` 3 m across at 4 m/s; the car under it moved 0.4 m in the 0.75 s that
// took, the sedan read as out of her path the whole way, she never lifted, and the hit spun her for five seconds.
test("closing on a slower car it has not yet moved out from behind, it slows for where it is, not where it means to be", () => {
  const points: CoursePoint[] = [[0, 0], [0, -4000]].map(([x, z]) => ({ x: x!, z: z!, y: 0, width: 20, zone: "boulevard" }));
  const route: RivalDefinition = { id: "rear-end", start: { x: 2, y: 0, z: -200, heading: 0, pitch: 0 }, points, along: [0, 4000], gates: [4000], car: "reign" };
  // The rival driven as the player by its own controller, in the Reign, 2 m right of centre at 85 mph; the sedan is a
  // hazard moving down the same lane at 31 mph, `gap` metres ahead.
  const drive = (gap: number, follows: boolean) => {
    const shipped = RIVAL_RACING.followWhereItIs;
    (RIVAL_RACING as { followWhereItIs: boolean }).followWhereItIs = follows;
    const sim = createSim(carHandling("reign"), { id: "rear-end", start: route.start, walls: [], project: (x, z) => projectOntoPath(points, x, z) }, { traffic: false });
    try {
      sim.body.setLinvel({ x: 0, y: 0, z: -38 }, true);
      const driver = createRivalDriver();
      driver.avoidance = 2; driver.along = driver.progressMark = 200;
      const sedan = { id: 163, kind: "sedan" as const, x: 2, y: 0, z: -200 - gap, heading: 0, speed: 14, length: 4.6 };
      let closest = Infinity, slowest = Infinity;
      for (let t = 0; t < 60 * 8; t++) {
        sedan.z -= 14 / 60;
        const car = sim.state.vehicle;
        step(sim, rivalInput(route, { vehicle: car, driver, race: null }, [sedan], null));
        const ahead = car.z - sedan.z, side = sedan.x - car.x;
        closest = Math.min(closest, Math.max(Math.abs(ahead) - 4.5, Math.abs(side) - 1.9));
        slowest = Math.min(slowest, car.speed);
      }
      return { closest, slowest };
    } finally { sim.world.free(); (RIVAL_RACING as { followWhereItIs: boolean }).followWhereItIs = shipped; }
  };
  const was = drive(24, false), now = drive(24, true), room = drive(90, true);
  assert.ok(was.closest < 0, `read against where it meant to be, it cleared the sedan by ${was.closest.toFixed(1)} m; the test proves nothing`);
  assert.ok(now.closest > 0, `it hit the sedan: ${(-now.closest).toFixed(1)} m of overlap, box to box`);
  // It slows while it moves out and never stops behind it; with 90 m in hand it does not slow at all.
  assert.ok(now.slowest > 12 && now.slowest < 30, `it slowed to ${(now.slowest * 2.237).toFixed(0)} mph behind a car doing 31`);
  assert.ok(room.slowest > 37 && room.closest > 1.5, `with 90 m in hand it slowed to ${(room.slowest * 2.237).toFixed(0)} mph and passed ${room.closest.toFixed(1)} m from the sedan`);
});
