import assert from "node:assert/strict";
import test from "node:test";
import { alderGround, ALDER_STREETS, ARENA_ROADS, ALDER_PAVEMENT, ALDER_FORECOURT, ALDER_BUILDING_FRONTS, ALDER_GROUNDS_FRONT_IDS, ALDER_SITE_GROUNDS } from "../src/sim/alder.ts";
import { frontPoint } from "../src/sim/building-fronts.ts";
import { ARENA, nearArena } from "../src/sim/arena.ts";
import { DRIFT_YARD, SITE_PAVING } from "../src/sim/drift-yard.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import { onMarketPaving } from "../src/sim/market-block.ts";

// Independent, complete-path oracle: this is the paving rule before indexing.
// Saved frontages extend that rule. Check their world polygons directly instead
// of calling the indexed frontage query under test.
const paving=[
  ...ALDER_BUILDING_FRONTS.filter(p=>!ALDER_GROUNDS_FRONT_IDS.has(p.recipe.id)).flatMap(plan=>plan.paving.map(s=>({plan,...s,start:0}))),
  ...ALDER_SITE_GROUNDS.flatMap(site=>site.patches.map(p=>({plan:site.front,...p}))),
];
const frontages=paving.map(({plan,...s})=>{
  const polygon=[frontPoint(plan,s.left,s.start),frontPoint(plan,s.right,s.start),frontPoint(plan,s.right,s.rightDepth),frontPoint(plan,s.left,s.leftDepth)];
  return {polygon,minX:Math.min(...polygon.map(p=>p.x)),maxX:Math.max(...polygon.map(p=>p.x)),
    minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z))};
});
function originalGround(x: number, z: number): boolean {
  if (onMarketPaving(x, z)) return false;
  if(frontages.some(area=>{
    if(x<area.minX-1e-7||x>area.maxX+1e-7||z<area.minZ-1e-7||z>area.maxZ+1e-7)return false;
    const crosses=area.polygon.map((a,i)=>{const b=area.polygon[(i+1)%4]!;return (b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);});
    return crosses.every(c=>c>=-1e-7)||crosses.every(c=>c<=1e-7);
  }))return false;
  const f = ALDER_FORECOURT;
  for (const area of [...SITE_PAVING, DRIFT_YARD.bounds, DRIFT_YARD.driveway,
    { minX:f.x-f.width/2, maxX:f.x+f.width/2, minZ:f.z-f.depth/2, maxZ:f.z+f.depth/2 }]) {
    if (x>=area.minX && x<=area.maxX && z>=area.minZ && z<=area.maxZ) return false;
  }
  if (nearArena(x,z,ARENA.width/2+ARENA.shoulder) && ARENA_ROADS.some(road => {
    const p=projectOntoPath(road.points,x,z); return p.distance<=p.width/2+ARENA.shoulder;
  })) return false;
  return !ALDER_STREETS.some(street => {
    const p=projectOntoPath(street.points,x,z); return p.distance<=p.width/2+ALDER_PAVEMENT;
  });
}

test("indexed paving agrees with the complete paths at shoulders, junctions, bucket edges and open ground", () => {
  for (const road of ARENA_ROADS) {
    assert.ok(road.points.every(p => p.width===road.points[0]!.width), "capsule union requires constant width within each circuit path");
  }
  const check = (x: number,z: number) => assert.equal(alderGround(x,z),originalGround(x,z),`paving changed at ${x},${z}`);
  for (const road of [...ALDER_STREETS,...ARENA_ROADS]) {
    const shoulder=road.id.startsWith("arena-") ? ARENA.shoulder : ALDER_PAVEMENT;
    // Every street and all parts of the three circuit laps, including endpoints.
    const stride=Math.max(1,Math.floor(road.points.length/8));
    for(let i=1;i<road.points.length;i+=stride) {
      const a=road.points[i-1]!,b=road.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);
      check(a.x,a.z);
      for(const side of [-1,1]) for(const extra of [-.000001,0,.000001,2]) {
        const offset=side*(a.width/2+shoulder+extra);
        check((a.x+b.x)/2-(b.z-a.z)/length*offset,(a.z+b.z)/2+(b.x-a.x)/length*offset);
      }
    }
  }
  for(let x=-1024;x<=3456;x+=64) for(let z=-3072;z<=1152;z+=64) {
    check(x,z); check(x-.000001,z+.000001);
  }
});
