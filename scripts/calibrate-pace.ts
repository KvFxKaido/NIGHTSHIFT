// The route-choice pace model against laps Shawn drove.
//
// `PACE` in src/sim/route-choice.ts prices a street as straight-equivalent
// metres over a committed pace plus a cost per bend, bend90 x (degrees / 90)^1.5,
// and routes on a line graph where a junction turn costs the same way. Both
// constants began as guesses, 32 m/s and 2.5 s (design/PROCEDURAL_RACES.md,
// step 3). This fits them to recorded Uptown Circuit laps, which drive ten
// junction turns from 52 to 129 degrees on streets 12-20 m wide, and reports
// what the fit leaves over and how far off the constants in PACE are.
//
// Each lap is cut into windows at the midpoints between turn gates, so each
// window holds one junction turn and the straights either side. In the model's
// own terms a window costs
//
//   time = metres / top + bend90 x sum((degrees / 90)^p)
//
// where metres is the model's straight time for the streets it covers times
// PACE.top (width and grade included, as the model has them) and the sum runs
// over the model's own turn angles: junction turns from the routing graph's
// drives and bends inside each street's polyline. That is linear in 1/top and
// bend90, so it is least squares, for p = 1, 1.5 and 2. Only valid laps count,
// as the recorder judged them; a standing start's first window is left out.
//
// It reads recordings and changes nothing.
//
//   pnpm pace          the fit
//   pnpm pace --json   the same facts, for tools
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALDER_STREETS, alderRouting } from "../src/sim/alder.ts";
import { PACE } from "../src/sim/route-choice.ts";
import { UPTOWN, STREET_CIRCUIT_IDENTITY } from "../src/sim/street-circuit.ts";
import type { LapSession } from "../src/sim/lap-recorder.ts";

const asJson = process.argv.includes("--json");
const graph = alderRouting();
const streets = new Map(ALDER_STREETS.map(street => [street.id, street]));

const angleAt = (a: { x: number; z: number }, p: { x: number; z: number }, b: { x: number; z: number }) => {
  const ux = p.x - a.x, uz = p.z - a.z, vx = b.x - p.x, vz = b.z - p.z;
  const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv)))) * 180 / Math.PI;
};
const vectorAngle = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180 / Math.PI;

// The loop in the model's terms: per street, its span along the loop and its
// straight-equivalent metres; every bend, inside a street or at a join, with its
// position along the loop and whether it is a junction turn.
type Span = { from: number; to: number; metres: number; name: string };
type Bend = { at: number; degrees: number; junction: boolean };
const spans: Span[] = [];
const bends: Bend[] = [];
let loopLength = 0;
UPTOWN.drives.forEach((drive, i) => {
  const street = streets.get(drive.street)!;
  const points = drive.reversed ? [...street.points].reverse() : [...street.points];
  const measure = graph.measures.get(drive.street)!;
  const along = [0];
  for (let k = 1; k < points.length; k++) along.push(along[k - 1]! + Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z));
  let bendSeconds = 0;
  for (let k = 1; k < points.length - 1; k++) {
    const degrees = angleAt(points[k - 1]!, points[k]!, points[k + 1]!);
    bendSeconds += PACE.bend(degrees);
    bends.push({ at: loopLength + along[k]!, degrees, junction: false });
  }
  // The model's straight time is its street time less its bends; times top is metres.
  spans.push({ from: loopLength, to: loopLength + along.at(-1)!, metres: (measure.time - bendSeconds) * PACE.top, name: street.name });
  loopLength += along.at(-1)!;
  const next = UPTOWN.drives[(i + 1) % UPTOWN.drives.length]!;
  const arriving = graph.drives.find(d => d.id === drive.street && d.reversed === drive.reversed)!;
  const leaving = graph.drives.find(d => d.id === next.street && d.reversed === next.reversed)!;
  bends.push({ at: loopLength, degrees: vectorAngle(arriving.arriving, leaving.leaving), junction: true });
});
const turns = bends.filter(b => b.junction && b.degrees > 30).sort((a, b) => a.at - b.at);

