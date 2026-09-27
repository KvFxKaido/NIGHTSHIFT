import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALDER_BUILDING_FRONTS, ALDER_FRONTAGE_DOCUMENT as DOC, alderHeight } from "../src/sim/alder.ts";
import { frontageSurfaceFingerprint, parseFrontageDocument } from "../src/sim/frontage-document.ts";
import type { FrontModule } from "../src/sim/building-fronts.ts";
import { createLaundryDisplay, LAUNDRY_PERIOD } from "../src/render/frontage-displays.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";
import { updatePlaceActivity } from "../src/render/place-activity.ts";

const id="plot--567.000--1330.000";
const entry=DOC.entries.find(e=>e.buildingId===id)!;
const plan=ALDER_BUILDING_FRONTS.find(p=>p.recipe.id===id)!;
const module=plan.modules.find(m=>m.display==="laundry")!;

test("Fifth Ave Laundry keeps its unique name, saved window and manual-edit lock",()=>{
  assert.ok(plan);assert.equal(entry.locked,true);assert.equal(entry.edited,true);
  assert.deepEqual(ALDER_BUILDING_FRONTS.filter(p=>p.modules.some(m=>m.text==="FIFTH AVE LAUNDRY")).map(p=>p.recipe.id),[id]);
  assert.equal(module.kind,"glazing");
  assert.ok(plan.modules.some(m=>m.kind==="blade"&&m.caption==="LAUNDRY"));
  const restored=parseFrontageDocument(JSON.parse(JSON.stringify(DOC)));
  assert.equal(restored.entries.find(e=>e.buildingId===id)!.plan.modules.find(m=>m.kind==="glazing")!.display,"laundry");
  const undressed=structuredClone(DOC);
  for(const p of undressed.entries)for(const m of p.plan.modules)delete (m as {display?:string}).display;
  assert.equal(frontageSurfaceFingerprint(DOC.entries.map(e=>e.plan)),frontageSurfaceFingerprint(undressed.entries.map(e=>e.plan)));
});

test("display validation refuses non-windows, unknown displays and undersized openings",()=>{
  for(const change of [{kind:"door"},{display:"arcade"},{width:2.39},{height:1.79}]) {
    const raw=structuredClone(DOC);
    Object.assign(raw.entries.find(e=>e.buildingId===id)!.plan.modules.find(m=>m.display)!,change);
    assert.throws(()=>parseFrontageDocument(raw),/laundry display/);
  }
});

function points(root:THREE.Group):THREE.Vector3[] {
  root.updateMatrixWorld(true);const out:THREE.Vector3[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh){const p=o.geometry.getAttribute("position");
    for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});
  return out;
}

test("the shared display fits every generated window size that supports it, plus editor extremes",()=>{
  const windows=ALDER_BUILDING_FRONTS.flatMap(p=>p.modules.filter(m=>m.kind==="glazing"&&m.width>=2.4&&m.height>=1.8));
  const sizes=new Map(windows.map(m=>[`${m.width}/${m.height}`,m]));
  for(const [w,h] of [[2.4,1.8],[50,10],[2.4,10],[50,1.8]])sizes.set(`${w}/${h}`,{...module,width:w!,height:h!});
  for(const m of sizes.values()) {
    const {group,update}=createLaundryDisplay(m);
    for(const t of [0,1,2,3,4,7.99]) {
      update(t);
      for(const p of points(group)) {
        assert.ok(Math.abs(p.x-m.x)<m.width/2-.07,`outside ${m.width} m window`);
        assert.ok(Math.abs(p.y-m.y)<m.height/2-.07,`outside ${m.height} m window`);
        assert.ok(p.z>=.1319&&p.z<.139,"between glass and mullions, even in a large window");
      }
    }
    let triangles=0,meshes=0;
    group.traverse(o=>{assert.ok(!(o instanceof THREE.Light));if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.getAttribute("position").count)/3;}});
    assert.ok(triangles<500);assert.equal(meshes,5);
  }
});

test("tumbling is continuous through the period boundary, paused time repeats, and idle drums stay still",()=>{
  const {group,update}=createLaundryDisplay(module);
  const active=group.getObjectByName("laundry-drum-0")!;
  const idle=group.getObjectByName("laundry-drum-1")!;
  update(0);const initial=points(group),idleAngle=idle.rotation.z;
  let last=initial;
  for(let tick=1;tick<=LAUNDRY_PERIOD*60+1;tick++) {
    update(tick/60);const now=points(group);
    now.forEach((p,i)=>assert.ok(p.distanceTo(last[i]!)<.015,"cloth jumps between ticks"));last=now;
    assert.equal(idle.rotation.z,idleAngle);
  }
  update(1);const angle=active.rotation.z,at=points(group);update(1);assert.deepEqual(points(group),at);
  update(2);assert.notEqual(active.rotation.z,angle);
  update(LAUNDRY_PERIOD);assert.deepEqual(points(group),initial);
});

test("batched and independent frontage roots animate until removed, and reattach safely",()=>{
  const scene=new THREE.Scene();
  const root=addBuildingFronts(scene,ALDER_BUILDING_FRONTS,alderHeight);
  const rotor=root.getObjectByName("laundry-drum-0")!;assert.ok(rotor,"static batching must not consume rotors");
  updatePlaceActivity(scene,1);const before=rotor.rotation.z;updatePlaceActivity(scene,2);assert.notEqual(rotor.rotation.z,before);
  const second=addBuildingFronts(scene,[plan],alderHeight);
  const secondRotor=second.getObjectByName("laundry-drum-0")!;
  updatePlaceActivity(scene,3);
  assert.equal(rotor.rotation.z,secondRotor.rotation.z,"both roots keep animating");
  assert.notEqual(rotor.rotation.z,before);
  assert.equal((scene.userData.placeActivity as Map<string,unknown>).size,2);
  root.removeFromParent();const stopped=rotor.rotation.z;
  addBuildingFronts(scene,[{...plan,modules:plan.modules.map(m=>({...m,display:undefined} as FrontModule))}],alderHeight);
  updatePlaceActivity(scene,4);assert.equal(rotor.rotation.z,stopped,"removed preview is not retained by its callback");
  assert.notEqual(secondRotor.rotation.z,stopped,"removing one root leaves the other active");
  assert.equal((scene.userData.placeActivity as Map<string,unknown>).size,1);
  scene.add(root);updatePlaceActivity(scene,5);
  assert.equal(rotor.rotation.z,secondRotor.rotation.z,"reattached root resumes at the current clock");
  root.removeFromParent();second.removeFromParent();
  assert.equal((scene.userData.placeActivity as Map<string,unknown>).size,0);
});
