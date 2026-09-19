import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { carHandling, createSim, handlingFor, HANDLING, resetSim, step, tunedHandling, PHYSICS_VERSION, TICK_HZ,
  type Input } from "../src/sim/sim.ts";
import { CAR_TUNES, type CarTune } from "../src/sim/car-handling.ts";
import { measureCar } from "../src/sim/car-card.ts";
import type { RoadWorld } from "../src/sim/road-world.ts";
import { replayLapSession } from "../src/sim/lap-replay.ts";
import { LAP_RECORDING_FORMAT, TRACK_LIMITS, LAP_CHANNELS, type LapSession } from "../src/sim/lap-recorder.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { ALDER_VERSION } from "../src/sim/alder.ts";
import { RIVAL_REVISION } from "../src/sim/rival.ts";

await RAPIER.init();

// Per-car handling (2026-09-19): each car is the shared model bent by a few
// knobs (car-handling.ts). These pin what a knob may touch, that weight is only
// felt in contact, and that a car's numbers cannot change without its revision.

const flat = { along: 0, segmentIndex: 0, distance: 0, height: 0, pitch: 0, ux: 0, uz: -1, width: 10000 };
const WORLD: RoadWorld = { id: "car-handling-check", start: { x: 0, y: 0.5, z: 0, heading: 0, pitch: 0 }, walls: [], project: () => flat };
const NUMBERS = ["mass", "topSpeed", "engineAcceleration", "engineMidAcceleration", "highSpeedAcceleration", "maxLateralAcceleration",
  "frontCorneringStiffness", "rearCorneringStiffness", "brakeDeceleration", "steeringResponse", "handbrakeRearStiffness", "aerodynamicDrag"] as const;
const shared = (field: typeof NUMBERS[number]) => field === "mass" ? HANDLING.mass : HANDLING[field];

test("a car with no knob is the shared model to the last bit", () => {
  const untouched = tunedHandling("probe", { drivetrain: "rwd", revision: 1 });
  for (const field of NUMBERS) assert.ok(Object.is(untouched[field], shared(field)), `${field} moved without a knob`);
  assert.equal(carHandling(null, "rwd").rearCorneringStiffness, HANDLING.rearCorneringStiffness);
});

test("each knob moves only the numbers it names", () => {
  const knobs: [keyof CarTune, number, (typeof NUMBERS[number])[]][] = [
    ["mass", 1500, ["mass"]],
    ["power", 1.1, ["engineAcceleration", "engineMidAcceleration"]],
    ["topEnd", 1.1, ["highSpeedAcceleration"]],
    ["topSpeed", 1.1, ["topSpeed"]],
    ["grip", 1.1, ["maxLateralAcceleration"]],
    ["balance", 1.21, ["frontCorneringStiffness", "rearCorneringStiffness"]],
    ["brakes", 1.1, ["brakeDeceleration"]],
    ["steering", 1.1, ["steeringResponse"]],
    ["handbrake", 1.1, ["handbrakeRearStiffness"]],
    ["drag", 0.9, ["aerodynamicDrag"]],
  ];
  for (const [knob, value, moved] of knobs) {
    const car = tunedHandling("probe", { drivetrain: "rwd", revision: 1, [knob]: value });
    for (const field of NUMBERS) {
      if (moved.includes(field)) assert.notEqual(car[field], shared(field), `${knob} did not move ${field}`);
      else assert.ok(Object.is(car[field], shared(field)), `${knob} moved ${field}, which it does not name`);
    }
  }
  // Balance divides the ratio between the axles: above 1 the rear is stiffer and the car settles.
  const settled = tunedHandling("probe", { drivetrain: "rwd", revision: 1, balance: 1.21 });
  assert.ok(Math.abs(settled.rearCorneringStiffness / settled.frontCorneringStiffness /
    (HANDLING.rearCorneringStiffness / HANDLING.frontCorneringStiffness) - 1.21) < 1e-12);
  // More handbrake loosens the rear further.
  assert.ok(tunedHandling("probe", { drivetrain: "rwd", revision: 1, handbrake: 1.1 }).handbrakeRearStiffness < HANDLING.handbrakeRearStiffness);
});

