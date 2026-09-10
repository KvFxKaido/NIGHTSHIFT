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
import { legTable, type Drive, type Leg, type RoutingGraph } from "./route-choice.ts";
import { projectOntoPath, type Street } from "./street-path.ts";
import type { RaceDefinition } from "./race.ts";
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

/**
 * Draw a race from the graph. `origin` is the junction the start street leads
 * to; `avoid` streets are never routed (the start street, so the first leg
 * cannot begin with a U-turn). Streets are not reused between legs, so a race
 * never doubles back on itself.
 */
export function generateRace(graph: RoutingGraph, seed: number, origin: string, avoid: readonly string[] = []): GeneratedRace {
  const next = stream(seed);
  const legs = legTable(graph);
  for (let attempt = 0; attempt < 12; attempt++) {
    const gateCount = GENERATOR.gates.min + Math.floor(next() * (GENERATOR.gates.max - GENERATOR.gates.min + 1));
    const chosen: Leg[] = [];
    const used = new Set<string>(avoid);
    const visited = new Set<string>([origin]);
    let at = origin, total = 0;
    for (let gate = 0; gate < gateCount; gate++) {
      const candidates: { leg: Leg; weight: number }[] = [];
      for (const to of graph.choicePoints) {
        if (visited.has(to)) continue;
        const leg = legs.get(`${at}|${to}`);
        if (!leg || !isFinite(leg.time) || leg.time < GENERATOR.leg.min || leg.time > GENERATOR.leg.max) continue;
        if (leg.via.some(d => used.has(d.id))) continue;
        if (total + leg.time > GENERATOR.total.max) continue;
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
    }
    if (chosen.length < GENERATOR.gates.min || total < GENERATOR.total.min) continue;
    const checkpoints = chosen.map(leg => {
      const node = graph.drives.find(d => d.from === leg.to)!;
      const street = graph.streets.get(node.id)!;
      const point = node.reversed ? street.points[street.points.length - 1]! : street.points[0]!;
      return { id: leg.to, name: graph.nodeName(leg.to), x: point.x, z: point.z, radius: GENERATOR.gateRadius };
    });
    const name = `${shortStreetName(checkpoints[0]!.name)} to ${shortStreetName(checkpoints[checkpoints.length - 1]!.name)}`;
    return { seed, legs: chosen,
      definition: { id: `gen-${seed}`, name, countdownTicks: GENERATOR.countdownTicks, checkpoints } };
  }
  throw new RangeError(`Seed ${seed} draws no race from ${origin}`);
}

/** Where a start pose's street leads: the street, the junction ahead, and the
 *  street's points from the start onward in the direction of travel. */
export function startApproach(streets: readonly Street[], start: RoadWorld["start"]):
  { street: Street; node: string; points: CoursePoint[] } {
  let best: { street: Street; on: ReturnType<typeof projectOntoPath> } | null = null;
  for (const street of streets) {
    const on = projectOntoPath(street.points, start.x, start.z);
    if (!best || on.distance < best.on.distance) best = { street, on };
  }
  const { street, on } = best!;
  const forwardX = -Math.sin(start.heading), forwardZ = -Math.cos(start.heading);
  const ahead = forwardX * on.ux + forwardZ * on.uz > 0;
  const points = ahead ? street.points.slice(on.segmentIndex + 1) : street.points.slice(0, on.segmentIndex + 1).reverse();
  return { street, node: ahead ? street.to : street.from, points: points.map(p => ({ ...p })) };
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
  const rivalStart = { ...start, x: start.x - 4.5, z: start.z - 7 };
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
    const index = points.findIndex((point, i) => i >= previous && Math.hypot(point.x - gate.x, point.z - gate.z) < 0.1);
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
