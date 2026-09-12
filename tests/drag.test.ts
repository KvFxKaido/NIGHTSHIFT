import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createRace, stepRace, racePosition, formatRaceTime, raceProgressLabel } from "../src/sim/race.ts";
import { onDragStrip } from "../src/sim/drag-rules.ts";
import { HARBOR_DRAG, DRAG_START, RIVET, RIVET_DRAG_DRIVER } from "../src/sim/drag-event.ts";
import { createSim, step, resetSim, type VehicleState } from "../src/sim/sim.ts";
import { createAlderWorld } from "../src/sim/alder.ts";
import { ALDER_CRUISE, MOTH, nearbyChallenge } from "../src/sim/encounter.ts";

await RAPIER.init();
const strip = HARBOR_DRAG.drag!;
const at = (along: number, across = -3) => ({ x: strip.start.x + across, z: strip.start.z - along }) as VehicleState;
const live = () => ({ ...createRace(HARBOR_DRAG), countdown: 0 });

test("drag counts a forward finish crossing, never the near edge of its beacon", () => {
  const race = live();
  stepRace(HARBOR_DRAG, race, at(0));
  stepRace(HARBOR_DRAG, race, at(strip.length - 1));
  assert.equal(race.finished, false);
  stepRace(HARBOR_DRAG, race, at(strip.length + 1));
  assert.equal(race.finished, true);
  assert.equal(race.checkpoint, 1);
  assert.equal(race.disqualified, undefined);
  const ticks = race.ticks;
  stepRace(HARBOR_DRAG, race, at(0));
  assert.equal(race.ticks, ticks);
});

test("drag permits crossing lanes but leaving the strip disqualifies", () => {
  const race = live();
  stepRace(HARBOR_DRAG, race, at(0));
  stepRace(HARBOR_DRAG, race, at(10, 3));
  assert.equal(race.disqualified, undefined);
  stepRace(HARBOR_DRAG, race, at(20, 6));
  assert.equal(race.disqualified, true);
  assert.equal(race.checkpoint, 0);
  assert.equal(race.next, null);
  const other = live();
  assert.equal(racePosition(HARBOR_DRAG, { race, ...at(300) }, { race: other, ...at(0, 3) }), 2);
});

test("drag position uses distance down the strip and the countdown prevents progress", () => {
  const race = createRace(HARBOR_DRAG);
  stepRace(HARBOR_DRAG, race, at(500));
  assert.equal(race.finished, false);
  assert.equal(race.ticks, 0);
  const me = live(), other = live();
  stepRace(HARBOR_DRAG, me, at(90));
  stepRace(HARBOR_DRAG, other, at(100, 3));
  assert.equal(racePosition(HARBOR_DRAG, { race: me, ...at(90) }, { race: other, ...at(100, 3) }), 2);
});

test("both grid lanes and braking road stay on Harbor Way", () => {
  const world = createAlderWorld(true, DRAG_START);
  assert.ok(Math.abs(onDragStrip(strip, DRAG_START).along - onDragStrip(strip, RIVET_DRAG_DRIVER.start).along) < 1e-9);
  for (let distance = -20; distance <= 580; distance += 5) {
    for (const lane of [-3, 3]) {
      const car = at(distance, lane);
      const road = world.project(car.x, car.z);
      assert.ok(road.distance < road.width / 2 - 1.1, `Off road at ${distance}/${lane}`);
    }
  }
});

