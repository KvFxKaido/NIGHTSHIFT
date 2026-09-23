import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createRace, stepRace } from "../src/sim/race.ts";
import { createSim, step, resetSim, type VehicleState } from "../src/sim/sim.ts";
import * as THREE from "three";
import { ALDER_GARAGE_EXIT, createAlderWorld, alderHeight } from "../src/sim/alder.ts";
import { SABLE_DRIFT } from "../src/sim/drift-event.ts";
import { DRIFT_YARD, DRIFT_ZONES, GATE_STRUCTURES, SABLE, YARD_GATE, YARD_LINE, YARD_STRUCTURES } from "../src/sim/drift-yard.ts";
import { addDriftYard } from "../src/render/drift-yard.ts";
import { nearbyChallenge } from "../src/sim/encounter.ts";

await RAPIER.init();
const live = () => ({ ...createRace(SABLE_DRIFT), countdown: 0 });
const car = (extra: Partial<VehicleState> = {}) => ({ x: -570, z: 930, speed: 18, forwardSpeed: 16,
  slipAngle: 25 * Math.PI / 180, ...extra }) as VehicleState;

test("drift countdown and timer are fixed ticks; stopping, reversing and spinning cannot score", () => {
  const race = createRace(SABLE_DRIFT);
  for (let tick = 0; tick < 180; tick++) stepRace(SABLE_DRIFT, race, car());
  assert.equal(race.drift!.chain, 0); assert.equal(race.ticks, 0);
  for (const state of [car({ speed: 0 }), car({ forwardSpeed: -12 }), car({ slipAngle: Math.PI / 2 }), car({ slipAngle: 0 })]) {
    const r = live();
    for (let i = 0; i < 120; i++) stepRace(SABLE_DRIFT, r, state);
    assert.equal(r.drift!.chain + r.drift!.score, 0);
  }
  for (let i = 0; i < 5400; i++) stepRace(SABLE_DRIFT, race, car({ speed: 0 }));
  assert.equal(race.finished, true); assert.equal(race.ticks, 5400); assert.equal(race.drift!.won, false);
  stepRace(SABLE_DRIFT, race, car()); assert.equal(race.ticks, 5400);
});

test("angle and speed grow chains; transitions link, straightening banks, and contact only loses unbanked points", () => {
  const race = live();
  for (let i = 0; i < 130; i++) stepRace(SABLE_DRIFT, race, car());
  assert.equal(race.drift!.multiplier, 2);
  stepRace(SABLE_DRIFT, race, car({ slipAngle: -.4 }));
  assert.equal(race.drift!.transitions, 1);
  const expected = Math.floor(race.drift!.chain * race.drift!.multiplier);
  for (let i = 0; i < 60; i++) stepRace(SABLE_DRIFT, race, car({ slipAngle: 0 }));
  assert.equal(race.drift!.score, expected);
  for (let i = 0; i < 30; i++) stepRace(SABLE_DRIFT, race, car());
  stepRace(SABLE_DRIFT, race, car(), true);
  assert.equal(race.drift!.chain, 0); assert.equal(race.drift!.score, expected);
  for (let i = 0; i < 30; i++) stepRace(SABLE_DRIFT, race, car());
  stepRace(SABLE_DRIFT, race, car({ x: -700 }));
  assert.equal(race.drift!.chain, 0); assert.equal(race.drift!.feedback, "RETURN TO THE YARD");
});

test("clipping bonuses require a drift and progress around the yard before repeating", () => {
  const race = live(), first = DRIFT_ZONES[0];
  stepRace(SABLE_DRIFT, race, car({ ...first, slipAngle: 0 }));
  assert.equal(race.drift!.clips, 0);
  for (let i = 0; i < 60; i++) stepRace(SABLE_DRIFT, race, car(first));
  assert.equal(race.drift!.clips, 1);
  for (const zone of DRIFT_ZONES.slice(1)) stepRace(SABLE_DRIFT, race, car(zone));
  assert.equal(race.drift!.clips, 5);
  stepRace(SABLE_DRIFT, race, car(first)); assert.equal(race.drift!.clips, 6);
  race.ticks = 5399; race.drift!.score = 3000;
  stepRace(SABLE_DRIFT, race, car());
  assert.equal(race.drift!.won, true); assert.equal(race.drift!.chain, 0);
});

