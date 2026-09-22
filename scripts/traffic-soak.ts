// Traffic alone for ten minutes under each traffic seed: what stood still for over a minute, the longest stand, and
// what is still standing at the end. What the trap in CLAUDE.md asks for before trusting a change to how traffic waits
// at its lines: a test that runs two minutes at the shipped density passed through two locks (2026-09-20).
//
//   pnpm traffic:soak                 seed 0 and eleven others, the spread measured on 2026-09-22
//   pnpm traffic:soak 0 1000 271828   those seeds
//   pnpm traffic:soak --minutes=5     a shorter soak
//   pnpm traffic:soak --json          one object per seed
//
// Seed 0 is the traffic every run had until traffic took a seed per race attempt (createTraffic). It is the layout
// every traffic fix was soaked against, so it is the cleanest: judge a change on the others.
import { createAlderWorld } from "../src/sim/alder.ts";
import { DT } from "../src/sim/sim.ts";
import { createTraffic, stepTraffic } from "../src/sim/traffic.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const minutes = Number(args.find(arg => arg.startsWith("--minutes="))?.slice(10) ?? 10);
const given = args.filter(arg => !arg.startsWith("--")).map(Number);
const seeds = given.length ? given : [0, 1, 2, 7, 42, 99, 1000, 123456, 271828, 314159, 2147483647, 3735928559];
if (seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error("Seeds are whole numbers from 0 to 4294967295.");

const network = createAlderWorld(true).traffic!;
for (const seed of seeds) {
  const state = createTraffic(network, undefined, seed);
  const standing = new Map<number, number>(), longest = new Map<number, number>();
  for (let tick = 0; tick < minutes * 60 * 60; tick++) {
    stepTraffic(network, state, DT);
    for (const vehicle of state.vehicles) {
      const run = vehicle.speed < 0.5 ? (standing.get(vehicle.id) ?? 0) + 1 : 0;
      standing.set(vehicle.id, run);
      if (run > (longest.get(vehicle.id) ?? 0)) longest.set(vehicle.id, run);
    }
  }
  const overAMinute = [...longest.entries()].filter(([, ticks]) => ticks > 60 * 60).sort((a, b) => b[1] - a[1])
    .map(([id, ticks]) => ({ id, seconds: Math.round(ticks / 60), lane: state.vehicles[id]!.lane }));
  const result = { seed, vehicles: state.vehicles.length, longestSeconds: Math.round(Math.max(0, ...longest.values()) / 60),
    overAMinute: overAMinute.length, stillStanding: [...standing.values()].filter(ticks => ticks > 60 * 60).length, worst: overAMinute.slice(0, 5) };
  if (json) { console.log(JSON.stringify(result)); continue; }
  console.log(`seed ${String(seed).padStart(10)}: longest stand ${String(result.longestSeconds).padStart(3)} s, ${String(result.overAMinute).padStart(2)} stood over a minute, `
    + `${result.stillStanding} still standing${result.worst.length ? "  (" + result.worst.map(w => `#${w.id} ${w.seconds} s lane ${w.lane}`).join(", ") + ")" : ""}`);
}
