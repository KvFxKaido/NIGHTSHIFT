// The golden master: fourteen long runs through every kind of vehicle the sim has,
// each hashed to Rapier's world snapshot and the sim state, so a change can be
// shown to move exactly what it should and nothing else (design/HANDLING.md, "Cars").
//
//   pnpm golden --save   before a change: record the baseline (recordings/golden.json, git-ignored)
//   pnpm golden          after it: compare, and name every run that moved
//   pnpm golden --json   the same facts, for tools
//
// Each run lists the cars in it, so a moved run says whose numbers moved it. A run
// that should have moved and did not is as much a finding as one that moved and
// should not have: retune a car on purpose and check its runs change. The `handling`
// field is left out of the state hash, so the resolved numbers alone never move a
// run; only what they do does. The harness itself reproduces its own hashes.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, resetSim, step, type Input, type Sim } from "../src/sim/sim.ts";
import { createAlderWorld, ALDER_RACE } from "../src/sim/alder.ts";
import { ALDER_RIVAL } from "../src/sim/alder-rival.ts";
import { ALDER_CRUISE } from "../src/sim/encounter.ts";
import { BLACKLIST_CRUISERS } from "../src/sim/alder-cruisers.ts";
import { RIVET, HARBOR_DRAG, DRAG_START, RIVET_DRAG_DRIVER } from "../src/sim/drag-event.ts";
import { SABLE, DRIFT_YARD } from "../src/sim/drift-yard.ts";
import { SABLE_DRIFT } from "../src/sim/drift-event.ts";
import { arenaEvent } from "../src/sim/arena-events.ts";
import { drawAlderCourse } from "../src/sim/alder-course.ts";

await RAPIER.init();
const args = new Set(process.argv.slice(2));
const file = fileURLToPath(new URL("../recordings/golden.json", import.meta.url));

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex").slice(0, 16);
// Throttle, part throttle, brakes, a swinging stick and a handbrake flick: slides,
// contact and, where the car pins itself, burnouts.
const pattern = (t: number): Input => ({
  throttle: t % 240 < 150 ? 1 : 0.3,
  brake: t % 240 >= 200 && t % 240 < 220 ? 0.8 : 0,
  steer: Math.sin(t / 37) * 0.8,
  handbrake: t % 300 >= 260 && t % 300 < 275 ? 1 : 0,
});
interface Run { name: string; cars: string; hash: string }
const runs: Run[] = [];
function run(name: string, cars: string, sim: Sim, ticks: number, input = pattern): void {
  for (let t = 0; t < ticks; t++) step(sim, input(t));
  const state = JSON.stringify(sim.state, (key, value) => key === "handling" ? undefined : value);
  runs.push({ name, cars, hash: `${sha(sim.world.takeSnapshot())} ${sha(state)}` });
}

for (const layout of ["fwd", "awd", "rwd"] as const) {
  const sim = createSim(layout);
  run(`blackglass ${layout}`, `player: shared ${layout}`, sim, 1200);
  resetSim(sim);
  run(`blackglass ${layout} after reset`, `player: shared ${layout}`, sim, 300);
  sim.world.free();
}
{
  const sim = createSim("rwd", createAlderWorld(true), { race: ALDER_RACE, rival: ALDER_RIVAL });
  run("sound to sky, rival", `player: shared rwd; rival: ${ALDER_RIVAL.car}`, sim, 2400);
  sim.world.free();
}
{
  const event = arenaEvent("full");
  const sim = createSim("awd", createAlderWorld(true, event.start), { race: event.race, rival: event.rival!, traffic: false });
  run("ridge circuit full, racing line", `player: shared awd; rival: ${event.rival!.car}`, sim, 3000,
    t => ({ ...pattern(t), steer: Math.sin(t / 53) * 0.5 }));
  sim.world.free();
}
{
  const sim = createSim("rwd", createAlderWorld(true, DRAG_START), { race: HARBOR_DRAG, rival: RIVET_DRAG_DRIVER, traffic: false });
  run("drag strip", `player: shared rwd; rival: ${RIVET_DRAG_DRIVER.car}`, sim, 900,
    t => ({ throttle: 1, brake: 0, steer: 0, handbrake: 0, shiftUp: t % 90 === 0 }));
  sim.world.free();
}
{
  const sim = createSim("rwd", createAlderWorld(true, DRIFT_YARD.start), { race: SABLE_DRIFT, traffic: false, parkedRivals: [SABLE] });
  run("drift yard, Sable parked", `player: shared rwd; parked: ${SABLE.car}`, sim, 1200);
  sim.world.free();
}
{
  const sim = createSim("rwd", createAlderWorld(false), { encounterRoute: ALDER_CRUISE, parkedRivals: [RIVET, SABLE],
    cruisers: BLACKLIST_CRUISERS.map(cruiser => ({ id: cruiser.id, name: cruiser.name, route: cruiser.route })) });
  // A burnout first: e-brake and gas at rest, swinging, then let go and drive.
  run("free roam: burnout, Moth, cruisers, traffic", `player: shared rwd; Moth: ${ALDER_CRUISE.car}; parked: ${RIVET.car}, ${SABLE.car}; `
    + `cruisers: ${BLACKLIST_CRUISERS.map(cruiser => cruiser.car).join(", ")}`, sim, 1500,
    t => t < 200 ? { throttle: 1, brake: 0, steer: t < 100 ? 1 : -1, handbrake: 1 } : pattern(t));
  sim.world.free();
}
for (const id of ["gen-stray-5", "gen-deuce-3", "gen-crest-8-unordered"]) {
  const course = drawAlderCourse(id, null);
  const sim = createSim("rwd", createAlderWorld(true, course.start ?? undefined), { race: course.race, rival: course.rival });
  run(id, `player: shared rwd; rival: ${course.rival.car}`, sim, 1800);
  sim.world.free();
}

if (args.has("--save")) {
  await mkdir(fileURLToPath(new URL("../recordings/", import.meta.url)), { recursive: true });
  await writeFile(file, JSON.stringify(runs, null, 1));
  console.log(`Saved ${runs.length} runs to recordings/golden.json. Make the change, then run pnpm golden to compare.`);
  process.exit(0);
}
const baseline = JSON.parse(await readFile(file, "utf8").catch(() => "null")) as Run[] | null;
if (!baseline) {
  console.log("No baseline yet: run pnpm golden --save on the tree before your change.");
  process.exit(1);
}
const report = runs.map(now => {
  const was = baseline.find(old => old.name === now.name);
  return { ...now, status: !was ? "new" : was.hash === now.hash ? "same" : "moved" };
});
const gone = baseline.filter(old => !runs.some(now => now.name === old.name)).map(old => old.name);
if (args.has("--json")) {
  console.log(JSON.stringify({ runs: report, gone }, null, 1));
} else {
  for (const entry of report) console.log(`${entry.status === "same" ? "same " : entry.status.toUpperCase()}  ${entry.name.padEnd(46)} ${entry.cars}`);
  if (gone.length) console.log(`not run any more: ${gone.join(", ")}`);
  const moved = report.filter(entry => entry.status !== "same").length;
  console.log(`\n${report.length - moved} of ${report.length} bit-identical to the baseline.`);
}
