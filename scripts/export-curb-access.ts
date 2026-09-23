/** Feed the surface builder the same reserved entrances used by the city. */
import { writeFileSync } from "node:fs";
import { ALDER_FORECOURT, ALDER_PARKING_RESERVES, ALDER_GROUNDS_RESERVES, ALDER_BUILDING_FRONTS } from "../src/sim/alder.ts";
import { SITE_PAVING } from "../src/sim/drift-yard.ts";
import { MARKET_PAVING } from "../src/sim/market-block.ts";
import { blockCorners } from "../src/sim/building-footprint.ts";
import { frontPoint } from "../src/sim/building-fronts.ts";

const polygons = [ALDER_FORECOURT, ...ALDER_PARKING_RESERVES, ...ALDER_GROUNDS_RESERVES]
  .map(b => blockCorners({...b, depth:b.depth+6}).map(p=>[p.x,p.z]));
for (const front of ALDER_BUILDING_FRONTS) {
  // Pedestrian door approaches also need a level connection to their apron.
  const depth=Math.max(0,...front.paving.filter(p=>p.joinsStreet).flatMap(p=>[p.leftDepth,p.rightDepth]))+4;
  polygons.push([[-1.5,0],[1.5,0],[1.5,depth],[-1.5,depth]].map(([a,d])=>{
    const p=frontPoint(front,a!,d!); return [p.x,p.z];
  }));
}
polygons.push(...MARKET_PAVING.map(poly=>poly.map(p=>[p.x,p.z])));
polygons.push(...SITE_PAVING.map(p=>[[p.minX,p.minZ],[p.maxX,p.minZ],[p.maxX,p.maxZ],[p.minX,p.maxZ]]));
writeFileSync(process.argv[2]!, JSON.stringify(polygons));
