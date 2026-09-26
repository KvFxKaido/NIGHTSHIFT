// The slowdown census (2026-09-25): every stretch the race rival is held below its own corner plan by something that is
// not a corner, over the gate's races (the 83-race batch at six traffic seeds, the player parked), counted by the rule
// that held it and ranked by the time it cost (rival-slowdowns.ts). What the player feels as a random slowdown is one
// of these, and this says which kind is commonest and dearest, and where each is.
//
//   pnpm rival:census                       run the six seeds (about as long as the gate) and report
//   pnpm rival:census --seeds=0,42          other seeds
//   pnpm rival:census --rows=<prefix>       read rows already run (<prefix><seed>-<0..3>.jsonl, from --keep)
//   pnpm rival:census --keep=<prefix>       keep this run's rows there too
//   pnpm rival:census --top=30 --json=<path> more worst episodes; everything as JSON
//
// A row here is a gate row with `slowdowns` added, so `pnpm rival:gate --rows=<prefix>` reads the same files.
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Slowdown } from "./rival-slowdowns.ts";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SEEDS = (arg("seeds") ?? "0,1000,271828,1,42,314159").split(",").map(Number);
const GROUPS = 4, TOP = Number(arg("top") ?? 20);
type Row = { id: string; seconds: number | null; slowdowns?: Slowdown[] };
const group = (k: number) => [...(k === 0 ? ["street-uptown"] : []), ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`).filter((_, i) => (i + 1) % GROUPS === k)];
const read = (path: string) => readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Row);

async function run(): Promise<Map<number, Row[]>> {
  const from = arg("rows");
  if (from) return new Map(SEEDS.map(seed => [seed, Array.from({ length: GROUPS }, (_, k) => read(`${from}${seed}-${k}.jsonl`)).flat()]));
  const dir = mkdtempSync(join(tmpdir(), "nightshift-census-")), started = Date.now(), keep = arg("keep");
  try {
    await Promise.all(SEEDS.flatMap(seed => Array.from({ length: GROUPS }, (_, k) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/street-line-batch.ts", ...group(k), "--line", "--trace", "--census", `--output=${join(dir, `${seed}-${k}.jsonl`)}`],
        { env: { ...process.env, TRAFFIC_SEED: String(seed) }, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      child.stderr.on("data", chunk => { errors += chunk; });
      child.on("exit", code => code === 0 ? resolve() : reject(new Error(`seed ${seed} group ${k} failed:\n${errors}`)));
    }))));
    console.log(`${SEEDS.length} seeds x ${GROUPS} processes in ${((Date.now() - started) / 60000).toFixed(1)} min`);
    if (keep) for (const seed of SEEDS) for (let k = 0; k < GROUPS; k++) copyFileSync(join(dir, `${seed}-${k}.jsonl`), `${keep}${seed}-${k}.jsonl`);
    return new Map(SEEDS.map(seed => [seed, Array.from({ length: GROUPS }, (_, k) => read(join(dir, `${seed}-${k}.jsonl`))).flat()]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const results = await run();
const all = [...results].flatMap(([seed, rows]) => rows.flatMap(row => (row.slowdowns ?? []).map(s => ({ seed, race: row.id, ...s }))));
const races = [...results.values()].reduce((n, rows) => n + rows.length, 0);
const raced = [...results.values()].flat().reduce((t, r) => t + (r.seconds ?? 0), 0);
const lost = all.reduce((t, s) => t + s.lost, 0);
console.log(`${all.length} slowdowns over ${races} races (${(raced / 3600).toFixed(1)} h raced): ${lost.toFixed(1)} s behind the rival's own plan, ${(100 * lost / raced).toFixed(2)}% of the time`);

// By rule: how often, how dear, and how the dearest half of them started.
const rules = new Map<string, typeof all>();
for (const s of all) rules.set(s.rule, [...(rules.get(s.rule) ?? []), s]);
const table = [...rules].map(([rule, list]) => {
  const total = list.reduce((t, s) => t + s.lost, 0), sorted = list.map(s => s.lost).sort((a, b) => a - b);
  return { rule, count: list.length, races: new Set(list.map(s => `${s.seed}|${s.race}`)).size, lost: +total.toFixed(1), share: +(100 * total / Math.max(lost, 1e-9)).toFixed(0),
    median: +(sorted[sorted.length >> 1] ?? 0).toFixed(2), worst: +(sorted.at(-1) ?? 0).toFixed(2), inPass: list.filter(s => s.inPass).length };
}).sort((a, b) => b.lost - a.lost);
console.log("\nby rule (what held it), dearest first:");
console.log("  rule        count  races  lost s  share  median  worst  in a pass");
for (const t of table) console.log(`  ${t.rule.padEnd(10)} ${String(t.count).padStart(6)} ${String(t.races).padStart(6)} ${t.lost.toFixed(1).padStart(7)} ${`${t.share}%`.padStart(6)} ${t.median.toFixed(2).padStart(7)} ${t.worst.toFixed(2).padStart(6)} ${String(t.inPass).padStart(10)}`);

// The worst episodes, one per place: several races share a course's first kilometres, so one slowdown can be many rows.
const places = new Map<string, (typeof all)[number] & { rows: number }>();
for (const s of all) {
  const key = `${s.seed}|${s.t}|${s.along}`, seen = places.get(key);
  if (seen) seen.rows++; else places.set(key, { ...s, rows: 1 });
}
const worst = [...places.values()].sort((a, b) => b.lost - a.lost).slice(0, TOP);
console.log(`\nthe ${worst.length} dearest, one per place:`);
for (const s of worst) {
  const car = s.kind ? `${s.kind}#${s.id} ${s.going} at ${s.its} mph, ${s.ahead} m on, ${s.across} m across` : "no car";
  console.log(`  ${s.lost.toFixed(2)} s  ${s.rule.padEnd(9)} seed ${String(s.seed).padEnd(6)} ${s.race.padEnd(13)} t=${s.t} at ${s.along} m: ${s.speed} mph (plan ${s.plan}) asked ${s.asked}, went to ${s.lowest}, ${s.seconds} s${s.inPass ? ", in a pass" : ""}, ${s.off} m off its aim; ${car}${s.rows > 1 ? ` (${s.rows} races)` : ""}`);
  console.log(`         pnpm rival:scene ${s.race} --seed=${s.seed} --from=${Math.max(0, s.along - 150)} --to=${s.along + 60}`);
}
const json = arg("json");
if (json) { writeFileSync(json, JSON.stringify({ races, raced, lost, table, slowdowns: all }, null, 1)); console.log(`\nwrote ${json}`); }
