// You against the rival, corner by corner, from one recorded race.
//
// A session holds the player's input log, and (start state + input log)
// reproduces the run, rival included. So this replays the session and records
// the rival through the same recorder the player was recorded with: both cars
// then have the same channels, tick for tick, from the same race. Nothing about
// the rival is stored in the file, and nothing needs to be.
//
//   pnpm laps:compare                      the newest raced session
//   pnpm laps:compare <substring>          the newest whose name contains it
//   pnpm laps:compare <path to a .json>    that file, wherever it is
//   pnpm laps:compare --json               the same facts, for tools
//
// It refuses a session that does not replay exactly on this build, and says why:
// a comparison against a run that diverged would be a comparison against nothing.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { createAlderWorld } from "../src/sim/alder.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import { createLapRecorder, recordTick, type LapSession, type RecordedLap } from "../src/sim/lap-recorder.ts";
import { replayLapSession } from "../src/sim/lap-replay.ts";
import type { RivalDefinition } from "../src/sim/rival.ts";
import { carHandling, createSim, step, TICK_HZ, type Drivetrain } from "../src/sim/sim.ts";

const MPH = 2.23694;
/** Metres either side of a gate that count as its corner, and where entry and exit speed are read. */
const WINDOW = 70;

export interface CornerSide { minMph: number; entryMph: number; exitMph: number; seconds: number; offsetAtApex: number; widest: number }
export interface Corner { lap: number; gate: number; you: CornerSide; rival: CornerSide }
export interface Comparison {
  race: string; car: string; pedalAssist: number;
  laps: { lap: number; you: number | null; rival: number | null }[];
  corners: Corner[];
  /** Seconds you gained on the rival inside corner windows, and everywhere else, over the laps both finished. */
  gainedInCorners: number; gainedElsewhere: number;
  /** Whether the player's laps came out exactly as the file has them. Always true for the rival that was raced; against
   *  another (`rival`, an experiment) it is the check that the two never touched, so the player's run is still the player's. */
  playerReproduced: boolean;
  /** The rival's own race: how often it was put back on its line, and its worst distance from the lap's centreline. */
  rivalResets: number; rivalWidest: number;
}

function side(lap: RecordedLap, gate: number): CornerSide | null {
  const { tick, speed, distance, offset } = lap.samples;
  const at = tick.indexOf(lap.gateTicks[gate]!);
  if (at < 0) return null;
  const centre = distance[at]!;
  let first = at, last = at;
  while (first > 0 && centre - distance[first - 1]! <= WINDOW) first--;
  while (last < distance.length - 1 && distance[last + 1]! - centre <= WINDOW) last++;
  let apex = first;
  for (let i = first; i <= last; i++) if (speed[i]! < speed[apex]!) apex = i;
  let widest = 0;
  for (let i = first; i <= last; i++) widest = Math.max(widest, Math.abs(offset[i]!));
  return { minMph: speed[apex]! * MPH, entryMph: speed[first]! * MPH, exitMph: speed[last]! * MPH,
    seconds: (last - first) / TICK_HZ, offsetAtApex: offset[apex]!, widest };
}

