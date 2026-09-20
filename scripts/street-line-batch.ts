// The rival in its own slot in the sim, in traffic, with the player parked across town: with the street line, or without.
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { RIVAL_STREET_LINE, sampleRivalPath, type RivalDefinition } from "../src/sim/rival.ts";
import { createSim, step, TICK_HZ, carHandling } from "../src/sim/sim.ts";
import { STREET_CIRCUIT_LINE } from "../src/sim/street-circuit.ts";
import { withStreetLine } from "../src/sim/street-line.ts";
import { TRAFFIC_KINDS } from "../src/sim/traffic.ts";

await RAPIER.init();
const withLine = process.argv.includes("--line"), trace = process.argv.includes("--trace");
const ids = process.argv.includes("--all") ? ["street-uptown", ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`)]
  : process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!ids.length) throw new Error("Pass race ids or --all; add --line for the conditional corner line, --trace for contacts.");
for (const id of ids) {
  let route: RivalDefinition, race;
  if (id.startsWith("street-")) { const event = circuitEvent(id, 3)!; route = event.rival!; race = event.race; }
  else { if (!alderCourseDraws(id, null)) continue; const course = drawAlderCourse(id, null); route = { ...course.rival }; race = course.race; }
  const { line: _shipped, ...bare } = route as RivalDefinition & { line?: unknown };
  const rival = withLine ? withStreetLine(bare, STREET_CIRCUIT_LINE, Number(process.env.PLAN ?? RIVAL_STREET_LINE.speedFactor), Number(process.env.REACH ?? 60)) : bare;
  const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race, rival, traffic: true });
  let aborts = 0, wasGo = false, contactOnLine = 0; let contact = 0, off = 0, stray = 0, onLine = 0, racing = 0, jumps = 0, lastAlong = 0, goCorners = 0, lastCorner = -1, wentGo = false, corners = 0;
  const events: string[] = [];
  try {
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * TICK_HZ) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
      const r = sim.state.rival!, car = r.vehicle, d = r.driver;
      if (r.race.countdown > 0) continue;
      racing++;
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      let touching = false;
      for (const v of sim.state.traffic!.vehicles) {
        const dx = v.x - car.x, dz = v.z - car.z;
        if (dx * dx + dz * dz > 64) continue;
        // Box against box, roughly: the other car's centre inside this car's box grown by the other's half-size.
        const spec = TRAFFIC_KINDS[v.kind], reach = Math.hypot(spec.length, spec.width) / 2;
        if (Math.abs(dx * fx + dz * fz) < 2.1 + reach * 0.75 && Math.abs(dx * -fz + dz * fx) < 0.95 + spec.width / 2 + 0.1) touching = true;
      }
      if (touching && (d.lineBlend ?? 0) > 0.05) contactOnLine++; if (touching) { contact++; if (trace && (events.length === 0 || !events.at(-1)!.startsWith("contact") )) events.push(`contact t=${(r.race.ticks / TICK_HZ).toFixed(1)} along ${d.along.toFixed(0)} blend ${(d.lineBlend ?? 0).toFixed(2)} go ${d.lineGo} v ${(car.speed * 2.237).toFixed(0)}`); }
      else if (trace && events.at(-1)?.startsWith("contact")) events.push("clear");
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
    console.log(JSON.stringify({ id, line: withLine, seconds: r.race.finished ? +(r.race.ticks / TICK_HZ).toFixed(2) : null, contact, resets: r.driver.resets, unseen: r.driver.unseenResets,
      reversals: r.driver.recoveries, off, stray: +stray.toFixed(1), onLine: +(onLine / Math.max(1, racing)).toFixed(3), corners, goCorners, aborts, contactOnLine, jumps, ...(trace ? { events: events.filter(e => e !== "clear") } : {}) }));
  } finally { sim.world.free(); }
}
