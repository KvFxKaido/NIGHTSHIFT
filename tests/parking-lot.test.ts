import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import recipes from "../src/sim/alder-parking.json" with { type: "json" };
import { createParkingLot, parkingPavingQuery, parkingPoint } from "../src/sim/parking-lot.ts";
import { blockCorners, blockPenetration, pointFootprintDistance, segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { ALDER_PARKING, ALDER_EVERGREENS, ALDER_BLOCKS, ALDER_STREETS, ALDER_SOLIDS, alderGround,
  alderHeight, createAlderWorld, projectOntoAlder, resolveAlderLayout, frontageContextForLayout } from "../src/sim/alder.ts";
import { addParkingLots } from "../src/render/parking-lot.ts";
import { grassSite } from "../src/render/grass.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { hasContact, NEUTRAL } from "./helpers/handling.ts";

const lot = ALDER_PARKING[0]!;

test("parking recipes reproduce bays and occupancy, and rotate the complete layout", () => {
  assert.deepEqual(createParkingLot(recipes[0]!, alderHeight), lot);
  assert.equal(lot.bays.filter(b=>!b.accessSpace).length,35);
  assert.equal(lot.cars.length,8);
  assert.ok(lot.cars.every(car=>!lot.bays.find(b=>b.id===car.id)!.accessible));
  assert.equal(lot.bays.filter(b=>b.accessible).length,1);
  assert.equal(lot.bays.filter(b=>b.accessSpace).length,1);
  const turned = createParkingLot({...recipes[0]!, x:100,z:200,rotation:Math.PI/2,walkTo:undefined},()=>2);
  for (let i=0;i<lot.cars.length;i++) {
    const a=lot.cars[i]!,b=turned.cars[i]!;
    assert.equal(a.id,b.id);assert.equal(a.kind,b.kind);
    assert.ok(Math.abs(b.solid.x-(100-(a.solid.z-lot.recipe.z)))<1e-8);
    assert.ok(Math.abs(b.solid.z-(200+(a.solid.x-lot.recipe.x)))<1e-8);
  }
  assert.throws(()=>createParkingLot({...recipes[0]!,aisleWidth:3},()=>0));
  assert.throws(()=>createParkingLot({...recipes[0]!,columns:5.5},()=>0));
  assert.throws(()=>createParkingLot(recipes[0]!,x=>x*.2),/flatter/);
});

test("every car fits its bay, and the driving aisle and turnaround stay clear", () => {
  for (const car of lot.cars) {
    const bay=lot.bays.find(b=>b.id===car.id)!;
    for (const corner of blockCorners(car.solid)) assert.ok(pointFootprintDistance(bay.footprint,corner.x,corner.z)<1e-6);
  }
  const left=parkingPoint(lot.recipe,-lot.footprint.width/2+4,0),right=parkingPoint(lot.recipe,lot.footprint.width/2-4,0);
  const exit=parkingPoint(lot.recipe,lot.footprint.width/2-4,lot.footprint.depth/2+lot.recipe.entranceLength);
  for (const solid of lot.solids) {
    assert.ok(segmentFootprintDistance(solid,left,right)>=1.8,"blocked main aisle");
    assert.ok(segmentFootprintDistance(solid,right,exit)>=1.8,"blocked entrance/turnaround");
  }
  const on=projectOntoAlder(exit.x,exit.z);
  assert.ok(on.distance<on.width/2,"driveway must reach a road, not stop in the grass");
});

test("lot paving agrees with tyre grip and grass exclusion through the street connection", () => {
  const query=parkingPavingQuery(ALDER_PARKING),grass=grassSite(createAlderWorld());
  for (const surface of lot.surfaces) for (const p of [surface,...blockCorners(surface)]) {
    assert.ok(query(p.x,p.z));assert.equal(alderGround(p.x,p.z),false);assert.equal(grass(p.x,p.z),false);
  }
  for (let z=0;z<=lot.footprint.depth/2+lot.recipe.entranceLength;z+=.5) {
    const p=parkingPoint(lot.recipe,lot.footprint.width/2-4,z);
    assert.equal(alderGround(p.x,p.z),false,"unpaved break in entrance");
  }
  assert.equal(query(lot.recipe.x,lot.recipe.z+25),false,"do not pave the whole campus");
});

test("parking leaves roads/buildings clear, displaces foliage and reserves its access from editing", () => {
  for (const street of ALDER_STREETS) for (let i=1;i<street.points.length;i++)
    assert.ok(segmentFootprintDistance(lot.footprint,street.points[i-1]!,street.points[i]!)>=street.points[i]!.width/2+2.8);
  for (const surface of lot.surfaces) {
    for (const b of ALDER_BLOCKS) assert.ok(blockPenetration(surface,b)<=0);
    for (const tree of ALDER_EVERGREENS) assert.ok(pointFootprintDistance(surface,tree.trunk.x,tree.trunk.z)>=tree.radius+2-1e-6);
  }
  assert.ok(lot.solids.every(s=>ALDER_SOLIDS.includes(s)));
  assert.ok(!ALDER_SOLIDS.includes(lot.footprint),"the lot cannot be an invisible solid slab");
  const layout=resolveAlderLayout({schema:2,retired:[],authored:[{...lot.footprint,id:"authored-parking-overlap",height:10}]});
  assert.ok(layout.issues.some(issue=>issue.includes("parking lot")));
  const editor=frontageContextForLayout({schema:2,retired:[],authored:[]});
  assert.ok(lot.solids.every(s=>editor.obstacles.includes(s)),"editor and reload must protect the same parking props");
});

test("parking renderer uses bounded batches and the shared car poses", () => {
  const scene=new THREE.Scene();addParkingLots(scene,ALDER_PARKING,alderHeight,false);scene.updateMatrixWorld(true);
  const root=scene.getObjectByName("alder-parking")!;
  let meshes=0,lights=0;
  root.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;if(o instanceof THREE.Light)lights++;});
  assert.ok(meshes<=14);assert.equal(lights,0);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  for (const kind of ["sedan","suv"] as const) {
    const cars=lot.cars.filter(c=>c.kind===kind),mesh=scene.getObjectByName(`parking-signal-house-${kind}-paint`) as THREE.InstancedMesh;
    assert.equal(mesh.count,cars.length);
    cars.forEach((car,i)=>{mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);
      assert.ok(position.distanceTo(new THREE.Vector3(car.solid.x,car.solid.base+.025,car.solid.z))<.001);
      assert.ok(scale.distanceTo(new THREE.Vector3(1,1,1))<1e-6);
    });
  }
});

await RAPIER.init();
test("parked cars are solid while the parking aisle is drivable", () => {
  const target=lot.cars.find(c=>c.solid.rotation===0)!;
  const world=createAlderWorld(),pose=target.solid;
  const start={x:pose.x,z:pose.z+12,y:2,heading:0,pitch:0};
  const run=(solids:typeof lot.solids)=>{
    const sim=createSim("fwd",{...world,start,solids},{traffic:false});
    try {
      sim.body.setLinvel({x:0,y:0,z:-10},true);let hit=false;
      for(let i=0;i<150;i++){step(sim,{...NEUTRAL,throttle:1});hit ||= hasContact(sim);}
      return {hit,z:sim.state.vehicle.z};
    } finally {sim.world.free();}
  };
  const blocked=run([pose]),clear=run([]);
  assert.ok(blocked.hit);assert.ok(blocked.z>pose.z);assert.ok(clear.z<pose.z-4);
});
