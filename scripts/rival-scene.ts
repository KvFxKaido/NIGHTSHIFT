// One race of the rival gate, reproduced (2026-09-23): the batch's own set-up (street-line-batch.ts: the rival in the
// Cinder, its route's line redrawn, the player parked at Wharf Garage) at one traffic seed, so an incident the gate
// lists is a scene read in seconds rather than a gate run. The sim is deterministic, so the race id and the seed are
// the whole scene.
//
//   pnpm rival:scene gen-56 --seed=314159                     every contact, dissected: what the traffic car was
//                                                             doing, when it claimed its junction and where the rival
//                                                             was then, and the rival's speed, aim and brake before it
//   pnpm rival:scene gen-56 --seed=314159 --from=2700 --to=2800   the rival every 0.2 s between two route metres,
//                                                             with the traffic near it (--every= seconds)
//   pnpm rival:scene street-uptown --seed=42 --until=120      stop after that many race seconds
//
// The batch's knobs (PLAN, REACH, BEND, BENDTANGENT, WORTH, SLIP, FRAME, FOLLOW) are read from the environment as it reads
// them. A contact is the batch's own test (a box against a box, roughly), so a scene counts what the gate counted.
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { RIVAL_RACING, RIVAL_STEERING, RIVAL_STREET_LINE, RIVAL_TRAFFIC_FRAME, sampleDrivingPath, type RivalDefinition } from "../src/sim/rival.ts";
import { RIVAL_REVISIONS } from "../src/sim/rival-revision.ts";
import { carHandling, createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { STREET_CIRCUIT_LINE } from "../src/sim/street-circuit.ts";
import { withStreetLine } from "../src/sim/street-line.ts";
import { TRAFFIC_KINDS, TRAFFIC_REVISION } from "../src/sim/traffic.ts";

await RAPIER.init();
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!id) throw new Error("Pass a race id (gen-56, street-uptown) and --seed=; --from= --to= for a trace, --until= to stop early.");
const seed = Number(arg("seed") ?? 0), until = Number(arg("until") ?? 330), every = Number(arg("every") ?? 0.2);
const from = arg("from") === undefined ? null : Number(arg("from")), to = Number(arg("to") ?? Infinity);
if (process.env.SLIP) (RIVAL_STEERING as { slip: number }).slip = Number(process.env.SLIP);
if (process.env.FOLLOW === "0") (RIVAL_RACING as { followWhereItIs: boolean }).followWhereItIs = false;
if (process.env.FRAME === "0") (RIVAL_TRAFFIC_FRAME as { on: boolean }).on = false;

let route: RivalDefinition, race;
if (id.startsWith("street-")) { const event = circuitEvent(id, 3)!; route = event.rival!; race = event.race; }
else {
  if (!alderCourseDraws(id, null)) throw new Error(`${id} draws no race`);
  const course = drawAlderCourse(id, null); route = { ...course.rival }; race = course.race;
}
const { line: _shipped, ...bare } = route as RivalDefinition & { line?: unknown };
const rival = withStreetLine(bare, STREET_CIRCUIT_LINE, Number(process.env.PLAN ?? RIVAL_STREET_LINE.speedFactor),
  { ...(process.env.REACH ? { reach: Number(process.env.REACH) } : {}), ...(process.env.BEND ? { bendFrom: Number(process.env.BEND) } : {}),
    ...(process.env.BENDTANGENT ? { bendTangent: Number(process.env.BENDTANGENT) } : {}), ...(process.env.WORTH ? { worth: Number(process.env.WORTH) } : {}) });
const sim = createSim(carHandling("cinder", "rwd"), createAlderWorld(true), { race, rival, traffic: true, trafficSeed: seed });
console.log(`${id}, traffic seed ${seed}, ${TRAFFIC_REVISION}, ${RIVAL_REVISIONS.driver}: ${from === null ? "every contact" : `the rival from ${from} to ${to === Infinity ? "the end" : to} m`}`);

