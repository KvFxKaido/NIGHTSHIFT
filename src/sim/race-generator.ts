/**
 * Generated races. Flash a rival and the race is drawn from the city: a seed,
 * three to five gates at junctions, each leg chosen for the choice it offers —
 * "every shortcut has a cost" is the constraint the generator refuses to
 * violate, scored by `route-choice.ts` with the same arithmetic the critique
 * reports. The seed is the race's identity: (world version, seed) reproduces
 * it, which is all a playlist or a ghost needs to carry.
 *
 * Sim, not renderer; deterministic — the integer hash the traffic uses, never
 * Math.random. The rival's line through the gates is routed on the same graph
 * and built from the streets' own points, exactly as the authored line was.
 */
import { mix } from "./traffic.ts";
import { forwardOf, rightOf } from "./race-start.ts";
import { measureLeg, route, type Drive, type Leg, type RoutingGraph } from "./route-choice.ts";
import { projectOntoPath, type Street } from "./street-path.ts";
import type { RaceDefinition, RaceKind } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";

export const GENERATOR = {
  gates: { min: 3, max: 5 },
  /** Seconds a leg's fastest route may take. */
  leg: { min: 12, max: 40 },
  total: { min: 45, max: 160 },
  /** How much a leg's class weighs when the next gate is drawn. */
  weight: { priced: 4, even: 1.5, free: 0.5, twin: 0.3, none: 0.4, sweetSpot: 1.5 } as Record<string, number>,
  /** Flow, in degrees from the heading you arrive at a gate on: the next gate
   *  lies within `bearing` of it, and the leg's first street leaves within
   *  `turn` of it. Without this the class weights pull the race straight back
   *  to the few priced corridors: 23% of legs sent you to a gate more than
   *  120° behind you, 9% to one more than 150° behind, and Yesler & James's
   *  Y sent 32 races in 300 out of the gate in a hairpin. */
  flow: { bearing: 120, turn: 135 },
  countdownTicks: 180,
  gateRadius: 20,
} as const;

export interface GeneratedRace {
  readonly definition: RaceDefinition;
  readonly seed: number;
  readonly legs: readonly Leg[];
}

/** A seeded stream of unit floats. `mix` is exactly specified on every engine. */
function stream(seed: number): () => number {
  let n = 0;
  return () => mix(Math.imul(seed | 0, 1000003) + (n++)) / 4294967296;
}

/** "S Jackson St & 4Th Ave S" -> "Jackson": the first street's own word. */
export function shortStreetName(name: string): string {
  const first = name.split(" & ")[0]!;
  return first.replace(/^(S|N|E|W|NE|NW|SE|SW)\s+/, "").replace(/\s+(St|Ave|Way|Rd|Blvd|Pl|Dr)(\s+(S|N|E|W))?$/, "")
    .replace(/\s+(S|N|E|W)$/, "");
}

type Heading = { readonly x: number; readonly z: number };
/** Degrees between two unit directions. */
export function degreesBetween(a: Heading, b: Heading): number {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180 / Math.PI;
}
/** Where a junction is: the first point of any street driven out of it. */
export function nodePosition(graph: RoutingGraph, id: string): { x: number; z: number } {
  const drive = graph.drives.find(d => d.from === id);
  if (!drive) throw new RangeError(`No street leaves ${id}`);
  const street = graph.streets.get(drive.id)!;
  const point = drive.reversed ? street.points[street.points.length - 1]! : street.points[0]!;
  return { x: point.x, z: point.z };
}

/**
 * Draw a race from the graph. `origin` is the junction the start street leads
 * to and `arriving` the heading it is reached on; `avoid` streets are never
 * routed (the start street, so the first leg cannot begin with a U-turn).
 * Streets are not reused between legs, and the flow rule keeps every next
 * gate ahead or abeam of the heading the last one is reached on, so a race
 * never doubles back on itself. A leg's time is still the table's, which
 * routes it with a free first exit: the turn at the gate (at most `turn`
 * degrees, under 5 s) is not in it.
 */
