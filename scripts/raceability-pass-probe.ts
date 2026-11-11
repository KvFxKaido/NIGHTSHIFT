// Read-only exact-call diagnostics, loaded only by raceability-pass-probe-loader.mjs.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
type Call = {tick:number;before:unknown;after?:unknown;evaluations:unknown[]};
export const passProbe: Call[]=[];
let active:Call|undefined;
let tick=0;
const steering:unknown[]=[];
export function recordSteering(value:any) {
 if(tick>=2850&&tick<=3020&&tick%12===0)steering.push(structuredClone({tick,...value}));
}
export function startPassProbe(args:any[]) {
 const [route,driver,car,context]=args;
 tick=context.tick;
 if(context.tick<2850||context.tick>3020) {active=undefined;return;}
 active={tick:context.tick,before:structuredClone({driver,car,context:{tick:context.tick,vehicles:context.vehicles,opponent:context.opponent},routeCar:route.car}),evaluations:[]};
}
export function evaluatedPass(args:any[],result:unknown) {
 if(!active)return;
 const [,pass,car,along,forecasts]=args;
 active.evaluations.push(structuredClone({pass,car,along,forecasts,result}));
}
export function endPassProbe(args:any[],result:unknown) {
 if(!active)return;
 active.after=structuredClone({driver:args[1],result});
 if(active.evaluations.length)passProbe.push(active);
 active=undefined;
}
process.on('exit',()=>{
 mkdirSync('artifacts/raceability-pass-probe',{recursive:true});
 const serialized=JSON.stringify(passProbe);
 writeFileSync('artifacts/raceability-pass-probe/exact-calls.json',serialized);
 writeFileSync('artifacts/raceability-pass-probe/steering.json',JSON.stringify(steering));
 console.log(JSON.stringify({passProbeCalls:passProbe.length,sha256:createHash('sha256').update(serialized).digest('hex')}));
});
