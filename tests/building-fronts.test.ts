import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ALDER_BLOCKS, ALDER_BUILDING_FRONTS, ALDER_STREETS, ALDER_SOLIDS, alderHeight, alderGround } from "../src/sim/alder.ts";
import { frontPoint, frontagePavingQuery, planBuildingFronts } from "../src/sim/building-fronts.ts";
import { pointFootprintDistance } from "../src/sim/building-footprint.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";
import { addNightBuildings } from "../src/render/night.ts";

test("pilot tenants have accessible entrances and their signs fit reserved facade bays",()=>{
  assert.equal(ALDER_BUILDING_FRONTS.length,3);
  const paved=frontagePavingQuery(ALDER_BUILDING_FRONTS);
  for(const plan of ALDER_BUILDING_FRONTS) {
    const doors=plan.modules.filter(m=>m.kind==="door");assert.ok(doors.length);
    for(const module of plan.modules) {
      const wallWidth=module.kind==="blade"?.18:module.width;
      assert.ok(Math.abs(module.x)+wallWidth/2+.15<plan.width/2,`${plan.recipe.id}: ${module.kind} crosses a corner`);
      assert.ok(module.y-module.height/2>=0 && module.y+module.height/2<=plan.bandHeight);
      assert.ok(doors.some(d=>d.owner===module.owner),"every sign, window and light belongs to an accessible tenant");
    }
    // Collision-worthy openings must never compete for the same facade space.
    const openings=plan.modules.filter(m=>["door","glazing","shutter","sign"].includes(m.kind));
    for(let i=0;i<openings.length;i++)for(let j=i+1;j<openings.length;j++) {
      const a=openings[i]!,b=openings[j]!;
      assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2,
        `${plan.recipe.id}: ${a.kind} overlaps ${b.kind}`);
    }
    for(const strip of plan.paving) {
      const u=(strip.left+strip.right)/2,depth=(strip.leftDepth+strip.rightDepth)/2;
      for(let d=.3;d<depth;d+=.45) {
        const p=frontPoint(plan,u,d);
        assert.ok(paved(p.x,p.z)&&!alderGround(p.x,p.z),"rendered apron supplies paved grip and excludes grass");
        assert.ok(ALDER_SOLIDS.every(b=>b===plan.block||pointFootprintDistance(b,p.x,p.z)>.05),"access is blocked by a solid");
        assert.ok(Math.abs(alderHeight(p.x,p.z)-plan.block.base)<.15,"entrance needs stairs or a ramp");
      }
      const end=frontPoint(plan,u,depth);
      const clearance=Math.min(...ALDER_STREETS.map(s=>{const p=projectOntoPath(s.points,end.x,end.z);return p.distance-p.width/2;}));
      if(strip.joinsStreet)assert.ok(clearance>2.1&&clearance<2.81,"apron meets the sidewalk without painting the road");
    }
  }
});

test("edited plots and obstructed approaches fall back without orphaned signage or paving",()=>{
  const target=ALDER_BUILDING_FRONTS[0]!;
  const moved=ALDER_BLOCKS.map(b=>b===target.block?{...b,width:b.width+1}:b);
  assert.equal(planBuildingFronts(moved,ALDER_STREETS,alderHeight).length,2);
  const p=frontPoint(target,0,3),obstruction={...target.block,x:p.x,z:p.z,width:2,depth:2};
  assert.equal(planBuildingFronts([...ALDER_BLOCKS,obstruction],ALDER_STREETS,alderHeight).length,2);
  assert.equal(planBuildingFronts(ALDER_BLOCKS,ALDER_STREETS,()=>10).length,0);
});

test("frontage kit shares materials, bounds draw cost and preserves the generic upper shell",()=>{
  const scene=new THREE.Scene(),root=addBuildingFronts(scene,ALDER_BUILDING_FRONTS,alderHeight);
  const materials=new Set<THREE.Material>();let triangles=0,meshes=0;
  root.traverse(o=>{
    assert.ok(!(o instanceof THREE.Light),"a tenant must not add a dynamic light");
    if(!(o instanceof THREE.Mesh))return;
    meshes++;assert.ok(!Array.isArray(o.material));materials.add(o.material);
    triangles+=(o.geometry.index?.count??o.geometry.getAttribute("position").count)/3;
    if(o.name.startsWith("front-paving")) {
      const p=o.geometry.getAttribute("position"),n=o.geometry.getAttribute("normal");
      for(let i=0;i<p.count;i++){assert.ok(n.getY(i)>.99);assert.ok(Math.abs(p.getY(i)-alderHeight(p.getX(i),p.getZ(i))-.018)<.001);}
    }
  });
  assert.ok(materials.size<=7);assert.ok(meshes<=21);assert.ok(triangles<6500,`${triangles} triangles`);
  for(const plan of ALDER_BUILDING_FRONTS) {
    const ordinary=new THREE.Scene(),structured=new THREE.Scene();
    const site={...plan.block,faceDistances:[5,5,5,5] as const};
    addNightBuildings(ordinary,[site]);addNightBuildings(structured,[{...site,structuredFrontage:true}]);
    for(const name of ["district-facades","district-roofs"]) {
      const before=ordinary.getObjectByName(name) as THREE.Mesh,after=structured.getObjectByName(name) as THREE.Mesh;
      assert.deepEqual(after.geometry.getAttribute("position").array,before.geometry.getAttribute("position").array);
    }
    assert.equal(structured.getObjectByName("district-signage"),undefined,"random panels must not overlap the kit");
  }
});
