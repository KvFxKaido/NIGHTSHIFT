import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { carHandling, createSim, step, TRAFFIC_KNOCK, UNSEEN_RECOVERY, type Sim } from "../src/sim/sim.ts";
import { restoreTraffic, TRAFFIC_KINDS, trafficCornering, type TrafficKind, type TrafficVehicleState } from "../src/sim/traffic.ts";

// Traffic a racer can knock (2026-09-23, traffic-v9, Shawn: the MC3 feel). Traffic was a wall of infinite mass that drove
// on; now a car near a racer is a physics body of its kind's mass for the tick, knocked off its lane it is a wreck, and a
// wreck at rest out of the player's sight goes back on its lane. The Cinder is driven into the back of a car on a long
// straight lane, coasting, 12 m/s faster than it.
await RAPIER.init();
const world = createAlderWorld(true), network = world.traffic!;
const COAST = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

function behind(kind: TrafficKind, closing = 12, gap = 14): { sim: Sim; target: TrafficVehicleState } {
  const sim = createSim(carHandling("cinder", "rwd"), world, { traffic: true });
  for (let tick = 0; tick < 120; tick++) step(sim, { throttle: 0, brake: 1, steer: 0, handbrake: 1 });
  const toEntry = (v: TrafficVehicleState) => network.lanes[v.lane]!.length - network.lanes[v.lane]!.entry - v.distance;
  const target = sim.state.traffic!.vehicles.find(v => v.kind === kind && v.speed > 12 && !trafficCornering(network, v) && toEntry(v) > 120 && v.distance > 40)!;
  const fx = -Math.sin(target.heading), fz = -Math.cos(target.heading), speed = target.speed + closing;
  sim.body.setTranslation({ x: target.x - fx * gap, y: sim.body.translation().y, z: target.z - fz * gap }, true);
  sim.body.setRotation({ x: 0, y: Math.sin(target.heading / 2), z: 0, w: Math.cos(target.heading / 2) }, true);
  sim.body.setLinvel({ x: fx * speed, y: 0, z: fz * speed }, true);
  sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  return { sim, target };
}

/** Coast into it: the car's speed the tick before contact and the tick after, and when it was knocked. */
function hit(kind: TrafficKind, mass: "kind" | "none" = "kind") {
  const spec = TRAFFIC_KINDS[kind] as { mass?: number }, had = spec.mass;
  if (mass === "none") spec.mass = undefined;
  try {
    const { sim, target } = behind(kind);
    try {
      let before = NaN, after = NaN, knocked = -1;
      for (let tick = 0; tick < 150 && Number.isNaN(after); tick++) {
        const was = sim.state.vehicle.speed;
        step(sim, COAST);
        if (sim.state.vehicle.speed < was - 1) { before = was; after = sim.state.vehicle.speed; }
      }
      for (let tick = 0; tick < 5 && knocked < 0; tick++) { if (target.wreck) knocked = tick; step(sim, COAST); }
      return { before, after, lost: before - after, knocked: knocked >= 0 || !!target.wreck };
    } finally { sim.world.free(); }
  } finally { spec.mass = had; }
}

test("a clipped sedan costs what the two masses say, less than the wall did, and leaves its lane", () => {
  const knock = hit("sedan"), wall = hit("sedan", "none");
  assert.ok(!Number.isNaN(knock.lost) && !Number.isNaN(wall.lost), "the car never met the sedan; the test proves nothing");
  // 1,180 kg at about 26.5 m/s into 900 kg at 17.9: momentum leaves both near 22.8, about 4 m/s off the car.
  assert.ok(knock.lost > 2.5 && knock.lost < 6, `the hit cost the car ${knock.lost.toFixed(1)} m/s`);
  assert.ok(wall.lost > knock.lost + 3, `the wall cost ${wall.lost.toFixed(1)} m/s against ${knock.lost.toFixed(1)}: mass made no difference`);
  assert.ok(knock.knocked, "the sedan stayed on its lane");
  assert.ok(!wall.knocked, "a car with no mass was knocked");
});

test("a box truck is still a wall", () => {
  assert.equal(TRAFFIC_KINDS["box-truck"].mass, undefined);
  const truck = hit("box-truck");
  assert.ok(!Number.isNaN(truck.lost), "the car never met the truck; the test proves nothing");
  assert.ok(!truck.knocked, "the box truck left its lane");
});

// A car becomes a body near a racer well before any contact. That must change nothing for anyone until something
// touches it: the tick before the sedan is reached, the car is where it is with the wall, to the bit.
test("a car that is a body near a racer changes nothing until it is touched", () => {
  const at = (mass: "kind" | "none") => {
    const spec = TRAFFIC_KINDS.sedan as { mass?: number }, had = spec.mass;
    if (mass === "none") spec.mass = undefined;
    try {
      const { sim } = behind("sedan");
      try {
        let last = { x: 0, z: 0, speed: 0, heading: 0 };
        for (let tick = 0; tick < 150; tick++) {
          const was = { x: sim.state.vehicle.x, z: sim.state.vehicle.z, speed: sim.state.vehicle.speed, heading: sim.state.vehicle.heading };
          step(sim, COAST);
          if (sim.state.vehicle.speed < was.speed - 1) return last;
          last = was;
        }
        throw new Error("no contact");
      } finally { sim.world.free(); }
    } finally { spec.mass = had; }
  };
  assert.deepEqual(at("kind"), at("none"));
});

