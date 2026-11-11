// Supplement the normal gate with changed encounter locations and control reproducibility.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='artifacts/raceability-full-gate-v2';
const d=JSON.parse(readFileSync(`${root}/comparison.json`,'utf8'));
const previous=JSON.parse(readFileSync('artifacts/raceability-full-gate/comparison.json','utf8'));
const old=new Map(previous.comparisons.map(r=>[`${r.seed}/${r.id}`,r.was]));
const addedEncounters=[], largerOnsets=[];
for(const r of d.comparisons){
  assert.deepEqual(r.was,old.get(`${r.seed}/${r.id}`),`Fresh current-AI control changed: ${r.seed}/${r.id}`);
  for(const e of r.now.physicalEvents){
    const matches=r.was.physicalEvents.filter(o=>o.other===e.other&&Math.abs(o.along-e.along)<=20);
    if(!matches.length) addedEncounters.push({id:r.id,seed:r.seed,event:e,oldEvents:r.was.physicalEvents});
    else {
      const peak=Math.max(...matches.map(o=>o.impulse));
      if(e.impulse>peak*1.5+500) largerOnsets.push({id:r.id,seed:r.seed,event:e,oldPeak:peak});
    }
  }
}
const result={complete:d.complete,matchedControls:d.pairs,addedEncounters,largerOnsets,
  flags:d.failureCandidates.map(({id,seed,delta,reasons})=>({id,seed,delta,reasons}))};
writeFileSync(`${root}/audit.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
