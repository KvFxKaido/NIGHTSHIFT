import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildingPalette, FACADE_BASE } from "../src/render/building-palette.ts";
import { addBuildingFronts } from "../src/render/building-fronts.ts";
import { addNightBuildings } from "../src/render/night.ts";
import { addTowerDetails } from "../src/render/tower-detail.ts";
import { ALDER_BUILDING_FRONTS, alderHeight } from "../src/sim/alder.ts";

test("upper concrete, modular base and tower metal use one palette without changing rooms or silhouette",()=>{
  const choices=new Map(ALDER_BUILDING_FRONTS.map(plan=>[buildingPalette(plan.recipe.id).name,plan]));
  assert.equal(choices.size,3);
  for(const plan of choices.values()) {
    const palette=buildingPalette(plan.recipe.id),scene=new THREE.Scene();
    const site={...plan.block,faceDistances:[10,10,10,10] as const,structuredFrontage:true,frontageHeight:plan.bandHeight};
    addNightBuildings(scene,[{...site,buildingPalette:palette}]);
    const baseline=new THREE.Scene();addNightBuildings(baseline,[site]);
    const upper=scene.getObjectByName("district-facades") as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    const previous=baseline.getObjectByName("district-facades") as typeof upper;
    assert.deepEqual(upper.geometry.getAttribute("position").array,previous.geometry.getAttribute("position").array);
    assert.deepEqual(upper.geometry.getAttribute("uv").array,previous.geometry.getAttribute("uv").array);
    assert.equal(upper.material.emissiveMap,previous.material.emissiveMap);
    assert.equal(upper.material.emissiveIntensity,previous.material.emissiveIntensity);
    const expected=new THREE.Color(palette.wall),baked=new THREE.Color(FACADE_BASE),upperColours=upper.geometry.getAttribute("color");
    for(let i=0;i<upperColours.count;i++) {
      assert.ok(Math.abs(upperColours.getX(i)*baked.r-expected.r)<1e-6);
      assert.ok(Math.abs(upperColours.getY(i)*baked.g-expected.g)<1e-6);
      assert.ok(Math.abs(upperColours.getZ(i)*baked.b-expected.b)<1e-6);
    }
    const root=addBuildingFronts(scene,[plan],alderHeight);
    root.traverse(o=>{
      if(!(o instanceof THREE.Mesh)||(o.material as THREE.Material).name!=="front-concrete")return;
      const colours=o.geometry.getAttribute("color");
      for(let i=0;i<colours.count;i++)assert.ok(Math.abs(colours.getX(i)-expected.r)+Math.abs(colours.getY(i)-expected.g)+Math.abs(colours.getZ(i)-expected.b)<1e-6);
    });
    const tower=addTowerDetails(scene,[{...site,height:70,buildingPalette:palette,dressing:{signs:0,secondSign:0,shopfronts:0,coloured:0,warm:0,windows:"office"}}]);
    const trim=tower.getObjectByName("tower-frame-relief") as THREE.Mesh;
    const colour=trim.geometry.getAttribute("color"),metal=new THREE.Color(palette.metal);
    assert.ok(Math.abs(colour.getX(0)-metal.r)+Math.abs(colour.getY(0)-metal.g)+Math.abs(colour.getZ(0)-metal.b)<1e-6);
  }
});

test("palette variation stays batched and warehouse roof caps stay within the existing height",()=>{
  const plans=ALDER_BUILDING_FRONTS.filter(p=>p.recipe.industrialStyle).slice(0,3),scene=new THREE.Scene();
  const root=addBuildingFronts(scene,plans,alderHeight),materials=new Set<THREE.Material>();
  for(const plan of plans) {
    const site=root.getObjectByName(`front-${plan.recipe.id}`)!;
    let top=-Infinity;
    site.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      materials.add(o.material as THREE.Material);
      const positions=o.geometry.getAttribute("position");
      for(let i=0;i<positions.count;i++)top=Math.max(top,positions.getY(i));
    });
    assert.ok(Math.abs(top-plan.block.height)<.0001,"roof trim must not grow a new silhouette");
  }
  assert.equal([...materials].filter(m=>m.name==="front-concrete").length,1,"different palettes share a single concrete material");
  assert.equal([...materials].filter(m=>m.name==="front-metal").length,1);
});
