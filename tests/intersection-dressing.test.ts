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
  assert.equal(dressIntersections(roads,5.6,()=>false).length,0);
  assert.deepEqual(new Set(a[0]!.approaches.map(p=>p.flash)),new Set(['amber','red']));
});
test('citywide poles stand on raised sidewalk and clear all solid footprints',()=>{
  assert.ok(ALDER_INTERSECTIONS.length>80);
  for(const j of ALDER_INTERSECTIONS)for(const a of j.approaches) {
    assert.ok(alderSidewalkLift(a.poleX,a.poleZ)>.1,a.id);
    assert.ok(ALDER_SOLIDS.every(b=>pointFootprintDistance(b,a.poleX,a.poleZ)>=.8),a.id);
    const own=ALDER_STREETS.find(s=>s.id===a.streetId)!;
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
