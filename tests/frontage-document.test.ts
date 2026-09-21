import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALDER_FRONTAGE_DOCUMENT as DOC, ALDER_FRONTAGE_CONTEXT as CONTEXT, ALDER_BUILDING_FRONTS, ALDER_BLOCKS, ALDER_STREETS, alderHeight } from "../src/sim/alder.ts";
import { planBuildingFronts, frontPoint } from "../src/sim/building-fronts.ts";
import { parseFrontageDocument, resolveFrontages, frontageForSite, frontageSurfaceFingerprint } from "../src/sim/frontage-document.ts";
import { generateFrontages, frontageAccessTools, validateFrontageAccess, checkedFrontages } from "../src/sim/frontage-generator.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";
import { authoredFromId } from "../src/sim/building-layout.ts";

test("the baked district loads exact saved choices and all generated entrances clear the world",()=>{
  assert.deepEqual(parseFrontageDocument(JSON.parse(JSON.stringify(DOC))),DOC);
  assert.ok(DOC.entries.length>75);assert.ok(DOC.attention.length>0);
  assert.equal(ALDER_BUILDING_FRONTS.length,DOC.entries.length);
  const tools=frontageAccessTools(CONTEXT);
  for(const plan of ALDER_BUILDING_FRONTS)assert.deepEqual(validateFrontageAccess(plan,tools),[],plan.recipe.id);
  for(const pilot of planBuildingFronts(ALDER_BLOCKS,ALDER_STREETS,alderHeight))
    assert.deepEqual(DOC.entries.find(e=>e.plan.recipe.id===pilot.recipe.id)?.plan,pilot,"approved pilots retain their exact choices");
  assert.deepEqual(new Set(DOC.entries.map(e=>e.plan.recipe.kind)),new Set(["office","shops","residential","warehouse"]));
});

test("generation is stable under site reordering, preserves locks and hand edits, and never rerolls at load",()=>{
  const pilots=DOC.entries.filter(e=>e.locked),base={...DOC,entries:pilots,attention:[]};
  const first=generateFrontages(base,CONTEXT,{district:"belltown"});
  const reordered=generateFrontages(base,{...CONTEXT,sites:[...CONTEXT.sites].reverse()},{district:"belltown"});
  assert.deepEqual(first,reordered);
  assert.deepEqual(generateFrontages(first,CONTEXT,{district:"belltown"}),first);
  for(const p of pilots)assert.deepEqual(first.entries.find(e=>e.buildingId===p.buildingId),p);
  const edited=structuredClone(first),entry=edited.entries.find(e=>!e.locked)!;entry.edited=true;
  const after=generateFrontages(edited,CONTEXT,{district:"belltown",reroll:true});
  assert.deepEqual(after.entries.find(e=>e.buildingId===entry.buildingId),entry);
  const locked=pilots[0]!;
  assert.deepEqual(generateFrontages(first,CONTEXT,{buildingId:locked.buildingId,reroll:true}),first);
  const rerolled=generateFrontages(first,CONTEXT,{buildingId:entry.buildingId,reroll:true});
  assert.notDeepEqual(rerolled.entries.find(e=>e.buildingId===entry.buildingId)?.plan.modules,entry.plan.modules);
});

test("stable authored identities retain frontage ownership; moving an envelope flags refit instead of losing edits",()=>{
  const entry=DOC.entries.find(e=>!e.locked)!,site=CONTEXT.sites.find(s=>s.id===entry.buildingId)!;
  const moved={id:authoredFromId(site.id),block:{...site.block,x:site.block.x+3,rotation:.3}};
  assert.equal(frontageForSite(DOC,moved.id),entry);
  const result=resolveFrontages(DOC,[moved]);assert.equal(result.plans.length,0);assert.equal(result.issues.length,1);
  assert.deepEqual(entry,DOC.entries.find(e=>e.buildingId===entry.buildingId));
  const renamed=resolveFrontages(DOC,[{...site,id:authoredFromId(site.id)}]);assert.equal(renamed.plans.length,1);
});

test("saved frontage data rejects overlapping openings, missing doors, unbounded textures and broken paths",()=>{
  for(const corrupt of [
    (d:typeof DOC)=>{d.entries[0]!.plan.modules=[];},
    (d:typeof DOC)=>{(d.entries[0]!.plan.modules[0] as {x:number}).x=NaN;},
    (d:typeof DOC)=>{d.entries.push(d.entries[0]!);},
    (d:typeof DOC)=>{(d.entries[0]!.plan.paving[0] as {left:number}).left=20;},
    (d:typeof DOC)=>{const m=d.entries[0]!.plan.modules.find(m=>m.kind==="sign")!;(m as {text:string}).text="X".repeat(500);},
  ]) {const copy=structuredClone(DOC);corrupt(copy);assert.throws(()=>parseFrontageDocument(copy));}
  const copy=structuredClone(DOC),plan=copy.entries[0]!.plan,door=plan.modules.find(m=>m.kind==="door")!;
  (plan as {modules:typeof plan.modules}).modules=[...plan.modules,{...door}];assert.throws(()=>parseFrontageDocument(copy),/overlap/);
});

test("appearance edits preserve race identity but changed access paving updates it",()=>{
  const plans=structuredClone(ALDER_BUILDING_FRONTS),before=frontageSurfaceFingerprint(plans);
  (plans[0]!.modules.find(m=>m.kind==="sign") as {text:string}).text="A NEW NAME";
  assert.equal(frontageSurfaceFingerprint(plans),before);
  (plans[0]!.paving[0] as {leftDepth:number}).leftDepth+=.1;
  assert.notEqual(frontageSurfaceFingerprint(plans),before);
});

test("a new obstruction withholds affected saved access without rerolling the building",()=>{
  const entry=DOC.entries.find(e=>!e.locked)!,plan=entry.plan,p=frontPoint(plan,0,1.5);
  const obstruction={x:p.x,z:p.z,width:1,depth:1,height:2,base:plan.block.base,rotation:0};
  const result=checkedFrontages(DOC,{...CONTEXT,obstacles:[...CONTEXT.obstacles,obstruction]});
  assert.ok(result.issues.some(i=>i.buildingId===entry.buildingId&&i.message.includes("blocked")));
  assert.ok(!result.plans.some(p=>p.recipe.id===plan.recipe.id));
  assert.deepEqual(frontageForSite(DOC,entry.buildingId),entry,"the saved choices survive validation failure");
});

test("district architecture batches geographically with bounded atlas pages and unchanged triangle count",()=>{
  const scene=new THREE.Scene(),root=addBuildingFronts(scene,ALDER_BUILDING_FRONTS,alderHeight);
  let triangles=0,meshes=0,lods=0;const materials=new Set<THREE.Material>();
  root.traverse(o=>{assert.ok(!(o instanceof THREE.Light));if(o instanceof THREE.LOD)lods++;
    if(o instanceof THREE.Mesh){meshes++;materials.add(o.material as THREE.Material);triangles+=(o.geometry.index?.count??o.geometry.attributes.position!.count)/3;}});
  assert.equal(lods,ALDER_BUILDING_FRONTS.length);assert.ok(meshes<ALDER_BUILDING_FRONTS.length*5);
  assert.ok(triangles<150000);assert.ok(root.userData.signAtlases<=12);assert.ok(materials.size<=18);
});
