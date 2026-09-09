/**
 * A measuring stick for the district's layout.
 *
 * Every fix this project has made to the district came with a number — 39% of
 * road samples buried, 4.21 m of building interpenetration, 226 s of gridlock —
 * and a layout "makeover" has none, so it can only be argued about. This reports
 * the properties that decide whether a street network is worth driving, so a
 * change to the map can be judged rather than admired.
 *
 * It asserts nothing. Targets are printed beside the measurements and are
 * proposals, not gates: the point is to establish a baseline first and argue
 * about the targets second. `--json` emits the same numbers for an agent.
 *
 *   pnpm district:critique
 *   pnpm district:critique --json
 */
import {
  DISTRICT_STREETS, DISTRICT_JUNCTIONS, DISTRICT_BLOCKS, DISTRICT_FACES, RIVER, RAIL,
  distanceToPath, outerTerrain, type Street,
} from "../src/sim/district.ts";
import { pathLength, pathSamples } from "../src/sim/lanes.ts";

const asJson = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Zones. Not the street families — those are how the map was typed, and two
// families can still drive identically. These are what the driver is actually
// in, taken from the geography the layout was built around.
// ---------------------------------------------------------------------------
type Zone = "core" | "waterfront" | "lineside" | "hill" | "inner";
const ZONES: Zone[] = ["core", "waterfront", "lineside", "hill", "inner"];

function midpoint(street: Street): { x: number; z: number } {
  const half = pathLength(street.points) / 2;
  let travelled = 0;
  for (let i = 0; i < street.points.length - 1; i++) {
    const a = street.points[i]!, b = street.points[i + 1]!;
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (travelled + run >= half) {
      const t = (half - travelled) / (run || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    travelled += run;
  }
  return street.points[street.points.length - 1]!;
}

function zoneOf(street: Street): Zone {
  if (!street.added) return "core";
  const mid = midpoint(street);
  if (distanceToPath(RIVER, mid.x, mid.z) < 170) return "waterfront";
  if (distanceToPath(RAIL, mid.x, mid.z) < 130) return "lineside";
  if (outerTerrain(mid.x, mid.z) > 8) return "hill";
  return "inner";
}

const zoneByStreet = new Map(DISTRICT_STREETS.map(s => [s.id, zoneOf(s)]));

// ---------------------------------------------------------------------------
// Shape: how the road bends and climbs. An arcade racer wants a mix — a network
// of nothing but straights is a grid, and one of nothing but tight corners is
// exhausting long before it is interesting.
// ---------------------------------------------------------------------------
const BENDS = [
  { name: "straight", min: 400 },
  { name: "sweeper", min: 150 },
  { name: "medium", min: 60 },
  { name: "tight", min: 0 },
] as const;

interface Shape {
  metres: number;
  bend: Record<string, number>;
  /** Metres of road at each grade band, and the steepest found. */
  climbing: number;
  steepest: number;
  /** How far the road runs before it turns 25 deg away from where you are aimed. */
  sightlines: number[];
}

function shapeOf(streets: readonly Street[]): Shape {
  const bend: Record<string, number> = Object.fromEntries(BENDS.map(b => [b.name, 0]));
  const sightlines: number[] = [];
  let metres = 0, climbing = 0, steepest = 0;
  const STEP = 5;
  for (const street of streets) {
    const samples = pathSamples(street.points, STEP);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!, b = samples[i]!;
      metres += STEP;
      // Radius from the turn rate: r = ds / dtheta.
      const cross = a.dirX * b.dirZ - a.dirZ * b.dirX;
      const dot = a.dirX * b.dirX + a.dirZ * b.dirZ;
      const turn = Math.abs(Math.atan2(cross, dot));
      const radius = turn < 1e-6 ? Infinity : STEP / turn;
      bend[BENDS.find(band => radius >= band.min)!.name]! += STEP;

    }
    // Grade comes from the authored points, not the samples: PathSample carries
    // no height, so reading `y` off one is undefined and measured this district's
    // 20 m hill as perfectly flat.
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!;
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      if (run < 1e-6) continue;
      const grade = Math.abs(b.y - a.y) / run;
      if (grade > 0.01) climbing += run;
      steepest = Math.max(steepest, grade);
    }
    // Sightline: march on until the road has turned 25 deg off the start heading.
    for (let i = 0; i < samples.length; i++) {
      const start = samples[i]!;
      let run = 0;
      for (let j = i + 1; j < samples.length; j++) {
        const here = samples[j]!;
        const dot = start.dirX * here.dirX + start.dirZ * here.dirZ;
        if (Math.acos(Math.max(-1, Math.min(1, dot))) > 25 * Math.PI / 180) break;
        run += STEP;
      }
      sightlines.push(run);
    }
  }
  return { metres, bend, climbing, steepest, sightlines };
}

