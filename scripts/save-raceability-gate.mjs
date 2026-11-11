// Preserve the completed gate and independently reproduced cases without bulky census samples.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'artifacts/raceability-full-gate';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const report = read(`${root}/comparison.json`);
assert.equal(report.complete, true);
assert.equal(report.pairs, 498);
const manifest = read(`${root}/manifest.json`);
for (const [path, hash] of Object.entries(manifest.sourceHashes)) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
}
const replays = [];
for (const [id, seed] of [['gen-40', 0], ['gen-66', 271828], ['street-uptown', 1], ['gen-53', 314159], ['gen-70', 314159]]) {
  const pair = report.comparisons.find(r => r.id === id && r.seed === seed);
  for (const mode of ['current', 'swept']) {
    const file = `${root}/cases/${id}-${seed}-${mode}.json`, replay = read(file);
    const gate = mode === 'current' ? pair.was : pair.now;
    assert.equal(+replay.seconds.toFixed(2), gate.seconds);
    for (const field of ['impulseTicks', 'unseen', 'resets', 'sweptStopTicks']) assert.equal(replay[field], gate[field]);
    assert.equal(replay.recoveries, gate.reversals);
    const { rows, ...summary } = replay;
    const contacts = new Map();
    for (const row of rows) for (const hit of row.impacts) {
      const key = String(hit.other), entry = contacts.get(key) ?? { other: hit.other, ticks: 0, impulse: 0, peakImpulse: 0, firstTick: row.tick, firstAlong: row.along };
      entry.ticks++; entry.impulse += hit.impulse; entry.peakImpulse = Math.max(entry.peakImpulse, hit.impulse);
      contacts.set(key, entry);
    }
    replays.push({ ...summary, file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      // gen-66 replay retained only route 2900-3100 m; others retain the full race.
      retainedWindow: id === 'gen-66' ? [2900, 3100] : 'full race', contacts: [...contacts.values()] });
  }
}
const compact = ({ census, ...row }) => row;
writeFileSync('design/measurements/raceability-full-gate.json', JSON.stringify({
  decision: 'Do not promote: new contact/reset failures on gen-70 and gen-53 seed 314159; new contacts on Uptown seed 1.',
  manifest, completion: read(`${root}/complete.json`),
  ...report, comparisons: report.comparisons.map(({was, now, ...pair}) => ({...pair, was: compact(was), now: compact(now)})),
  replayChecks: replays,
}, null, 1) + '\n');
console.log('498 pairs, source hashes, and 10 replay outcomes verified; saved design/measurements/raceability-full-gate.json');