test("weight alone changes nothing about how a car drives", () => {
  const mixed = (tick: number): Input => ({ throttle: tick % 240 < 170 ? 1 : 0, brake: tick % 240 >= 200 ? 0.6 : 0,
    steer: Math.sin(tick / 45) * 0.8, handbrake: tick % 400 > 380 ? 1 : 0 });
  for (const drivetrain of ["fwd", "rwd", "awd"] as const) {
    const base = carHandling(null, drivetrain);
    const [light, heavy] = [base, { ...base, mass: 1800 }].map(handling => {
      const sim = createSim(handling, WORLD);
      try { for (let tick = 0; tick < 1200; tick++) step(sim, mixed(tick)); return sim.state.vehicle; } finally { sim.world.free(); }
    });
    // Twenty seconds of slides and handbrake end within f32 noise (measured: 3 mm or less).
    assert.ok(Math.hypot(light!.x - heavy!.x, light!.z - heavy!.z) < 0.02, `${drivetrain}: 1,800 kg drove somewhere else`);
    assert.ok(Math.abs(light!.heading - heavy!.heading) < 1e-3);
    const { mass: _light, ...lightCard } = measureCar(base);
    const { mass: _heavy, ...heavyCard } = measureCar({ ...base, mass: 1800 });
    assert.deepEqual(heavyCard, lightCard, `${drivetrain}: weight changed the card`);
  }
});

test("in contact a heavier car shoves harder and keeps more of its own speed", () => {
  const parked = { id: "parked", name: "Parked", start: { x: 0, y: 0, z: -12, heading: 0, pitch: 0 } };
  const bump = (mass: number) => {
    const sim = createSim({ ...carHandling(null, "rwd"), mass }, WORLD, { parkedRivals: [parked] });
    sim.body.setLinvel({ x: 0, y: 0, z: -12 }, true);
    let shoved = 0, contact = -1, kept = 0;
    try {
      for (let tick = 0; tick < 2 * TICK_HZ; tick++) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
        const other = sim.state.parkedRivals[0]!.vehicle.speed;
        if (contact < 0 && other > 0.2) contact = tick;
        shoved = Math.max(shoved, other);
        if (contact >= 0 && tick === contact + TICK_HZ / 2) kept = sim.state.vehicle.speed;
      }
    } finally { sim.world.free(); }
    assert.ok(contact >= 0, `the ${mass} kg car never reached the parked one`);
    return { shoved, kept };
  };
  const light = bump(900), even = bump(1180), heavy = bump(2000);
  // Measured 2026-09-19: parked car to 4.87 / 5.63 / 7.09 m/s; the hitter keeps 2.34 / 3.26 / 5.01 m/s.
  assert.ok(light.shoved < even.shoved && even.shoved < heavy.shoved, JSON.stringify({ light, even, heavy }));
  assert.ok(light.kept < even.kept && even.kept < heavy.kept, JSON.stringify({ light, even, heavy }));
  assert.ok(heavy.shoved > light.shoved * 1.3);
});

// A car's tune, pinned under its revision, the way generator draws are pinned
// (race-generator.test.ts). Changing a tune without bumping its revision would let
// an old recording replay against new numbers and diverge instead of being refused.
// A car a rival drives also needs a RIVAL_REVISION bump. The tune, not its resolved
// numbers: a new knob leaves every existing pin alone, and a change to the shared
// HANDLING is PHYSICS_VERSION's to name.
const fingerprint = (tune: CarTune) => {
  const { revision: _revision, ...knobs } = tune;
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(Object.entries(knobs).sort(([a], [b]) => a < b ? -1 : 1))) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};
const PINNED: Record<string, { revision: number; fingerprint: string }> = {
  cinder: { revision: 1, fingerprint: "5caa34f4" },
  bulwark: { revision: 2, fingerprint: "eef80a98" },
  blender: { revision: 1, fingerprint: "5caa34f4" },
  ns01: { revision: 1, fingerprint: "5caa34f4" },
  kestrel: { revision: 1, fingerprint: "fc966077" },
  vesper: { revision: 1, fingerprint: "5caa34f4" },
  latch: { revision: 1, fingerprint: "69049eb8" },
  breakwater: { revision: 1, fingerprint: "fc966077" },
  wager: { revision: 1, fingerprint: "5caa34f4" },
  meridian: { revision: 1, fingerprint: "fc966077" },
  skim: { revision: 1, fingerprint: "69049eb8" },
  reign: { revision: 1, fingerprint: "fc966077" },
  hammer: { revision: 1, fingerprint: "5caa34f4" },
};
test("a car's numbers change only with its revision", () => {
  assert.deepEqual(Object.keys(PINNED).sort(), Object.keys(CAR_TUNES).sort(), "every car is pinned, and only cars");
  for (const [car, tune] of Object.entries(CAR_TUNES)) {
    const pin = PINNED[car]!, printed = fingerprint(tune);
    const repin = `repin PINNED.${car} to { revision: ${tune.revision}, fingerprint: "${printed}" }`;
    if (pin.revision !== tune.revision) assert.fail(`the ${car} has a new revision since it was pinned: ${repin}`);
    assert.equal(printed, pin.fingerprint, `the ${car}'s numbers changed on revision ${tune.revision}. If that was meant, ` +
      `bump CAR_TUNES.${car}.revision${car === "cinder" || car === "bulwark" ? "" : ` and RIVAL_REVISION (${RIVAL_REVISION})`}, then ${repin}`);
  }
  // Sable's NS-01 is one car under two ids.
  assert.equal(CAR_TUNES.blender, CAR_TUNES.ns01);
});

