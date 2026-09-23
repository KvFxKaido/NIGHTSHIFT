// The rival alone in traffic, over several traffic layouts: the 83-race street-line batch (street-line-batch.ts) once per
// traffic seed, every seed and every quarter of the races in its own process, compared race by race with a committed
// baseline (2026-09-22). One seed is one layout: seed 0, the one every rival gate was measured on to that date, is the
// cleanest of twelve, and the rival met twelve times the distinct incidents over six.
//
//   pnpm rival:gate                         run the six seeds and compare with the baseline
//   pnpm rival:gate --seeds=0,42            other seeds (a seed missing from the baseline is reported, not compared)
//   pnpm rival:gate --save                  also write this run as the baseline (the file each change re-saves; git keeps
//                                           the history), or --save=<path> somewhere else
//   pnpm rival:gate --rows=.probe/v8s       read rows already run (<prefix><seed>-<0..3>.jsonl) instead of running
//
// The batch's knobs (PLAN, REACH, BEND, BENDTANGENT, WORTH, SLIP, FRAME, FOLLOW) pass through the environment to every
// process. Races are compared by id; a distinct incident is one (time, route metres) pair, because races from the grid
// share their first kilometres and one incident can be many rows.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RIVAL_REVISIONS } from "../src/sim/rival-revision.ts";
import { TRAFFIC_REVISION } from "../src/sim/traffic.ts";
import { PHYSICS_VERSION } from "../src/sim/sim.ts";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SEEDS = (arg("seeds") ?? "0,1000,271828,1,42,314159").split(",").map(Number);
const BASELINE = arg("baseline") ?? "design/measurements/rival-gate.json";
const GROUPS = 4;
const SOURCES = ["src/sim/traffic.ts", "src/sim/rival.ts", "src/sim/sim.ts", "src/sim/traffic-pass.ts", "src/sim/street-line.ts", "src/sim/car-handling.ts", "scripts/street-line-batch.ts"];