test("the driveway is continuous and clear, and all yard structures share simulation solids", () => {
  const world = createAlderWorld(true, DRIFT_YARD.start);
  for (const structure of YARD_STRUCTURES) assert.ok(world.solids!.includes(structure));
  for (let z = 740; z <= 865; z += 2) {
    assert.equal(alderHeight(-560, z), DRIFT_YARD.base);
    assert.ok(world.solids!.every(b => Math.abs(b.x + 560) > b.width / 2 + 3 || Math.abs(b.z - z) > b.depth / 2 + 3));
  }
});

// design/CHAOS.md, "The shape of the venue": the east gate is the venue's front
// door on Harbor Way, and the garage exit faces it down z = 910. It has to be a
// gate you can drive through, clear of the road, and lit enough to be seen from
// the start — the thing it exists for is being the first thing the game offers.
test("the east gate stands off Harbor Way, opens on the garage exit, and is a way through", () => {
  const world = createAlderWorld();
  for (const structure of GATE_STRUCTURES) assert.ok(world.solids!.includes(structure),
    `${structure.id} is drawn but not solid`);

  // Clear of the carriageway, every part of it.
  for (const s of GATE_STRUCTURES) {
    const road = world.project(s.x, s.z);
    const reach = Math.max(s.width, s.depth) / 2;
    assert.ok(road.distance - road.width / 2 - reach > 2,
      `${s.id} stands ${(road.distance - road.width / 2 - reach).toFixed(1)} m from a ${road.width} m carriageway`);
  }

  // The player leaves the garage pointed at it: same z, and to the west.
  assert.ok(Math.abs(YARD_GATE.z - ALDER_GARAGE_EXIT.z) < 2, "the gate is off the exit's heading");
  assert.ok(YARD_GATE.x < ALDER_GARAGE_EXIT.x - 20, "the gate is not ahead of the exit");

  // A car's width is 1.84 (the collider in sim.ts), so the opening must clear it
  // with room to steer. Nothing solid may stand in the gateway.
  assert.ok(YARD_GATE.opening > 6, `a ${YARD_GATE.opening} m opening is not a gate`);
  for (let z = YARD_GATE.z - YARD_GATE.opening / 2 + 1; z <= YARD_GATE.z + YARD_GATE.opening / 2 - 1; z += .5)
    for (let x = YARD_GATE.x - 3; x <= YARD_GATE.x + 3; x += .5)
      assert.ok(world.solids!.every(b => Math.abs(b.x - x) > b.width / 2 || Math.abs(b.z - z) > b.depth / 2),
        `the gateway is blocked at ${x.toFixed(1)}, ${z.toFixed(1)}`);
});

