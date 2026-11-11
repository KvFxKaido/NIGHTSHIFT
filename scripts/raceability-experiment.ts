import RAPIER from "@dimforge/rapier3d-compat";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { batchRace } from "./batch-race.ts";
import { openScenario } from "../src/sim/scenario.ts";
import { step } from "../src/sim/sim.ts";
import { cooldownAudit } from "./raceability-cooldown-audit.ts";

await RAPIER.init();
const mode = process.env.NS_STOP_LABEL ?? (process.env.NS_STOP_EXPERIMENT === "1" ? "swept" : "baseline");
if (!/^[a-z0-9-]+$/.test(mode)) throw new Error("Invalid output label");
const ids = (process.env.NS_STOP_RACES ?? "gen-22,gen-56").split(",");
const seeds = (process.env.NS_STOP_SEEDS ?? "314159").split(",").map(Number);
mkdirSync("artifacts/raceability-experiment", { recursive: true });
for (const id of ids) for (const seed of seeds) {
  cooldownAudit.length = 0;
  const sim = openScenario(batchRace(id, { car: "cinder", seed, env: {} })!);
  const prefix = createHash("sha256"), complete = createHash("sha256"), changes = [];
  const impacts: { tick: number; along: number; traffic: number | null; impulse: number }[] = [];
  let impulseTicks = 0, previousUnseen = 0, previousRule = "", forkSnapshot = "", groundTicks = 0;
  try {
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * 60) {
      const before = sim.state.rival!.race.ticks;
      if (before === 3600) forkSnapshot = createHash("sha256").update(sim.world.takeSnapshot()).digest("hex");
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const state = JSON.stringify(sim.state);
      complete.update(state); if (before < 3600) prefix.update(state);
      const r = sim.state.rival!, d = r.driver;
      if (r.race.countdown <= 0 && r.vehicle.groundContact > 0) groundTicks++;
      const collider = sim.rivalBody!.collider(0);
      let impact = 0;
      sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, m => {
        let impulse = 0; for (let i = 0; i < m.numContacts(); i++) impulse += m.contactImpulse(i);
        if (impulse <= 0) return;
        const index = sim.trafficBodies.findIndex(body => body.collider(0).handle === other.handle);
        impacts.push({ tick: r.race.ticks, along: d.along, traffic: index < 0 ? null : sim.state.traffic!.vehicles[index]!.id, impulse });
        impact += impulse;
      }));
      if (impact > 0) impulseTicks++;
      if (sim.rivalWhy.by !== previousRule || d.unseenResets !== previousUnseen) changes.push({ tick: r.race.ticks, along: d.along,
        x: r.vehicle.x, z: r.vehicle.z, speed: r.vehicle.speed, why: { ...sim.rivalWhy }, unseen: d.unseenResets, noProgress: d.noProgressTicks });
      previousRule = sim.rivalWhy.by; previousUnseen = d.unseenResets;
    }
    const r = sim.state.rival!;
    const result = { id, seed, mode, seconds: r.race.ticks / 60, finished: r.race.finished, resets: r.driver.resets,
      unseen: r.driver.unseenResets, recoveries: r.driver.recoveries, impulseTicks, groundTicks,
      prefixHash: prefix.digest("hex"), stateHash: complete.digest("hex"), forkSnapshot, impacts, changes, cooldownAudit };
    writeFileSync(`artifacts/raceability-experiment/${id}-${seed}-${mode}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ id, seed, mode, seconds: result.seconds, finished: result.finished, unseen: result.unseen, impulseTicks, audit: cooldownAudit.length }));
  } finally { sim.world.free(); }
}