// ---------------------------------------------------------------------------
// Topology. Degree-2 nodes are not decisions — they are two streets meeting in
// a line — so the graph is contracted onto real choice points before anything
// is measured about how often you get to choose.
// ---------------------------------------------------------------------------
interface Edge { a: string; b: string; cost: number; id: string }
const rawEdges: Edge[] = DISTRICT_STREETS.map(s =>
  ({ a: s.from, b: s.to, cost: pathLength(s.points), id: s.id }));
const nodes = [...new Set(rawEdges.flatMap(e => [e.a, e.b]))];

const degree = new Map<string, number>();
for (const e of rawEdges) for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
const choicePoints = nodes.filter(n => (degree.get(n) ?? 0) >= 3);

/** Contract chains through degree-2 nodes; the result's edges are the runs
 *  between one decision and the next. */
function contracted(): Edge[] {
  const out: Edge[] = [];
  const used = new Set<string>();
  for (const start of choicePoints) {
    for (const first of rawEdges.filter(e => e.a === start || e.b === start)) {
      if (used.has(first.id)) continue;
      let cost = 0, at = start, edge: Edge | undefined = first;
      const chain: string[] = [];
      while (edge) {
        chain.push(edge.id);
        cost += edge.cost;
        at = edge.a === at ? edge.b : edge.a;
        if ((degree.get(at) ?? 0) !== 2) break;
        edge = rawEdges.find(e => !chain.includes(e.id) && (e.a === at || e.b === at));
      }
      for (const id of chain) used.add(id);
      out.push({ a: start, b: at, cost, id: chain.join("+") });
    }
  }
  return out;
}
const edges = contracted();

/** Dijkstra returning cost and the edges taken, with an optional banned edge. */
function route(from: string, to: string, banned?: string): { cost: number; via: string[] } {
  const dist = new Map(nodes.map(n => [n, Infinity]));
  const prev = new Map<string, Edge>();
  dist.set(from, 0);
  const seen = new Set<string>();
  for (;;) {
    let best: string | null = null;
    for (const n of nodes) if (!seen.has(n) && dist.get(n)! < (best === null ? Infinity : dist.get(best)!)) best = n;
    if (best === null || dist.get(best) === Infinity) break;
    if (best === to) break;
    seen.add(best);
    for (const e of edges) {
      if (e.id === banned) continue;
      const other = e.a === best ? e.b : e.b === best ? e.a : null;
      if (other === null) continue;
      const cost = dist.get(best)! + e.cost;
      if (cost < dist.get(other)!) { dist.set(other, cost); prev.set(other, e); }
    }
  }
  const via: string[] = [];
  for (let at = to; prev.has(at);) {
    const e = prev.get(at)!;
    via.push(e.id);
    at = e.a === at ? e.b : e.a;
  }
  return { cost: dist.get(to)!, via };
}

/**
 * Route choice, which is the measurable form of "does learning the city matter".
 *
 * For each journey, close the single most important street on its best route and
 * see what the detour costs. If the answer is always "a lot", there is one way
 * to go and nothing to learn; if it is always "nothing", the map is soup.
 */
