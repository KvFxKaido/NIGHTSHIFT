import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_RACE, createAlderWorld } from "../src/sim/alder.ts";
import { drawAlderCourse } from "../src/sim/alder-course.ts";
import { HARBOR_DRAG, DRAG_START, RIVET_DRAG_DRIVER } from "../src/sim/drag-event.ts";
import { BLACKLIST_LAUNCH, createLaunch, LAUNCH, RIVAL_LAUNCH_SKILL, rivalLaunchCharge, stepLaunch } from "../src/sim/launch.ts";
import { BLACKLIST } from "../src/settings/blacklist.ts";
import { createSim, step, TICK_HZ, type Input } from "../src/sim/sim.ts";
await RAPIER.init();

// The launch (design/HANDLING.md, "The launch"): hold the handbrake and the gas
// through the countdown, let go as the flag drops, and the first seconds carry
// extra traction. Botch it and it costs you. Drag races keep the gearbox's own.

const held: Input = { throttle: 1, brake: 0, steer: 0, handbrake: 1 };
const gas: Input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
/** Charge for `charging` ticks of countdown, then release `late` ticks after the flag. */
function launched(charging: number, late: number) {
  const state = createLaunch();
  for (let countdown = charging; countdown > 0; countdown--) stepLaunch(state, held, countdown, 0);
  const drives: number[] = [];
  for (let ticks = 0; ticks < 120; ticks++) drives.push(stepLaunch(state, ticks < late ? held : gas, 0, ticks));
  return { state, drives, first: drives[Math.max(0, late)]! };
}

test("a launch is charged by holding both, resolved on release, and worth the most at the flag", () => {
  const perfect = launched(LAUNCH.chargeTicks, 0);
  assert.equal(perfect.state.feedback, "PERFECT LAUNCH");
  assert.ok(perfect.state.quality > .999, `quality ${perfect.state.quality}`);
  assert.ok(Math.abs(perfect.first - (1 + LAUNCH.boost)) < 1e-3, "the whole boost on the first tick");
  assert.ok(perfect.drives.at(-1)! === 1, "and none of it 2 seconds later");
  // Inside the window it is whole; past it, it fades to nothing.
  assert.ok(launched(LAUNCH.chargeTicks, LAUNCH.perfectTicks).state.quality > .999);
  const late = launched(LAUNCH.chargeTicks, 21).state;
  assert.ok(late.quality > .4 && late.quality < .5, `late quality ${late.quality}`);
  assert.equal(launched(LAUNCH.chargeTicks, LAUNCH.windowTicks).state.feedback, "MISSED LAUNCH");
  assert.equal(launched(LAUNCH.chargeTicks, LAUNCH.windowTicks).state.quality, 0);
});

test("holding past the flag spins the tyres, a half-charge bogs, and doing nothing costs nothing", () => {
  const spun = launched(LAUNCH.chargeTicks, LAUNCH.spinTicks);
  assert.equal(spun.state.feedback, "WHEELSPIN");
  assert.equal(spun.first, LAUNCH.penaltyScale);
  const bogged = launched(Math.round(LAUNCH.chargeTicks * .3), 0);
  assert.equal(bogged.state.feedback, "BOGGED LAUNCH");
  assert.equal(bogged.first, LAUNCH.penaltyScale);
  // The gas alone charges nothing, which is why every lap recorded before today still replays.
  const state = createLaunch();
  for (let countdown = 180; countdown > 0; countdown--) assert.equal(stepLaunch(state, gas, countdown, 0), 1);
  assert.equal(state.charge, 0);
  for (let ticks = 0; ticks < 120; ticks++) assert.equal(stepLaunch(state, gas, 0, ticks), 1);
  assert.equal(state.feedback, "");
  // Letting go a little early is fine; letting go a second early is not.
  const anticipated = createLaunch();
  for (let countdown = LAUNCH.chargeTicks; countdown > 6; countdown--) stepLaunch(anticipated, held, countdown, 0);
  for (let countdown = 6; countdown > 0; countdown--) stepLaunch(anticipated, gas, countdown, 0);
  stepLaunch(anticipated, gas, 0, 0);
  assert.ok(anticipated.quality > .7, `anticipating the flag keeps most of it (${anticipated.quality})`);
});

test("a perfect launch is worth about two car lengths, a spin costs several, and the gains are what the tuning says", () => {
  const drive = (hold: boolean, releaseAt = 0) => {
    const sim = createSim("rwd", createAlderWorld(true), { race: ALDER_RACE });
    const from = { x: sim.state.vehicle.x, z: sim.state.vehicle.z };
    let at3 = 0, at5 = 0;
    for (let tick = 0; tick < 60 * 9; tick++) {
      const race = sim.state.race!;
      const handbrake = hold && (race.countdown > 0 || race.ticks < releaseAt) ? 1 : 0;
      step(sim, { throttle: 1, brake: 0, steer: 0, handbrake });
      const gone = Math.hypot(sim.state.vehicle.x - from.x, sim.state.vehicle.z - from.z);
      if (race.ticks === 3 * TICK_HZ) at3 = gone;
      if (race.ticks === 5 * TICK_HZ) at5 = gone;
    }
    sim.world.free();
    return { at3, at5 };
  };
  const plain = drive(false), perfect = drive(true), spun = drive(true, LAUNCH.spinTicks);
  // Measured 2026-09-16 on Sound to Sky's grid, RWD: +5.3 m at 3 s, +8.9 m at 5 s.
  assert.ok(perfect.at3 - plain.at3 > 4.5 && perfect.at3 - plain.at3 < 6.5, `perfect at 3 s: +${(perfect.at3 - plain.at3).toFixed(1)} m`);
  assert.ok(perfect.at5 - plain.at5 > 7.5 && perfect.at5 - plain.at5 < 10.5, `perfect at 5 s: +${(perfect.at5 - plain.at5).toFixed(1)} m`);
  assert.ok(spun.at5 - plain.at5 < -20, `a spin at 5 s: ${(spun.at5 - plain.at5).toFixed(1)} m`);
  // A launch buys traction off the line; it must never raise the governed top speed.
  const flat = drive(true);
  assert.ok(flat.at5 < plain.at5 + 12, "the boost is a launch, not a higher top speed");
});

