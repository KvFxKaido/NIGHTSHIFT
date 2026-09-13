import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, HANDLING, PHYSICS_VERSION, type Drivetrain, type Input, type Sim } from "../src/sim/sim.ts";
import type { RoadWorld } from "../src/sim/road-world.ts";
import { alderGround, projectOntoAlder, ALDER_GARAGE, ALDER_PAVEMENT, ALDER_STREETS } from "../src/sim/alder.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import { DRIFT_YARD, YARD_LINE } from "../src/sim/drift-yard.ts";
import { ALDER_RIVAL } from "../src/sim/alder-rival.ts";
import { ALDER_CRUISE } from "../src/sim/encounter.ts";

await RAPIER.init();

// Leaving the paved road costs a 2WD car some grip and pace; AWD pays nothing
// (four-wheel-v6, 2026-09-13). An unlimited flat world isolates that from
// kerbs, grades and traffic: `ground` decides where the tyres are.
const flat = { along: 0, segmentIndex: 0, distance: 0, height: 0, pitch: 0, ux: 0, uz: -1, width: 10000 };
function world(ground?: (x: number, z: number) => boolean): RoadWorld {
  return { id: "ground-check", start: { x: 0, y: 0.5, z: 0, heading: 0, pitch: 0 }, walls: [],
    project: () => flat, ...(ground ? { ground } : {}) };
}
const FULL: Input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
const mixed = (tick: number): Input => ({ throttle: tick % 240 < 170 ? 1 : 0, brake: tick % 240 >= 200 ? 0.6 : 0,
  steer: Math.sin(tick / 45) * 0.8, handbrake: tick % 400 > 380 ? 1 : 0 });

function run(sim: Sim, ticks: number, input: (tick: number) => Input): Sim {
  try { for (let tick = 0; tick < ticks; tick++) step(sim, input(tick)); return sim; }
  finally { /* callers read state before freeing */ }
}
const motion = (sim: Sim) => {
  const { groundContact: _contact, ...vehicle } = sim.state.vehicle;
  return JSON.stringify({ vehicle, translation: sim.body.translation(), rotation: sim.body.rotation() });
};

test("the physics revision names the ground cost", () => {
  assert.equal(PHYSICS_VERSION, "four-wheel-v6");
});

test("2WD on ground is governed lower and accelerates slower; AWD is untouched", () => {
  for (const drivetrain of ["fwd", "rwd"] as Drivetrain[]) {
    const road = run(createSim(drivetrain, world(), { traffic: false }), 60 * 60, () => FULL);
    const grass = run(createSim(drivetrain, world(() => true), { traffic: false }), 60 * 60, () => FULL);
    try {
      assert.ok(Math.abs(road.state.vehicle.speed - HANDLING.topSpeed) < 0.2, `${drivetrain} reaches the governor on the road`);
      assert.ok(Math.abs(grass.state.vehicle.speed - HANDLING.topSpeed * HANDLING.groundTopSpeedScale) < 0.2,
        `${drivetrain} is governed at the ground scale: ${grass.state.vehicle.speed}`);
      assert.equal(grass.state.vehicle.groundContact, 1);
    } finally { road.world.free(); grass.world.free(); }
    // Slower off the line as well as at the top.
    const toSixty = (sim: Sim) => { let tick = 0; while (sim.state.vehicle.speed < 26.8 && tick < 1200) { step(sim, FULL); tick++; } sim.world.free(); return tick; };
    const roadTicks = toSixty(createSim(drivetrain, world(), { traffic: false }));
    const grassTicks = toSixty(createSim(drivetrain, world(() => true), { traffic: false }));
    assert.ok(grassTicks > roadTicks * 1.15, `${drivetrain} 0-60 on ground ${grassTicks} ticks vs road ${roadTicks}`);
  }
  // AWD: identical motion on ground and on road through mixed driving, handbrake included.
  const road = run(createSim("awd", world(), { traffic: false }), 1200, mixed);
  const grass = run(createSim("awd", world(() => true), { traffic: false }), 1200, mixed);
  try {
    assert.equal(motion(grass), motion(road), "AWD must drive identically on ground");
    assert.equal(grass.state.vehicle.groundContact, 1, "AWD still reads the ground it is on");
  } finally { road.world.free(); grass.world.free(); }
});