test("no traffic drives through a wreck, and out of sight at rest it goes back on its lane as the car it was", () => {
  const { sim, target } = behind("sedan");
  try {
    let tick = 0;
    for (; tick < 200 && !target.wreck; tick++) step(sim, COAST);
    assert.ok(target.wreck, "the sedan was never knocked; the test proves nothing");
    const count = sim.state.traffic!.vehicles.length, kinds = sim.state.traffic!.vehicles.map(v => v.kind).join();
    const park = (ahead: number) => {
      const lane = network.pose(target.lane, target.distance), fx = -Math.sin(lane.heading), fz = -Math.cos(lane.heading);
      sim.body.setTranslation({ x: target.x + fx * ahead, y: sim.body.translation().y, z: target.z + fz * ahead }, true);
      sim.body.setRotation({ x: 0, y: Math.sin(lane.heading / 2), z: 0, w: Math.cos(lane.heading / 2) }, true);
      sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    };
    const HOLD = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };
    // Let it come to rest with the player in sight, parked 60 m on down the lane and out of the way.
    for (tick = 0; tick < 60 * 8 && target.speed > 0.1; tick++) step(sim, HOLD);
    park(60);
    // Traffic is one car per 900 m of lane, so nobody is behind it: one is put there, on its lane 60 m back, driving.
    const follower = sim.state.traffic!.vehicles.find(v => v !== target && !v.wreck && Math.hypot(v.x - target.x, v.z - target.z) > 400)!;
    const hit = network.pose(target.lane, target.distance), slid = (target.x - hit.x) * -Math.sin(hit.heading) + (target.z - hit.z) * -Math.cos(hit.heading);
    Object.assign(follower, { lane: target.lane, distance: Math.max(0, target.distance + slid - 60), holds: [], via: -1, movement: target.movement, speed: 15 });
    let closest = Infinity;
    for (tick = 0; tick < 60 * 10; tick++) {
      step(sim, HOLD);
      closest = Math.min(closest, Math.hypot(follower.x - target.x, follower.z - target.z));
    }
    assert.ok(target.wreck, "it went back in the player's sight");
    assert.ok(follower.lane === target.lane && follower.distance < target.distance + slid, "the car behind drove through the wreck and on");
    assert.ok(Math.hypot(follower.x - target.x, follower.z - target.z) < 25, "the car behind never came up to it; the test proves nothing");
    // Nothing drove into it while it was down: half the two cars' lengths and a little.
    assert.ok(closest > 3, `a car came within ${closest.toFixed(1)} m of the wreck`);
    // The player leaves, 300 m on down the lane: out of sight, the wreck goes back, and the car behind it drives on.
    park(300);
    let restored = -1;
    for (tick = 0; tick < 60 * 10 && restored < 0; tick++) {
      step(sim, HOLD);
      if (!target.wreck) restored = tick;
    }
    assert.ok(restored >= 0, "the wreck was never put back");
    assert.ok(Math.hypot(sim.state.vehicle.x - target.x, sim.state.vehicle.z - target.z) > UNSEEN_RECOVERY.sight, "it went back in the player's sight");
    assert.ok(TRAFFIC_KNOCK.rest > 0);
    // Back as it was: on its lane, no wreck field, the same count and kinds for the renderer.
    const pose = network.pose(target.lane, target.distance);
    assert.ok(Math.hypot(pose.x - target.x, pose.z - target.z) < 0.01 || trafficCornering(network, target), "it went back off its lane");
    assert.ok(!Object.hasOwn(target, "wreck"), "a put-back car still carries a wreck field");
    assert.equal(sim.state.traffic!.vehicles.length, count);
    assert.equal(sim.state.traffic!.vehicles.map(v => v.kind).join(), kinds);
    // And it drives again.
    for (let more = 0; more < 180; more++) step(sim, { throttle: 0, brake: 1, steer: 0, handbrake: 1 });
    assert.ok(target.speed > 1 || target.holds.length === 0, "it stood on its lane with nothing in front of it");
  } finally { sim.world.free(); }
});

// A wreck that waited for its own resting place waited, at traffic seed 314159 in gen-39, for the rival stopped beside
// it, which waited for the car queued behind the wreck, which waited for the wreck: 61 resets and no finish. Its place
// taken, it goes back further along its lane.
test("a wreck whose resting place is taken goes back further along its lane", () => {
  const { sim, target } = behind("sedan");
  try {
    for (let tick = 0; tick < 200 && !target.wreck; tick++) step(sim, COAST);
    for (let tick = 0; tick < 60 * 8 && target.speed > 0.1; tick++) step(sim, { throttle: 0, brake: 1, steer: 0, handbrake: 1 });
    assert.ok(target.wreck && target.speed <= 0.1, "the sedan never came to rest as a wreck; the test proves nothing");
    const lane = network.lanes[target.lane]!, hit = network.pose(target.lane, target.distance);
    const rest = target.distance + (target.x - hit.x) * -Math.sin(hit.heading) + (target.z - hit.z) * -Math.cos(hit.heading);
    const onIt = { x: target.x, z: target.z, heading: target.heading, speed: 0 };
    assert.ok(rest + 8 < lane.length - lane.entry - 2, "no room along the lane past it; the test proves nothing");
    assert.ok(restoreTraffic(network, sim.state.traffic!, target, [onIt]), "with a racer on its resting place it did not go back at all");
    assert.ok(target.distance > rest + 5, `it went back at ${target.distance.toFixed(1)} m, on the racer at ${rest.toFixed(1)}`);
  } finally { sim.world.free(); }
});