export function generateRace(graph: RoutingGraph, seed: number, origin: string, arriving: Heading,
  avoid: readonly string[] = []): GeneratedRace {
  const next = stream(seed);
  for (let attempt = 0; attempt < 12; attempt++) {
    const gateCount = GENERATOR.gates.min + Math.floor(next() * (GENERATOR.gates.max - GENERATOR.gates.min + 1));
    const chosen: Leg[] = [];
    const used = new Set<string>(avoid);
    const visited = new Set<string>([origin]);
    let at = origin, total = 0, arrival = arriving;
    for (let gate = 0; gate < gateCount; gate++) {
      const here = nodePosition(graph, at);
      const candidates: { leg: Leg; weight: number }[] = [];
      for (const to of graph.choicePoints) {
        if (visited.has(to)) continue;
        // Reject impossible gates before measuring their alternate routes. A
        // larger city has thousands of pairs that this draw will never use.
        const fastest = route(graph, at, to);
        if (!isFinite(fastest.time) || fastest.time < GENERATOR.leg.min || fastest.time > GENERATOR.leg.max) continue;
        if (fastest.via.some(d => used.has(d.id))) continue;
        if (total + fastest.time > GENERATOR.total.max) continue;
        const there = nodePosition(graph, to);
        const span = Math.hypot(there.x - here.x, there.z - here.z) || 1;
        const bearing = { x: (there.x - here.x) / span, z: (there.z - here.z) / span };
        if (degreesBetween(arrival, bearing) > GENERATOR.flow.bearing) continue;
        if (degreesBetween(arrival, fastest.via[0]!.leaving) > GENERATOR.flow.turn) continue;
        const leg = measureLeg(graph, at, to);
        let weight = GENERATOR.weight[leg.kind]!;
        if (leg.detour !== null && leg.detour >= 0.1 && leg.detour <= 0.25) weight += GENERATOR.weight.sweetSpot!;
        candidates.push({ leg, weight });
      }
      if (!candidates.length) break;
      let pick = next() * candidates.reduce((s, c) => s + c.weight, 0);
      let leg = candidates[candidates.length - 1]!.leg;
      for (const candidate of candidates) {
        pick -= candidate.weight;
        if (pick <= 0) { leg = candidate.leg; break; }
      }
      chosen.push(leg);
      for (const d of leg.via) used.add(d.id);
      visited.add(leg.to);
      at = leg.to;
      total += leg.time;
      arrival = leg.via[leg.via.length - 1]!.arriving;
    }
    if (chosen.length < GENERATOR.gates.min || total < GENERATOR.total.min) continue;
    const checkpoints = chosen.map(leg => {
      const point = nodePosition(graph, leg.to);
      return { id: leg.to, name: graph.nodeName(leg.to), x: point.x, z: point.z, radius: GENERATOR.gateRadius };
    });
    const name = `${shortStreetName(checkpoints[0]!.name)} to ${shortStreetName(checkpoints[checkpoints.length - 1]!.name)}`;
    return { seed, legs: chosen,
      definition: { id: `gen-${seed}`, name, countdownTicks: GENERATOR.countdownTicks, checkpoints } };
  }
  throw new RangeError(`Seed ${seed} draws no race from ${origin}`);
}

/** Convert a seeded sprint into another event, keeping the same routed gates.
 * Circuits close at the approach junction and repeat the complete loop twice.
 */
export function withRaceKind(graph: RoutingGraph, race: GeneratedRace, origin: string, kind: Exclude<RaceKind, "drag" | "drift">): GeneratedRace {
  if (kind === "sprint") return race;
  if (kind === "unordered") return { ...race, definition: { ...race.definition,
    kind, id: `${race.definition.id}-unordered`, name: `${race.definition.name} / Unordered` } };
  const finish = race.legs.at(-1)!;
  const arrival = finish.via.at(-1)!.arriving;
  const departure = race.legs[0]!.via[0]!.leaving;
  // Route the return with both boundary headings constrained. A shortest
  // return otherwise often reverses down the street the rival just arrived on.
  const closingGraph: RoutingGraph = { ...graph, legs: null, drives: graph.drives.filter(d =>
    (d.from !== finish.to || degreesBetween(arrival, d.leaving) <= GENERATOR.flow.turn) &&
    (d.to !== origin || degreesBetween(d.arriving, departure) <= GENERATOR.flow.turn)) };
  const closing = measureLeg(closingGraph, finish.to, origin);
  if (!Number.isFinite(closing.time) || !closing.via.length) throw new RangeError("Circuit cannot return to its start");
  const point = nodePosition(graph, origin);
  const gates = [...race.definition.checkpoints,
    { id: origin, name: graph.nodeName(origin), ...point, radius: GENERATOR.gateRadius }];
  const loop = [...race.legs, closing];
  return { ...race, legs: [...loop, ...loop], definition: { ...race.definition,
    kind, id: `${race.definition.id}-circuit`, name: `${shortStreetName(gates[0]!.name)} Circuit`,
    laps: 2, gatesPerLap: gates.length, checkpoints: [...gates, ...gates] } };
}

