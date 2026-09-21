import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addTowerDetails, TOWER_DETAIL } from "../src/render/tower-detail.ts";
import { addNightBuildings, facadeGrid, type BuildingSite } from "../src/render/night.ts";
import { ALDER_BLOCKS } from "../src/sim/alder.ts";

const site: BuildingSite = { x: 30,z: -50,base: 12,width: 24,depth: 23,height: 74,rotation: .7,
  decorationIndex: 41,faceDistances: [10,Infinity,Infinity,Infinity],
  dressing: { signs: 0,secondSign: 0,shopfronts: 1,coloured: 0,warm: 1,windows: "office" } };

test("tower detail retains every original distant facade, window phase and roof", () => {
  const scene = new THREE.Scene(); addNightBuildings(scene,[site]);
  const baseline = scene.children.map(object => ({ object, geometry: (object as THREE.Mesh).geometry,
    positions: [...(object as THREE.Mesh).geometry.getAttribute("position").array],
    uv: [...((object as THREE.Mesh).geometry.getAttribute("uv")?.array ?? [])] }));
  const root = addTowerDetails(scene,[site,{...site,height:25},{...site,dressing:{...site.dressing!,windows:"freight"}}]);
  assert.equal(root.children.length,1,"only office towers receive this kit");
  for (const {object,geometry,positions,uv} of baseline) {
    assert.ok(scene.children.includes(object)); assert.equal((object as THREE.Mesh).geometry,geometry);
    assert.deepEqual([...geometry.getAttribute("position").array],positions);
    assert.deepEqual([...(geometry.getAttribute("uv")?.array ?? [])],uv);
  }
  const lod=root.children[0] as THREE.LOD;
  assert.deepEqual(lod.position.toArray(),[30,12,-50]); assert.equal(lod.rotation.y,-.7);
  assert.equal(lod.levels[0]!.object.children.length,2);
  assert.equal(lod.levels[1]!.object.children.length,0,"far level is the existing batched shell");
  assert.equal(facadeGrid(24,74).floors,21);
});

test("detail culls beyond the completed fade and hysteresis cannot expose a hard switch", () => {
  const scene=new THREE.Scene(),root=addTowerDetails(scene,[site]); scene.updateMatrixWorld(true);
  const lod=root.children[0] as THREE.LOD, camera=new THREE.PerspectiveCamera();
  const distance=(metres:number)=>{camera.position.set(site.x+metres,site.base!,site.z);camera.updateMatrixWorld(true);lod.update(camera);};
  distance(20); assert.ok(lod.levels[0]!.object.visible);
  distance(241); assert.ok(!lod.levels[0]!.object.visible);
  distance(225); assert.ok(!lod.levels[0]!.object.visible,"stay far inside the hysteresis band");
  distance(219); assert.ok(lod.levels[0]!.object.visible);
  assert.ok(TOWER_DETAIL.cull*(1-TOWER_DETAIL.hysteresis)>TOWER_DETAIL.faded,"reactivate before any detail is visible");
});

test("the complete tower kit has bounded geometry and two shared materials without added lights", () => {
  const scene=new THREE.Scene();
  const sites=ALDER_BLOCKS.map(block=>({...site,...block}));
  const root=addTowerDetails(scene,sites),materials=new Set<THREE.Material>();
  let total=0;
  for(const object of root.children) {
    const lod=object as THREE.LOD; let triangles=0;
    lod.traverse(child=>{
      assert.ok(!(child instanceof THREE.Light));
      if(!(child instanceof THREE.Mesh)) return;
      materials.add(child.material); assert.equal(child.castShadow,false);
      assert.ok(child.geometry.boundingBox && child.geometry.boundingSphere);
      const points=child.geometry.getAttribute("position");triangles+=points.count/3;
      const block=sites.find(b=>b.x===lod.position.x&&b.z===lod.position.z)!;
      for(let i=0;i<points.count;i++) {
        assert.ok(Math.abs(points.getX(i))<=block.width/2+.33);
        assert.ok(Math.abs(points.getZ(i))<=block.depth/2+.33);
        assert.ok(points.getY(i)>=0 && points.getY(i)<=block.height+1);
      }
    });
    assert.ok(triangles<2200,`per-tower geometry budget: ${triangles}`); total+=triangles;
  }
  assert.equal(materials.size,2); assert.ok(total<230000,`city-wide detail budget: ${total}`);
});