type Row = { id: string; seconds: number | null; contact: number; contactOnLine: number; passContact: number; off: number; resets: number; unseen: number; reversals: number; events?: string[] };
const group = (k: number) => [...(k === 0 ? ["street-uptown"] : []), ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`).filter((_, i) => (i + 1) % GROUPS === k)];

async function run(): Promise<Map<number, Row[]>> {
  const from = arg("rows");
  const read = (path: string) => readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Row);
  if (from) return new Map(SEEDS.map(seed => [seed, Array.from({ length: GROUPS }, (_, k) => read(`${from}${seed}-${k}.jsonl`)).flat()]));
  const dir = mkdtempSync(join(tmpdir(), "nightshift-gate-"));
  const started = Date.now();
  try {
    await Promise.all(SEEDS.flatMap(seed => Array.from({ length: GROUPS }, (_, k) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/street-line-batch.ts", ...group(k), "--line", "--trace", `--output=${join(dir, `${seed}-${k}.jsonl`)}`],
        { env: { ...process.env, TRAFFIC_SEED: String(seed) }, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      child.stderr.on("data", chunk => { errors += chunk; });
      child.on("exit", code => code === 0 ? resolve() : reject(new Error(`seed ${seed} group ${k} failed:\n${errors}`)));
    }))));
    console.log(`${SEEDS.length} seeds x ${GROUPS} processes in ${((Date.now() - started) / 60000).toFixed(1)} min`);
    return new Map(SEEDS.map(seed => [seed, Array.from({ length: GROUPS }, (_, k) => read(join(dir, `${seed}-${k}.jsonl`))).flat()]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const incidents = (rows: Row[]) => {
  const found = new Map<string, { at: string; mph: number; races: string[] }>();
  for (const row of rows) for (const event of row.events ?? []) {
    const m = /^contact t=([\d.]+) along (\d+).* v (\d+)/.exec(event);
    if (!m) continue;
    const key = `${m[1]}@${m[2]}`, seen = found.get(key);
    if (seen) seen.races.push(row.id); else found.set(key, { at: `t=${m[1]} along ${m[2]}`, mph: Number(m[3]), races: [row.id] });
  }
  return [...found.values()];
};
const summary = (rows: Row[]) => ({
  races: rows.length,
  seconds: +rows.reduce((s, r) => s + (r.seconds ?? 0), 0).toFixed(2),
  dnf: rows.filter(r => r.seconds === null).length,
  contact: rows.reduce((s, r) => s + r.contact, 0),
  racesWithContact: rows.filter(r => r.contact > 0).length,
  distinctIncidents: incidents(rows).length,
  contactOnLine: rows.reduce((s, r) => s + r.contactOnLine, 0),
  passContact: rows.reduce((s, r) => s + r.passContact, 0),
  off: rows.reduce((s, r) => s + r.off, 0),
  resets: rows.reduce((s, r) => s + r.resets + r.unseen, 0),
  reversals: rows.reduce((s, r) => s + r.reversals, 0),
});
type Summary = ReturnType<typeof summary>;
const KEYS: (keyof Summary)[] = ["seconds", "dnf", "contact", "racesWithContact", "distinctIncidents", "contactOnLine", "passContact", "off", "resets", "reversals"];

const results = await run();
let baseline: { seeds: Record<string, { rows: Row[] }> } | null = null;
try { baseline = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { console.log(`no baseline at ${BASELINE}: reporting this run alone`); }
const totals = { was: {} as Record<string, number>, now: {} as Record<string, number> };
for (const seed of SEEDS) {
  const now = results.get(seed)!, was = baseline?.seeds[String(seed)]?.rows;
  const s = summary(now);
  if (!was) { console.log(`seed ${String(seed).padStart(7)}: ${KEYS.map(k => `${k} ${s[k]}`).join(", ")}${baseline ? " (not in the baseline)" : ""}`); continue; }
  const ids = new Set(was.map(r => r.id)), shared = now.filter(r => ids.has(r.id)), old = was.filter(r => shared.some(n => n.id === r.id));
  const a = summary(old), b = summary(shared);
  for (const k of KEYS) { totals.was[k] = (totals.was[k] ?? 0) + a[k]; totals.now[k] = (totals.now[k] ?? 0) + b[k]; }
  const same = shared.filter(r => { const o = old.find(w => w.id === r.id)!; return o.seconds === r.seconds && o.contact === r.contact; }).length;
  console.log(`seed ${String(seed).padStart(7)} (${shared.length} races, ${same} identical): ${KEYS.map(k => `${k} ${k === "seconds" ? a[k].toFixed(0) : a[k]}->${k === "seconds" ? b[k].toFixed(0) : b[k]}`).join(", ")}`);
  for (const incident of incidents(shared)) console.log(`      ${incident.at} ${incident.mph} mph: ${incident.races.length > 4 ? `${incident.races.slice(0, 4).join(" ")} +${incident.races.length - 4}` : incident.races.join(" ")}`);
}
if (Object.keys(totals.was).length) console.log(`all compared: ${KEYS.map(k => `${k} ${k === "seconds" ? totals.was[k]!.toFixed(0) : totals.was[k]}->${k === "seconds" ? totals.now[k]!.toFixed(0) : totals.now[k]}`).join(", ")}`);

const save = arg("save") ?? (process.argv.includes("--save") ? BASELINE : undefined);
if (save) {
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(save, JSON.stringify({
    provenance: `pnpm rival:gate, ${new Date().toISOString().slice(0, 10)}`,
    revisions: { physics: PHYSICS_VERSION, traffic: TRAFFIC_REVISION, ...RIVAL_REVISIONS },
    method: "scripts/street-line-batch.ts --line --trace per traffic seed, four processes a seed, the player parked at Wharf Garage. A distinct incident is one (time, route metres) pair.",
    sourceHashes: Object.fromEntries(SOURCES.map(path => [path, hash(path)])),
    seeds: Object.fromEntries(SEEDS.map(seed => { const rows = results.get(seed)!; return [String(seed), { summary: summary(rows), incidents: incidents(rows), rows }]; })),
  }, null, 1) + "\n");
  console.log(`saved ${save}`);
}
