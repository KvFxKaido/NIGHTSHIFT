// Detailed replay of one full-gate case; same drawn rival car and unmodified gate setup.
import RAPIER from "@dimforge/rapier3d-compat";
import { mkdirSync, writeFileSync } from "node:fs";
import { batchRace } from "./batch-race.ts";
import { openScenario } from "../src/sim/scenario.ts";
import { step } from "../src/sim/sim.ts";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg("race"), seed = Number(arg("seed")), label = arg("label") ?? "current";
if (!id || !Number.isInteger(seed) || !/^[a-z0-9-]+$/.test(label)) throw new Error("Supply --race= --seed= and optional --label=");
const from = Number(arg("from") ?? 0), to = Number(arg("to") ?? Infinity);
await RAPIER.init();
const scenario = batchRace(id, { seed, env: {} });
if (!scenario) throw new Error("Race does not draw");
const sim = openScenario(scenario), rows = [];
let impulseTicks = 0, unseen = 0, resets = 0, lastRule = "", sweptStopTicks = 0;
try {
  while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * 60) {
    step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    const r = sim.state.rival!, d = r.driver, car = r.vehicle;
    if (r.race.countdown > 0) continue;
    const collider = sim.rivalBody!.collider(0);
    const impacts: { other: number | null; impulse: number }[] = [];
    sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, manifold => {
      let impulse = 0; for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
      if (impulse <= 0) return;
      const index = sim.trafficBodies.findIndex(b => b.collider(0).handle === other.handle);
      impacts.push({ other: index < 0 ? null : sim.state.traffic!.vehicles[index]!.id, impulse });
    }));
    if (impacts.length) impulseTicks++;
    if (sim.rivalWhy.by === "swept-stop") sweptStopTicks++;
    const recovery = d.unseenResets !== unseen || d.resets !== resets;
    if (recovery || (d.along >= from && d.along <= to && (r.race.ticks % 6 === 0 || impacts.length || sim.rivalWhy.by !== lastRule))) {
      // Nested pass/wheel/wreck records can be mutated on later ticks. Keep the
      // state at capture time, rather than references to a plan's eventual state.
      rows.push({ tick: r.race.ticks, along: d.along, car: structuredClone(car), driver: structuredClone(d), input: { ...r.input }, why: { ...sim.rivalWhy }, impacts,
        traffic: (sim.state.traffic?.vehicles ?? []).filter(v => Math.hypot(v.x - car.x, v.z - car.z) < 100).map(v => structuredClone(v)) });
    }
    unseen = d.unseenResets; resets = d.resets; lastRule = sim.rivalWhy.by;
  }
  const r = sim.state.rival!, result = { id, seed, label, car: scenario.options.rival!.car, finished: r.race.finished,
    seconds: r.race.ticks / 60, impulseTicks, unseen, resets, recoveries: r.driver.recoveries, sweptStopTicks, rows };
  mkdirSync("artifacts/raceability-full-gate/cases", { recursive: true });
  writeFileSync(`artifacts/raceability-full-gate/cases/${id}-${seed}-${label}.json`, JSON.stringify(result));
  console.log(JSON.stringify({ ...result, rows: rows.length }));
} finally { sim.world.free(); }
