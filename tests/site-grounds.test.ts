import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import recipes from "../src/sim/alder-site-grounds.json" with {type:"json"};
import layout from "../src/sim/alder-layout.json" with {type:"json"};
import { planSiteGrounds, groundsPavingQuery, groundsRect } from "../src/sim/site-grounds.ts";
import { frontPoint } from "../src/sim/building-fronts.ts";
import { blockCorners, blockPenetration, pointFootprintDistance } from "../src/sim/building-footprint.ts";
import { ALDER_SITE_GROUNDS as sites, ALDER_GROUNDS_ISSUES, ALDER_GROUNDS_FRONT_IDS, ALDER_FRONTAGE_ISSUES,
  ALDER_BUILDING_FRONTS, ALDER_BLOCKS, ALDER_STREETS, ALDER_SOLIDS, ALDER_EVERGREENS,
  ALDER_LAMP_POSES, ALDER_BIN_POSES, ALDER_FRONTAGE_CONTEXT, alderHeight, alderGround, frontageContextForLayout } from "../src/sim/alder.ts";
import { frontageAccessTools } from "../src/sim/frontage-generator.ts";
import { addSiteGrounds } from "../src/render/site-grounds.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";

test("expanded saved grounds and the original pilots fit the released city without losing a frontage",()=>{
  assert.deepEqual(ALDER_GROUNDS_ISSUES,[]);assert.deepEqual(ALDER_FRONTAGE_ISSUES,[]);
  assert.equal(sites.length,66);assert.deepEqual(sites.slice(0,3).map(s=>s.recipe.kind),["shops","residential","warehouse"]);
  const again=planSiteGrounds(recipes,ALDER_BUILDING_FRONTS,ALDER_BLOCKS,ALDER_STREETS,alderHeight);
  assert.deepEqual(again.plans,sites);assert.deepEqual(again.issues,[]);
  for(const site of sites) {
    assert.ok(site.solids.every(s=>ALDER_SOLIDS.includes(s)));
    assert.ok(site.reserves.every(s=>!ALDER_SOLIDS.includes(s)),"access reserves must never become invisible collision slabs");
    for(const solid of site.solids) {
      assert.ok(blockPenetration(site.walk,solid)<=0);
      assert.ok(blockPenetration(site.landing,solid)<=0);
      for(const loading of site.loading)assert.ok(blockPenetration(loading,solid)<=0);
    }
    for(const reserve of site.reserves)for(const tree of ALDER_EVERGREENS)
      assert.ok(pointFootprintDistance(reserve,tree.trunk.x,tree.trunk.z)>=tree.radius+2-1e-6);
    for(const pose of [...ALDER_LAMP_POSES,...ALDER_BIN_POSES])
      assert.ok(pointFootprintDistance({...site.reserves[0]!,depth:site.reserves[0]!.depth+6},pose.x,pose.z)>=1.1);
    for(const car of site.cars)for(const corner of blockCorners(car.solid))
      assert.ok(site.parking.some(b=>pointFootprintDistance(b,corner.x,corner.z)<1e-6));
  }
});

test("every door reaches paved circulation while the apartment garden retains grass",()=>{
  const paved=groundsPavingQuery(sites);
  for(const site of sites) {
    for(const door of site.front.modules.filter(m=>m.kind==="door")) {
      for(let d=.1;d<=site.recipe.landingDepth;d+=.25) {
        const p=frontPoint(site.front,door.x,d);assert.ok(paved(p.x,p.z));assert.equal(alderGround(p.x,p.z),false);
      }
    }
    for(let d=.1;d<Math.min(...site.edge.map(e=>e.depth));d+=.25) {
      const p=frontPoint(site.front,site.recipe.walkAcross,d);assert.ok(paved(p.x,p.z));assert.equal(alderGround(p.x,p.z),false);
    }
  }
  const garden=sites[1]!,p=frontPoint(garden.front,7.8,12.8);
  assert.equal(paved(p.x,p.z),false);assert.equal(alderGround(p.x,p.z),true);
});

