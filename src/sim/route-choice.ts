/**
 * Route choice, measured: what a street costs to drive and what a leg between
 * two junctions rewards. The rule the map is held to is "every shortcut has a
 * cost" — between two gates, the faster way should be the riskier way — and
 * this is that rule as arithmetic, shared by the critique that reports it and
 * the generator that refuses to violate it. Two copies would drift.
 *
 * Risk per street comes from the map data: width, bends, grade, blind corners.
 * Reward per leg is TIME, not length — on a grid two ways round a block are the
 * same length and only time tells them apart — routed on the line graph, where
 * a state is a street driven in one direction, so a turn at a junction costs
 * and straight-through is free. The pace model is a declared proposal, not the
 * handling model. Sim, not renderer; pure; no clock, no randomness.
 */
import { pathLength } from "./lanes.ts";
import { blockCorners, type BuildingBlock } from "./building-footprint.ts";
import type { Street } from "./street-path.ts";

export const RISK_WEIGHTS = { narrow: 0.35, bends: 0.25, grade: 0.2, blind: 0.2 } as const;
/** Width barely touches pace — the lane count is the same on a 16 m street as
 *  on a 24 m one — so it lives in risk. With width cutting pace to 78%, every
 *  narrow street was dominated by construction, and the first report found 78
 *  priced legs in 1050; that was the model, not the map. */
export const PACE = {
  top: 32,
  widthFactor: (width: number) => 0.94 + 0.06 * Math.max(0, Math.min(1, (width - 16) / 8)),
  bend: (degrees: number) => 2.5 * Math.pow(degrees / 90, 1.5),
  gradeFactor: (grade: number) => 1 + 1.5 * grade,
} as const;

export interface StreetMeasure {
  readonly id: string;
  readonly name: string;
  readonly length: number;
  readonly width: number;
  readonly narrow: number;
  readonly bends: number;
  readonly sharpest: number;
  readonly grade: number;
  readonly blind: number;
  readonly risk: number;
  /** Seconds at a committed pace, turns inside the street included. */
  readonly time: number;
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

export function measureStreet(street: Street, height: (x: number, z: number) => number,
  corners: readonly { x: number; z: number }[]): StreetMeasure {
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
    const slope = Math.abs(height(b.x, b.z) - height(a.x, a.z)) / run;
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
    risk: RISK_WEIGHTS.narrow * narrow + RISK_WEIGHTS.bends * bends + RISK_WEIGHTS.grade * grade +
      RISK_WEIGHTS.blind * blindRisk };
}

/** A street driven in one direction: a state of the line graph. */
export interface Drive {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Driven against the order of the street's points. */
  readonly reversed: boolean;
  readonly leaving: { x: number; z: number };
  readonly arriving: { x: number; z: number };
}

export type LegClass = "priced" | "free" | "even" | "twin" | "none";
export interface Leg {
  readonly from: string;
  readonly to: string;
  readonly length: number;
  readonly time: number;
  readonly via: readonly Drive[];
  /** Time the best genuinely different alternative costs, as a fraction; null when there is none. */
  readonly detour: number | null;
  readonly alternative: readonly Drive[];
  readonly riskFast: number;
  readonly riskAlternative: number | null;
  readonly kind: LegClass;
}

export interface RoutingGraph {
  readonly streets: ReadonlyMap<string, Street>;
  readonly measures: ReadonlyMap<string, StreetMeasure>;
  readonly drives: readonly Drive[];
  readonly nodes: readonly string[];
  readonly degree: ReadonlyMap<string, number>;
  readonly choicePoints: readonly string[];
  readonly nodeName: (id: string) => string;
  /** Every measured leg between choice points, by `${from}|${to}`; built on first use. */
  legs: Map<string, Leg> | null;
}

export function buildRoutingGraph(streets: readonly Street[], height: (x: number, z: number) => number,
  blocks: readonly BuildingBlock[]): RoutingGraph {
  const corners = blocks.flatMap(block => blockCorners(block));
  const streetMap = new Map(streets.map(street => [street.id, street]));
  const measures = new Map(streets.map(street => [street.id, measureStreet(street, height, corners)]));
  const drives: Drive[] = streets.flatMap(street => {
    const p = street.points, first = norm(p[1]!.x - p[0]!.x, p[1]!.z - p[0]!.z);
    const last = norm(p[p.length - 1]!.x - p[p.length - 2]!.x, p[p.length - 1]!.z - p[p.length - 2]!.z);
    return [
      { id: street.id, from: street.from, to: street.to, reversed: false, leaving: first, arriving: last },
      { id: street.id, from: street.to, to: street.from, reversed: true,
        leaving: { x: -last.x, z: -last.z }, arriving: { x: -first.x, z: -first.z } },
    ];
  });
  const nodes = [...new Set(drives.map(d => d.from))];
  const degree = new Map<string, number>();
  for (const d of drives) degree.set(d.from, (degree.get(d.from) ?? 0) + 1);
  const choicePoints = nodes.filter(n => (degree.get(n) ?? 0) >= 3);
  const names = new Map(nodes.map(n => [n,
    [...new Set(drives.filter(d => d.from === n).map(d => streetMap.get(d.id)!.name))].join(" & ")]));
  return { streets: streetMap, measures, drives, nodes, degree, choicePoints,
    nodeName: id => names.get(id) ?? id, legs: null };
}

