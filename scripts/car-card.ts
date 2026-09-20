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
//   pnpm cars cinder bulwark --streets also six fixed generated sprints, clear and in traffic
//                                     combines with --laps; clear pace and traffic incidents
//   pnpm cars cinder ns01 --drift     also Sable's 90-second yard event, closed-loop driver
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
const streets = args.includes("--streets");
const drift = args.includes("--drift");
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

type StreetResult = { seconds: number | null; resets: number; unseenResets: number; recoveries: number };
type Row = ReturnType<typeof measureCar> & {
  revision: number;
  drift?: ReturnType<typeof import("./drift-driver.ts").measureDrift>;
  laps?: Record<string, { first: number; best: number }>;
  streets?: Record<string, { clear: StreetResult; traffic: StreetResult; trafficCost: number | null }>;
  streetSummary?: { sprints: string[]; total: number | null; versusCinder: number | null;
    traffic: { dnfs: number; recoveries: number; costSprints: string[]; cost: number | null } };
};
const rows: Row[] = [];
const circuits = ["arena-full", "arena-east", "arena-ridge", "street-uptown-clear"];
// Fixed grid draws, checked with alderCourseDraws: plain seeds cover the east's
// cross streets and ridge; turf draws add downtown, the waterfront and Queen Anne.
// Chosen by geography (2.5–4.8 km), not by which car wins or avoids traffic.
const sprints = ["gen-1", "gen-7", "gen-15", "gen-moth-12", "gen-crest-23", "gen-wake-42"];
const streetLimit = 300; // Seconds after the flag, enough for slow runs and reversing.
const streetTools = streets ? {
  ...(await import("../src/sim/alder-course.ts")), ...(await import("../src/sim/alder.ts")),
  ...(await import("../src/sim/rival.ts")), ...(await import("../src/sim/sim.ts")),
  ...(await import("../src/sim/traffic.ts")),
} : null;
const courses = streetTools ? sprints.map(id => {
  if (!streetTools.alderCourseDraws(id, null)) throw new Error(`Street benchmark '${id}' no longer draws`);
  return streetTools.drawAlderCourse(id, null);
}) : [];
const lapTools = laps ? {
  ...(await import("../src/sim/circuits.ts")), ...(await import("../src/sim/alder.ts")),
  ...(await import("../src/sim/rival.ts")), ...(await import("../src/sim/sim.ts")),
} : null;
const driftTools = drift ? await import("./drift-driver.ts") : null;
for (const car of cars) {
  const row: Row = { ...measureCar(carHandling(car)), revision: CAR_TUNES[car]!.revision };
  if (driftTools) row.drift = driftTools.measureDrift(car);
  if (lapTools) {
    const { circuitEvent, createAlderWorld, createRivalDriver, rivalInput, createSim, step, TICK_HZ } = lapTools;
    row.laps = {};
    for (const raceId of circuits) {
      // Uptown is driven on the route the rival has in traffic, the centreline with its lane arcs, on clear streets:
      // what this column has always measured, and what every street race but Uptown / Clear is driven on. The clear
      // race's own rival has a racing line since 2026-09-20, which would move every car's number for no tune.
      const event = circuitEvent(raceId === "street-uptown-clear" ? "street-uptown" : raceId, 3)!;
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
  if (streetTools) {
    const { createAlderWorld, createRivalDriver, rivalInput, createSim, step, TICK_HZ, TRAFFIC_KINDS } = streetTools;
    row.streets = {};
    for (const course of courses) {
      const route = { ...course.rival, car };
      const runs = {} as Record<"clear" | "traffic", StreetResult>;
      for (const mode of ["clear", "traffic"] as const) {
        const sim = createSim(carHandling(car), createAlderWorld(true, course.start ?? undefined), { race: course.race, traffic: mode === "traffic" });
        const driver = createRivalDriver();
        try {
          while (!sim.state.race!.finished && sim.state.race!.ticks < streetLimit * TICK_HZ) {
            const obstacles = mode === "clear" ? [] : (sim.state.traffic?.vehicles ?? []).map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }));
            step(sim, rivalInput(route, { vehicle: sim.state.vehicle, driver, race: sim.state.race }, obstacles, null));
          }
          const race = sim.state.race!;
          // The player rig has no rival teleport recovery; these counters stay zero.
          // Reversing recoveries do run in rivalInput and help explain a slow finish.
          runs[mode] = { seconds: race.finished ? race.ticks / TICK_HZ : null,
            resets: driver.resets, unseenResets: driver.unseenResets, recoveries: driver.recoveries };
        } finally { sim.world.free(); }
      }
      row.streets[course.race.id] = { ...runs, trafficCost: runs.clear.seconds !== null && runs.traffic.seconds !== null
        ? runs.traffic.seconds - runs.clear.seconds : null };
    }
  }
  rows.push(row);
}

