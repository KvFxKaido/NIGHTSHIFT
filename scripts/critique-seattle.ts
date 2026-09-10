/**
 * A measuring stick for Seattle's route choice, and the material a race
 * generator would draw from.
 *
 * The rule the map is held to is "every shortcut has a cost": the faster way
 * between two gates should be the riskier way, or it is just a shorter road
 * and there is nothing to learn. This reports that as numbers. Risk per street
 * comes from the map data — width, bends, grade, blind corners — and reward
 * per leg is the TIME the best genuinely different alternative route costs,
 * because a narrow bendy street is slower as well as riskier, and on a grid
 * two ways round a block are the same length; only time tells them apart. A
 * leg whose fastest route is also its safest is a free shortcut, a defect
 * under the rule; a leg whose fastest route is the riskiest is what a
 * generator should sample.
 *
 * It asserts nothing. The speed and turn model is a declared proposal, not
 * the handling model. `--json` emits the same numbers for an agent.
 *
 *   pnpm seattle:critique
 *   pnpm seattle:critique --json
 */
import { SEATTLE_STREETS, SEATTLE_BLOCKS, seattleHeight } from "../src/sim/seattle.ts";
import { blockCorners } from "../src/sim/building-footprint.ts";
import { pathLength } from "../src/sim/lanes.ts";
import type { Street } from "../src/sim/street-path.ts";

const asJson = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Risk and time per street. Risk: four things the map data can say about how
// hard a street is to drive fast, each 0..1, and a composite whose weights
// are a proposal. Time: a committed pace through the same features.
// ---------------------------------------------------------------------------
interface StreetMeasure {
  id: string; name: string; length: number; width: number;
  narrow: number; bends: number; sharpest: number; grade: number; blind: number; risk: number;
  /** Seconds at a committed pace, turns inside the street included. */
  time: number;
}
const WEIGHTS = { narrow: 0.35, bends: 0.25, grade: 0.2, blind: 0.2 };
/** The pace model: a top speed, what a street's width does to it, what a bend
 *  costs, what a climb costs. Arcade numbers, declared so they can be argued. */
/** Width barely touches pace — the lane count is the same on a 16 m street as
 *  on a 24 m one — so it lives in risk, where it belongs. With width cutting
 *  pace to 78%, every narrow street was dominated by construction and the
 *  report found 78 priced legs in 1050; that was the model, not the map. */
const PACE = { top: 32, widthFactor: (w: number) => 0.94 + 0.06 * Math.max(0, Math.min(1, (w - 16) / 8)),
  bend: (deg: number) => 2.5 * Math.pow(deg / 90, 1.5), gradeFactor: (g: number) => 1 + 1.5 * g };
const corners = SEATTLE_BLOCKS.flatMap(block => blockCorners(block));

