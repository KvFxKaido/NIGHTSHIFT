import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { dressIntersections, intersectionPaintReserves, insidePaintReserve } from "../src/sim/intersection-dressing.ts";
import { ALDER_INTERSECTIONS, ALDER_INTERSECTION_PAINT, ALDER_SHOULDER, ALDER_STREETS, ALDER_SOLIDS, alderSidewalkLift, alderHeight } from "../src/sim/alder.ts";
import { pointFootprintDistance } from "../src/sim/building-footprint.ts";
import { projectOntoPath, type Street } from "../src/sim/street-path.ts";
import { roadMarkings } from "../src/render/road-markings.ts";
import { addIntersectionDressing, updateIntersectionSignals } from "../src/render/intersection-dressing.ts";

const roads:Street[]=[[0,100],[100,0],[0,-100],[-100,0]].map(([x,z],i)=>({id:`s${i}`,name:`Road ${i}`,from:'j',to:`end${i}`,added:false,kind:'arterial',
  points:[{x:0,z:0,y:2,width:20,zone:'boulevard'},{x:x!,z:z!,y:2,width:20,zone:'boulevard'}]}));
test('junction dressing is deterministic, complete, and excludes bends and alleys',()=>{
  const a=dressIntersections(roads,5.6);
  assert.equal(a.length,1);assert.equal(a[0]!.approaches.length,4);
  assert.deepEqual(a,dressIntersections([...roads].reverse(),5.6));
  assert.equal(dressIntersections(roads.slice(0,2),5.6).length,0);
  assert.equal(dressIntersections(roads.map(s=>({...s,kind:'alley'})),5.6).length,0);
  assert.deepEqual(new Set(a[0]!.approaches.map(p=>p.flash)),new Set(['amber','red']));
  assert.ok(a[0]!.approaches.every(p=>p.pole),'with room, every approach has its pole, as step 1 dressed it');
});
// The second pass (2026-09-24): a junction whose arms have room for a bar and not a pole keeps its paint, where step 1
// left the whole junction bare. Traffic stops at the bar either way, so a stop without a pole is painted on the road.
test('a junction with no room for poles keeps its bars, and says which of them are stops',()=>{
  const bare=dressIntersections(roads,5.6,()=>false);
  assert.equal(bare.length,1);
  assert.equal(bare[0]!.approaches.length,4);
  assert.ok(bare[0]!.approaches.every(p=>!p.pole));
  const scene=new THREE.Scene();
  addIntersectionDressing(scene,bare,()=>0,()=>0,5.6);
  let letters=0;
  // A legend is one quad: six corners of two triangles, indexed or, once chunked, not.
  scene.traverse(o=>{if(o instanceof THREE.Mesh&&(o.material as THREE.MeshStandardMaterial).map&&(o.material as THREE.MeshStandardMaterial).alphaTest>0)
    letters+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/6;});
  assert.equal(letters,bare[0]!.approaches.filter(p=>p.flash==='red').length,'one STOP on the road for each stop with no head');
  scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
});
// The inventory decides where traffic stops (traffic-v10), so a change to it moves traffic: this is its tripwire.
// 113 from step 1, identical, and 31 from the second pass (7 of whose approaches have no pole).
test('Port Alder dresses 144 junctions: a changed count is a TRAFFIC_REVISION bump',()=>{
  assert.equal(ALDER_INTERSECTIONS.length,144);
  assert.equal(ALDER_INTERSECTIONS.flatMap(j=>j.approaches).filter(a=>!a.pole).length,7);
});
test('citywide poles stand on raised sidewalk and clear all solid footprints',()=>{
  assert.ok(ALDER_INTERSECTIONS.length>80);
  for(const j of ALDER_INTERSECTIONS)for(const a of j.approaches) {
    const own=ALDER_STREETS.find(s=>s.id===a.streetId)!;
    if(!a.pole) {
      // Its paint still sits on its own asphalt, the legend's side of the bar included.
      for(const along of [0,4.5])for(const side of [-a.width/2-ALDER_SHOULDER+.3,0,a.width/2+ALDER_SHOULDER-.3]) {
        const p=projectOntoPath(own.points,a.stopX+a.ux*along+a.uz*side,a.stopZ+a.uz*along-a.ux*side);
        assert.ok(p.distance<=p.width/2+ALDER_SHOULDER+.05,`paint leaves asphalt: ${a.id}`);
      }
      continue;
    }
    assert.ok(alderSidewalkLift(a.poleX,a.poleZ)>.1,a.id);
    assert.ok(ALDER_SOLIDS.every(b=>pointFootprintDistance(b,a.poleX,a.poleZ)>=.8),a.id);
    for(const along of [0,-4.9,-2.1])for(const side of [-a.width/2-ALDER_SHOULDER+.3,0,a.width/2+ALDER_SHOULDER-.3]) {
      const p=projectOntoPath(own.points,a.stopX+a.ux*along+a.uz*side,a.stopZ+a.uz*along-a.ux*side);
      assert.ok(p.distance<=p.width/2+ALDER_SHOULDER+.05,`paint leaves asphalt: ${a.id}`);
    }
    for(const s of ALDER_STREETS) {
      const p=projectOntoPath(s.points,a.poleX,a.poleZ);
      assert.ok(p.distance>=p.width/2+ALDER_SHOULDER+.1,`pole in road: ${a.id}`);
    }
  }
});
test('lane paint clears stop bars and crosswalks on the full map',()=>{
  const paint=roadMarkings(ALDER_STREETS,{shoulderWidth:ALDER_SHOULDER,reserves:ALDER_INTERSECTION_PAINT});
  for(const p of paint)for(const [x,z] of [[p.ax,p.az],[p.bx,p.bz]])
    assert.ok(!ALDER_INTERSECTION_PAINT.some(r=>insidePaintReserve(r,x!,z!)),p.streetId);
  for(const j of ALDER_INTERSECTIONS)for(const a of j.approaches)
    assert.ok(intersectionPaintReserves([j],ALDER_SHOULDER).some(r=>insidePaintReserve(r,a.stopX,a.stopZ)));
});
test('signals render without browser APIs and flash only amber/red at one hertz',()=>{
  const scene=new THREE.Scene();
  addIntersectionDressing(scene,ALDER_INTERSECTIONS.slice(0,2),alderHeight,alderSidewalkLift,ALDER_SHOULDER);
  const lights=scene.userData.intersectionFlashes as THREE.MeshBasicMaterial[];
  updateIntersectionSignals(scene,0);const on=lights.map(m=>m.color.getHex());
  updateIntersectionSignals(scene,.7);assert.ok(lights.every((m,i)=>m.color.getHex()!==on[i]));
  updateIntersectionSignals(scene,1);assert.deepEqual(lights.map(m=>m.color.getHex()),on);
  assert.ok(scene.children.length>3);
  scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
});