if (streets) {
  const common = sprints.filter(id => rows.every(row => row.streets![id]!.clear.seconds !== null));
  const total = (row: Row) => common.reduce((sum, id) => sum + row.streets![id]!.clear.seconds!, 0);
  const cinder = rows.find(row => row.car === "cinder");
  for (const row of rows) {
    // Traffic costs require both finishes; a DNF is not a 300-second finish.
    const costSprints = sprints.filter(id => row.streets![id]!.trafficCost !== null);
    row.streetSummary = { sprints: common, total: common.length ? total(row) : null,
      versusCinder: common.length && cinder ? (total(row) / total(cinder) - 1) * 100 : null,
      traffic: { dnfs: sprints.filter(id => row.streets![id]!.traffic.seconds === null).length,
        recoveries: sprints.reduce((sum, id) => sum + row.streets![id]!.traffic.recoveries, 0),
        costSprints, cost: costSprints.length ? costSprints.reduce((sum, id) => sum + row.streets![id]!.trafficCost!, 0) : null } };
  }
}

if (json) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const columns: [string, (row: Row) => string][] = [
    ["car", row => `${row.car} r${row.revision}`], ["drive", row => row.drivetrain.toUpperCase()], ["kg", row => String(row.mass)],
    ["0-60 s", row => row.zeroToSixty.toFixed(2)], ["60-100 s", row => row.sixtyToHundred.toFixed(2)],
    ["top mph", row => row.topSpeed.toFixed(1)], ["100-0 m", row => row.stoppingDistance.toFixed(1)],
    ["lat m/s2", row => row.peakLateral.toFixed(2)], ["turn-in s", row => row.turnIn.toFixed(2)], ["hb slip", row => `${row.handbrakeSlip.toFixed(1)}°`],
    ["slide s", row => row.slideSeconds.toFixed(2)], ["slide deg", row => `${row.slideAngle.toFixed(1)}°`],
    ...(laps ? circuits.map((raceId): [string, (row: Row) => string] => [raceId.replace("street-", ""), row => row.laps![raceId]!.best.toFixed(2)]) : []),
  ];
  const table = [columns.map(([title]) => title), ...rows.map(row => columns.map(([, cell]) => cell(row)))];
  const widths = columns.map((_, i) => Math.max(...table.map(line => line[i]!.length)));
  for (const line of table) console.log(line.map((cell, i) => i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
  console.log("Slide: seconds held between 12° and 55° of body slip over nine flick entries at 25 m/s, one hold law for every car, and the mean angle over them. This is how sideways the CAR goes; the drift event below is a score.");
  if (laps) console.log("\nAI laps: best flying lap of three, in seconds, the rival's planner driving (not a pad lap).");
  if (drift) {
    console.log("\nAI drift: Sable's 90-second yard event; angles only on scoring drift ticks.");
    const columns: [string, (row: Row) => string][] = [
      ["car", row => row.car], ["score", row => String(row.drift!.score)],
      ["target", row => String(row.drift!.targetScore)], ["won", row => row.drift!.won ? "yes" : "no"],
      ["mean deg", row => row.drift!.meanAngle.toFixed(2)], ["best deg", row => row.drift!.bestAngle.toFixed(2)],
      ["drift ticks", row => `${row.drift!.driftingTicks}/${row.drift!.ticks}`],
      ["drift %", row => (row.drift!.driftingShare * 100).toFixed(2)],
      ["links", row => String(row.drift!.transitions)], ["clips", row => String(row.drift!.clips)],
      ["spins", row => String(row.drift!.spins)], ["contacts", row => String(row.drift!.contacts)],
      ["left yard", row => row.drift!.leftBounds ? "yes" : "no"],
    ];
    const table = [columns.map(([title]) => title), ...rows.map(row => columns.map(([, cell]) => cell(row)))];
    const widths = columns.map((_, i) => Math.max(...table.map(line => line[i]!.length)));
    for (const line of table) console.log(line.map((cell, i) => i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
    console.log("Spins and contacts count episodes (consecutive ticks count once); countdown excluded. Same driver, no launch or resets.");
    console.log("The score is the EVENT's verdict under one scripted driver, not a ranking of cars: it is a chain game, so a car that");
    console.log("banks fewer, longer chains outscores one that drifts more in shorter ones (measured 2026-09-19: the Hammer takes 7,231");
    console.log("to the NS-01's 6,558 on identical clips and links and LESS raw chain). Rank drift on the card's slide columns.");
  }
  if (streets) {
    console.log(`\nAI street pace (traffic off): seconds; DNF at ${streetLimit} s after the flag.`);
    const columns: [string, (row: Row) => string][] = [
      ["car", row => row.car],
      ...sprints.map((id): [string, (row: Row) => string] => [id, row => {
        const run = row.streets![id]!.clear;
        return run.seconds === null ? "DNF" : run.seconds.toFixed(2);
      }]),
      ["total s", row => row.streetSummary!.total?.toFixed(2) ?? "N/A"],
      ["vs Cinder", row => {
        const percent = row.streetSummary!.versusCinder;
        return percent === null ? "N/A" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
      }],
    ];
    const table = [columns.map(([title]) => title), ...rows.map(row => columns.map(([, cell]) => cell(row)))];
    const widths = columns.map((_, i) => Math.max(...table.map(line => line[i]!.length)));
    for (const line of table) console.log(line.map((cell, i) => i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
    console.log(`Clear totals use only sprints every measured car finished: ${rows[0]!.streetSummary!.sprints.join(", ") || "none"}. Minus means quicker.`);
    console.log("\nAI street incidents (traffic on): traffic minus clear seconds / reversing recoveries per sprint; DNF has no time cost.");
    const incidentColumns: [string, (row: Row) => string][] = [
      ["car", row => row.car],
      ...sprints.map((id): [string, (row: Row) => string] => [id, row => {
        const run = row.streets![id]!;
        return `${run.traffic.seconds === null ? "DNF" : run.trafficCost?.toFixed(2) ?? "N/A"} / ${run.traffic.recoveries}`;
      }]),
      ["DNFs", row => String(row.streetSummary!.traffic.dnfs)],
      ["recoveries", row => String(row.streetSummary!.traffic.recoveries)],
      ["cost s", row => row.streetSummary!.traffic.cost?.toFixed(2) ?? "N/A"],
      ["paired", row => `${row.streetSummary!.traffic.costSprints.length}/${sprints.length}`],
    ];
    const incidents = [incidentColumns.map(([title]) => title), ...rows.map(row => incidentColumns.map(([, cell]) => cell(row)))];
    const incidentWidths = incidentColumns.map((_, i) => Math.max(...incidents.map(line => line[i]!.length)));
    for (const line of incidents) console.log(line.map((cell, i) => i === 0 ? cell.padEnd(incidentWidths[i]!) : cell.padStart(incidentWidths[i]!)).join("  "));
    console.log("Traffic costs sum only paired finishes per car, not pace; negative costs are possible when traffic changes the driven line.");
    console.log("Player rig: rival teleport resets are unavailable (zero); reversing recovery is active. No rival, no launch.");
  }
}
