import assert from "node:assert/strict";
import test from "node:test";
import { alderGround, ALDER_STREETS, ARENA_ROADS, ALDER_PAVEMENT, ALDER_FORECOURT } from "../src/sim/alder.ts";
import { ARENA, nearArena } from "../src/sim/arena.ts";
import { DRIFT_YARD } from "../src/sim/drift-yard.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";

// Independent, complete-path oracle: this is the paving rule before indexing.
function originalGround(x: number, z: number): boolean {
  const f = ALDER_FORECOURT;
  for (const area of [DRIFT_YARD.bounds, DRIFT_YARD.driveway,
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
