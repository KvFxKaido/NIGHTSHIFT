import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const revision = process.env.NS_STOP_REVISION ?? 'v1';
if (!['v1', 'v2'].includes(revision)) throw new Error('Invalid stopping revision');
const root = revision === 'v1' ? 'artifacts/raceability-full-gate' : 'artifacts/raceability-full-gate-v2';
const seeds = [0, 1000, 271828, 1, 42, 314159];
const collect = mode => seeds.flatMap(seed => Array.from({ length: 4 }, (_, group) => {
  const path = `${root}/${mode}-${seed}-${group}.jsonl`;
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(s => s.endsWith('}')).map(s => ({ seed, ...JSON.parse(s) }));
}).flat());
const current = collect('current'), swept = collect('swept');
const key = r => `${r.seed}/${r.id}`;
for (const rows of [current, swept]) if (new Set(rows.map(key)).size !== rows.length) throw new Error('Duplicate gate row');
const old = new Map(current.map(r => [key(r), r]));
const comparisons = swept.filter(r => old.has(key(r))).map(now => {
  const was = old.get(key(now));
  const delta = was.seconds !== null && now.seconds !== null ? +(now.seconds - was.seconds).toFixed(2) : null;
  const reasons = [];
  if (now.seconds === null && was.seconds !== null) reasons.push('new DNF');
  if (now.impulseTicks > 0 && was.impulseTicks === 0) reasons.push('new physical contact');
  if (now.impulseTicks > was.impulseTicks + 30) reasons.push('over 0.5 s more physical contact');
  if (now.physicalEvents.length > was.physicalEvents.length) reasons.push('more physical episodes');
  if (now.physicalEvents.length && Math.max(...now.physicalEvents.map(e => e.speed)) > Math.max(0, ...was.physicalEvents.map(e => e.speed)) + 5) reasons.push('higher-speed physical contact');
  if (now.contact > 0 && was.contact === 0) reasons.push('new approximate contact');
  if (now.resets + now.unseen > was.resets + was.unseen) reasons.push('more resets');
  if (now.reversals > was.reversals) reasons.push('more reversals');
  if (now.off > 0 && was.off === 0) reasons.push('new ground contact');
  if (now.off > was.off + 60) reasons.push('over 1 s more ground contact');
  if (delta !== null && delta > 5) reasons.push('over 5 s slower');
  return { id: now.id, seed: now.seed, delta, reasons, was, now };
});
const summary = rows => ({ runs: rows.length, dnf: rows.filter(r => r.seconds === null).length,
  seconds: +rows.reduce((s, r) => s + (r.seconds ?? 0), 0).toFixed(2),
  racesWithPhysicalContact: rows.filter(r => r.impulseTicks > 0).length,
  impulseTicks: rows.reduce((s, r) => s + r.impulseTicks, 0),
  uniquePhysicalOnsets: new Set(rows.flatMap(r => r.physicalEvents.map(e => `${r.seed}/${e.tick}/${Math.round(e.along)}/${e.other}`))).size,
  racesWithApproximateContact: rows.filter(r => r.contact > 0).length,
  contactTicks: rows.reduce((s, r) => s + r.contact, 0),
  resets: rows.reduce((s, r) => s + r.resets + r.unseen, 0),
  reversals: rows.reduce((s, r) => s + r.reversals, 0),
  groundTicks: rows.reduce((s, r) => s + r.off, 0),
  modifiedRuns: rows.filter(r => r.sweptStopTicks > 0).length });
const failures = comparisons.filter(r => r.reasons.length).sort((a, b) =>
  Number(b.reasons.includes('new DNF')) - Number(a.reasons.includes('new DNF')) ||
  (b.now.resets + b.now.unseen - b.was.resets - b.was.unseen) - (a.now.resets + a.now.unseen - a.was.resets - a.was.unseen) ||
  (b.delta ?? 0) - (a.delta ?? 0));
const report = { complete: current.length === 498 && swept.length === 498 && existsSync(`${root}/complete.json`),
  current: summary(current), swept: summary(swept), pairs: comparisons.length,
  failureCandidates: failures.map(({ id, seed, delta, reasons, was, now }) => ({ id, seed, delta, reasons,
    current: { seconds: was.seconds, impacts: was.impulseTicks, resets: was.resets + was.unseen, off: was.off },
    swept: { seconds: now.seconds, impacts: now.impulseTicks, resets: now.resets + now.unseen, off: now.off },
    newEvents: now.physicalEvents, oldEvents: was.physicalEvents })), comparisons };
writeFileSync(`${root}/comparison.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ complete: report.complete, current: report.current, swept: report.swept, pairs: report.pairs,
  failures: report.failureCandidates.slice(0, 20).map(({newEvents, oldEvents, ...r}) => r) }, null, 2));
