// The free cuts in Port Alder: every straight line of at most REACH metres between two points on the street network
// that stays clear of every solid, runs partly over open ground, and beats the streets between its ends by at least
// MIN_SAVE metres. GDD §60 wants every shortcut to cost something; a line that is shorter, clear and on open ground
// costs nothing, so each one found is a shortcut nobody drew.
//
// First run 2026-10-01, from a race against Moth (gen-moth-92229) where 228 m of grass between Madison Avenue and Fir
// Street won 7.2 s of a 9.0 s margin: 335 places, 256 of them in the four residential hill districts. This is that scan
// moved out of a session scratchpad, unchanged in what it measures, so filling the hills can be judged as a before and
// after number rather than by eye.
//
// It reads the map and changes nothing. Distances are metres along the street centrelines, not times: the line is
// priced by length alone, so ground pace, grade and the corners at each end are not in it. `pnpm alder:critique
// --try=` prices one properly, but only between two junctions, and a cut's ends are usually mid-block. Places whose
// midpoints lie within MERGE metres are counted once, so read the total as an order of magnitude, not an exact census.
//
//   pnpm alder:cuts                        summary, by neighbourhood, and the top 30
//   pnpm alder:cuts --top=100
//   pnpm alder:cuts --json                 every place, for agents and plots
//   pnpm alder:cuts --reach=250 --min-save=60 --min-ground=0.3
import { ALDER_BLOCKS, ALDER_SOLIDS, ALDER_STREETS, alderGround } from "../src/sim/alder.ts";
import { alderNeighbourhoodAt } from "../src/sim/alder-neighbourhoods.ts";
import { pointFootprintDistance, type BuildingBlock } from "../src/sim/building-footprint.ts";
import data from "../src/sim/alder-data.json" with { type: "json" };

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
/** Longest straight cut considered, metres. */
const REACH = Number(arg("reach") ?? 250);
/** Shortest saving against the streets that counts, metres. */
const MIN_SAVE = Number(arg("min-save") ?? 60);
/** Least share of the line on open ground (`alderGround`) for it to count as a cut across a block. */
const MIN_GROUND = Number(arg("min-ground") ?? 0.3);
/** How near a solid a line may pass and still be drivable: the distance the sim keeps a car's centre from one. */
const CLEAR = 1.8;
/** Streets are resampled to at most this many metres between points. */
const STEP = 15;
/** Places whose midpoints are this close are one place. */
const MERGE = 90;
const top = Number(arg("top") ?? 30);
const asJson = process.argv.includes("--json");

