import {readFileSync} from 'node:fs';
import {batchRace} from './batch-race.ts';
import {sampleDrivingPath} from '../src/sim/rival.ts';
import {footprintStopSpeed as v1} from './raceability-footprint-stop-v1.ts';
import {footprintStopSpeed as v2} from './raceability-footprint-stop.ts';
const s=batchRace('gen-22',{seed:314159,car:'cinder',env:{}})!;
const d=JSON.parse(readFileSync('artifacts/raceability-traces/gen-22-traffic.json','utf8'));
for(const r of d.rows.filter((r:any)=>r.t>=60&&r.t<65&&Math.abs(r.t*5-Math.round(r.t*5))<.001)) {
 const car={...r}, driver={along:r.along, avoidance:r.avoidance,lineBlend:r.blend,trafficPass:r.pass} as any;
 const context={network:s.world.traffic!,vehicles:r.near,tick:r.t*60};
 const p=sampleDrivingPath(s.options.rival!,r.along);
 console.log(JSON.stringify({t:r.t,at:r.along,v:r.speed,blend:r.blend,
 error:Math.hypot(r.x-(p.x-p.uz*r.avoidance),r.z-(p.z+p.ux*r.avoidance)),
 v1:v1(s.options.rival!,driver,car,11,context,sampleDrivingPath),
 v2:v2(s.options.rival!,driver,car,11,context,sampleDrivingPath)}));
}