function measure(street: Street): StreetMeasure {
  const points = street.points;
  const length = pathLength(points);
  const width = points[0]!.width;
  const narrow = Math.max(0, Math.min(1, (24 - width) / 8));
  let turned = 0, sharpest = 0, blind = 0, bendSeconds = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, p = points[i]!, b = points[i + 1]!;
    const u1 = norm(p.x - a.x, p.z - a.z), u2 = norm(b.x - p.x, b.z - p.z);
    const angle = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.z * u2.z))) * 180 / Math.PI;
    turned += angle;
    sharpest = Math.max(sharpest, angle);
    bendSeconds += PACE.bend(angle);
    if (angle < 25) continue;
    // A building on the inside of a real bend hides what is round it.
    const inside = norm(u2.x - u1.x, u2.z - u1.z);
    const reach = width / 2 + 10;
    if (corners.some(c => {
      const dx = c.x - p.x, dz = c.z - p.z;
      return dx * inside.x + dz * inside.z > 0 && Math.hypot(dx, dz) < reach;
    })) blind++;
  }
  let steepest = 0, climb = 0;
  for (let s = 0; s < length; s += 5) {
    const a = pointAt(points, s), b = pointAt(points, Math.min(length, s + 5));
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run < 0.1) continue;
    const slope = Math.abs(seattleHeight(b.x, b.z) - seattleHeight(a.x, a.z)) / run;
    steepest = Math.max(steepest, slope);
    climb += slope * run;
  }
  const meanGrade = climb / Math.max(1, length);
  const bendsPer100 = turned / Math.max(1, length / 100);
  const bends = Math.min(1, Math.max(bendsPer100 / 90, sharpest / 90));
  const grade = Math.min(1, steepest / 0.12);
  const blindRisk = Math.min(1, blind / 2);
  const time = length / (PACE.top * PACE.widthFactor(width)) * PACE.gradeFactor(meanGrade) + bendSeconds;
  return { id: street.id, name: street.name, length, width, narrow, bends, sharpest, grade: steepest, blind, time,
    risk: WEIGHTS.narrow * narrow + WEIGHTS.bends * bends + WEIGHTS.grade * grade + WEIGHTS.blind * blindRisk };
}
function norm(x: number, z: number): { x: number; z: number } {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}
function pointAt(points: Street["points"], along: number): { x: number; z: number } {
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= along || i === points.length - 2) {
      const t = Math.max(0, Math.min(1, (along - acc) / l));
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    acc += l;
  }
  return { x: points[0]!.x, z: points[0]!.z };
}

// ---------------------------------------------------------------------------
// Routing on the line graph: a state is a street driven in one direction, so a
// turn at a junction can cost what a turn costs and going straight is free.
// ---------------------------------------------------------------------------
const measures = new Map(SEATTLE_STREETS.map(street => [street.id, measure(street)]));
const streets = new Map(SEATTLE_STREETS.map(street => [street.id, street]));
interface Drive { id: string; from: string; to: string; leaving: { x: number; z: number }; arriving: { x: number; z: number } }
const drives: Drive[] = SEATTLE_STREETS.flatMap(street => {
  const p = street.points, first = norm(p[1]!.x - p[0]!.x, p[1]!.z - p[0]!.z);
  const last = norm(p[p.length - 1]!.x - p[p.length - 2]!.x, p[p.length - 1]!.z - p[p.length - 2]!.z);
  return [
    { id: street.id, from: street.from, to: street.to, leaving: first, arriving: last },
    { id: street.id, from: street.to, to: street.from, leaving: { x: -last.x, z: -last.z }, arriving: { x: -first.x, z: -first.z } },
  ];
});
const nodes = [...new Set(drives.map(d => d.from))];
const degree = new Map<string, number>();
for (const d of drives) degree.set(d.from, (degree.get(d.from) ?? 0) + 1);
const choicePoints = nodes.filter(n => (degree.get(n) ?? 0) >= 3);
const nodeName = (id: string) => [...new Set(drives.filter(d => d.from === id).map(d => streets.get(d.id)!.name))].join(" & ");
const turnCost = (arriving: { x: number; z: number }, leaving: { x: number; z: number }) => {
  const deg = Math.acos(Math.max(-1, Math.min(1, arriving.x * leaving.x + arriving.z * leaving.z))) * 180 / Math.PI;
  return PACE.bend(deg);
};