function routeChoice() {
  const penalties: number[] = [];
  let stranded = 0;
  for (let i = 0; i < choicePoints.length; i++) {
    for (let j = i + 1; j < choicePoints.length; j++) {
      const base = route(choicePoints[i]!, choicePoints[j]!);
      if (!isFinite(base.cost) || base.cost < 200) continue;
      let worst = base.cost;
      // Only the streets on the best route can matter; banning the rest is work
      // that cannot change the answer.
      for (const id of base.via) {
        const alt = route(choicePoints[i]!, choicePoints[j]!, id);
        worst = Math.max(worst, alt.cost);
      }
      if (!isFinite(worst)) { stranded++; continue; }
      penalties.push((worst - base.cost) / base.cost);
    }
  }
  penalties.sort((a, b) => a - b);
  return { penalties, stranded };
}

/** The shallowest angle any two streets meet at, per junction. A pair leaving
 *  on nearly the same bearing shares kerbs for tens of metres and reads as one
 *  road forking late — it is how three layout defects got in. */
function junctionAngles() {
  const rows: { id: string; degree: number; shallowest: number }[] = [];
  for (const junction of DISTRICT_JUNCTIONS) {
    const headings: number[] = [];
    for (const street of DISTRICT_STREETS) {
      const ends: [boolean, number][] = [[street.from === junction.id, 0], [street.to === junction.id, 1]];
      for (const [matches, end] of ends) {
        if (!matches) continue;
        const points = street.points;
        const a = end === 0 ? points[0]! : points[points.length - 1]!;
        const b = end === 0 ? points[1]! : points[points.length - 2]!;
        headings.push(Math.atan2(b.z - a.z, b.x - a.x));
      }
    }
    if (headings.length < 2) continue;
    let shallowest = 180;
    for (let i = 0; i < headings.length; i++) {
      for (let j = i + 1; j < headings.length; j++) {
        let d = Math.abs(headings[i]! - headings[j]!) * 180 / Math.PI;
        if (d > 180) d = 360 - d;
        shallowest = Math.min(shallowest, d);
      }
    }
    rows.push({ id: junction.id, degree: headings.length, shallowest });
  }
  return rows.sort((a, b) => a.shallowest - b.shallowest);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const quantile = (sorted: number[], q: number) =>
  sorted.length ? sorted[Math.floor(q * (sorted.length - 1))]! : NaN;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const total = DISTRICT_STREETS.reduce((sum, s) => sum + pathLength(s.points), 0);
const whole = shapeOf(DISTRICT_STREETS);
const runs = edges.map(e => e.cost).sort((a, b) => a - b);
const choice = routeChoice();
const angles = junctionAngles();

/** Each building belongs to the street it fronts. Counting it in every zone
 *  whose streets pass nearby reported 65 buildings as 87. */
const blockZone = new Map(DISTRICT_BLOCKS.map(block => {
  let best: Zone = "inner", nearest = Infinity;
  for (const street of DISTRICT_STREETS) {
    for (const point of street.points) {
      const gap = Math.hypot(point.x - block.x, point.z - block.z);
      if (gap < nearest) { nearest = gap; best = zoneByStreet.get(street.id)!; }
    }
  }
  return [block, best] as const;
}));

const zones = ZONES.map(zone => {
  const streets = DISTRICT_STREETS.filter(s => zoneByStreet.get(s.id) === zone);
  const shape = shapeOf(streets);
  const blocks = DISTRICT_BLOCKS.filter(b => blockZone.get(b) === zone);
  return {
    zone,
    streets: streets.length,
    km: shape.metres / 1000,
    straight: shape.metres ? shape.bend.straight! / shape.metres : 0,
    tight: shape.metres ? shape.bend.tight! / shape.metres : 0,
    climbing: shape.metres ? shape.climbing / shape.metres : 0,
    sightline: quantile([...shape.sightlines].sort((a, b) => a - b), 0.5),
    medianWidth: streets.length
      ? [...streets.map(s => s.points[0]!.width)].sort((a, b) => a - b)[Math.floor(streets.length / 2)]!
      : 0,
    blocks: blocks.length,
    medianHeight: blocks.length
      ? [...blocks.map(b => b.height)].sort((a, b) => a - b)[Math.floor(blocks.length / 2)]!
      : 0,
  };
});

/** Is the district built on, or is it roads in a void? A face the street graph
 *  encloses is a city block; one with nothing standing in it is a field. */
function massing() {
  const areaOf = (face: readonly { x: number; z: number }[]) => {
    let twice = 0;
    for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
      twice += (face[j]!.x + face[i]!.x) * (face[j]!.z - face[i]!.z);
    }
    return Math.abs(twice / 2);
  };
  const inFace = (face: readonly { x: number; z: number }[], x: number, z: number) => {
    let hit = false;
    for (let i = 0, j = face.length - 1; i < face.length; j = i++) {
      const a = face[i]!, b = face[j]!;
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  };
  const faces = DISTRICT_FACES.map(face => ({
    area: areaOf(face),
    held: DISTRICT_BLOCKS.filter(b => inFace(face, b.x, b.z)).length,
  }));
  const streetX = DISTRICT_STREETS.flatMap(s => s.points.map(p => p.x));
  const streetZ = DISTRICT_STREETS.flatMap(s => s.points.map(p => p.z));
  const districtArea = (Math.max(...streetX) - Math.min(...streetX))
    * (Math.max(...streetZ) - Math.min(...streetZ));
  const builtArea = (Math.max(...DISTRICT_BLOCKS.map(b => b.x)) - Math.min(...DISTRICT_BLOCKS.map(b => b.x)))
    * (Math.max(...DISTRICT_BLOCKS.map(b => b.z)) - Math.min(...DISTRICT_BLOCKS.map(b => b.z)));
  return {
    faces: faces.length,
    empty: faces.filter(f => f.held === 0).length,
    emptyArea: faces.filter(f => f.held === 0).reduce((sum, f) => sum + f.area, 0),
    buildings: DISTRICT_BLOCKS.length,
    coverage: builtArea / districtArea,
  };
}
const built = massing();

const report = {
  size: { km: total / 1000, streets: DISTRICT_STREETS.length, junctions: DISTRICT_JUNCTIONS.length,
    choicePoints: choicePoints.length, passThroughs: nodes.length - choicePoints.length,
    deadEnds: nodes.filter(n => degree.get(n) === 1).length },
  decisions: { runs: runs.length, shortest: runs[0], median: quantile(runs, 0.5), longest: runs[runs.length - 1] },
  choice: { journeys: choice.penalties.length, stranded: choice.stranded,
    withAlternative: choice.penalties.filter(p => p < 0.25).length,
    median: quantile(choice.penalties, 0.5), upperQuartile: quantile(choice.penalties, 0.75) },
  shape: { straight: whole.bend.straight! / whole.metres, sweeper: whole.bend.sweeper! / whole.metres,
    medium: whole.bend.medium! / whole.metres, tight: whole.bend.tight! / whole.metres,
    climbing: whole.climbing / whole.metres, steepest: whole.steepest,
    sightline: quantile([...whole.sightlines].sort((a, b) => a - b), 0.5) },
  junctions: { shallowest: angles.slice(0, 5), under30: angles.filter(a => a.shallowest < 30).length },
  massing: built,
  zones,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (label: string, value: string, target = "") =>
    console.log(`  ${label.padEnd(30)} ${value.padEnd(24)} ${target}`);

  console.log(`\nBLACKGLASS DISTRICT — layout critique`);
  console.log(`${"=".repeat(78)}\n`);

  console.log("SIZE");
  line("network", `${report.size.km.toFixed(2)} km over ${report.size.streets} streets`);
  line("choice points", `${report.size.choicePoints} of ${report.size.junctions} junctions`,
    `${report.size.passThroughs} are pass-throughs`);
  line("dead ends", `${report.size.deadEnds}`, "target 0 — a dead end is a reset, not a route");

  console.log("\nHOW OFTEN YOU CHOOSE   (run between one decision and the next)");
  line("shortest run", `${report.decisions.shortest!.toFixed(0)} m`);
  line("median run", `${report.decisions.median.toFixed(0)} m`, "target 150-300 m at these speeds");
  line("longest run", `${report.decisions.longest!.toFixed(0)} m`);

  console.log("\nWHETHER LEARNING IT MATTERS   (close the key street; what does the detour cost?)");
  line("journeys measured", `${report.choice.journeys}`, "between choice points, over 200 m");
  line("have a real alternative", `${report.choice.withAlternative} (${pct(report.choice.withAlternative / report.choice.journeys)})`,
    "target 50%+ — below that there is one way, not a choice");
  line("median detour", pct(report.choice.median), "target under 40%");
  line("upper quartile", pct(report.choice.upperQuartile));
  line("no alternative at all", `${report.choice.stranded}`, "target 0 outside the river crossings");

  console.log("\nWHAT IT IS LIKE TO DRIVE");
  line("straight (r > 400 m)", pct(report.shape.straight), "target under 45% — more is a grid");
  line("sweeper (150-400 m)", pct(report.shape.sweeper));
  line("medium (60-150 m)", pct(report.shape.medium));
  line("tight (under 60 m)", pct(report.shape.tight), "target 10%+ — corners you brake for");
  line("climbing or falling", pct(report.shape.climbing), "target 35%+ — the hill should be felt");
  line("steepest grade", pct(report.shape.steepest));
  line("median sightline", `${report.shape.sightline.toFixed(0)} m`, "how far before the road turns away");

  console.log("\nJUNCTION QUALITY   (the shallowest angle two streets meet at)");
  line("under 30 deg", `${report.junctions.under30}`,
    "target 0 — a shallow fork shares kerbs and reads as one road");
  for (const j of report.junctions.shallowest) {
    console.log(`    ${j.id.padEnd(22)} ${j.shallowest.toFixed(0).padStart(3)} deg, ${j.degree} arms`);
  }

  console.log("\nIS IT BUILT ON?   (a face the streets enclose is a block; empty, it is a field)");
  line("faces with nothing in them", `${report.massing.empty} of ${report.massing.faces}`,
    "target 0 — every enclosed block should be built");
  line("that is unbuilt enclosure", `${(report.massing.emptyArea / 1000).toFixed(0)}k m2`);
  line("buildings", `${report.massing.buildings}`);
  line("built extent vs district", pct(report.massing.coverage),
    "target 70%+ — below that the edges are roads in a void");

  console.log("\nDO THE ZONES DIFFER?   (if two rows read alike, they drive alike)");
  console.log(`    ${"zone".padEnd(12)}${"km".padStart(6)}${"straight".padStart(10)}${"tight".padStart(7)}` +
    `${"climb".padStart(7)}${"sight".padStart(7)}${"width".padStart(7)}${"blocks".padStart(8)}${"height".padStart(8)}`);
  for (const z of report.zones) {
    console.log(`    ${z.zone.padEnd(12)}${z.km.toFixed(2).padStart(6)}${pct(z.straight).padStart(10)}` +
      `${pct(z.tight).padStart(7)}${pct(z.climbing).padStart(7)}${z.sightline.toFixed(0).padStart(7)}` +
      `${z.medianWidth.toFixed(0).padStart(7)}${String(z.blocks).padStart(8)}${z.medianHeight.toFixed(0).padStart(8)}`);
  }
  console.log(`\n${"=".repeat(78)}`);
  console.log("Targets are proposals, not gates. Nothing here fails a build.\n");
}
