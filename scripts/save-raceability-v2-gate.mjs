// Save the complete v2 gate, immutable source identity, and verified diagnostic replays.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='artifacts/raceability-full-gate-v2';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const report=read(`${root}/comparison.json`), audit=read(`${root}/audit.json`),manifest=read(`${root}/manifest.json`);
assert.equal(report.complete,true); assert.equal(report.pairs,498);
assert.equal(audit.matchedControls,498);
for(const [file,value] of Object.entries(manifest.sourceHashes)) assert.equal(hash(file),value,file);
const focused=read('design/measurements/raceability-stopping-v2.json');
for(const file of ['scripts/raceability-experiment-loader.mjs','scripts/raceability-footprint-stop.ts'])
  assert.equal(manifest.sourceHashes[file],focused.manifest.hashes[file],`Candidate differs from Cinder fork: ${file}`);
const comparable=({seed,census,slowdowns,...row})=>row;
for(const pair of focused.standard.pairs){
  const fresh=report.comparisons.find(r=>r.id===pair.id&&r.seed===pair.seed);
  assert.deepEqual(comparable(fresh.now),comparable(pair.now),`Focused v2 case changed: ${pair.seed}/${pair.id}`);
}
const replays=[];
for(const [id,seed] of [['gen-6',271828],['gen-42',271828],['gen-77',271828]]){
  const pair=report.comparisons.find(r=>r.id===id&&r.seed===seed);
  for(const mode of ['current','swept']){
    const label=id==='gen-77'?'v2gate-exact':'v2gate';
    const file=`artifacts/raceability-full-gate/cases/${id}-${seed}-${label}-${mode}.json`,r=read(file),expected=mode==='current'?pair.was:pair.now;
    assert.equal(+r.seconds.toFixed(2),expected.seconds);
    for(const key of ['impulseTicks','resets','unseen','sweptStopTicks']) assert.equal(r[key],expected[key]);
    assert.equal(r.recoveries,expected.reversals);
    const contacts=new Map();
    for(const row of r.rows)for(const hit of row.impacts){
      const entry=contacts.get(hit.other)??{other:hit.other,ticks:0,impulse:0,peak:0,firstTick:row.tick,firstAlong:row.along};
      entry.ticks++;entry.impulse+=hit.impulse;entry.peak=Math.max(entry.peak,hit.impulse);contacts.set(hit.other,entry);
    }
    const {rows,...summary}=r;
    replays.push({...summary,file,sha256:hash(file),contacts:[...contacts.values()]});
  }
}
const compact=({census,slowdowns,...row})=>row;
const result={decision:'Do not promote v2: gen-77 / seed 271828 introduces a substantial new box-truck collision.',
  manifest,completion:read(`${root}/complete.json`),...report,audit,replays,
  comparisons:report.comparisons.map(({was,now,...pair})=>({...pair,was:compact(was),now:compact(now)})),
  candidateSources:Object.fromEntries(['scripts/raceability-experiment-loader.mjs','scripts/raceability-footprint-stop.ts'].map(p=>[p,readFileSync(p,'utf8')])),
  replayCapture:{script:'scripts/raceability-gate-case.ts',sha256:hash('scripts/raceability-gate-case.ts'),
    note:'gen-77 replays use deep snapshots of nested pass/wheel/wreck records; earlier gen-6/gen-42 analysis uses scalar fields and independent contact records.'},
  focusedStandardCasesReproduced:focused.standard.pairs.length,
  originalGen22Evidence:'design/measurements/raceability-stopping-v2.json; candidate source hashes match this full gate'};
writeFileSync('design/measurements/raceability-full-gate-v2.json',JSON.stringify(result,null,1)+'\n');
console.log(JSON.stringify({pairs:report.pairs,current:report.current,v2:report.swept,replayed:replays.length,audit},null,2));