/** `rival` swaps in another driver for the same race and the same input log: an experiment, judged against the player's fixed run. */
export function compareSession(session: LapSession, rival?: RivalDefinition): Comparison {
  const raced = circuitEvent(session.race, session.laps);
  if (!raced?.rival) throw new Error(`${session.race} has no rival to compare with: race one without -solo`);
  const event = { ...raced, rival: rival ?? raced.rival };
  const handling = carHandling(session.car, session.drivetrain as Drivetrain);
  const sim = createSim(handling, createAlderWorld(true, event.start),
    { race: event.race, rival: event.rival, traffic: event.traffic, pedalAssist: session.pedalAssist ?? 1 });
  try {
    const you = createLapRecorder(event.track), theirs = createLapRecorder(event.track);
    const { throttle, brake, steer, handbrake } = session.inputs;
    for (let i = 0; i < throttle.length; i++) {
      const input = { throttle: throttle[i]!, brake: brake[i]!, steer: steer[i]!, handbrake: handbrake[i]! };
      step(sim, input);
      recordTick(you, input, sim.state.vehicle, sim.state.race, TICK_HZ);
      const driver = sim.state.rival!;
      recordTick(theirs, driver.input, driver.vehicle, driver.race, TICK_HZ);
    }
    const laps = Array.from({ length: Math.max(you.laps.length, theirs.laps.length) }, (_, i) =>
      ({ lap: i + 1, you: you.laps[i]?.seconds ?? null, rival: theirs.laps[i]?.seconds ?? null }));
    const corners: Corner[] = [];
    let gainedInCorners = 0, total = 0;
    for (let i = 0; i < Math.min(you.laps.length, theirs.laps.length); i++) {
      total += theirs.laps[i]!.seconds - you.laps[i]!.seconds;
      // The last gate is the finish line, which is a corner on the street circuit as any other gate is.
      for (let gate = 0; gate < event.track.gatesPerLap; gate++) {
        const mine = side(you.laps[i]!, gate), other = side(theirs.laps[i]!, gate);
        if (!mine || !other) continue;
        corners.push({ lap: i + 1, gate: gate + 1, you: mine, rival: other });
        gainedInCorners += other.seconds - mine.seconds;
      }
    }
    const playerReproduced = you.laps.length === session.recorded.length && you.laps.every((lap, i) => JSON.stringify(lap) === JSON.stringify(session.recorded[i]));
    const rivalWidest = Math.max(0, ...theirs.laps.flatMap(lap => lap.samples.offset.map(Math.abs)));
    return { race: session.race, car: session.car, pedalAssist: session.pedalAssist ?? 1, laps, corners, gainedInCorners, gainedElsewhere: total - gainedInCorners,
      playerReproduced, rivalResets: sim.state.rival!.driver.resets, rivalWidest };
  } finally { sim.world.free(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = fileURLToPath(new URL("../recordings/laps/", import.meta.url));
  const args = process.argv.slice(2), json = args.includes("--json"), wanted = args.find(arg => !arg.startsWith("--"));
  const files = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith(".json")).sort();
  await RAPIER.init();
  // Newest first, and the first that was raced against somebody.
  let chosen: { name: string; session: LapSession } | null = null;
  if (wanted?.endsWith(".json") && await stat(wanted).then(found => found.isFile(), () => false)) {
    chosen = { name: wanted, session: JSON.parse(await readFile(wanted, "utf8")) as LapSession };
  } else for (const name of files.reverse()) {
    if (wanted && !name.includes(wanted)) continue;
    const session = JSON.parse(await readFile(join(dir, name), "utf8")) as LapSession;
    if (session.solo && !wanted) continue;
    chosen = { name, session };
    break;
  }
  if (!chosen) { console.log(wanted ? `No recording matches '${wanted}'.` : "No raced recording yet. Drive ?race=street-uptown-clear or ?race=arena-full under pnpm dev."); process.exit(1); }
  const replayed = replayLapSession(chosen.session);
  if (!replayed.ok) { console.log(`${chosen.name} does not replay on this build, so there is no rival to compare with: ${replayed.reason}`); process.exit(1); }
  const result = compareSession(chosen.session);
  if (json) console.log(JSON.stringify({ file: chosen.name, ...result }, null, 2));
  else {
    const time = (seconds: number | null) => seconds === null ? "  --   " : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
    console.log(`${chosen.name}  ${result.race} · ${result.car} · pedal assist ${result.pedalAssist} · replays exactly\n`);
    for (const lap of result.laps) console.log(`  lap ${lap.lap}   you ${time(lap.you)}   rival ${time(lap.rival)}${lap.you !== null && lap.rival !== null ? `   you by ${(lap.rival - lap.you).toFixed(2)} s` : ""}`);
    console.log(`\n  Over the laps you both finished: ${result.gainedInCorners.toFixed(2)} s gained within ${WINDOW} m of a gate, ${result.gainedElsewhere.toFixed(2)} s everywhere else.\n`);
    console.log("  lap gate   slowest mph        into it mph        out of it mph      seconds through    metres off the centreline at the slowest point (widest)");
    console.log("             you   rival        you   rival        you   rival        you   rival        you            rival");
    const n = (value: number, width = 5, digits = 0) => value.toFixed(digits).padStart(width);
    for (const c of result.corners) {
      console.log(`  ${String(c.lap).padStart(3)} ${String(c.gate).padStart(4)}   ${n(c.you.minMph)}  ${n(c.rival.minMph)}       ${n(c.you.entryMph)}  ${n(c.rival.entryMph)}       ${n(c.you.exitMph)}  ${n(c.rival.exitMph)}       ${n(c.you.seconds, 5, 2)}  ${n(c.rival.seconds, 5, 2)}       ${n(c.you.offsetAtApex, 5, 1)} (${n(c.you.widest, 4, 1)})   ${n(c.rival.offsetAtApex, 5, 1)} (${n(c.rival.widest, 4, 1)})`);
    }
    const mean = (pick: (c: Corner) => number) => result.corners.reduce((sum, c) => sum + pick(c), 0) / Math.max(1, result.corners.length);
    console.log(`\n  On average through a corner: you ${mean(c => c.you.minMph).toFixed(0)} mph at the slowest against ${mean(c => c.rival.minMph).toFixed(0)}, ${mean(c => Math.abs(c.you.offsetAtApex)).toFixed(1)} m from the centreline there against ${mean(c => Math.abs(c.rival.offsetAtApex)).toFixed(1)}, using ${mean(c => c.you.widest).toFixed(1)} m of road against ${mean(c => c.rival.widest).toFixed(1)}.`);
  }
}