/** Model features for loop distances [a, b], which may run past the loop's end. */
function features(a: number, b: number, p: number) {
  let metres = 0, bendSum = 0, paceBends = 0;
  for (let lap = Math.floor(a / loopLength); lap * loopLength < b; lap++) {
    const base = lap * loopLength;
    for (const s of spans) {
      const lo = Math.max(a, base + s.from), hi = Math.min(b, base + s.to);
      if (hi > lo) metres += s.metres * (hi - lo) / (s.to - s.from);
    }
    for (const bend of bends) if (base + bend.at > a && base + bend.at <= b) { bendSum += Math.pow(bend.degrees / 90, p); paceBends += PACE.bend(bend.degrees); }
  }
  return { metres, bendSum, paceBends };
}
/** What PACE as it stands prices loop distances [a, b] at. */
const paceSeconds = (a: number, b: number) => { const f = features(a, b, 1.5); return f.metres / PACE.top + f.paceBends; };

// Windows in loop distance: from the midpoint before each turn to the midpoint after.
const mids = turns.map((t, i) => {
  const next = turns[(i + 1) % turns.length]!;
  const nextAt = next.at > t.at ? next.at : next.at + loopLength;
  return (t.at + nextAt) / 2;
});
const windows = turns.map((turn, i) => {
  const from = mids[(i - 1 + turns.length) % turns.length]!;
  let to = mids[i]!;
  let start = from;
  if (start > turn.at) start -= loopLength;
  if (to < turn.at) to += loopLength;
  return { turn, from: start, to };
});

const dir = fileURLToPath(new URL("../recordings/laps/", import.meta.url));
const files = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith(".json")).sort();
type Observation = { file: string; traffic: boolean; lap: number; window: number; seconds: number; length: number; degrees: number;
  entry: number; apex: number; exit: number };
const observations: Observation[] = [];
for (const file of files) {
  const session = JSON.parse(await readFile(join(dir, file), "utf8")) as LapSession;
  if (session.arena !== STREET_CIRCUIT_IDENTITY) continue;
  // One session's laps as one run: loop distance and time per tick, and which lap each tick belongs to.
  const loopDistance: number[] = [], seconds: number[] = [], speed: number[] = [], lapOf: number[] = [];
  for (const lap of session.recorded) {
    const s = lap.samples;
    for (let k = 0; k < s.tick.length; k++) {
      loopDistance.push(s.distance[k]! + (lap.lap - 1) * (loopLength) + UPTOWN.line);
      seconds.push(s.tick[k]! / session.tickHz);
      speed.push(s.speed[k]!);
      lapOf.push(lap.lap);
    }
  }
  const timeAt = (d: number): number | null => {
    for (let k = 1; k < loopDistance.length; k++) {
      if (loopDistance[k - 1]! < d && loopDistance[k]! >= d) {
        const t = (d - loopDistance[k - 1]!) / (loopDistance[k]! - loopDistance[k - 1]!);
        return seconds[k - 1]! + t * (seconds[k]! - seconds[k - 1]!);
      }
    }
    return null;
  };
  const firstLap = Math.floor((loopDistance[0]! - UPTOWN.line) / loopLength);
  for (let lapIndex = firstLap; lapIndex * loopLength < loopDistance.at(-1)!; lapIndex++) {
    windows.forEach((w, i) => {
      const a = w.from + lapIndex * loopLength, b = w.to + lapIndex * loopLength;
      const ta = timeAt(a), tb = timeAt(b);
      if (ta === null || tb === null) return;
      const ka = seconds.findIndex(t => t >= ta), kb = seconds.findIndex(t => t >= tb);
      const laps = new Set(lapOf.slice(ka, kb + 1));
      if ([...laps].some(n => !session.recorded[n - 1]!.valid)) return;
      // A standing start: the window the car accelerates from the grid through.
      if (laps.has(1) && a < turns[0]!.at) return;
      const turnAt = w.turn.at + lapIndex * loopLength;
      const around = (d0: number, d1: number) => { let m = Infinity; for (let k = ka; k <= kb; k++) if (loopDistance[k]! >= d0 && loopDistance[k]! <= d1) m = Math.min(m, speed[k]!); return m; };
      observations.push({ file, traffic: session.traffic ?? false, lap: [...laps][0]!, window: i, seconds: tb - ta, length: b - a, degrees: w.turn.degrees,
        entry: speed[ka]!, apex: around(turnAt - 30, turnAt + 30), exit: speed[kb]! });
    });
  }
}

