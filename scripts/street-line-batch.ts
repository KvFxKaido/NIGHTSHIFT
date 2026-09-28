// The rival in its own slot in the sim, in traffic, with the player parked across town: with the street line, or without.
import RAPIER from "@dimforge/rapier3d-compat";
import { appendFileSync, writeFileSync } from "node:fs";
import { sampleDrivingPath, sampleRivalPath, shiftAt } from "../src/sim/rival.ts";
import { openScenario } from "../src/sim/scenario.ts";
import { step, TICK_HZ } from "../src/sim/sim.ts";
import { TRAFFIC_KINDS } from "../src/sim/traffic.ts";
import { applyDriverKnobs, batchRace } from "./batch-race.ts";
import { slowdownTracker } from "./rival-slowdowns.ts";

await RAPIER.init();
const withLine = process.argv.includes("--line"), trace = process.argv.includes("--trace"), census = process.argv.includes("--census");
const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
// The driver's knobs (SLIP, FOLLOW, FRAME) and the line's (PLAN, REACH, BEND, BENDTANGENT, WORTH): batch-race.ts.
applyDriverKnobs();
if (output) writeFileSync(output, "");
const ids = process.argv.includes("--all") ? ["street-uptown", ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`)]
  : process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!ids.length) throw new Error("Pass race ids or --all; add --line for corner lines and planned passes, --legacy-pass for v29 passing, --trace for events, --census for slowdowns, --output=path.jsonl to save rows.");
for (const id of ids) {
  // TRAFFIC_SEED=n runs every race against another traffic (createTraffic): the rival alone across traffic layouts.
  const scenario = batchRace(id, { line: withLine, seed: Number(process.env.TRAFFIC_SEED ?? 0) });
  if (!scenario) continue;
  const rival = scenario.options.rival!;
  if (process.argv.includes("--legacy-pass")) (rival as { trafficPassing?: boolean }).trafficPassing = false;
  const sim = openScenario(scenario);
  let aborts = 0, wasGo = false, contactOnLine = 0; let contact = 0, off = 0, stray = 0, onLine = 0, racing = 0, jumps = 0, lastAlong = 0, goCorners = 0, lastCorner = -1, wentGo = false, corners = 0;
  const events: string[] = [];
  let passTicks = 0, passes = 0, passContact = 0, lastPass = -1;
  // How far it runs from where it means to be, at speed, in its lane or on a line: not in a pass, whose path is its
  // own, and not within 4 s of touching anything, which throws it further than it ever drives.
  let wide = 0, wideAt = "", sinceContact = Infinity;
  // --census: every stretch the rival is held below its own corner plan by something that is not a corner (rival-slowdowns.ts).
  const slowdowns = census ? slowdownTracker(sim.rivalDefinition!) : null;
  try {
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * TICK_HZ) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      slowdowns?.tick(sim);
      const r = sim.state.rival!, car = r.vehicle, d = r.driver;
      if (r.race.countdown > 0) continue;
      racing++;
      if (d.trafficPass) { passTicks++; if (d.trafficPass.from !== lastPass) { passes++; lastPass = d.trafficPass.from; if (trace) events.push(`pass t=${(r.race.ticks / TICK_HZ).toFixed(1)} target=${d.trafficPass.target} from=${d.trafficPass.from.toFixed(0)} to=${d.trafficPass.to.toFixed(0)} offset=${d.trafficPass.offset.toFixed(1)}`); } }
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      let touching = false;
      for (const v of sim.state.traffic!.vehicles) {
        const dx = v.x - car.x, dz = v.z - car.z;
        if (dx * dx + dz * dz > 64) continue;
        // Box against box, roughly: the other car's centre inside this car's box grown by the other's half-size.
        const spec = TRAFFIC_KINDS[v.kind], reach = Math.hypot(spec.length, spec.width) / 2;
        if (Math.abs(dx * fx + dz * fz) < 2.1 + reach * 0.75 && Math.abs(dx * -fz + dz * fx) < 0.95 + spec.width / 2 + 0.1) touching = true;
      }
      if (touching && d.trafficPass) passContact++;
      if (touching && (d.lineBlend ?? 0) > 0.05) contactOnLine++; if (touching) { contact++; if (trace && (events.length === 0 || !events.at(-1)!.startsWith("contact") )) events.push(`contact t=${(r.race.ticks / TICK_HZ).toFixed(1)} along ${d.along.toFixed(0)} blend ${(d.lineBlend ?? 0).toFixed(2)} go ${d.lineGo} v ${(car.speed * 2.237).toFixed(0)}`); }
      else if (trace && events.at(-1)?.startsWith("contact")) events.push("clear");
      sinceContact = touching ? 0 : sinceContact + 1;
      if (car.speed > 30 && !d.trafficPass && sinceContact > 4 * TICK_HZ && d.reverseTicks === 0) {
        const at = sampleDrivingPath(rival, d.along), shift = rival.line ? shiftAt(rival.line, d.along) : { x: 0, z: 0 }, blend = d.lineBlend ?? 0;
        const away = Math.hypot(car.x - (at.x - at.uz * d.avoidance + blend * shift.x), car.z - (at.z + at.ux * d.avoidance + blend * shift.z));
        if (away > wide) { wide = away; wideAt = `${d.along.toFixed(0)} m at ${(car.speed * 2.237).toFixed(0)} mph`; }
      }
      if (car.groundContact > 0) off++;
      const on = sampleRivalPath(rival, d.along);
      stray = Math.max(stray, Math.hypot(car.x - on.x, car.z - on.z));
      if ((d.lineBlend ?? 0) > 0.5) onLine++;
      if (Math.abs(d.along - lastAlong) > 6) jumps++;
      lastAlong = d.along;
      if (d.lineCorner !== undefined && d.lineCorner !== lastCorner) { if (lastCorner >= 0) { corners++; if (wentGo) goCorners++; } lastCorner = d.lineCorner; wentGo = false; }
      if ((d.lineBlend ?? 0) > 0.9) wentGo = true; { const w = rival.line?.corners[d.lineCorner ?? -1]; if (wasGo && !d.lineGo && (d.lineBlend ?? 0) > 0.3 && w && d.along > w.from && d.along < w.to - 15) { aborts++; if (trace) events.push(`gave back t=${(r.race.ticks / TICK_HZ).toFixed(1)} along ${d.along.toFixed(0)} v ${(car.speed * 2.237).toFixed(0)}`); } } wasGo = !!d.lineGo;
    }
    const r = sim.state.rival!;
    const result = JSON.stringify({ id, line: withLine, seconds: r.race.finished ? +(r.race.ticks / TICK_HZ).toFixed(2) : null, contact, resets: r.driver.resets, unseen: r.driver.unseenResets,
      passTicks, passes, passContact, reversals: r.driver.recoveries, off, stray: +stray.toFixed(1), wide: +wide.toFixed(1), wideAt, onLine: +(onLine / Math.max(1, racing)).toFixed(3), corners, goCorners, aborts, contactOnLine, jumps, ...(trace ? { events: events.filter(e => e !== "clear") } : {}), ...(slowdowns ? { slowdowns: slowdowns.done() } : {}) });
    if (output) appendFileSync(output, result + "\n"); else console.log(result);
  } finally { sim.world.free(); }
}