test("the gate is drawn, and its gatehouse is lit only after dark", () => {
  const named = (scene: THREE.Scene, prefix: string) => {
    const found: THREE.Object3D[] = [];
    scene.traverse(object => { if (object.name.startsWith(prefix)) found.push(object); });
    return found;
  };
  const night = new THREE.Scene(); addDriftYard(night, true);
  for (const s of GATE_STRUCTURES) assert.equal(named(night, `yard-${s.id}`).length, 1, `${s.id} is not drawn`);
  assert.equal(named(night, "gate-floodlight-head").length, 2, "the gate posts carry no floods");

  // "Lit means occupied": the booth window is how a player knows the meet is on.
  const lit = named(night, "gate-booth-window")[0] as THREE.Mesh;
  assert.ok(lit, "no gatehouse window");
  assert.ok(((lit.material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0) > 0, "the gatehouse is dark at night");

  const blockout = new THREE.Scene(); addDriftYard(blockout, false);
  const unlit = named(blockout, "gate-booth-window")[0] as THREE.Mesh;
  assert.equal((unlit.material as THREE.MeshStandardMaterial).emissiveIntensity, 0, "the blockout lit the gatehouse");
  for (const scene of [night, blockout])
    scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

test("real tyre forces support repeatable drift runs across all drivetrains with full steering", () => {
  const run = (layout: "fwd" | "rwd" | "awd") => {
    const sim = createSim(layout, createAlderWorld(true, DRIFT_YARD.start), { race: SABLE_DRIFT, traffic: false, parkedRivals: [SABLE] });
    let index = 1, driftingTicks = 0;
    try {
      for (let tick = 0; !sim.state.race!.finished && tick < 5581; tick++) {
        const c = sim.state.vehicle, target = YARD_LINE[index]!;
        if (Math.hypot(c.x - target.x, c.z - target.z) < 16) index = (index + 1) % YARD_LINE.length;
        const desired = Math.atan2(c.x - target.x, c.z - target.z) - c.heading;
        const error = Math.atan2(Math.sin(desired), Math.cos(desired));
        step(sim, { throttle: c.speed < 23 ? 1 : .3, brake: c.speed > 27 ? .3 : 0,
          steer: Math.max(-1, Math.min(1, -error * 2.8 + c.yawRate * .8)),
          handbrake: Math.abs(error) > .2 && c.speed > 12 && tick % 60 < 22 ? 1 : 0 });
        if (sim.state.race!.drift!.drifting) driftingTicks++;
        assert.ok(!sim.state.race!.drift!.feedback.startsWith("CONTACT"), `${layout} struck yard scenery at ${c.x},${c.z} tick ${tick}`);
      }
      const result = { ...sim.state.race!.drift };
      assert.equal(sim.state.race!.finished, true);
      assert.ok(driftingTicks > 500); assert.ok(result.score! > 1500); assert.ok(result.clips! >= 3);
      assert.equal(sim.state.vehicle.transmission, undefined);
      assert.equal(sim.state.race!.dragLane, undefined);
      resetSim(sim);
      assert.equal(sim.state.race!.drift!.score, 0);
      return result;
    } finally { sim.world.free(); }
  };
  assert.deepEqual(run("rwd"), run("rwd"));
  run("fwd"); run("awd");
});

test("a real wall contact breaks the drift chain and Sable owns the nearby challenge", () => {
  // A metre off the warehouse's east face, which is at x -487. This used to run
  // at the apron's west wall, which came out when the site was fenced and paved
  // (2026-09-21). The gap has to be about a metre: the car is sliding sideways,
  // so at more than 2 m it spins before it touches anything and the chain is
  // lost to the spin rather than to the contact this is about.
  const sim = createSim("rwd", createAlderWorld(true, { ...DRIFT_YARD.start, x: -485, z: 1055 }), { race: SABLE_DRIFT, traffic: false });
  try {
    sim.state.race!.countdown = 0;
    sim.state.race!.drift!.chain = 200; sim.state.race!.drift!.score = 100;
    sim.body.setLinvel({ x: -12, y: 0, z: 0 }, true);
    for (let i = 0; i < 10; i++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    assert.equal(sim.state.race!.drift!.chain, 0); assert.equal(sim.state.race!.drift!.score, 100);
    assert.match(sim.state.race!.drift!.feedback, /CONTACT/);
    const parked = [{ id: SABLE.id, vehicle: { ...sim.state.vehicle, ...SABLE.start } }];
    assert.equal(nearbyChallenge({ ...SABLE.start, speed: 0 }, null, parked, false), "sable");
    assert.equal(nearbyChallenge({ ...SABLE.start, speed: 0 }, null, parked, true), null);
  } finally { sim.world.free(); }
});
