/**
 * A measuring stick for Seattle's route choice, and the material a race
 * generator draws from.
 *
 * The rule the map is held to is "every shortcut has a cost": the faster way
 * between two gates should be the riskier way, or it is just a shorter road
 * and there is nothing to learn. `src/sim/route-choice.ts` is that rule as
 * arithmetic — risk per street from the map data, reward per leg as the time
 * the best genuinely different alternative costs — and the generator refuses
 * to violate it with the same functions. This only reports. A leg whose
 * fastest route is also its safest is a free shortcut, a defect under the
 * rule; a leg whose fastest route is the riskiest is generator material.
 *
 * It asserts nothing. `--json` emits the same numbers for an agent.
 *
 *   pnpm seattle:critique
 *   pnpm seattle:critique --json
 */
import { SEATTLE_STREETS, SEATTLE_BLOCKS, seattleHeight, createSeattleWorld } from "../src/sim/seattle.ts";
import { buildRoutingGraph, legTable, routeLength, route, measureLeg, blindness, PACE, RISK_WEIGHTS, SIGHT_CLEAR,
  type Drive, type Leg, type LegClass, type RoutingGraph } from "../src/sim/route-choice.ts";
import { GENERATOR, generateRace, startApproach, nodePosition, degreesBetween } from "../src/sim/race-generator.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import type { Street } from "../src/sim/street-path.ts";

const asJson = process.argv.includes("--json");
const graph: RoutingGraph = buildRoutingGraph(SEATTLE_STREETS, seattleHeight, SEATTLE_BLOCKS);

/**
 * --try=x1,z1,x2,z2[,width]: score an alley between the two existing
 * junctions nearest those points before drawing it. What the generator could
 * draw next from each arrival at
 * either end, by class, before and after; then the draw itself over 300
 * seeds — how many draws are made where nothing priced or even is ahead, the
 * priced-or-even share, and how many first legs get a choice. The alley's
 * own risk and the plots it would displace are the cost. Freight Cut was
 * chosen this way: draws at a dead spot 382 -> 59 of ~1170, share 48% -> 62%.
 */
