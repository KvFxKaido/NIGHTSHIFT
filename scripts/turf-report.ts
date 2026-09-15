// What each Blacklist turf does to the draw (src/sim/alder-turf.ts,
// design/PROCEDURAL_RACES.md step 2). For every turf: start on the street
// nearest its centre, draw the same seeds with no turf and with the turf, and
// compare how much of the race lies inside, how long it is, how much of it
// offers a priced or even choice, and whether every seed still draws. Where two
// turfs sit close together, it also says how much of one name's races lie in
// the other's turf, which is how alike their races would feel.
//
// It reads the map and changes nothing.
//
//   pnpm alder:turf                         the report
//   pnpm alder:turf --seeds=100 --pull=3 --radius=800
//   pnpm alder:turf --json
import { ALDER_STREETS, alderHeight, alderRouting } from "../src/sim/alder.ts";
import { ALDER_TURFS, TURF_RADIUS, type RivalTurf } from "../src/sim/alder-turf.ts";
import { GENERATOR, generateRace, startApproach, turfShare, type GeneratedRace, type Turf } from "../src/sim/race-generator.ts";
import { headingOf, snapToLane } from "../src/sim/race-start.ts";
import { routeLength } from "../src/sim/route-choice.ts";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const seeds = Number(arg("seeds") ?? 100);
const pull = arg("pull");
if (pull !== undefined) (GENERATOR.turf as { pull: number }).pull = Number(pull);
const radius = Number(arg("radius") ?? TURF_RADIUS);
const asJson = process.argv.includes("--json");
const graph = alderRouting();
const turfs: RivalTurf[] = ALDER_TURFS.map(t => ({ ...t, radius }));

/** The lane nearest a turf's centre, facing along its street: where a flash there would start. */
function startNear(turf: Turf) {
  let best: { distance: number; x: number; z: number; ux: number; uz: number } | null = null;
  for (const street of ALDER_STREETS) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const t = Math.max(0, Math.min(1, ((turf.centre.x - a.x) * dx + (turf.centre.z - a.z) * dz) / (length * length)));
      const x = a.x + dx * t, z = a.z + dz * t, distance = Math.hypot(turf.centre.x - x, turf.centre.z - z);
      if (!best || distance < best.distance) best = { distance, x, z, ux: dx / length, uz: dz / length };
    }
  }
  const pose = snapToLane(ALDER_STREETS, { x: best!.x, z: best!.z, heading: headingOf(best!.ux, best!.uz) }, alderHeight);
  if (!pose || ![pose.x, pose.z, pose.heading].every(Number.isFinite)) throw new Error(`No lane near ${turf.id}`);
  return pose;
}

const inside = (race: GeneratedRace, turf: Turf) => {
  let metres = 0, within = 0;
  for (const leg of race.legs) { const m = routeLength(graph, leg.via); metres += m; within += m * turfShare(graph, leg, turf); }
  return { metres, share: metres ? within / metres : 0 };
};
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
const mean = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;

function draws(turf: Turf, withTurf: boolean) {
  const from = startNear(turf);
  const approach = startApproach(ALDER_STREETS, from);
  const races: GeneratedRace[] = [];
  let failed = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    try { races.push(generateRace(graph, seed, approach.node, approach.arriving, [approach.street.id], withTurf ? turf : null)); } catch { failed++; }
  }
  const legs = races.flatMap(r => r.legs);
  return { races, failed,
    inside: mean(races.map(r => inside(r, turf).share)),
    km: median(races.map(r => inside(r, turf).metres / 1000)),
    choice: legs.filter(l => l.kind === "priced" || l.kind === "even").length / Math.max(1, legs.length) };
}

const rows = turfs.map(turf => {
  const plain = draws(turf, false), leaning = draws(turf, true);
  const near = turfs.filter(o => o.id !== turf.id && Math.hypot(o.centre.x - turf.centre.x, o.centre.z - turf.centre.z) < 2 * radius);
  const start = startNear(turf);
  return { id: turf.id, name: turf.name, place: turf.place, anchor: turf.anchor, centre: turf.centre, start: { x: Math.round(start.x), z: Math.round(start.z) },
    plain: { inside: plain.inside, km: plain.km, choice: plain.choice, failed: plain.failed },
    turf: { inside: leaning.inside, km: leaning.km, choice: leaning.choice, failed: leaning.failed },
    changed: leaning.races.filter((r, i) => JSON.stringify(r.legs.map(l => l.to)) !== JSON.stringify(plain.races[i]?.legs.map(l => l.to))).length,
    neighbours: near.map(o => ({ id: o.id, apart: Math.round(Math.hypot(o.centre.x - turf.centre.x, o.centre.z - turf.centre.z)),
      insideTheirs: mean(leaning.races.map(r => inside(r, o).share)) })) };
});

if (asJson) {
  console.log(JSON.stringify({ seeds, pull: GENERATOR.turf.pull, radius, rows }, null, 2));
} else {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
  console.log(`Turf pull ${GENERATOR.turf.pull}, radius ${radius} m, seeds 1-${seeds}, each drawn from the lane nearest the turf's centre. Tally's whole-city turf is no pull and is not listed.`);
  console.log(`${"".padEnd(9)}inside turf     race km      priced/even   no race   seeds that draw another race`);
  for (const r of rows) {
    console.log(`${r.id.padEnd(9)}${pct(r.plain.inside)} -> ${pct(r.turf.inside)}    ${r.plain.km.toFixed(1)} -> ${r.turf.km.toFixed(1)}    ${pct(r.plain.choice)} -> ${pct(r.turf.choice)}    ${r.plain.failed} -> ${r.turf.failed}      ${r.changed}/${seeds}`);
    for (const n of r.neighbours) console.log(`${"".padEnd(11)}${n.apart} m from ${n.id}; ${pct(n.insideTheirs)} of ${r.name}'s turf races lie in ${n.id}'s turf`);
  }
}
