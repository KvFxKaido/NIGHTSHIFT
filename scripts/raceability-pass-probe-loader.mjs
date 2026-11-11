import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(url.endsWith('/src/sim/rival.ts')) {
   let source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString('utf8');
   const needle='const steer=clamp(-steerError*3.5 + car.lateralSpeed*.025 + feedforward,-1,1);';
   if(!source.includes(needle))throw new Error('Steering probe insertion moved');
   source='import {recordSteering} from "../../scripts/raceability-pass-probe.ts";\n'+source.replace(needle,needle+'\nrecordSteering({car,along:driver.along,pass,error,chord,steerError,feedforward,lineCurvature,steer,tx,tz,avoidance:driver.avoidance});');
   return {...result,source};
 }
 if(!url.endsWith('/src/sim/traffic-pass.ts'))return result;
 let source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString('utf8');
 for(const name of ['evaluatePass','planTrafficPass']){
   const needle=`export function ${name}(`;
   if(!source.includes(needle))throw new Error(`Probe insertion moved: ${name}`);
   source=source.replace(needle,`function ${name}Raw(`);
 }
 source='import {startPassProbe,evaluatedPass,endPassProbe} from "../../scripts/raceability-pass-probe.ts";\n'+source+`
export function evaluatePass(...args: Parameters<typeof evaluatePassRaw>) {
 const result=evaluatePassRaw(...args); evaluatedPass(args,result); return result;
}
export function planTrafficPass(...args: Parameters<typeof planTrafficPassRaw>) {
 startPassProbe(args); const result=planTrafficPassRaw(...args); endPassProbe(args,result); return result;
}
`;
 return {...result,source};
}});