const tryArg = process.argv.find(arg => arg.startsWith("--try="));
if (tryArg) {
  const numbers = tryArg.slice("--try=".length).split(",").map(Number);
  const [x1, z1, x2, z2, widthArg] = numbers;
  const width = widthArg ?? 8;
  if (numbers.length < 4 || numbers.some(n => !isFinite(n))) throw new Error("--try=x1,z1,x2,z2[,width]");
  const junctionNear = (x: number, z: number): string => {
    const nearest = graph.choicePoints.map(id => ({ id, d: Math.hypot(nodePosition(graph, id).x - x, nodePosition(graph, id).z - z) }))
      .sort((p, q) => p.d - q.d)[0]!;
    if (nearest.d > 5) throw new Error(`No junction within 5 m of (${x}, ${z}); nearest is ${graph.nodeName(nearest.id)} at ${nearest.d.toFixed(0)} m`);
    return nearest.id;
  };
  const nodeA = junctionNear(x1!, z1!), nodeB = junctionNear(x2!, z2!);
  if (nodeA === nodeB) throw new Error("Both ends are the same junction");
  const a = nodePosition(graph, nodeA), b = nodePosition(graph, nodeB);
  const crossesMidBlock = (p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }, s: { x: number; z: number }) => {
    const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  };
  const crossed = SEATTLE_STREETS.filter(s => s.points.slice(1).some((q, i) => crossesMidBlock(a, b, s.points[i]!, q))).map(s => s.name);
  const alley: Street = { id: "alley-try", name: "Trial Alley", from: nodeA, to: nodeB, added: true, kind: "alley",
    points: [a, b].map(p => ({ x: p.x, z: p.z, y: seattleHeight(p.x, p.z), width, zone: "old-quarter" })) };
  const displaced = SEATTLE_BLOCKS.filter(block => segmentFootprintDistance(block, alley.points[0]!, alley.points[1]!) < width / 2 + 2.8);
  const trial = buildRoutingGraph([...SEATTLE_STREETS, alley], seattleHeight, SEATTLE_BLOCKS.filter(block => !displaced.includes(block)));
  const own = trial.measures.get("alley-try")!;
  console.log(`Trial alley ${graph.nodeName(nodeA)} -> ${graph.nodeName(nodeB)}: ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(0)} m, ${width} m wide, ${own.time.toFixed(1)} s, risk ${own.risk.toFixed(2)}, displaces ${displaced.length} buildings; sight at its ends ${trial.drives.filter(d => d.id === "alley-try").map(d => d.sight === Infinity ? "open" : `${d.sight.toFixed(0)} m`).join(" / ")}`);
  if (crossed.length) console.log(`  crosses ${crossed.join(", ")} mid-block: the builder nodes alleys only among themselves, so this cannot be drawn as one`);
  type By = Record<LegClass, number>;
  const ahead = (g: RoutingGraph, node: string, arriving: { x: number; z: number }): By => {
    const here = nodePosition(g, node), by: By = { priced: 0, free: 0, even: 0, twin: 0, none: 0 };
    for (const to of g.choicePoints) {
      if (to === node) continue;
      const fastest = route(g, node, to);
      if (!isFinite(fastest.time) || fastest.time < GENERATOR.leg.min || fastest.time > GENERATOR.leg.max) continue;
      const there = nodePosition(g, to), span = Math.hypot(there.x - here.x, there.z - here.z) || 1;
      if (degreesBetween(arriving, { x: (there.x - here.x) / span, z: (there.z - here.z) / span }) > GENERATOR.flow.bearing) continue;
      if (degreesBetween(arriving, fastest.via[0]!.leaving) > GENERATOR.flow.turn) continue;
      by[measureLeg(g, node, to).kind]++;
    }
    return by;
  };
  const fmt = (by: By) => `priced ${by.priced} even ${by.even} free ${by.free} twin ${by.twin} none ${by.none}`;
  for (const node of [nodeA, nodeB]) {
    console.log(`  arrivals at ${graph.nodeName(node)}:`);
    for (const d of graph.drives.filter(d => d.to === node)) {
      const before = ahead(graph, node, d.arriving), after = ahead(trial, node, d.arriving);
      const dead = (by: By) => by.priced + by.even === 0;
      console.log(`    on ${graph.measures.get(d.id)!.name}${d.reversed ? " (rev)" : ""}: before ${fmt(before)}; after ${fmt(after)}${dead(before) ? dead(after) ? "  still dead" : "  FIXED" : ""}`);
    }
  }
  const approach = startApproach(SEATTLE_STREETS, createSeattleWorld(true).start);
  const drawSummary = (g: RoutingGraph) => {
    const spots = new Map<string, By>();
    const spotOf = (node: string, arrival: Drive | null, arriving: { x: number; z: number }) => {
      const k = `${node}|${arrival ? arrival.id + (arrival.reversed ? "r" : "") : "start"}`;
      let s = spots.get(k); if (!s) { s = ahead(g, node, arriving); spots.set(k, s); } return s;
    };
    let dead = 0, drawn = 0, choice = 0, first = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const race = generateRace(g, seed, approach.node, approach.arriving, [approach.street.id]);
      let at = approach.node, arrival: Drive | null = null, arriving = approach.arriving;
      race.legs.forEach((leg, i) => {
        const s = spotOf(at, arrival, arriving);
        if (s.priced + s.even === 0) dead++;
        drawn++;
        if (leg.kind === "priced" || leg.kind === "even") { choice++; if (i === 0) first++; }
        at = leg.to; arrival = leg.via[leg.via.length - 1]!; arriving = arrival.arriving;
      });
    }
    return `draws at a dead spot ${dead}/${drawn}, priced-or-even ${(choice / drawn * 100).toFixed(0)}%, first legs with a choice ${first}/300`;
  };
  console.log(`  the draw over 300 seeds, before: ${drawSummary(graph)}`);
  console.log(`  the draw over 300 seeds, after:  ${drawSummary(trial)}`);
  process.exit(0);
}
const legs = [...legTable(graph).values()].filter(leg => {
  const length = routeLength(graph, leg.via);
  return isFinite(leg.time) && length >= 300 && length <= 1600;
});

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const byKind = (kind: LegClass) => legs.filter(l => l.kind === kind);
const describe = (via: Leg["via"]) => {
  const names: string[] = [];
  for (const d of via) { const name = graph.measures.get(d.id)!.name; if (names[names.length - 1] !== name) names.push(name); }
  return names.join(" > ");
};
const detours = legs.map(l => l.detour).filter((d): d is number => d !== null).sort((a, b) => a - b);
const summary = {
  streets: SEATTLE_STREETS.length, nodes: graph.nodes.length, choicePoints: graph.choicePoints.length,
  deadEnds: graph.nodes.filter(n => graph.degree.get(n) === 1).length,
  legs: legs.length, priced: byKind("priced").length, free: byKind("free").length,
  even: byKind("even").length, twin: byKind("twin").length, none: byKind("none").length,
  medianDetour: detours.length ? detours[Math.floor(detours.length / 2)]! : null,
  sweetSpot: detours.filter(d => d >= 0.1 && d <= 0.25).length,
  // Sight at junction approaches: how many first see every other arm only
  // inside the clear distance, and the shortest sight on the map.
  approaches: graph.drives.length,
  blindApproaches: graph.drives.filter(d => d.sight < SIGHT_CLEAR).length,
  nearestSight: Math.min(...graph.drives.map(d => d.sight)),
  blindBends: [...graph.measures.values()].filter(m => m.sight < SIGHT_CLEAR).length,
};
const blindest = [...graph.drives].filter(d => d.sight < SIGHT_CLEAR).sort((a, b) => a.sight - b.sight).slice(0, 8)
  .map(d => ({ sight: d.sight, blind: blindness(d.sight), street: graph.measures.get(d.id)!.name, reversed: d.reversed,
    node: d.to, name: graph.nodeName(d.to) }));
