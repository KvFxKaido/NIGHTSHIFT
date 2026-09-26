// Lap recordings at a glance: one line per lap of every session in
// recordings/laps, newest session last. `--verify` also replays each session
// against this build and says whether it reproduces (src/sim/lap-replay.ts).
//
//   pnpm laps            summary
//   pnpm laps --verify   summary and replay check
//   pnpm laps --json     the same facts, for tools
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LapSession } from "../src/sim/lap-recorder.ts";

const dir = fileURLToPath(new URL("../recordings/laps/", import.meta.url));
const args = new Set(process.argv.slice(2));
const files = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith(".json")).sort();
if (!files.length) {
  console.log("No lap recordings yet. Drive a circuit race (?race=arena-full-solo, ?race=street-uptown-clear-solo) or finish a generated one (?race=gen-tally-7) under pnpm dev and it saves to recordings/laps.");
  process.exit(0);
}
// Replaying needs the physics engine; a plain summary does not load it, or the map.
const replay = args.has("--verify") ? (await import("../src/sim/lap-replay.ts")).replayLapSession : null;
if (replay) await (await import("@dimforge/rapier3d-compat")).default.init();
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
const report = [];
for (const name of files) {
  const session = JSON.parse(await readFile(join(dir, name), "utf8")) as LapSession;
  const verified = replay ? replay(session) : null;
  report.push({ file: name, race: session.race, traffic: session.traffic ?? false, car: session.car, drivetrain: session.drivetrain, physics: session.physics, verified,
    // How the log ended when not at a saved lap (2026-09-26), and how long it runs.
    ...(session.ended ? { ended: session.ended } : {}), seconds: +(session.inputs.throttle.length / (session.tickHz || 60)).toFixed(1),
    laps: session.recorded.map(lap => ({ lap: lap.lap, seconds: lap.seconds, valid: lap.valid, reasons: lap.reasons, standingStart: lap.standingStart,
      topSpeedMph: Math.round(lap.topSpeed * 2.23694), offTrackTicks: lap.offTrackTicks })) });
}
if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const session of report) {
    const check = session.verified ? session.verified.ok ? " · replays exactly" : ` · DOES NOT REPLAY: ${session.verified.reason}` : "";
    console.log(`${session.file}  ${session.race}${session.traffic ? " · traffic" : ""} · ${session.car} ${session.drivetrain.toUpperCase()} · ${session.physics}${check}`);
    for (const lap of session.laps) {
      console.log(`  lap ${lap.lap}  ${time(lap.seconds)}  ${lap.valid ? "valid  " : "INVALID"}  ${String(lap.topSpeedMph).padStart(3)} mph top${lap.standingStart ? "  standing start" : ""}${lap.reasons.length ? `  (${lap.reasons.join(", ")})` : ""}`);
    }
    if (session.ended) console.log(`  ended by ${session.ended === "restart" ? "a restart" : "leaving the race"}, ${session.seconds} s of log${session.laps.length ? ", past its last completed lap" : ", no completed laps"}`);
    else if (!session.laps.length) console.log("  no completed laps");
  }
}