function fit(subset: Observation[], p: number) {
  // Least squares for t = u * metres + v * bendSum, u = 1 / top.
  let smm = 0, smb = 0, sbb = 0, smt = 0, sbt = 0;
  const rows = subset.map(o => {
    const w = windows[o.window]!, f = features(w.from, w.to, p);
    smm += f.metres * f.metres; smb += f.metres * f.bendSum; sbb += f.bendSum * f.bendSum;
    smt += f.metres * o.seconds; sbt += f.bendSum * o.seconds;
    return { o, f };
  });
  const det = smm * sbb - smb * smb;
  const u = (smt * sbb - sbt * smb) / det, v = (sbt * smm - smt * smb) / det;
  const residuals = rows.map(({ o, f }) => o.seconds - (u * f.metres + v * f.bendSum));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const current = rows.map(({ o }) => paceSeconds(windows[o.window]!.from, windows[o.window]!.to));
  const currentRms = Math.sqrt(rows.reduce((s, { o }, k) => s + (o.seconds - current[k]!) ** 2, 0) / rows.length);
  const lapModel = windows.reduce((s, w) => { const f = features(w.from, w.to, p); return s + u * f.metres + v * f.bendSum; }, 0);
  return { p, top: 1 / u, bend90: v, rms, currentRms, lapModel, residuals };
}

const groups = { all: observations, clear: observations.filter(o => !o.traffic), traffic: observations.filter(o => o.traffic) };
const currentLap = windows.reduce((s, w) => s + paceSeconds(w.from, w.to), 0);
const result = Object.fromEntries(Object.entries(groups).map(([name, subset]) => [name, {
  windows: subset.length,
  fits: [1, 1.5, 2].map(p => { const { residuals: _r, ...rest } = fit(subset, p); return rest; }),
}]));
// Per window, averaged over every observation: what the recorded laps do at each turn against the fit at p = 1.5.
const best = fit(observations, 1.5);
const perWindow = windows.map((w, i) => {
  const mine = observations.map((o, k) => ({ o, r: best.residuals[k]! })).filter(({ o }) => o.window === i);
  const f = features(w.from, w.to, 1.5);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const k = spans.findIndex(s => w.turn.at > s.from && w.turn.at <= s.to + 1e-6);
  return { window: i, turn: `${spans[k]!.name} > ${spans[(k + 1) % spans.length]!.name} (${w.turn.degrees.toFixed(0)}°)`, length: w.to - w.from, metres: f.metres, count: mine.length,
    seconds: mean(mine.map(m => m.o.seconds)), residual: mean(mine.map(m => m.r)),
    entryMph: mean(mine.map(m => m.o.entry)) * 2.23694, apexMph: mean(mine.map(m => m.o.apex)) * 2.23694 };
});

if (asJson) {
  console.log(JSON.stringify({ pace: { top: PACE.top, bend90: PACE.bend(90) }, loopLength, currentLapSeconds: currentLap, groups: result, perWindow }, null, 2));
} else {
  console.log(`Uptown Circuit (${STREET_CIRCUIT_IDENTITY}), ${loopLength.toFixed(0)} m, ${turns.length} turns. PACE prices a lap at ${currentLap.toFixed(1)} s (top ${PACE.top} m/s, 90° turn ${PACE.bend(90)} s).`);
  for (const [name, group] of Object.entries(result)) {
    console.log(`\n${name}: ${group.windows} windows`);
    for (const f of group.fits) {
      console.log(`  p ${f.p.toFixed(1)}  top ${f.top.toFixed(1)} m/s (${(f.top * 2.23694).toFixed(0)} mph)  90° turn ${f.bend90.toFixed(2)} s  rms ${f.rms.toFixed(2)} s (PACE ${f.currentRms.toFixed(2)} s)  lap ${f.lapModel.toFixed(1)} s`);
    }
  }
  console.log(`\nPer turn, all laps, fit at p 1.5 (residual = recorded - fitted):`);
  for (const w of perWindow) {
    console.log(`  ${w.turn.padEnd(40)} ${w.length.toFixed(0).padStart(4)} m  ${w.count} laps  ${w.seconds.toFixed(2).padStart(6)} s  residual ${w.residual >= 0 ? "+" : ""}${w.residual.toFixed(2)} s  entry ${w.entryMph.toFixed(0)} mph, slowest ${w.apexMph.toFixed(0)} mph`);
  }
}
