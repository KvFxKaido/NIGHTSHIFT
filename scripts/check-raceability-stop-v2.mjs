// Executable acceptance checks for the retained stopping experiment, not production promotion.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'artifacts/raceability-stop-v2-local';
const read = p => JSON.parse(readFileSync(p,'utf8'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest = read(`${root}/manifest.json`), standard = read(`${root}/comparison.json`);
for(const [file,value] of Object.entries({...manifest.hashes,...manifest.productionHashes})) assert.equal(hash(file),value,file);
assert.equal(standard.pairs.length,22);
const cases = (id,mode) => read(`artifacts/raceability-full-gate/cases/${id}-314159-${mode}.json`);
const regression53 = cases('gen-53','v2-local'), regression70 = cases('gen-70','v2-local');
assert.deepEqual(regression53.rows,cases('gen-53','current').rows,'gen-53 must restore the current trace, including its existing sedan incident');
assert.equal(regression70.impulseTicks,0); assert.equal(regression70.unseen,0);
assert.equal(regression70.resets,0); assert.equal(regression70.recoveries,0);
assert.deepEqual(cases('gen-70','v1-recheck').rows,cases('gen-70','swept').rows,'frozen v1 must reproduce the rejected experiment');
const seeds=[0,1000,271828,1,42,314159];
const cinder=seeds.map(seed=>({id:'gen-22',seed,
  was:read(`artifacts/raceability-experiment/gen-22-${seed}-current.json`),
  v1:read(`artifacts/raceability-experiment/gen-22-${seed}-swept-full.json`),
  now:read(`artifacts/raceability-experiment/gen-22-${seed}-v2-local-six.json`)}));
for(const {now} of cinder) {
  assert.equal(now.finished,true); assert.equal(now.impulseTicks,0); assert.equal(now.unseen,0);
  assert.equal(now.resets,0); assert.equal(now.recoveries,0); assert.equal(now.groundTicks,0);
}
const target=cinder.find(r=>r.seed===314159), fork=read('artifacts/raceability-experiment/gen-22-314159-v2-local-fork.json');
assert.ok(target.now.seconds < target.was.seconds-1);
assert.equal(fork.prefixHash,target.was.prefixHash); assert.equal(fork.forkSnapshot,target.was.forkSnapshot);
assert.equal(fork.impulseTicks,0); assert.equal(fork.unseen,0); assert.ok(fork.seconds<target.was.seconds-1);
const flags=standard.pairs.flatMap(({id,seed,was,now})=>{
  const reasons=[];
  if(now.seconds===null) reasons.push('DNF');
  if(now.impulseTicks>0&&was.impulseTicks===0) reasons.push('new physical contact');
  if(now.physicalEvents.length>was.physicalEvents.length) reasons.push('more physical episodes');
  if(now.impulseTicks>was.impulseTicks) reasons.push('more contact ticks');
  if(now.unseen+now.resets>was.unseen+was.resets) reasons.push('more resets');
  if(now.reversals>was.reversals) reasons.push('more reversals');
  if(now.off>was.off) reasons.push('more ground ticks');
  if(now.seconds-was.seconds>1) reasons.push('over 1 s slower');
  return reasons.length?[{id,seed,reasons,delta:+(now.seconds-was.seconds).toFixed(2),
    contact:[was.impulseTicks,now.impulseTicks],resets:[was.unseen+was.resets,now.unseen+now.resets]}]:[];
});
const compact=({changes,impacts,cooldownAudit,...rest})=>rest;
const result={decision:'Retain as opt-in v2; focused regression acceptance is not a full 498-run promotion gate.',manifest,
  checks:['production source hashes unchanged','gen-53 retained trace identical to current','gen-70 no physical contact or recovery',
    'Cinder gen-22 clean on all six seeds','gen-22 identical-state 60 s fork preserves improvement','frozen v1 gen-70 trace reproduced'],
  standard,flags,cinder:cinder.map(({was,v1,now,...r})=>({...r,was:compact(was),v1:compact(v1),now:compact(now)})),fork:compact(fork)};
writeFileSync('design/measurements/raceability-stopping-v2.json',JSON.stringify(result,null,1)+'\n');
console.log(JSON.stringify({checks:result.checks,pairs:standard.pairs.length+cinder.length,flags,cinder:result.cinder},null,2));