/** Least time from one node to another, optionally with one street closed. */
function route(from: string, to: string, banned?: string): { time: number; via: string[] } {
  const best = new Map<Drive, number>();
  const prev = new Map<Drive, Drive | null>();
  const open: Drive[] = [];
  for (const d of drives) {
    if (d.from !== from || d.id === banned) continue;
    best.set(d, measures.get(d.id)!.time); prev.set(d, null); open.push(d);
  }
  const done = new Set<Drive>();
  let arrival: Drive | null = null;
  while (open.length) {
    let i = 0;
    for (let k = 1; k < open.length; k++) if (best.get(open[k]!)! < best.get(open[i]!)!) i = k;
    const here = open.splice(i, 1)[0]!;
    if (done.has(here)) continue;
    done.add(here);
    if (here.to === to) { arrival = here; break; }
    for (const next of drives) {
      if (next.from !== here.to || next.id === here.id || next.id === banned) continue;
      const cost = best.get(here)! + turnCost(here.arriving, next.leaving) + measures.get(next.id)!.time;
      if (cost < (best.get(next) ?? Infinity)) { best.set(next, cost); prev.set(next, here); open.push(next); }
    }
  }
  if (!arrival) return { time: Infinity, via: [] };
  const via: string[] = [];
  for (let at: Drive | null = arrival; at; at = prev.get(at) ?? null) via.push(at.id);
  return { time: best.get(arrival)!, via: via.reverse() };
}
const routeRisk = (via: string[]) => {
  let weight = 0, sum = 0;
  for (const id of via) { const m = measures.get(id)!; weight += m.time; sum += m.time * m.risk; }
  return weight ? sum / weight : 0;
};
const routeLength = (via: string[]) => via.reduce((s, id) => s + measures.get(id)!.length, 0);

/** twin: the alternative costs under 4% — two ways round a block, no shortcut
 *  either way. A twin with a risk gap is not a defect; the risky way just
 *  offers nothing, which is fine. */
