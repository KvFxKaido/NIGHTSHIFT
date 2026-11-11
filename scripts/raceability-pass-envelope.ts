// Counterfactual geometry, not a validated controller or safety envelope.
import {readFileSync,writeFileSync} from 'node:fs';
import {batchRace} from './batch-race.ts';
import {evaluatePass,passingPoint} from '../src/sim/traffic-pass.ts';
const scenario=batchRace('gen-77',{seed:271828,env:{}})!;
const route=scenario.options.rival!;
const calls=JSON.parse(readFileSync('artifacts/raceability-pass-probe/exact-calls.json','utf8'));
const results=calls.map((c:any)=>{
 const pass=c.after.driver.trafficPass;
 const e=c.evaluations.find((e:any)=>e.pass.target===171&&e.pass.offset===pass.offset);
 const p=passingPoint(route,e.pass,e.along);
 return {tick:c.tick,lateralError:(e.car.x-p.x)*-p.uz+(e.car.z-p.z)*p.ux,
   original:e.result,counterfactual:evaluatePass(route,e.pass,e.car,e.along,e.forecasts)};
});
writeFileSync('artifacts/raceability-pass-probe/envelope.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
