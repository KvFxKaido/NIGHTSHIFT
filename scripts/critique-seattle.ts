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
import { SEATTLE_STREETS, SEATTLE_BLOCKS, seattleHeight } from "../src/sim/seattle.ts";
import { buildRoutingGraph, legTable, routeLength, blindness, PACE, RISK_WEIGHTS, SIGHT_CLEAR, type Leg,
  type LegClass, type RoutingGraph } from "../src/sim/route-choice.ts";

const asJson = process.argv.includes("--json");
const graph: RoutingGraph = buildRoutingGraph(SEATTLE_STREETS, seattleHeight, SEATTLE_BLOCKS);
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