const mph = (v: number) => (v * 2.237).toFixed(0);
const claimed = new Map<number, { t: number; speed: number; along: number; apart: number }>();
const history: { t: number; speed: number; target: number; brake: number; blend: number; pass: boolean; x: number; z: number }[] = [];
let touchingBefore = new Set<number>(), lastPrint = -Infinity, contacts = 0;
try {
  while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < until * TICK_HZ) {
    const held = new Map(sim.state.traffic!.vehicles.map(v => [v.id, v.holds.length]));
    step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    const r = sim.state.rival!, car = r.vehicle, d = r.driver, t = r.race.ticks / TICK_HZ;
    for (const v of sim.state.traffic!.vehicles) if (!held.get(v.id) && v.holds.length)
      claimed.set(v.id, { t, speed: car.speed, along: d.along, apart: Math.hypot(v.x - car.x, v.z - car.z) });
    if (r.race.countdown > 0) continue;
    history.push({ t, speed: car.speed, target: d.targetSpeed, brake: r.input.brake, blend: d.lineBlend ?? 0, pass: !!d.trafficPass, x: car.x, z: car.z });
    if (history.length > 20 * TICK_HZ) history.shift();
    const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
    const frame = (x: number, z: number) => ({ ahead: (x - car.x) * fx + (z - car.z) * fz, side: (x - car.x) * -fz + (z - car.z) * fx });

    if (from !== null) {
      if (d.along < from || d.along > to || t - lastPrint < every - 1e-9) continue;
      lastPrint = t;
      const on = sampleDrivingPath(rival, d.along), across = (car.x - on.x) * -on.uz + (car.z - on.z) * on.ux;
      const near = sim.state.traffic!.vehicles.map(v => ({ v, ...frame(v.x, v.z) })).filter(n => Math.abs(n.ahead) < 45 && Math.abs(n.side) < 9)
        .sort((a, b) => Math.abs(a.ahead) - Math.abs(b.ahead)).slice(0, 2)
        .map(n => `${n.v.kind}#${n.v.id} ${n.ahead.toFixed(0)}m ${n.side > 0 ? "R" : "L"}${Math.abs(n.side).toFixed(1)} ${mph(n.v.speed)}mph ${Math.cos(n.v.heading - car.heading) > 0.7 ? "same" : Math.cos(n.v.heading - car.heading) < -0.7 ? "onc" : "cross"}${n.v.holds.length ? " claimed" : ""}`);
      console.log(`t=${t.toFixed(1)} at ${d.along.toFixed(0)} m ${mph(car.speed)} mph, wants ${mph(d.targetSpeed)}${sim.rivalWhy.by === "corner" || sim.rivalWhy.by === "top" ? "" : ` (${sim.rivalWhy.by}${sim.rivalWhy.id === undefined ? "" : ` #${sim.rivalWhy.id}`})`}; throttle ${r.input.throttle.toFixed(1)} brake ${r.input.brake.toFixed(1)} steer ${r.input.steer.toFixed(1)}; `
        + `${across.toFixed(1)} m across a ${on.width} m road, aiming ${d.avoidance.toFixed(1)}, line ${(d.lineBlend ?? 0).toFixed(1)}${d.trafficPass ? ", passing" : ""}${car.groundContact > 0 ? ", OFF THE PAVEMENT" : ""} | ${near.join("; ")}`);
      continue;
    }

    // Every new touch, by the batch's test.
    const touching = new Set<number>();
    for (const v of sim.state.traffic!.vehicles) {
      const dx = v.x - car.x, dz = v.z - car.z;
      if (dx * dx + dz * dz > 64) continue;
      const spec = TRAFFIC_KINDS[v.kind], reach = Math.hypot(spec.length, spec.width) / 2, f = frame(v.x, v.z);
      if (Math.abs(f.ahead) < 2.1 + reach * 0.75 && Math.abs(f.side) < 0.95 + spec.width / 2 + 0.1) touching.add(v.id);
    }
    for (const vid of touching) {
      if (touchingBefore.has(vid)) continue;
      contacts++;
      const v = sim.state.traffic!.vehicles.find(v => v.id === vid)!, f = frame(v.x, v.z), rel = Math.cos(v.heading - car.heading);
      const how = rel > 0.7 ? (f.ahead > 0 ? "into the back of a car going its way" : "hit from behind by a car going its way")
        : rel < -0.7 ? "a car coming the other way" : `a car crossing at ${(Math.acos(Math.max(-1, Math.min(1, rel))) * 180 / Math.PI).toFixed(0)} degrees`;
      let onset: typeof history[number] | undefined;
      for (let i = history.length - 1; i >= 0 && history[i]!.t > t - 6; i--) { if (history[i]!.brake >= 0.5) onset = history[i]; else if (onset) break; }
      const before = history.find(h => h.t >= t - 1.5)!, c = claimed.get(vid);
      console.log(`\nt=${t.toFixed(1)} at ${d.along.toFixed(0)} m, ${mph(car.speed)} mph: ${how}, ${v.kind} #${vid} at ${mph(v.speed)} mph, ${f.ahead.toFixed(1)} m ahead and ${f.side.toFixed(1)} across, `
        + `${v.holds.length ? `holding movements [${v.holds.join(", ")}]` : "holding no junction"}, lane ${v.lane}`);
      console.log(`  1.5 s before: ${mph(before.speed)} mph wanting ${mph(before.target)}, on its line ${before.blend.toFixed(2)}${before.pass ? ", in a committed pass" : ""}; `
        + (onset ? `hard brake from t=${onset.t.toFixed(1)} at ${mph(onset.speed)} mph, ${Math.hypot(v.x - onset.x, v.z - onset.z).toFixed(0)} m from where the car now is` : "no hard brake"));
      if (c) console.log(`  it last claimed a junction at t=${c.t.toFixed(1)}, with the rival ${c.apart.toFixed(0)} m away at ${mph(c.speed)} mph (at ${c.along.toFixed(0)} m)`);
      console.log(`  trace it: pnpm rival:scene ${id} --seed=${seed} --from=${Math.max(0, Math.round(d.along - 150))} --to=${Math.round(d.along + 10)}`);
    }
    touchingBefore = touching;
  }
  const r = sim.state.rival!;
  console.log(`\n${r.race.finished ? `finished in ${(r.race.ticks / TICK_HZ).toFixed(2)} s` : `stopped at ${(r.race.ticks / TICK_HZ).toFixed(1)} s`}`
    + `${from === null ? `, ${contacts} contact${contacts === 1 ? "" : "s"}` : ""}, resets ${r.driver.resets} (out of sight ${r.driver.unseenResets}), reversals ${r.driver.recoveries}`);
} finally { sim.world.free(); }