test("a rival drives the car it names; naming a contradiction or no known car throws", () => {
  assert.equal(handlingFor({ car: "latch" }), carHandling("latch"));
  assert.equal(handlingFor({ car: "latch" }).drivetrain, "fwd");
  assert.equal(handlingFor({ car: "latch", drivetrain: "fwd" }), carHandling("latch"));
  assert.throws(() => handlingFor({ car: "latch", drivetrain: "awd" }), /latch is fwd, not awd/);
  assert.throws(() => handlingFor({ car: "no-such-car" }), /Unknown car/);
  // A route with no car drives the shared model, FWD unless it says otherwise.
  assert.equal(handlingFor({}).car, null);
  assert.equal(handlingFor({}).drivetrain, "fwd");
  assert.equal(handlingFor({ drivetrain: "awd" }), carHandling(null, "awd"));
  // An unknown body in the garage (the primitive "classic") drives the shared model rather than failing.
  assert.equal(carHandling("classic").drivetrain, "fwd");
  assert.equal(carHandling("classic").mass, HANDLING.mass);
});

test("a reset keeps the car; a layout keeps the car on another drivetrain; a car replaces it", () => {
  const sim = createSim(carHandling("bulwark"), WORLD);
  try {
    assert.equal(sim.state.handling, carHandling("bulwark"));
    assert.equal(sim.state.drivetrain, "awd");
    resetSim(sim);
    assert.equal(sim.state.handling, carHandling("bulwark"));
    resetSim(sim, "rwd");
    assert.equal(sim.state.handling.car, "bulwark", "a developer layout comparison changed the car");
    assert.equal(sim.state.drivetrain, "rwd");
    assert.equal(sim.state.handling, carHandling("bulwark", "rwd"));
    resetSim(sim, carHandling("cinder"));
    assert.equal(sim.state.handling, carHandling("cinder"));
    assert.throws(() => resetSim(sim, "4wd" as never), /Unknown drivetrain/);
    assert.equal(sim.body.mass(), carHandling("cinder").mass);
  } finally { sim.world.free(); }
});

test("a recording driven at another car revision is refused, not compared", () => {
  const event = circuitEvent("arena-full-solo", 1)!;
  const session = (carRevision?: number): LapSession => ({ format: LAP_RECORDING_FORMAT, id: "car-revision-check", recordedAt: "",
    world: ALDER_VERSION, arena: event.identity, rival: RIVAL_REVISION, physics: PHYSICS_VERSION, tickHz: TICK_HZ,
    race: "arena-full-solo", layout: "full", solo: true, laps: 1, car: "cinder", drivetrain: "rwd",
    ...(carRevision === undefined ? {} : { carRevision }), start: event.start, trackLimits: TRACK_LIMITS, channels: LAP_CHANNELS,
    inputs: { throttle: [], brake: [], steer: [], handbrake: [] }, recorded: [] });
  // Before per-car handling every car drove the shared numbers: an absent revision is 1.
  assert.deepEqual(replayLapSession(session()), { ok: true, laps: 0 });
  assert.deepEqual(replayLapSession(session(CAR_TUNES.cinder!.revision)), { ok: true, laps: 0 });
  const refused = replayLapSession(session(CAR_TUNES.cinder!.revision + 1));
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.reason, /handling revision/);
});
