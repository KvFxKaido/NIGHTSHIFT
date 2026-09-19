// Every car's measured card (src/sim/car-card.ts): what its tune does, driven on a
// flat world with nothing to hit. The instrument for tuning car-handling.ts; run it
// before and after a change and put both in design/HANDLING.md.
//
//   pnpm cars                         every car
//   pnpm cars bulwark cinder          just these
//   pnpm cars bulwark --try='{"power":0.7}'
//                                     also the car with these knobs over its tune ("bulwark*")
//   pnpm cars cinder bulwark --laps   also AI laps: the rival's planner driving each car
//                                     round Ridge Circuit's layouts and Uptown clear (slow)
//   pnpm cars --json                  the same facts, for tools
//
// AI laps are the same driver in each car, never a pad lap: no launch, no handbrake,
// cornering at about 0.8 of grip, and no use of rear-drive rotation. Compare one car
// with another, never with a person's lap times (design/HANDLING.md, "Cars").
import RAPIER from "@dimforge/rapier3d-compat";
import { CAR_TUNES, type CarTune } from "../src/sim/car-handling.ts";
import { measureCar } from "../src/sim/car-card.ts";
import { carHandling } from "../src/sim/sim.ts";

await RAPIER.init();
const args = process.argv.slice(2);
const json = args.includes("--json"), laps = args.includes("--laps");
const tried = args.find(arg => arg.startsWith("--try="));
const asked = args.filter(arg => !arg.startsWith("--"));
for (const car of asked) if (!Object.hasOwn(CAR_TUNES, car)) throw new Error(`Unknown car '${car}'. Cars: ${Object.keys(CAR_TUNES).join(", ")}`);
// "blender" is Sable's NS-01 under its asset id, the same tune as "ns01": list it once.
const cars = asked.length ? [...asked] : Object.keys(CAR_TUNES).filter(car => car !== "blender");
if (tried) {
  if (asked.length !== 1) throw new Error("--try bends one car's tune: name exactly one car");
  // A candidate is registered for this run only, under its own id, so the rival's
  // planner (which reads a car by id) and the tyres see the same numbers, as a real
  // rival's do. Nothing is written back.
  const knobs = JSON.parse(tried.slice("--try=".length)) as Partial<CarTune>;
  (CAR_TUNES as Record<string, CarTune>)[`${asked[0]}*`] = { ...CAR_TUNES[asked[0]!]!, ...knobs };
  cars.push(`${asked[0]}*`);
}

type Row = ReturnType<typeof measureCar> & { revision: number; laps?: Record<string, { first: number; best: number }> };
const rows: Row[] = [];
const circuits = ["arena-full", "arena-east", "arena-ridge", "street-uptown-clear"];
const lapTools = laps ? {
  ...(await import("../src/sim/circuits.ts")), ...(await import("../src/sim/alder.ts")),
  ...(await import("../src/sim/rival.ts")), ...(await import("../src/sim/sim.ts")),
} : null;
for (const car of cars) {
  const row: Row = { ...measureCar(carHandling(car)), revision: CAR_TUNES[car]!.revision };
  if (lapTools) {
    const { circuitEvent, createAlderWorld, createRivalDriver, rivalInput, createSim, step, TICK_HZ } = lapTools;
    row.laps = {};
    for (const raceId of circuits) {
      const event = circuitEvent(raceId, 3)!;
      // From the rival's own grid slot, on its own line, in this car.
      const route = { ...event.rival!, car };
      const sim = createSim(carHandling(car), createAlderWorld(true, route.start), { race: event.race, traffic: false });
      const driver = createRivalDriver();
      try {
        for (let tick = 0; !sim.state.race!.finished && tick < 600 * TICK_HZ; tick++) {
          step(sim, rivalInput(route, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, [], null));
        }
        const gates = event.race.gatesPerLap ?? event.race.checkpoints.length, splits = sim.state.race!.splits;
        const ends = [1, 2, 3].map(lap => splits[lap * gates - 1] ?? NaN);
        const times = ends.map((end, i) => (end - (i ? ends[i - 1]! : 0)) / TICK_HZ);
        row.laps[raceId] = { first: Math.round(times[0]! * 100) / 100, best: Math.round(Math.min(times[1]!, times[2]!) * 100) / 100 };
      } finally { sim.world.free(); }
    }
  }
  rows.push(row);
}

if (json) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const columns: [string, (row: Row) => string][] = [
    ["car", row => `${row.car} r${row.revision}`], ["drive", row => row.drivetrain.toUpperCase()], ["kg", row => String(row.mass)],
    ["0-60 s", row => row.zeroToSixty.toFixed(2)], ["60-100 s", row => row.sixtyToHundred.toFixed(2)],
    ["top mph", row => row.topSpeed.toFixed(1)], ["100-0 m", row => row.stoppingDistance.toFixed(1)],
    ["lat m/s2", row => row.peakLateral.toFixed(2)], ["turn-in s", row => row.turnIn.toFixed(2)], ["hb slip", row => `${row.handbrakeSlip.toFixed(1)}°`],
    ...(laps ? circuits.map((raceId): [string, (row: Row) => string] => [raceId.replace("street-", ""), row => row.laps![raceId]!.best.toFixed(2)]) : []),
  ];
  const table = [columns.map(([title]) => title), ...rows.map(row => columns.map(([, cell]) => cell(row)))];
  const widths = columns.map((_, i) => Math.max(...table.map(line => line[i]!.length)));
  for (const line of table) console.log(line.map((cell, i) => i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
  if (laps) console.log("\nAI laps: best flying lap of three, in seconds, the rival's planner driving (not a pad lap).");
}
