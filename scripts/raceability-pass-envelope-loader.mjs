// Offline counterfactual only: replay captured evaluator calls, never a sim run.
import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(!url.endsWith('/src/sim/traffic-pass.ts'))return result;
 let source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString('utf8');
 const needle='if (passingOverlap(p.x, p.z, p.ux, p.uz, at, forecast.vehicle.kind))';
 if(!source.includes(needle))throw new Error('Envelope probe insertion moved');
 source=source.replace(needle,`const origin=passingPoint(route,pass,along);
 const trackingError=(car.x-origin.x)*-origin.uz+(car.z-origin.z)*origin.ux;
 if (passingOverlap(p.x, p.z, p.ux, p.uz, at, forecast.vehicle.kind)
   || passingOverlap(p.x-p.uz*trackingError,p.z+p.ux*trackingError,p.ux,p.uz,at,forecast.vehicle.kind))`);
 return {...result,source};
}});
