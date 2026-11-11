// Read-only instrumentation of the existing rival-gate scenario. No driver knobs.
import RAPIER from "@dimforge/rapier3d-compat";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ALDER_DATA, ALDER_STREETS } from "../src/sim/alder.ts";
import { sampleDrivingPath } from "../src/sim/rival.ts";
import { rivalRevisionParts } from "../src/sim/rival-revision.ts";
import { openScenario } from "../src/sim/scenario.ts";
import { PHYSICS_VERSION, step, TICK_HZ } from "../src/sim/sim.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import { TRAFFIC_KINDS, TRAFFIC_REVISION } from "../src/sim/traffic.ts";
import { batchRace } from "./batch-race.ts";
import { slowdownTracker } from "./rival-slowdowns.ts";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ids = (arg("races") ?? "gen-30,gen-22,gen-56").split(",");
const seeds = (arg("seeds") ?? "0,42,314159").split(",").map(Number);
if (seeds.some(s => !Number.isSafeInteger(s) || s < 0)) throw new Error("Seeds must be nonnegative integers");
const output = arg("output") ?? "artifacts/raceability";
mkdirSync(output, { recursive: true });
function renderReport() {
  const report = JSON.parse(readFileSync(arg("input") ?? `${output}/data.json`, "utf8")) as {
    streets: { name: string; points: number[][] }[];
    courses: { bins: { street: string; points: number[][] }[] }[];
  };
  // Labels use the saved map, so re-rendering old measurements never consults a newer world.
  for (const course of report.courses) for (const bin of course.bins) {
    const a = bin.points[2]!, b = bin.points[3]!, x = (a[0]! + b[0]!) / 2, z = (a[1]! + b[1]!) / 2;
    let nearest = Infinity;
    for (const street of report.streets) for (let i = 1; i < street.points.length; i++) {
      const p = street.points[i - 1]!, q = street.points[i]!, dx = q[0]! - p[0]!, dz = q[1]! - p[1]!;
      const t = Math.max(0, Math.min(1, ((x - p[0]!) * dx + (z - p[1]!) * dz) / (dx * dx + dz * dz || 1)));
      const distance = Math.hypot(x - p[0]! - t * dx, z - p[1]! - t * dz);
      if (distance < nearest) { nearest = distance; bin.street = street.name; }
    }
  }
  const json = JSON.stringify(report).replaceAll("<", "\\u003c");
  writeFileSync(`${output}/data.json`, JSON.stringify(report));
  writeFileSync(`${output}/index.html`, readFileSync("scripts/raceability-view.html", "utf8").replace("/*REPORT_DATA*/null", () => json));
}
if (process.argv.includes("--render")) { renderReport(); process.exit(0); }
await RAPIER.init();
const hash = createHash("sha256");
const sourceFiles = execFileSync("git", ["ls-files", "src", "scripts"], { encoding: "utf8" }).trim().split(/\r?\n/);
for (const file of [...new Set([...sourceFiles, "scripts/raceability-map.ts", "scripts/raceability-view.html"])].sort()) hash.update(file).update(readFileSync(file));
const metadata = { created: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceHash: hash.digest("hex"), runtime: process.version, world: ALDER_DATA.version, physics: PHYSICS_VERSION, traffic: TRAFFIC_REVISION,
  seeds, binMetres: 50, timeoutSeconds: 330, setup: "Rival gate scenario, Cinder RWD, player parked; identical line with traffic toggled; no environment tuning knobs" };