/** Where a start pose's street leads: the street, the junction ahead, the
 *  street's points from the start onward in the direction of travel, and the
 *  heading the junction is reached on (the street's last segment). */
export function startApproach(streets: readonly Street[], start: RoadWorld["start"]):
  { street: Street; node: string; points: CoursePoint[]; arriving: Heading } {
  let best: { street: Street; on: ReturnType<typeof projectOntoPath> } | null = null;
  for (const street of streets) {
    const on = projectOntoPath(street.points, start.x, start.z);
    if (!best || on.distance < best.on.distance) best = { street, on };
  }
  const { street, on } = best!;
  const forwardX = -Math.sin(start.heading), forwardZ = -Math.cos(start.heading);
  const ahead = forwardX * on.ux + forwardZ * on.uz > 0;
  const points = ahead ? street.points.slice(on.segmentIndex + 1) : street.points.slice(0, on.segmentIndex + 1).reverse();
  const end = points[points.length - 1]!, before = points.length >= 2 ? points[points.length - 2]! : start;
  const run = Math.hypot(end.x - before.x, end.z - before.z) || 1;
  return { street, node: ahead ? street.to : street.from, points: points.map(p => ({ ...p })),
    arriving: { x: (end.x - before.x) / run, z: (end.z - before.z) / run } };
}

/**
 * The rival's line for a generated race: the start, the approach to the first
 * junction, then every street of every leg in the direction it is driven,
 * joined at the junctions they share, and one street past the finish so the
 * driver has road to stop on. Gates are the along-distances of the junction
 * vertices, which every arm's points contain exactly.
 */
export function rivalLineFor(graph: RoutingGraph, race: GeneratedRace, streets: readonly Street[],
  start: RoadWorld["start"], height: (x: number, z: number) => number): RivalDefinition {
  const approach = startApproach(streets, start);
  // Seven metres ahead in the other lane, in the start's own frame: on the
  // grid, facing north, that is x - 4.5, z - 7, as it always was.
  const forward = forwardOf(start.heading), right = rightOf(start.heading);
  const rivalStart = { ...start, x: start.x + forward.x * 7 - right.x * 4.5, z: start.z + forward.z * 7 - right.z * 4.5 };
  const points: CoursePoint[] = [{ ...approach.points[0]!, x: rivalStart.x, z: rivalStart.z, y: height(rivalStart.x, rivalStart.z) }];
  const push = (point: CoursePoint) => {
    const last = points[points.length - 1]!;
    if (Math.hypot(last.x - point.x, last.z - point.z) > 0.01) points.push({ ...point });
  };
  for (const point of approach.points) push(point);
  const append = (drive: Drive) => {
    const street = graph.streets.get(drive.id)!;
    const ordered = drive.reversed ? [...street.points].reverse() : street.points;
    const last = points[points.length - 1]!;
    if (Math.hypot(last.x - ordered[0]!.x, last.z - ordered[0]!.z) > 0.1) {
      throw new Error(`Generated rival line has a disconnected join at ${drive.id}`);
    }
    for (const point of ordered) push(point);
  };
  for (const leg of race.legs) for (const drive of leg.via) append(drive);
  // Past the finish: the straightest way on, by the same turn arithmetic.
  const finish = race.legs[race.legs.length - 1]!;
  const last = finish.via[finish.via.length - 1]!;
  const onward = graph.drives.filter(d => d.from === finish.to && d.id !== last.id)
    .sort((a, b) => (b.leaving.x * last.arriving.x + b.leaving.z * last.arriving.z) -
      (a.leaving.x * last.arriving.x + a.leaving.z * last.arriving.z))[0];
  if (onward) append(onward);
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  }
  let previous = 0;
  const gates = race.definition.checkpoints.map(gate => {
    const index = points.findIndex((point, i) => i > previous && Math.hypot(point.x - gate.x, point.z - gate.z) < 0.1);
    if (index < 0) throw new Error(`Generated rival line misses ${gate.name}`);
    previous = index;
    return along[index]!;
  });
  return { id: `${race.definition.id}-driver`, start: { ...rivalStart, y: height(rivalStart.x, rivalStart.z) },
    points, along, gates };
}

/** Which streets and legs a race drives, for a map or a test. */
export function raceRoute(race: GeneratedRace): Drive[] {
  return race.legs.flatMap(leg => [...leg.via]);
}

/** A seed from the moment of the flash: the tick is deterministic given the
 *  input log, so a replay of the cruise draws the same race. */
export function seedFromTick(tick: number, salt = 0): number {
  return mix(tick * 7919 + salt) % 1_000_000;
}