test("invalid, moved, obstructed and conflicting site plans are withheld without mutating saved choices",()=>{
  const recipe=recipes[0]!,front=sites[0]!.front,snapshot=JSON.stringify(recipe);
  const run=(r=recipe,blocks=ALDER_BLOCKS,obstacles:typeof ALDER_SOLIDS=[])=>planSiteGrounds([r],[front],blocks,ALDER_STREETS,alderHeight,obstacles);
  for(const result of [
    run({...recipe,walkAcross:100}),
    run({...recipe,parking:{...recipe.parking,across:[recipe.walkAcross]}}),
    run(recipe,ALDER_BLOCKS.filter(b=>b!==front.block)),
    run(recipe,ALDER_BLOCKS,[groundsRect(front,0,20,4,4,2)]),
    planSiteGrounds([recipe,recipe],[front],ALDER_BLOCKS,ALDER_STREETS,alderHeight),
  ])assert.equal(result.issues.length,1);
  assert.equal(JSON.stringify(recipe),snapshot);
});

test("rotating a frontage rotates its whole grounds layout and paving query",()=>{
  const site=sites[0]!,angle=.73,rotate=(x:number,z:number)=>({x:x*Math.cos(angle)-z*Math.sin(angle),z:x*Math.sin(angle)+z*Math.cos(angle)});
  const blocks=ALDER_BLOCKS.map(b=>({...b,...rotate(b.x,b.z),rotation:b.rotation+angle}));
  const front={...site.front,block:{...site.front.block,...rotate(site.front.block.x,site.front.block.z),rotation:site.front.block.rotation+angle}};
  const roads=ALDER_STREETS.map(s=>({...s,points:s.points.map(p=>({...p,...rotate(p.x,p.z)}))}));
  const result=planSiteGrounds([site.recipe],[front],blocks,roads,()=>2);
  assert.deepEqual(result.issues,[]);const turned=result.plans[0]!,paved=groundsPavingQuery(result.plans);
  for(let i=0;i<site.solids.length;i++) {
    const p=rotate(site.solids[i]!.x,site.solids[i]!.z);
    assert.ok(Math.hypot(p.x-turned.solids[i]!.x,p.z-turned.solids[i]!.z)<1e-7);
  }
  const door=frontPoint(front,site.recipe.walkAcross,8);assert.ok(paved(door.x,door.z));
});

test("editor and runtime ignore only a frontage's own validated grounds furniture",()=>{
  const editor=frontageContextForLayout(layout);
  for(const site of sites) {
    const runtime=frontageAccessTools(ALDER_FRONTAGE_CONTEXT),editing=frontageAccessTools(editor);
    for(const r of site.recipe.planters) {
      assert.equal(runtime.clear(site.front,r.across,r.outward),null);
      assert.equal(editing.clear(site.front,r.across,r.outward),null);
      const foreign={...site.front,recipe:{...site.front.recipe,id:"foreign-frontage"}};
      assert.match(runtime.clear(foreign,r.across,r.outward)??"",/blocked/i);
    }
  }
});

test("rendered grounds replace old aprons with upward surfaces, shared cars and bounded batches",()=>{
  const pilots=sites.slice(0,3),scene=new THREE.Scene(),root=addSiteGrounds(scene,pilots,alderHeight);
  addBuildingFronts(scene,pilots.map(s=>s.front),alderHeight,ALDER_GROUNDS_FRONT_IDS);
  let meshes=0,triangles=0,lights=0;
  root.traverse(o=>{
    if(o instanceof THREE.Light)lights++;
    if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position!.count)/3;
      if(!(o instanceof THREE.InstancedMesh)&&/-(walk|asphalt|paint|yellow)$/.test(o.name)) {
        const normals=o.geometry.getAttribute("normal"),positions=o.geometry.getAttribute("position");
        const site=sites.find(s=>o.name.startsWith(`grounds-${s.recipe.id}-`))!;
        for(let i=0;i<normals.count;i++) {
          assert.ok(normals.getY(i)>.99);
          assert.ok(pointFootprintDistance(site.reserves[0]!,positions.getX(i),positions.getZ(i))<.001,"surface or paint leaked outside its site");
        }
      }
    }
  });
  assert.ok(meshes<=36);assert.ok(triangles<25000);assert.equal(lights,0);
  for(const site of pilots) {
    assert.equal(scene.getObjectByName(`front-paving-${site.recipe.frontageId}`),undefined);
    for(const car of site.cars) {
      const mesh=root.getObjectByName(`grounds-${site.recipe.id}-${car.kind}-paint`) as THREE.InstancedMesh,matrix=new THREE.Matrix4();
      mesh.getMatrixAt(0,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);
      assert.ok(p.distanceTo(new THREE.Vector3(car.solid.x,car.solid.base+.025,car.solid.z))<.001);
    }
  }
});