// The street network as a point graph: every street resampled to at most STEP m, joined where points coincide.
interface Node { readonly x: number; readonly z: number; readonly edges: [number, number][]; readonly streets: Set<number> }
const nodes: Node[] = [];
const byKey = new Map<string, number>();
const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
function node(x: number, z: number, street: number): number {
  const k = key(x, z);
  let i = byKey.get(k);
  if (i === undefined) { i = nodes.length; nodes.push({ x, z, edges: [], streets: new Set() }); byKey.set(k, i); }
  nodes[i]!.streets.add(street);
  return i;
}
function link(a: number, b: number) {
  if (a === b) return;
  const d = Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.z - nodes[b]!.z);
  nodes[a]!.edges.push([b, d]);
  nodes[b]!.edges.push([a, d]);
}
const ends: { node: number; street: number }[] = [];
ALDER_STREETS.forEach((street, s) => {
  const pts = street.points;
  let prev = node(pts[0]!.x, pts[0]!.z, s);
  const first = prev;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
    for (let k = 1; k <= n; k++) { const cur = node(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, s); link(prev, cur); prev = cur; }
  }
  ends.push({ node: first, street: s }, { node: prev, street: s });
});
// A street end on another street's line (a T the data did not split there) joins that street at its nearer point.
const segments: { a: Node; b: Node; ai: number; bi: number; street: number }[] = [];
nodes.forEach((n, i) => {
  for (const [j] of n.edges) if (j > i) segments.push({ a: n, b: nodes[j]!, ai: i, bi: j, street: [...n.streets].find(s => nodes[j]!.streets.has(s)) ?? -1 });
});
const width = (s: number) => ALDER_STREETS[s]!.points[0]!.width;
for (const end of ends) {
  const n = nodes[end.node]!;
  if (n.streets.size > 1) continue;
  for (const g of segments) {
    if (g.street === end.street || g.street < 0) continue;
    const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z;
    const t = Math.max(0, Math.min(1, ((n.x - g.a.x) * dx + (n.z - g.a.z) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(n.x - g.a.x - t * dx, n.z - g.a.z - t * dz) <= width(g.street) / 2 + width(end.street) / 2 + 2) {
      link(end.node, t < 0.5 ? g.ai : g.bi);
      break;
    }
  }
}

/** Shortest distances along the network from one point, out to `cap` metres. */
function distancesFrom(from: number, cap: number): Map<number, number> {
  const dist = new Map<number, number>([[from, 0]]);
  const heap: [number, number][] = [[0, from]];
  const push = (v: [number, number]) => {
    heap.push(v);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
  };
  const pop = (): [number, number] => {
    const topItem = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return topItem;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > (dist.get(i) ?? Infinity) || d > cap) continue;
    for (const [j, w] of nodes[i]!.edges) { const nd = d + w; if (nd < (dist.get(j) ?? Infinity)) { dist.set(j, nd); push([nd, j]); } }
  }
  return dist;
}

const solids = ALDER_SOLIDS as readonly BuildingBlock[];
/** The line from a to b, sampled every 2 m: null when it passes within CLEAR of a solid or crosses the shore,
 *  otherwise its length and the share of it on open ground. */
function cutLine(a: Node, b: Node): { length: number; ground: number } | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(length / 2);
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const near = solids.filter(s => {
    if (Math.abs(s.x - mx) < 80 && Math.abs(s.z - mz) < 80) return true;
    if (length <= 120) return false;
    const t = Math.max(0, Math.min(1, ((s.x - a.x) * (b.x - a.x) + (s.z - a.z) * (b.z - a.z)) / (length * length)));
    return Math.hypot(s.x - a.x - t * (b.x - a.x), s.z - a.z - t * (b.z - a.z)) < 60;
  });
  let ground = 0;
  for (let k = 0; k <= n; k++) {
    const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
    if (x < data.shore) return null;
    if (near.some(s => pointFootprintDistance(s, x, z) < CLEAR)) return null;
    if (alderGround(x, z)) ground++;
  }
  return { length, ground: ground / (n + 1) };
}

