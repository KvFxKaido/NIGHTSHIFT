import {readFileSync,writeFileSync} from 'node:fs';
import {batchRace} from './batch-race.ts';
import {passingPoint,passingOverlap} from '../src/sim/traffic-pass.ts';
import {sampleDrivingPath} from '../src/sim/rival.ts';
const route=batchRace('gen-77',{seed:271828,env:{}})!.options.rival!;
const trace=JSON.parse(readFileSync('artifacts/raceability-full-gate/cases/gen-77-271828-v2gate-exact-swept.json','utf8'));
const near=(tick:number)=>trace.rows.reduce((a:any,b:any)=>Math.abs(a.tick-tick)<Math.abs(b.tick-tick)?a:b);
const tracking=trace.rows.filter((r:any)=>r.tick>=2892&&r.tick<=3010&&(r.tick%12===0||r.tick===3010)).map((r:any)=>{
 const pass=r.driver.trafficPass;if(!pass)return {tick:r.tick};
 const p=passingPoint(route,pass,r.along),road=sampleDrivingPath(route,r.along),v=r.traffic.find((v:any)=>v.id===171);
 return {tick:r.tick,along:r.along,speed:r.car.speed,why:r.why,
   lateralError:(r.car.x-p.x)*-p.uz+(r.car.z-p.z)*p.ux,
   error:Math.hypot(r.car.x-p.x,r.car.z-p.z),
   actualOffset:(r.car.x-road.x)*-road.uz+(r.car.z-road.z)*road.ux,
   intendedOffset:r.driver.avoidance,point:p,car:r.car,traffic:v,
   idealOverlap:v&&passingOverlap(p.x,p.z,p.ux,p.uz,v,v.kind),
   actualOverlap:v&&passingOverlap(r.car.x,r.car.z,-Math.sin(r.car.heading),-Math.cos(r.car.heading),v,v.kind)};
});
const calls=JSON.parse(readFileSync('artifacts/raceability-pass-probe/exact-calls.json','utf8'));
const checks=calls.map((c:any)=>{
 const chosen=c.after.driver.trafficPass;
 const evaluations=c.evaluations.map((e:any)=>({pass:e.pass,result:e.result}));
 const e=c.evaluations.find((e:any)=>chosen&&Math.abs(e.pass.offset-chosen.offset)<1e-8&&e.pass.target===171);
 const forecasts=e?.forecasts.filter((f:any)=>f.vehicle.id===171).map((f:any)=>{
   const time=(3010-c.tick)/60,index=Math.round(time/.25),pose=f.path[index];
   const real=near(c.tick+index*15).traffic.find((v:any)=>v.id===171);
   return {index,pose,real,error:real&&pose?Math.hypot(pose.x-real.x,pose.z-real.z):null};
 });
 return {tick:c.tick,car:c.before.car,driver:c.before.driver,evaluations,forecasts};
});
writeFileSync('artifacts/raceability-pass-probe/analysis.json',JSON.stringify({tracking,checks},null,2));
console.log(JSON.stringify({tracking:tracking.map(({tick,along,speed,lateralError,error,intendedOffset,actualOffset,idealOverlap,actualOverlap}:any)=>({tick,along,speed,lateralError,error,intendedOffset,actualOffset,idealOverlap,actualOverlap})),checks:checks.map((c:any)=>({tick:c.tick,evaluations:c.evaluations,forecastErrors:c.forecasts?.map((f:any)=>f.error)}))},null,2));

