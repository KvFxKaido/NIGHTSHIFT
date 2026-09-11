import assert from "node:assert/strict";
import test from "node:test";
import base from "../assets/maps/alder/base-slice.json" with { type: "json" };
import landmarks from "../src/sim/alder-landmarks.json" with { type: "json" };
import { ALDER_DATA, ALDER_STREETS, ALDER_VERSION, createAlderWorld } from "../src/sim/alder.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";

test("north expansion preserves original street identities, shapes and building plots", () => {
  assert.deepEqual(ALDER_DATA.roads.slice(0,base.roads.length),base.roads);
  // Original plots keep their identities and order; the only ones allowed to
  // go are those an authored alley cuts through (carriageway plus pavement).
  const corridors=ALDER_DATA.roads.filter(r=>r.id.startsWith("sea-alley-")).map(r=>({points:r.points,reach:r.width/2+2.8}));
  const cutByAlley=(b:{x:number;z:number;width:number;depth:number})=>corridors.some(({points,reach})=>points.slice(1).some((q,i)=>{
    const p=points[i]!,dx=q[0]!-p[0]!,dz=q[1]!-p[1]!,steps=Math.ceil(Math.hypot(dx,dz)/0.25);
    for(let s=0;s<=steps;s++){
      const px=p[0]!+dx*s/steps,pz=p[1]!+dz*s/steps;
      if(Math.hypot(Math.max(0,Math.abs(px-b.x)-b.width/2),Math.max(0,Math.abs(pz-b.z)-b.depth/2))<reach)return true;
    }
    return false;
  }));
  const kept=base.buildings.filter(b=>!cutByAlley(b));
  assert.ok(base.buildings.length-kept.length<=4,`${base.buildings.length-kept.length} original plots displaced by alleys`);
  assert.deepEqual(ALDER_DATA.buildings.slice(0,kept.length),kept);
  assert.equal(ALDER_DATA.version,ALDER_VERSION);
  assert.equal(new Set(ALDER_STREETS.map(s=>s.id)).size,ALDER_STREETS.length);
});

test("waterfront and downtown approaches all reach Alder Center through the addition", () => {
  const graph = new Map<string,string[]>();
  for (const street of ALDER_STREETS.filter(s=>s.id.startsWith("sea-north-"))) {
    graph.set(street.from,[...(graph.get(street.from)??[]),street.to]);
    graph.set(street.to,[...(graph.get(street.to)??[]),street.from]);
  }
  for (const start of ["-589.36,-708.02","-524.683,-775.007","-213.0,-628.0","-117.0,-680.0"]) {
    const seen = new Set<string>(), todo = [start];
    while (todo.length) {
      const at = todo.pop()!;
      if (seen.has(at)) continue;
      seen.add(at);todo.push(...graph.get(at)??[]);
    }
    assert.ok(seen.has("-989.0,-1480.0"),`${start} cannot reach Mercer / Queen Anne`);
  }
});

test("Broadcast Tower has a shared solid footprint with road clearance", () => {
  assert.ok(createAlderWorld().solids!.includes(landmarks.broadcastTower));
  for (const street of ALDER_STREETS) for (let i=1;i<street.points.length;i++) {
    assert.ok(segmentFootprintDistance(landmarks.broadcastTower,street.points[i-1]!,street.points[i]!)>
      street.points[i]!.width/2+2.8,`landmark obstructs ${street.name}`);
  }
});