// Every pair of points within REACH whose straight line beats the network by MIN_SAVE, largest saving first.
const cell = (v: number) => Math.floor(v / REACH);
const grid = new Map<string, number[]>();
nodes.forEach((n, i) => { const k = `${cell(n.x)},${cell(n.z)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
interface Pair { readonly a: Node; readonly b: Node; readonly straight: number; readonly network: number; readonly save: number }
const pairs: Pair[] = [];
nodes.forEach((a, ai) => {
  const near: number[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) near.push(...(grid.get(`${cell(a.x) + dx},${cell(a.z) + dz}`) ?? []));
  const candidates = near.filter(bi => bi > ai).map(bi => ({ b: nodes[bi]!, bi, straight: Math.hypot(nodes[bi]!.x - a.x, nodes[bi]!.z - a.z) }))
    .filter(c => c.straight <= REACH && c.straight >= 30);
  if (!candidates.length) return;
  const dist = distancesFrom(ai, REACH * 8);
  for (const c of candidates) {
    const network = dist.get(c.bi) ?? Infinity, save = network - c.straight;
    if (save >= MIN_SAVE) pairs.push({ a, b: c.b, straight: c.straight, network, save });
  }
});
// Unreached within the cap sorts as the largest saving of all.
const rank = (p: Pair) => Number.isFinite(p.save) ? p.save : 1e9;
pairs.sort((p, q) => rank(q) - rank(p));

export interface Cut {
  readonly from: string;
  readonly to: string;
  readonly x: number; readonly z: number;
  readonly tx: number; readonly tz: number;
  /** The midpoint, which places merge on and the neighbourhood is read at. */
  readonly mx: number; readonly mz: number;
  readonly neighbourhood: string;
  readonly straight: number;
  /** Metres by street, or null when the network does not join the ends within REACH × 8. */
  readonly network: number | null;
  readonly save: number | null;
  /** Share of the line on open ground, 0-1. */
  readonly ground: number;
}
const cuts: Cut[] = [];
let checked = 0;
const streetName = (n: Node) => { const s = ALDER_STREETS[[...n.streets][0]!]!; return s.name || s.id; };
for (const p of pairs) {
  const mx = (p.a.x + p.b.x) / 2, mz = (p.a.z + p.b.z) / 2;
  if (cuts.some(c => Math.hypot(c.mx - mx, c.mz - mz) < MERGE)) continue;
  checked++;
  const line = cutLine(p.a, p.b);
  if (!line || line.ground < MIN_GROUND) continue;
  cuts.push({
    from: streetName(p.a), to: streetName(p.b),
    x: +p.a.x.toFixed(1), z: +p.a.z.toFixed(1), tx: +p.b.x.toFixed(1), tz: +p.b.z.toFixed(1), mx, mz,
    neighbourhood: alderNeighbourhoodAt(mx, mz)?.id ?? "outside",
    straight: Math.round(p.straight),
    network: Number.isFinite(p.network) ? Math.round(p.network) : null,
    save: Number.isFinite(p.save) ? Math.round(p.save) : null,
    ground: +line.ground.toFixed(2),
  });
}

if (asJson) {
  console.log(JSON.stringify({ reach: REACH, minSave: MIN_SAVE, minGround: MIN_GROUND, version: data.version, pairs: pairs.length, checked, cuts }));
} else {
  const bands = [[400, Infinity], [250, 400], [150, 250], [MIN_SAVE, 150]] as const;
  console.log(`Free cuts: ${cuts.length} places (reach ${REACH} m, saving >= ${MIN_SAVE} m, >= ${Math.round(MIN_GROUND * 100)}% open ground)`);
  console.log(`  ${pairs.length} pairs saved >= ${MIN_SAVE} m; ${checked} distinct places checked for solids and ground`);
  for (const [lo, hi] of bands) {
    const n = cuts.filter(c => (c.save ?? Infinity) >= lo && (c.save ?? Infinity) < hi).length;
    console.log(`  ${(hi === Infinity ? `${lo}+` : `${lo}-${hi}`).padEnd(8)} m saved: ${n}`);
  }
  console.log(`  >= 70% open ground: ${cuts.filter(c => c.ground >= 0.7).length}`);

  const table = new Map<string, { cuts: number; big: number; grassy: number; buildings: number; area: number }>();
  const row = (k: string) => table.get(k) ?? table.set(k, { cuts: 0, big: 0, grassy: 0, buildings: 0, area: 0 }).get(k)!;
  for (const c of cuts) { const r = row(c.neighbourhood); r.cuts++; if ((c.save ?? Infinity) >= 250) r.big++; if (c.ground >= 0.7) r.grassy++; }
  for (const b of ALDER_BLOCKS) { const r = row(alderNeighbourhoodAt(b.x, b.z)?.id ?? "outside"); r.buildings++; r.area += b.width * b.depth; }
  console.log("\nneighbourhood        cuts  250m+  >=70%ground  buildings  mean footprint m2");
  for (const [k, r] of [...table].sort((a, b) => b[1].cuts - a[1].cuts)) {
    console.log(`${k.padEnd(20)} ${String(r.cuts).padStart(4)} ${String(r.big).padStart(6)} ${String(r.grassy).padStart(12)} ${String(r.buildings).padStart(10)} ${String(Math.round(r.area / Math.max(1, r.buildings))).padStart(18)}`);
  }

  console.log(`\nTop ${Math.min(top, cuts.length)} (metres; ends in game coordinates):`);
  cuts.slice(0, top).forEach((c, i) => {
    console.log(`${String(i + 1).padStart(4)}. ${String(c.save ?? "unreached").padStart(9)} saved  ${String(c.straight).padStart(4)} cut, ${String(Math.round(c.ground * 100)).padStart(3)}% ground, vs ${String(c.network ?? "-").padStart(5)} by street  ${c.from} -> ${c.to}  [${c.neighbourhood}]  (${c.x}, ${c.z}) -> (${c.tx}, ${c.tz})`);
  });
}
