// The rival in its own slot in the sim, in traffic, with the player parked across town: with the street line, or without.
import RAPIER from "@dimforge/rapier3d-compat";
import { appendFileSync, writeFileSync } from "node:fs";
import { createAlderWorld } from "../src/sim/alder.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { RIVAL_RACING, RIVAL_STEERING, RIVAL_STREET_LINE, RIVAL_TRAFFIC_FRAME, sampleDrivingPath, sampleRivalPath, shiftAt, type RivalDefinition } from "../src/sim/rival.ts";
import { createSim, step, TICK_HZ, carHandling } from "../src/sim/sim.ts";
import { STREET_CIRCUIT_LINE } from "../src/sim/street-circuit.ts";
import { withStreetLine } from "../src/sim/street-line.ts";
import { TRAFFIC_KINDS } from "../src/sim/traffic.ts";

await RAPIER.init();
const withLine = process.argv.includes("--line"), trace = process.argv.includes("--trace");
const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
// SLIP=0 is the steering feedforward without the tyres' slip, as it was to full-line-v31.
if (process.env.SLIP) (RIVAL_STEERING as { slip: number }).slip = Number(process.env.SLIP);
// FOLLOW=0 judges a slower car ahead against where the rival means to be alone, as it was to driver-v1.
if (process.env.FOLLOW === "0") (RIVAL_RACING as { followWhereItIs: boolean }).followWhereItIs = false;
// FRAME=0 reads every car from the aim point's frame, as it was to full-line-v31.
if (process.env.FRAME === "0") (RIVAL_TRAFFIC_FRAME as { on: boolean }).on = false;
if (output) writeFileSync(output, "");
const ids = process.argv.includes("--all") ? ["street-uptown", ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`)]
  : process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!ids.length) throw new Error("Pass race ids or --all; add --line for corner lines and planned passes, --legacy-pass for v29 passing, --trace for events, --output=path.jsonl to save rows.");
for (const id of ids) {
  let route: RivalDefinition, race;
  if (id.startsWith("street-")) { const event = circuitEvent(id, 3)!; route = event.rival!; race = event.race; }
  else { if (!alderCourseDraws(id, null)) continue; const course = drawAlderCourse(id, null); route = { ...course.rival }; race = course.race; }
  const { line: _shipped, ...bare } = route as RivalDefinition & { line?: unknown };
  const rival = withLine ? withStreetLine(bare, STREET_CIRCUIT_LINE, Number(process.env.PLAN ?? RIVAL_STREET_LINE.speedFactor),
    { ...(process.env.REACH ? { reach: Number(process.env.REACH) } : {}), ...(process.env.BEND ? { bendFrom: Number(process.env.BEND) } : {}), ...(process.env.BENDREACH ? { bendReach: Number(process.env.BENDREACH) } : {}), ...(process.env.WORTH ? { worth: Number(process.env.WORTH) } : {}) }) : bare;
  if (process.argv.includes("--legacy-pass")) (rival as { trafficPassing?: boolean }).trafficPassing = false;
  const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race, rival, traffic: true });
  let aborts = 0, wasGo = false, contactOnLine = 0; let contact = 0, off = 0, stray = 0, onLine = 0, racing = 0, jumps = 0, lastAlong = 0, goCorners = 0, lastCorner = -1, wentGo = false, corners = 0;
  const events: string[] = [];
  let passTicks = 0, passes = 0, passContact = 0, lastPass = -1;
  // How far it runs from where it means to be, at speed, in its lane or on a line: not in a pass, whose path is its
  // own, and not within 4 s of touching anything, which throws it further than it ever drives.
  let wide = 0, wideAt = "", sinceContact = Infinity;
  try {
    while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * TICK_HZ) {
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
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
      passTicks, passes, passContact, reversals: r.driver.recoveries, off, stray: +stray.toFixed(1), wide: +wide.toFixed(1), wideAt, onLine: +(onLine / Math.max(1, racing)).toFixed(3), corners, goCorners, aborts, contactOnLine, jumps, ...(trace ? { events: events.filter(e => e !== "clear") } : {}) });
    if (output) appendFileSync(output, result + "\n"); else console.log(result);
  } finally { sim.world.free(); }
}