test("rivals launch by rank: the further up the list, the better it hooks up, and none of them sits at the lights", () => {
  const drawn = drawAlderCourse("gen-moth-12", null);
  const run = (skill: number) => {
    const sim = createSim("rwd", createAlderWorld(true, drawn.start ?? undefined),
      { race: drawn.race, rival: { ...drawn.rival, launch: skill } });
    const from = { x: sim.state.rival!.vehicle.x, z: sim.state.rival!.vehicle.z };
    let at3 = 0, feedback = "";
    for (let tick = 0; tick < 60 * 7; tick++) {
      const race = sim.state.race!;
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const said = sim.state.rival!.vehicle.launch?.feedback ?? "";
      if (said && !said.startsWith("LAUNCH ") && !feedback) feedback = said;
      if (race.ticks === 3 * TICK_HZ) at3 = Math.hypot(sim.state.rival!.vehicle.x - from.x, sim.state.rival!.vehicle.z - from.z);
    }
    sim.world.free();
    return { at3, feedback };
  };
  // Measured 2026-09-16 on gen-moth-12: not launching 58.3 m at three seconds, launching
  // 61.3 m at Moth's rank and 62.0 at Tally's. The launch is worth about 3 m to a rival;
  // rank is worth 0.7 m of that, so it flavours the start rather than deciding it.
  const runs = [0, .5, .75, 1].map(run);
  assert.ok(runs[1]!.at3 > runs[0]!.at3 + 2, `launching is worth ${(runs[1]!.at3 - runs[0]!.at3).toFixed(1)} m`);
  for (let i = 2; i < runs.length; i++) assert.ok(runs[i]!.at3 >= runs[i - 1]!.at3, `skill ${i} went ${runs[i]!.at3.toFixed(2)} m`);
  assert.equal(runs[0]!.feedback, "", "skill 0 never touches the handbrake");
  assert.equal(runs.at(-1)!.feedback, "PERFECT LAUNCH");
  // Rank is charge, not reaction: every rival lets go at the flag, so none is ever
  // still sitting on the handbrake when the player pulls away.
  assert.equal(rivalLaunchCharge(1), LAUNCH.chargeTicks);
  assert.equal(rivalLaunchCharge(.5), Math.round(LAUNCH.chargeTicks / 2));
  assert.ok(Math.min(...Object.values(BLACKLIST_LAUNCH)) >= LAUNCH.bogCharge, "no name on the list bogs its own start");
});

test("every Blacklist name has a launch skill that climbs the list, and an authored rival has the default", () => {
  assert.deepEqual(Object.keys(BLACKLIST_LAUNCH).sort(), BLACKLIST.map(name => name.id).sort());
  const byRank = [...BLACKLIST].sort((a, b) => b.rank - a.rank);
  for (let i = 1; i < byRank.length; i++) {
    assert.ok(BLACKLIST_LAUNCH[byRank[i]!.id]! > BLACKLIST_LAUNCH[byRank[i - 1]!.id]!,
      `#${byRank[i]!.rank} ${byRank[i]!.name} must launch better than #${byRank[i - 1]!.rank}`);
  }
  assert.equal(BLACKLIST_LAUNCH.tally, 1, "the one who never misses");
  assert.equal(BLACKLIST_LAUNCH.moth, LAUNCH.bogCharge, "and the one who leaves half of it on the line");
  assert.ok(RIVAL_LAUNCH_SKILL > 0 && RIVAL_LAUNCH_SKILL < 1);
  assert.equal(drawAlderCourse("gen-moth-12", null).rival.launch, BLACKLIST_LAUNCH.moth);
  assert.equal(drawAlderCourse("gen-12", null).rival.launch, RIVAL_LAUNCH_SKILL, "a race under nobody's name");
});

test("the drag strip keeps its own launch and never gets this one", () => {
  const sim = createSim("rwd", createAlderWorld(true, DRAG_START), { race: HARBOR_DRAG, rival: RIVET_DRAG_DRIVER });
  try {
    assert.equal(sim.state.vehicle.launch, undefined);
    assert.equal(sim.state.rival!.vehicle.launch, undefined);
    assert.ok(sim.state.vehicle.transmission, "it launches through the gearbox instead");
  } finally { sim.world.free(); }
});
