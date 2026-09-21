import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALDER_FRONTAGE_DOCUMENT as DOC, ALDER_FRONTAGE_CONTEXT as CONTEXT, ALDER_BUILDING_FRONTS, ALDER_BLOCKS, ALDER_STREETS, alderHeight } from "../src/sim/alder.ts";
import { planBuildingFronts, frontPoint } from "../src/sim/building-fronts.ts";
import { parseFrontageDocument, resolveFrontages, frontageForSite, frontageSurfaceFingerprint } from "../src/sim/frontage-document.ts";
import { generateFrontages, frontageAccessTools, validateFrontageAccess, checkedFrontages } from "../src/sim/frontage-generator.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";
import { authoredFromId } from "../src/sim/building-layout.ts";
import { buildingWallFrames, frontagePavingQuery } from "../src/sim/building-fronts.ts";
import { industrialModules } from "../src/sim/industrial-fronts.ts";

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
  assert.ok(triangles<450000);assert.ok(root.userData.signAtlases<=12);assert.ok(materials.size<=18);
});

test("SODO generation preserves existing work and saves three industrial identities deterministically",()=>{
  const base={...DOC,entries:DOC.entries.filter(e=>!e.plan.recipe.industrialStyle),attention:[]};
  const result=generateFrontages(base,CONTEXT,{district:"sodo"});
  for(const entry of base.entries)assert.deepEqual(frontageForSite(result,entry.buildingId),entry);
  assert.deepEqual(result,generateFrontages(base,{...CONTEXT,sites:[...CONTEXT.sites].reverse()},{district:"sodo"}));
  assert.deepEqual(generateFrontages(result,CONTEXT,{district:"sodo"}),result);
  const industrial=result.entries.filter(e=>e.plan.recipe.industrialStyle);
  assert.ok(industrial.length>75);
  assert.deepEqual(new Set(industrial.map(e=>e.plan.recipe.industrialStyle)),new Set(["freight","workshop","depot"]));
  for(const {plan} of industrial) {
    assert.ok(plan.modules.some(m=>m.kind==="door"));assert.ok(plan.modules.some(m=>m.kind==="shutter"));
    assert.ok(plan.modules.filter(m=>m.kind==="sign").every(m=>m.finish==="painted"));
    assert.ok(!plan.modules.some(m=>m.kind==="blade"));
  }
  assert.deepEqual(parseFrontageDocument(result),result);
  const bad=structuredClone(result),entry=bad.entries.find(e=>e.plan.recipe.industrialStyle)!;
  (entry.plan.modules.find(m=>m.finish) as {kind:string}).kind="blade";
  assert.throws(()=>parseFrontageDocument(bad),/Painted lettering/);
});

test("industrial openings fit both narrow and broad sites, and loading guides stay on the shared paving",()=>{
  for(const style of ["freight","workshop","depot"] as const)for(const width of [12,17,18,27,48]) {
    const source=DOC.entries.find(e=>e.plan.recipe.industrialStyle===style)!.plan;
    const plan={...source,width,modules:industrialModules(style,width,19),paving:[{left:-width/2,right:width/2,leftDepth:5,rightDepth:5,joinsStreet:true}]};
    const candidate={...DOC,entries:[{...DOC.entries.find(e=>e.plan.recipe.industrialStyle===style)!,plan:{...plan,block:{...plan.block,width,depth:width}}}]};
    assert.doesNotThrow(()=>parseFrontageDocument(candidate));
  }
  const plans=["freight","workshop","depot"].map(style=>ALDER_BUILDING_FRONTS.find(p=>p.recipe.industrialStyle===style)!);
  const paved=frontagePavingQuery(plans),root=addBuildingFronts(new THREE.Scene(),plans,alderHeight);
  let guides=0,painted=0;
  root.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const material=o.material as THREE.Material;
    if(material.name==="front-painted-sign-atlas"){assert.ok(material instanceof THREE.MeshStandardMaterial);painted++;}
    if(o.name!=="front-loading-guides")return;
    guides++;const positions=o.geometry.getAttribute("position"),normals=o.geometry.getAttribute("normal");
    for(let i=0;i<positions.count;i++) {
      assert.ok(paved(positions.getX(i),positions.getZ(i)),"paint remains inside the physical apron");
      assert.ok(normals.getY(i)>.99);assert.ok(Math.abs(positions.getY(i)-alderHeight(positions.getX(i),positions.getZ(i))-.026)<.001);
    }
  });
  assert.equal(guides,3);assert.ok(painted>0);
});

test("every kit closes all four ground-storey walls, including rotated rectangular buildings",()=>{
  const examples=["shops","residential","office","warehouse"].map(kind=>ALDER_BUILDING_FRONTS.find(p=>p.recipe.kind===kind)!);
  for(const original of examples) {
    const plan={...original,block:{...original.block,rotation:.37}};
    const root=addBuildingFronts(new THREE.Scene(),[plan],alderHeight);root.updateMatrixWorld(true);
    const site=root.getObjectByName(`front-${plan.recipe.id}`)!;
    assert.deepEqual(site.userData.elevations,[0,1,2,3]);
    const surfaceVertices:THREE.Vector3[]=[];
    for(const mesh of site.children)if(mesh instanceof THREE.Mesh) {
      const positions=mesh.geometry.getAttribute("position");
      for(let i=0;i<positions.count;i++)surfaceVertices.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
    }
    // The cladding's four corners on each elevation must exist at both base
    // and cornice height; this catches omitted rear walls and reversed frames.
    for(const wall of buildingWallFrames(plan.block))for(const across of [-wall.width/2,wall.width/2])for(const height of [0,plan.bandHeight]) {
      const point=frontPoint(wall,across,.05);
      assert.ok(surfaceVertices.some(v=>Math.hypot(v.x-point.x,v.y-plan.block.base-height,v.z-point.z)<.002),`${plan.recipe.kind} wall ${wall.side} must close its corner`);
    }
  }
});