test("a tyre on ground loses grip; a world without ground drives exactly as before", () => {
  const road = run(createSim("rwd", world(), { traffic: false }), 90, () => ({ throttle: 0.4, brake: 0, steer: 0.6, handbrake: 0 }));
  const grass = run(createSim("rwd", world(() => true), { traffic: false }), 90, () => ({ throttle: 0.4, brake: 0, steer: 0.6, handbrake: 0 }));
  try {
    for (const id of ["front-left", "rear-right"] as const) {
      const ratio = grass.state.vehicle.wheels[id].gripLimit / road.state.vehicle.wheels[id].gripLimit;
      // Load shares differ a little once the two cars' paths diverge; the scale dominates.
      assert.ok(Math.abs(ratio - HANDLING.groundGripScale) < 0.05, `${id} grip ratio ${ratio}`);
    }
  } finally { road.world.free(); grass.world.free(); }
  const without = run(createSim("fwd", world(), { traffic: false }), 900, mixed);
  const paved = run(createSim("fwd", world(() => false), { traffic: false }), 900, mixed);
  try {
    assert.equal(motion(paved), motion(without), "reporting no ground is the same as having none");
    assert.equal(paved.state.vehicle.groundContact, 0);
  } finally { without.world.free(); paved.world.free(); }
});

test("ground is sampled per tyre: two wheels off the edge is half the cost", () => {
  // Heading 0 drives toward -Z, so the right-hand tyres sit at +X.
  const sim = run(createSim("rwd", world(x => x > 0), { traffic: false }), 30, () => ({ throttle: 0.3, brake: 0, steer: 0, handbrake: 0 }));
  try {
    assert.equal(sim.state.vehicle.groundContact, 0.5);
    const { wheels } = sim.state.vehicle;
    assert.ok(wheels["front-right"].gripLimit < wheels["front-left"].gripLimit * 0.95, "the tyre on ground has less grip");
  } finally { sim.world.free(); }
});

test("the ground cost replays tick for tick", () => {
  const a = run(createSim("rwd", world(x => Math.sin(x / 9) > 0), { traffic: false }), 900, mixed);
  const b = run(createSim("rwd", world(x => Math.sin(x / 9) > 0), { traffic: false }), 900, mixed);
  try {
    assert.equal(JSON.stringify(a.state.vehicle), JSON.stringify(b.state.vehicle));
    assert.ok(a.state.vehicle.groundContact >= 0);
  } finally { a.world.free(); b.world.free(); }
});

test("Port Alder's ground is past the pavement, and paved yards and routes are not ground", () => {
  let checked = 0;
  for (const street of ALDER_STREETS) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 40) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      const edge = Math.min(a.width, b.width) / 2 + ALDER_PAVEMENT;
      assert.equal(alderGround(mx, mz), false, `${street.id} centreline`);
      assert.equal(alderGround(mx + nx * (edge - 0.3), mz + nz * (edge - 0.3)), false, `${street.id} pavement`);
      // Only claim ground where no other street's paving reaches.
      const ox = mx + nx * (edge + 2), oz = mz + nz * (edge + 2);
      const paved = ALDER_STREETS.some(other => { const on = projectOntoPath(other.points, ox, oz); return on.distance <= on.width / 2 + ALDER_PAVEMENT + 0.5; });
      if (!paved && ox > DRIFT_YARD.bounds.maxX + 5) { assert.equal(alderGround(ox, oz), true, `${street.id} past the pavement`); checked++; }
    }
  }
  assert.ok(checked > 50, `only ${checked} open verges were checked`);
  // The drift yard, its driveway and the garage forecourt are drawn as asphalt.
  assert.equal(YARD_LINE.some(point => alderGround(point.x, point.z)), false, "Sable's line crosses ground");
  assert.equal(alderGround(DRIFT_YARD.start.x, DRIFT_YARD.start.z), false);
  assert.equal(alderGround(ALDER_GARAGE.entrance.x, ALDER_GARAGE.entrance.z), false);
  // Every street is asked, not the nearest centreline: find a point on one
  // street's asphalt whose nearest centreline belongs to a narrower street.
  // On 2026-09-13 a radial search found 8 such points (one is 1st Ave S's 24 m
  // carriageway beside an 8 m street at -0.7, 783.4).
  let junction = 0;
  for (const street of ALDER_STREETS) {
    for (const point of street.points) {
      for (let r = 1; r < point.width / 2; r++) for (let k = 0; k < 16; k++) {
        const x = point.x + Math.cos(k * Math.PI / 8) * r, z = point.z + Math.sin(k * Math.PI / 8) * r;
        const nearest = projectOntoAlder(x, z), own = projectOntoPath(street.points, x, z);
        if (own.distance < own.width / 2 && nearest.distance > nearest.width / 2 + ALDER_PAVEMENT) {
          assert.equal(alderGround(x, z), false, `${street.id} asphalt read as ground at ${x}, ${z}`);
          junction++;
        }
      }
    }
  }
  assert.ok(junction > 0, "no junction case found to exercise every-street selection");
  // The AI routes stay on paving.
  for (const route of [ALDER_RIVAL, ALDER_CRUISE]) {
    assert.equal(route.points.filter(point => alderGround(point.x, point.z)).length, 0, route.id);
  }
});
