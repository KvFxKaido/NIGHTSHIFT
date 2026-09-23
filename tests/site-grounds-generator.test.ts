import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import recipes from "../src/sim/alder-site-grounds.json" with {type:"json"};
import { ALDER_BUILDING_FRONTS, ALDER_FRONTAGE_CONTEXT, ALDER_SITE_GROUNDS, alderHeight } from "../src/sim/alder.ts";
import { generateSiteGrounds } from "../src/sim/site-grounds-generator.ts";
import { planSiteGrounds, groundsRect, groundsPavingQuery } from "../src/sim/site-grounds.ts";
import { frontPoint } from "../src/sim/building-fronts.ts";
import { addSiteGrounds } from "../src/render/site-grounds.ts";

test("generation is deterministic from the cleared sites, independent of frontage order",()=>{
  const pilots=recipes;
  const a=generateSiteGrounds(pilots,ALDER_BUILDING_FRONTS,ALDER_FRONTAGE_CONTEXT);
  const b=generateSiteGrounds(pilots,[...ALDER_BUILDING_FRONTS].reverse(),ALDER_FRONTAGE_CONTEXT);
  assert.deepEqual(a,b);assert.deepEqual(a.recipes,recipes);assert.ok(a.attention.length>0);
  assert.ok(a.attention.every(i=>!a.recipes.some(r=>r.frontageId===i.frontageId)));
});

test("generation preserves every existing recipe and manual edit without rerolling",()=>{
  const copy=structuredClone(recipes);copy[0]!.benches[0]!.width=1.9;
  const snapshot=JSON.stringify(copy),after=generateSiteGrounds(copy,ALDER_BUILDING_FRONTS,ALDER_FRONTAGE_CONTEXT);
  assert.deepEqual(after.recipes,copy);assert.equal(JSON.stringify(copy),snapshot);
});

test("courts preserve garden ground without phantom asphalt or parking",()=>{
  const courts=ALDER_SITE_GROUNDS.filter(p=>p.recipe.surface==="court");assert.equal(courts.length,34);
  const paving=groundsPavingQuery(courts);
  for(const court of courts) {
    assert.ok(court.patches.every(p=>p.kind==="walk"));assert.equal(court.parking.length,0);assert.equal(court.cars.length,0);
    assert.ok(court.planters.length>0);
    const p=frontPoint(court.front,court.recipe.walkAcross,4);assert.ok(paving(p.x,p.z));
    const bed=court.planters[0]!;assert.equal(paving(bed.x,bed.z),false);
  }
});

test("obstructed and overlapping proposals cannot displace saved sites or their paths",()=>{
  const front=ALDER_SITE_GROUNDS[3]!.front,blocker=groundsRect(front,0,4,front.width,2,1);
  const context={...ALDER_FRONTAGE_CONTEXT,obstacles:[...ALDER_FRONTAGE_CONTEXT.obstacles,blocker]};
  const result=generateSiteGrounds(recipes.slice(0,3),ALDER_BUILDING_FRONTS,context);
  assert.ok(!result.recipes.some(r=>r.frontageId===front.recipe.id));assert.deepEqual(result.recipes.slice(0,3),recipes.slice(0,3));
  const duplicateFront={...ALDER_SITE_GROUNDS[0]!.front,recipe:{...ALDER_SITE_GROUNDS[0]!.front.recipe,id:"overlap"}};
  const overlap=planSiteGrounds([recipes[0]!,{...recipes[0]!,id:"other-site",frontageId:"overlap"}],
    [ALDER_SITE_GROUNDS[0]!.front,duplicateFront],ALDER_FRONTAGE_CONTEXT.sites.map(s=>s.block),ALDER_FRONTAGE_CONTEXT.streets,alderHeight);
  assert.equal(overlap.plans.length,1);assert.match(overlap.issues[0]!.message,/overlaps another/);
});

test("district batches preserve every triangle and parked car while reducing submissions",()=>{
  let standaloneMeshes=0,standaloneTriangles=0;
  for(const plan of ALDER_SITE_GROUNDS) {
    const group=addSiteGrounds(new THREE.Scene(),[plan],alderHeight);
    group.traverse(o=>{if(o instanceof THREE.Mesh){standaloneMeshes++;standaloneTriangles+=(o.geometry.index?.count??o.geometry.attributes.position!.count)/3*(o instanceof THREE.InstancedMesh?o.count:1);}});
  }
  const root=addSiteGrounds(new THREE.Scene(),ALDER_SITE_GROUNDS,alderHeight);
  let meshes=0,triangles=0,cars=0,lights=0;
  root.traverse(o=>{
    if(o instanceof THREE.Light)lights++;
    if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position!.count)/3*(o instanceof THREE.InstancedMesh?o.count:1);
      if(o instanceof THREE.InstancedMesh&&o.name.endsWith("-paint"))cars+=o.count;
      o.geometry.computeBoundingBox();assert.ok(o.geometry.boundingBox!.max.x-o.geometry.boundingBox!.min.x<350,"batch spans too much city");
    }
  });
  assert.equal(triangles,standaloneTriangles);assert.equal(cars,ALDER_SITE_GROUNDS.reduce((n,p)=>n+p.cars.length,0));assert.equal(lights,0);
  assert.ok(meshes<standaloneMeshes*.55);assert.ok(meshes<180);assert.ok(triangles<160000);
});