type LegClass = "priced" | "free" | "even" | "twin" | "none";
interface Leg {
  from: string; to: string; fromName: string; toName: string;
  length: number; time: number; via: string[]; detour: number | null; alternative: string[];
  riskFast: number; riskAlternative: number | null; kind: LegClass;
}
const legs: Leg[] = [];
for (const from of choicePoints) {
  for (const to of choicePoints) {
    if (from === to) continue;
    const fast = route(from, to);
    const length = routeLength(fast.via);
    if (!isFinite(fast.time) || length < 300 || length > 1600) continue;
    // Close each street of the fast route in turn; the quickest way round that
    // still shares under 60% of the fast route's time is the leg's real
    // alternative.
    let alternative: { time: number; via: string[] } | null = null;
    for (const id of new Set(fast.via)) {
      const other = route(from, to, id);
      if (!isFinite(other.time)) continue;
      const shared = other.via.filter(e => fast.via.includes(e)).reduce((s, e) => s + measures.get(e)!.time, 0);
      if (shared / fast.time > 0.6) continue;
      if (!alternative || other.time < alternative.time) alternative = other;
    }
    const riskFast = routeRisk(fast.via);
    const detour = alternative ? (alternative.time - fast.time) / fast.time : null;
    const riskAlternative = alternative ? routeRisk(alternative.via) : null;
    let kind: LegClass = "none";
    if (detour !== null && detour < 0.04) kind = "twin";
    else if (detour !== null && detour <= 0.4) {
      kind = riskFast > riskAlternative! + 0.05 ? "priced" : riskFast < riskAlternative! - 0.05 ? "free" : "even";
    }
    legs.push({ from, to, fromName: nodeName(from), toName: nodeName(to), length, time: fast.time, via: fast.via,
      detour, alternative: alternative?.via ?? [], riskFast, riskAlternative, kind });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const byKind = (kind: LegClass) => legs.filter(l => l.kind === kind);
const describe = (via: string[]) => {
  const names: string[] = [];
  for (const id of via) { const name = measures.get(id)!.name; if (names[names.length - 1] !== name) names.push(name); }
  return names.join(" > ");
};
const detours = legs.map(l => l.detour).filter((d): d is number => d !== null).sort((a, b) => a - b);
const summary = {
  streets: SEATTLE_STREETS.length, nodes: nodes.length, choicePoints: choicePoints.length,
  deadEnds: nodes.filter(n => degree.get(n) === 1).length,
  legs: legs.length, priced: byKind("priced").length, free: byKind("free").length,
  even: byKind("even").length, twin: byKind("twin").length, none: byKind("none").length,
  medianDetour: detours.length ? detours[Math.floor(detours.length / 2)]! : null,
  sweetSpot: detours.filter(d => d >= 0.1 && d <= 0.25).length,
};

if (asJson) {
  console.log(JSON.stringify({ summary, pace: { top: PACE.top }, weights: WEIGHTS, streets: [...measures.values()], legs }, null, 1));
} else {
  console.log(`Seattle: ${summary.streets} streets, ${summary.nodes} nodes, ${summary.choicePoints} choice points, ${summary.deadEnds} dead ends`);
  console.log(`Directed legs between choice points, 300-1600 m by the fastest route: ${summary.legs}`);
  console.log(`  with a real alternative within 40% of its time: ${summary.legs - summary.none} (${pct((summary.legs - summary.none) / summary.legs)}); median detour ${summary.medianDetour === null ? "-" : pct(summary.medianDetour)}; in the 10-25% sweet spot: ${summary.sweetSpot}`);
  console.log(`  priced (fastest is the riskier): ${summary.priced}   free (fastest is the safer): ${summary.free}   even: ${summary.even}   twins (under 4% apart): ${summary.twin}   no choice: ${summary.none}`);
  // Where a generator would put gates: the nodes that begin or end priced legs.
  const gateScore = new Map<string, number>();
  for (const l of byKind("priced")) for (const n of [l.from, l.to]) gateScore.set(n, (gateScore.get(n) ?? 0) + 1);
  const gates = [...gateScore].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  gate candidates (nodes on the most priced legs): ${gates.map(([n, c]) => `${nodeName(n)} (${c})`).join("; ") || "none"}`);
  const show = (title: string, rows: Leg[], sort: (a: Leg, b: Leg) => number, limit = 10) => {
    console.log(`\n${title}`);
    for (const l of rows.sort(sort).slice(0, limit)) {
      console.log(`  ${l.fromName}  ->  ${l.toName}`);
      console.log(`     fast ${l.time.toFixed(0)} s / ${l.length.toFixed(0)} m  risk ${l.riskFast.toFixed(2)}  via ${describe(l.via)}`);
      if (l.detour !== null) console.log(`     alt  +${pct(l.detour)}${" ".repeat(Math.max(0, 8 - pct(l.detour).length))} risk ${l.riskAlternative!.toFixed(2)}  via ${describe(l.alternative)}`);
    }
  };
  show("Priced shortcuts — the fast way is the risky way (generator material), by risk gap:",
    byKind("priced"), (a, b) => (b.riskFast - b.riskAlternative!) - (a.riskFast - a.riskAlternative!));
  show("Free shortcuts — the fast way is also the safe way (defects under the rule), by risk gap:",
    byKind("free"), (a, b) => (b.riskAlternative! - b.riskFast) - (a.riskAlternative! - a.riskFast));
  show("No choice — nothing within 40% of the fastest time, longest first:", byKind("none"), (a, b) => b.length - a.length, 6);
  const table = [...measures.values()].sort((a, b) => b.risk - a.risk);
  console.log("\nRisk per street (narrow / bends / grade / blind corners), then pace:");
  for (const r of [...table.slice(0, 8), ...table.slice(-4)]) {
    console.log(`  ${r.risk.toFixed(2)}  ${r.name.padEnd(22)} ${r.id.padEnd(8)} ${r.length.toFixed(0).padStart(4)} m  w ${r.width}  ${pct(r.narrow).padStart(4)} / ${r.bends.toFixed(2)} (sharpest ${r.sharpest.toFixed(0)} deg) / ${pct(r.grade)} / ${r.blind}   ${(r.length / r.time * 3.6).toFixed(0)} km/h`);
  }
  console.log(`\nWeights: narrow ${WEIGHTS.narrow}, bends ${WEIGHTS.bends}, grade ${WEIGHTS.grade}, blind ${WEIGHTS.blind}. Pace: ${PACE.top} m/s top, 16 m streets at 78% of it, a 90 degree turn 2.5 s, a climb 1 + 1.5 x grade. Proposals. Traffic is not scored: it is seeded uniformly per lane length.`);
}
