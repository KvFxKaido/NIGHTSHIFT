// Every car's measured card (src/sim/car-card.ts): what its tune does, driven on a
// flat world with nothing to hit. The instrument for tuning car-handling.ts; run it
// before and after a change and put both in design/HANDLING.md.
//
//   pnpm cars                 every car
//   pnpm cars bulwark cinder  just these
//   pnpm cars --json          the same facts, for tools
import RAPIER from "@dimforge/rapier3d-compat";
import { CAR_TUNES } from "../src/sim/car-handling.ts";
import { measureCar } from "../src/sim/car-card.ts";
import { carHandling } from "../src/sim/sim.ts";

await RAPIER.init();
const args = process.argv.slice(2);
const json = args.includes("--json");
const asked = args.filter(arg => !arg.startsWith("--"));
for (const car of asked) if (!Object.hasOwn(CAR_TUNES, car)) throw new Error(`Unknown car '${car}'. Cars: ${Object.keys(CAR_TUNES).join(", ")}`);
// "blender" is Sable's NS-01 under its asset id, the same tune as "ns01": list it once.
const cars = asked.length ? asked : Object.keys(CAR_TUNES).filter(car => car !== "blender");
const cards = cars.map(car => ({ ...measureCar(carHandling(car)), revision: CAR_TUNES[car]!.revision }));
if (json) {
  console.log(JSON.stringify(cards, null, 1));
} else {
  const columns: [string, (card: typeof cards[number]) => string][] = [
    ["car", card => `${card.car} r${card.revision}`], ["drive", card => card.drivetrain.toUpperCase()], ["kg", card => String(card.mass)],
    ["0-60 s", card => card.zeroToSixty.toFixed(2)], ["60-100 s", card => card.sixtyToHundred.toFixed(2)],
    ["top mph", card => card.topSpeed.toFixed(1)], ["100-0 m", card => card.stoppingDistance.toFixed(1)],
    ["lat m/s2", card => card.peakLateral.toFixed(2)], ["turn-in s", card => card.turnIn.toFixed(2)], ["hb slip", card => `${card.handbrakeSlip.toFixed(1)}°`],
  ];
  const rows = [columns.map(([title]) => title), ...cards.map(card => columns.map(([, cell]) => cell(card)))];
  const widths = columns.map((_, i) => Math.max(...rows.map(row => row[i]!.length)));
  for (const row of rows) console.log(row.map((cell, i) => i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
}