const courses = [];
for (const id of ids) {
  const base = batchRace(id, { env: {}, car: "cinder" });
  if (!base || base.options.rival!.loop) throw new Error(`Expected a generated point-to-point race: ${id}`);
  // Explicit common car for reference comparisons, independent of any named rival tune.
  const route = base.options.rival!;
  const length = route.along.at(-1)!;
  const bins = Array.from({ length: Math.ceil(length / 50) }, (_, i) => {
    const from = i * 50, to = Math.min(length, from + 50), at = sampleDrivingPath(route, (from + to) / 2);
    const street = ALDER_STREETS.reduce((best, s) => {
      const p = projectOntoPath(s.points, at.x, at.z), distance = Math.abs(p.distance);
      return distance < best.distance ? { name: s.name, distance } : best;
    }, { name: "Unknown", distance: Infinity }).name;
    return { from, to, street, points: Array.from({ length: 6 }, (_, j) => { const p = sampleDrivingPath(route, from + (to - from) * j / 5); return [p.x, p.z]; }) };
  });
  const runs = [];
  for (const seed of [null, ...seeds]) {
    const sim = openScenario({ ...base, options: { ...base.options, rival: route, traffic: seed !== null, trafficSeed: seed ?? 0 } });
    const tracker = slowdownTracker(sim.rivalDefinition!);
    const stats = bins.map(() => ({ ticks: 0, speed: 0, brake: 0, contact: 0, ground: 0, entries: 0 }));
    const events: { x: number; z: number; along: number; t: number; kind: string }[] = [];
    let previousBin = -1, contactBefore = false, resets = 0, recoveries = 0, unseen = 0;
    try {
      while (!sim.state.rival!.race.finished && sim.state.rival!.race.ticks < 330 * TICK_HZ) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
        tracker.tick(sim);
        const r = sim.state.rival!, car = r.vehicle, d = r.driver;
        if (r.race.countdown > 0) continue;
        const index = Math.max(0, Math.min(stats.length - 1, Math.floor(d.along / 50))), stat = stats[index]!;
        stat.ticks++; stat.speed += car.speed; stat.brake += r.input.brake > 0.1 ? 1 : 0;
        stat.ground += car.groundContact > 0 ? 1 : 0;
        if (index !== previousBin) stat.entries++;
        previousBin = index;
        const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
        // Same approximate overlap check as street-line-batch, not a collision impulse sensor.
        const contact = (sim.state.traffic?.vehicles ?? []).some(v => {
          const dx = v.x - car.x, dz = v.z - car.z;
          if (dx * dx + dz * dz > 64) return false;
          const spec = TRAFFIC_KINDS[v.kind], reach = Math.hypot(spec.length, spec.width) / 2;
          return Math.abs(dx * fx + dz * fz) < 2.1 + reach * .75 && Math.abs(dx * -fz + dz * fx) < .95 + spec.width / 2 + .1;
        });
        if (contact) stat.contact++;
        const mark = (kind: string) => events.push({ x: car.x, z: car.z, along: d.along, t: r.race.ticks / TICK_HZ, kind });
        if (contact && !contactBefore) mark("Approximate traffic contact");
        if (d.resets > resets) mark("Reset");
        if (d.unseenResets > unseen) mark("Out-of-sight reset");
        if (d.recoveries > recoveries) mark("Reversing recovery");
        contactBefore = contact; resets = d.resets; recoveries = d.recoveries; unseen = d.unseenResets;
      }
      const r = sim.state.rival!;
      const slowdowns = tracker.done().map(s => { const p = sampleDrivingPath(route, s.along); return { ...s, x: p.x, z: p.z }; });
      runs.push({ seed, finished: r.race.finished, seconds: r.race.finished ? r.race.ticks / TICK_HZ : null,
        elapsed: r.race.ticks / TICK_HZ, resets, recoveries, unseen: r.driver.unseenResets, events, slowdowns,
        bins: stats.map(s => ({ seconds: s.ticks / TICK_HZ, mph: s.ticks ? s.speed / s.ticks * 2.237 : null,
          brakeSeconds: s.brake / TICK_HZ, contactSeconds: s.contact / TICK_HZ, groundSeconds: s.ground / TICK_HZ, entries: s.entries })) });
      console.log(`${id} ${seed === null ? "clear" : `seed ${seed}`}: ${runs.at(-1)!.seconds ?? "DNF"} s, ${slowdowns.length} slowdowns, ${events.length} events`);
    } finally { sim.world.free(); }
  }
  courses.push({ id, length, identity: rivalRevisionParts(route), fingerprint: createHash("sha256").update(JSON.stringify({ route, race: base.options.race })).digest("hex"),
    start: route.start, checkpoints: base.options.race!.checkpoints, bins, runs });
  writeFileSync(`${output}/data.json`, JSON.stringify({ metadata, streets: ALDER_STREETS.map(s => ({ name: s.name, points: s.points.map(p => [p.x, p.z]) })), courses }));
}
renderReport();
console.log(`Report: ${output}/index.html`);
