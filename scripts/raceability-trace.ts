// Read-only tick evidence for the reference report. No driver/table overrides.
import RAPIER from "@dimforge/rapier3d-compat";
import { mkdirSync, writeFileSync } from "node:fs";
import { batchRace } from "./batch-race.ts";
import { openScenario } from "../src/sim/scenario.ts";
import { step, TICK_HZ } from "../src/sim/sim.ts";
import { sampleDrivingPath } from "../src/sim/rival.ts";
import { readStreetLine, STREET_LINE } from "../src/sim/street-line.ts";

await RAPIER.init();
mkdirSync("artifacts/raceability-traces", { recursive: true });
for (const id of ["gen-22", "gen-56"]) for (const traffic of [false, true]) {
  const base = batchRace(id, { car: "cinder", seed: 314159, env: {} })!;
  const sim = openScenario({ ...base, options: { ...base.options, traffic } });
  const rows = [], refusals = [], route = sim.rivalDefinition!;
  let lastRefused = 0;
  try {
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * TICK_HZ) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const r = sim.state.rival!, d = r.driver, car = r.vehicle, t = r.race.ticks / TICK_HZ;
      if (r.race.countdown > 0) continue;
      const p = sampleDrivingPath(route, d.along);
      const near = (sim.state.traffic?.vehicles ?? []).filter(v => Math.hypot(v.x - car.x, v.z - car.z) < 80 || (id === "gen-22" && v.id === 11));
      const contacts: { handle: number; traffic: number | null; impulse: number }[] = [];
      const collider = sim.rivalBody!.collider(0);
      sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, manifold => {
        let impulse = 0; for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
        const index = sim.trafficBodies.findIndex(b => b.collider(0).handle === other.handle);
        contacts.push({ handle: other.handle, traffic: index < 0 ? null : sim.state.traffic!.vehicles[index]!.id, impulse });
      }));
      rows.push({ t, along: d.along, x: car.x, z: car.z, speed: car.speed, heading: car.heading,
        input: { ...r.input }, why: { ...sim.rivalWhy }, corner: d.lineCorner, go: d.lineGo, blend: d.lineBlend,
        refused: d.lineRefused, pass: d.trafficPass ? { ...d.trafficPass } : null,
        noProgress: d.noProgressTicks, progressMark: d.progressMark, unseen: d.unseenResets,
        resets: d.resets, reverse: d.reverseTicks, ghost: r.ghost, ground: car.groundContact,
        across: (car.x - p.x) * -p.uz + (car.z - p.z) * p.ux, avoidance: d.avoidance,
        contacts, near: near.map(v => ({ ...v })) });
      if ((d.lineRefused ?? 0) > lastRefused) {
        // Counterfactual reader on driver copies only: identify vehicles refusing this line at this post-tick snapshot.
        // These probes do not step physics or write the live driver. They are not the exact pre-input decision state.
        const before = JSON.stringify(sim.state);
        const blockers = (sim.state.traffic?.vehicles ?? []).filter(v => {
          const probe = { ...d, lineRefused: 0 };
          readStreetLine(route, probe, car, Math.ceil(r.race.ticks / STREET_LINE.every) * STREET_LINE.every,
            sim.roadWorld.traffic, [v]);
          return (probe.lineRefused ?? 0) > 0;
        }).map(v => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, speed: v.speed, lane: v.lane }));
        if (JSON.stringify(sim.state) !== before) throw new Error("Read probe mutated live state");
        refusals.push({ t, along: d.along, corner: d.lineCorner, blockers });
      }
      lastRefused = d.lineRefused ?? 0;
    }
    const r = sim.state.rival!;
    writeFileSync(`artifacts/raceability-traces/${id}-${traffic ? "traffic" : "clear"}.json`,
      JSON.stringify({ id, traffic, seed: 314159, car: "cinder", seconds: r.race.ticks / TICK_HZ, finished: r.race.finished,
        corners: route.line!.corners, rows, refusals }));
    console.log(id, traffic, r.race.ticks / TICK_HZ, "refusals", refusals.length);
  } finally { sim.world.free(); }
}