const turnCost = (arriving: { x: number; z: number }, leaving: { x: number; z: number }) => {
  const degrees = Math.acos(Math.max(-1, Math.min(1, arriving.x * leaving.x + arriving.z * leaving.z))) * 180 / Math.PI;
  return PACE.bend(degrees);
};

/** Least time from one node to another, optionally with one street closed. */
export function route(graph: RoutingGraph, from: string, to: string, banned?: string): { time: number; via: Drive[] } {
  const best = new Map<Drive, number>();
  const prev = new Map<Drive, Drive | null>();
  const open: Drive[] = [];
  for (const d of graph.drives) {
    if (d.from !== from || d.id === banned) continue;
    best.set(d, graph.measures.get(d.id)!.time); prev.set(d, null); open.push(d);
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
    for (const next of graph.drives) {
      if (next.from !== here.to || next.id === here.id || next.id === banned) continue;
      const cost = best.get(here)! + turnCost(here.arriving, next.leaving) + graph.measures.get(next.id)!.time;
      if (cost < (best.get(next) ?? Infinity)) { best.set(next, cost); prev.set(next, here); open.push(next); }
    }
  }
  if (!arrival) return { time: Infinity, via: [] };
  const via: Drive[] = [];
  for (let at: Drive | null = arrival; at; at = prev.get(at) ?? null) via.push(at);
  return { time: best.get(arrival)!, via: via.reverse() };
}

export function routeRisk(graph: RoutingGraph, via: readonly Drive[]): number {
  let weight = 0, sum = 0;
  for (const d of via) { const m = graph.measures.get(d.id)!; weight += m.time; sum += m.time * m.risk; }
  return weight ? sum / weight : 0;
}
export const routeLength = (graph: RoutingGraph, via: readonly Drive[]) =>
  via.reduce((s, d) => s + graph.measures.get(d.id)!.length, 0);

/**
 * A leg's fastest route and its real alternative: close each street of the
 * fast route in turn, and the quickest way round that still shares under 60%
 * of the fast route's time is the alternative. Under 4% apart is a twin — two
 * ways round a block, no shortcut either way, and a twin with a risk gap is
 * not a defect. Within 40%: priced if the fast route is the riskier by 0.05,
 * free if it is the safer, even between.
 */
export function measureLeg(graph: RoutingGraph, from: string, to: string): Leg {
  const fast = route(graph, from, to);
  const length = routeLength(graph, fast.via);
  let alternative: { time: number; via: Drive[] } | null = null;
  if (isFinite(fast.time)) {
    for (const id of new Set(fast.via.map(d => d.id))) {
      const other = route(graph, from, to, id);
      if (!isFinite(other.time)) continue;
      const shared = other.via.filter(d => fast.via.some(f => f.id === d.id))
        .reduce((s, d) => s + graph.measures.get(d.id)!.time, 0);
      if (shared / fast.time > 0.6) continue;
      if (!alternative || other.time < alternative.time) alternative = other;
    }
  }
  const riskFast = routeRisk(graph, fast.via);
  const detour = alternative ? (alternative.time - fast.time) / fast.time : null;
  const riskAlternative = alternative ? routeRisk(graph, alternative.via) : null;
  let kind: LegClass = "none";
  if (detour !== null && detour < 0.04) kind = "twin";
  else if (detour !== null && detour <= 0.4) {
    kind = riskFast > riskAlternative! + 0.05 ? "priced" : riskFast < riskAlternative! - 0.05 ? "free" : "even";
  }
  return { from, to, length, time: fast.time, via: fast.via, detour, alternative: alternative?.via ?? [],
    riskFast, riskAlternative, kind };
}

/** Every directed leg between choice points, measured once per graph. */
export function legTable(graph: RoutingGraph): ReadonlyMap<string, Leg> {
  if (graph.legs) return graph.legs;
  const table = new Map<string, Leg>();
  for (const from of graph.choicePoints) {
    for (const to of graph.choicePoints) {
      if (from !== to) table.set(`${from}|${to}`, measureLeg(graph, from, to));
    }
  }
  graph.legs = table;
  return table;
}