const gateScore = new Map<string, number>();
for (const l of byKind("priced")) for (const n of [l.from, l.to]) gateScore.set(n, (gateScore.get(n) ?? 0) + 1);
const gates = [...gateScore].sort((a, b) => b[1] - a[1]).slice(0, 8);

if (asJson) {
  const plain = legs.map(l => ({ ...l, via: l.via.map(d => d.id), alternative: l.alternative.map(d => d.id),
    fromName: graph.nodeName(l.from), toName: graph.nodeName(l.to) }));
  console.log(JSON.stringify({ summary, pace: { top: PACE.top }, weights: RISK_WEIGHTS, sightClear: SIGHT_CLEAR,
    streets: [...graph.measures.values()], legs: plain, blindest,
    gates: gates.map(([node, count]) => ({ node, name: graph.nodeName(node), count })) }, null, 1));
} else {
  console.log(`Seattle: ${summary.streets} streets, ${summary.nodes} nodes, ${summary.choicePoints} choice points, ${summary.deadEnds} dead ends`);
  console.log(`Sight at junctions: ${summary.blindApproaches} of ${summary.approaches} approaches first see every other arm inside ${SIGHT_CLEAR} m (the clear distance); nearest ${summary.nearestSight.toFixed(0)} m; bends inside a street under it: ${summary.blindBends}`);
  console.log(`Directed legs between choice points, 300-1600 m by the fastest route: ${summary.legs}`);
  console.log(`  with a real alternative within 40% of its time: ${summary.legs - summary.none} (${pct((summary.legs - summary.none) / summary.legs)}); median detour ${summary.medianDetour === null ? "-" : pct(summary.medianDetour)}; in the 10-25% sweet spot: ${summary.sweetSpot}`);
  console.log(`  priced (fastest is the riskier): ${summary.priced}   free (fastest is the safer): ${summary.free}   even: ${summary.even}   twins (under 4% apart): ${summary.twin}   no choice: ${summary.none}`);
  console.log(`  gate candidates (nodes on the most priced legs): ${gates.map(([n, c]) => `${graph.nodeName(n)} (${c})`).join("; ") || "none"}`);
  const show = (title: string, rows: Leg[], sort: (a: Leg, b: Leg) => number, limit = 10) => {
    console.log(`\n${title}`);
    for (const l of rows.sort(sort).slice(0, limit)) {
      console.log(`  ${graph.nodeName(l.from)}  ->  ${graph.nodeName(l.to)}`);
      console.log(`     fast ${l.time.toFixed(0)} s / ${l.length.toFixed(0)} m  risk ${l.riskFast.toFixed(2)}  via ${describe(l.via)}`);
      if (l.detour !== null) console.log(`     alt  +${pct(l.detour)}${" ".repeat(Math.max(0, 8 - pct(l.detour).length))} risk ${l.riskAlternative!.toFixed(2)}  via ${describe(l.alternative)}`);
    }
  };
  show("Priced shortcuts — the fast way is the risky way (generator material), by risk gap:",
    byKind("priced"), (a, b) => (b.riskFast - b.riskAlternative!) - (a.riskFast - a.riskAlternative!));
  show("Free shortcuts — the fast way is also the safe way (defects under the rule), by risk gap:",
    byKind("free"), (a, b) => (b.riskAlternative! - b.riskFast) - (a.riskAlternative! - a.riskFast));
  show("No choice — nothing within 40% of the fastest time, longest first:", byKind("none"), (a, b) => b.length - a.length, 6);
  console.log(`\nBlind approaches — sight distance arriving at a junction, shortest first (blindness = 1 - sight / ${SIGHT_CLEAR} m):`);
  for (const b of blindest) {
    console.log(`  ${b.sight.toFixed(1).padStart(5)} m  ${b.blind.toFixed(2)}  ${b.street}${b.reversed ? " (reversed)" : ""} arriving at ${b.name}`);
  }
  if (!blindest.length) console.log("  none: every approach sees every other arm from the clear distance");
  const table = [...graph.measures.values()].sort((a, b) => b.risk - a.risk);
  console.log("\nRisk per street (narrow / bends / grade / blind bend, with its sight), then pace:");
  for (const r of [...table.slice(0, 8), ...table.slice(-4)]) {
    console.log(`  ${r.risk.toFixed(2)}  ${r.name.padEnd(22)} ${r.id.padEnd(8)} ${r.length.toFixed(0).padStart(4)} m  w ${r.width}  ${pct(r.narrow).padStart(4)} / ${r.bends.toFixed(2)} (sharpest ${r.sharpest.toFixed(0)} deg) / ${pct(r.grade)} / ${r.blind.toFixed(2)} (${r.sight === Infinity ? "open" : `${r.sight.toFixed(0)} m`})   ${(r.length / r.time * 3.6).toFixed(0)} km/h`);
  }
  console.log(`\nWeights: narrow ${RISK_WEIGHTS.narrow}, bends ${RISK_WEIGHTS.bends}, grade ${RISK_WEIGHTS.grade}, blind ${RISK_WEIGHTS.blind} (blindness 1 - sight / ${SIGHT_CLEAR} m, at bends inside a street and at every junction approach a route arrives on). Pace: ${PACE.top} m/s top, 16 m streets at 94% of it, a 90 degree turn 2.5 s, a climb 1 + 1.5 x grade. Proposals. Traffic is not scored: it is seeded uniformly per lane length.`);
}