test("Rivet coexists with the cruiser, stays parked, survives reset and owns the nearby challenge", () => {
  const sim = createSim("fwd", createAlderWorld(), { traffic: false, encounterRoute: ALDER_CRUISE, parkedRivals: [RIVET] });
  try {
    const rivet = sim.state.parkedRivals[0]!;
    for (let i = 0; i < 300; i++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    assert.ok(Math.hypot(rivet.vehicle.x - RIVET.start.x, rivet.vehicle.z - RIVET.start.z) < .1);
    assert.equal(nearbyChallenge({ ...rivet.vehicle, x: rivet.vehicle.x - 8, speed: 0 }, sim.state.encounter, sim.state.parkedRivals, false), RIVET.id);
    assert.equal(nearbyChallenge({ ...rivet.vehicle, speed: 0 }, sim.state.encounter, sim.state.parkedRivals, true), null);
    assert.equal(nearbyChallenge({ ...sim.state.encounter!, x: sim.state.encounter!.x + 8, speed: 0 }, sim.state.encounter, sim.state.parkedRivals, false), MOTH.id);
    resetSim(sim);
    assert.equal(sim.state.parkedRivals[0]!.id, RIVET.id);
    assert.equal(sim.parkedRivalBodies.length, 1);
  } finally { sim.world.free(); }
});

test("player and Rivet complete a physical quarter mile from equal standing starts", () => {
  const run = () => {
    const sim = createSim("fwd", createAlderWorld(true, DRAG_START), { race: HARBOR_DRAG, rival: RIVET_DRAG_DRIVER, traffic: false });
    try {
      for (let tick = 0; tick < 3600 && !(sim.state.race!.finished && sim.state.rival!.race.finished); tick++) {
        step(sim, { throttle: tick < 180 ? .52 : 1, brake: 0, steer: 0, handbrake: 0, shiftUp: sim.state.vehicle.transmission!.rpm >= 7550 && sim.state.vehicle.transmission!.shiftTicks === 0 });
        if (tick < 180) assert.ok(sim.state.vehicle.speed < .05);
      }
      for (const race of [sim.state.race!, sim.state.rival!.race]) {
        assert.equal(race.finished, true);
        assert.equal(race.disqualified, undefined);
        assert.equal(race.checkpoint, 1);
        assert.ok(race.ticks > 600 && race.ticks < 2400, `implausible time ${race.ticks}`);
      }
      assert.equal(sim.state.rival!.driver.resets, 0);
      return [sim.state.race!.splits, sim.state.rival!.race.splits];
    } finally { sim.world.free(); }
  };
  assert.deepEqual(run(), run());
});

test("drag readout distinguishes staged distance, precise time and disqualification", () => {
  const race = createRace(HARBOR_DRAG);
  assert.equal(raceProgressLabel(HARBOR_DRAG, race), "DRAG · 402 M · LANE 1/2");
  assert.equal(formatRaceTime(721, 60, 3), "0:12.017");
  assert.equal(formatRaceTime(721, 60), "0:12.0");
  race.disqualified = true;
  assert.equal(raceProgressLabel(HARBOR_DRAG, race), "DQ · LEFT THE STRIP");
});

test("lane assistance crosses smoothly, settles in either lane, and cannot steer beyond the strip", () => {
  for (const drivetrain of ["fwd", "rwd", "awd"] as const) {
    const sim = createSim(drivetrain, createAlderWorld(true, DRAG_START), { race: HARBOR_DRAG, traffic: false });
    try {
      for (let tick = 0; tick < 1000 && !sim.state.race!.finished; tick++) {
        const previousX = sim.state.vehicle.x;
        const gearbox = sim.state.vehicle.transmission!;
        step(sim, { throttle: tick < 180 ? .52 : 1, brake: 0, handbrake: 0,
          steer: tick >= 340 && tick < 580 ? 1 : tick >= 580 ? -1 : 0,
          shiftUp: gearbox.rpm >= 7550 && gearbox.shiftTicks === 0 });
        assert.ok(Math.abs(sim.state.vehicle.x - previousX) < .5, "lane changes must move through physics");
        assert.equal(sim.state.race!.disqualified, undefined, `${drivetrain} left strip at tick ${tick}`);
        if (tick === 579) assert.ok(Math.abs(onDragStrip(strip, sim.state.vehicle).across - 3) < .5, `${drivetrain} failed to settle right`);
        if (tick === 850) assert.ok(Math.abs(onDragStrip(strip, sim.state.vehicle).across + 3) < .5, `${drivetrain} failed to settle left`);
      }
      resetSim(sim);
      assert.equal(sim.state.vehicle.transmission!.gear, 1);
      assert.equal(sim.state.vehicle.transmission!.launched, false);
    } finally { sim.world.free(); }
  }
});
