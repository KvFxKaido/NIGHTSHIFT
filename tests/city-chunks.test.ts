import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { chunkMesh } from "../src/render/city-chunks.ts";
import { addCapitolMarket, isMarketBuilding } from "../src/render/capitol-market.ts";
import { SEATTLE_BLOCKS, SEATTLE_STREETS, seattleHeight } from "../src/sim/seattle.ts";

test("spatial batching preserves complete triangles, UVs, normals and material flags",()=>{
  const source=new THREE.BoxGeometry(800,12,800).toNonIndexed();
  const material=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(source,material);mesh.name="city";mesh.castShadow=true;mesh.receiveShadow=true;mesh.renderOrder=2;
  const records=(geometry:THREE.BufferGeometry)=>{
    const result:string[]=[];
    for(let i=0;i<geometry.getAttribute("position").count;i+=3){
      const values:number[]=[];
      for(let v=i;v<i+3;v++)for(const name of ["position","normal","uv"]){
        const a=geometry.getAttribute(name);for(let c=0;c<a.itemSize;c++)values.push(a.getComponent(v,c));
      }
      result.push(JSON.stringify(values));
    }
    return result;
  };
  const before=records(source).sort(),chunked=chunkMesh(mesh,256),after:string[]=[];
  assert.ok(chunked.children.length>1);
  for(const object of chunked.children){
    const part=object as THREE.Mesh<THREE.BufferGeometry>;
    assert.equal(part.material,material);assert.ok(part.castShadow&&part.receiveShadow);assert.equal(part.renderOrder,2);
    assert.ok(part.geometry.boundingBox&&part.geometry.boundingSphere);after.push(...records(part.geometry));
  }
  assert.deepEqual(after.sort(),before);
});

test("Market Row follows existing solids and its detail LOD switches without changing the world",()=>{
  const blocks=SEATTLE_BLOCKS.filter(isMarketBuilding),before=JSON.stringify(blocks),scene=new THREE.Scene();
  assert.ok(blocks.length>=8);
  addCapitolMarket(scene,blocks,seattleHeight,SEATTLE_STREETS);
  assert.equal(JSON.stringify(blocks),before);
  const wall=scene.getObjectByName("market-row-brick") as THREE.Mesh<THREE.BufferGeometry>;
  const vertices=wall.geometry.getAttribute("position");
  for(let i=0;i<vertices.count;i++) {
    const x=vertices.getX(i),z=vertices.getZ(i),y=vertices.getY(i);
    assert.ok(blocks.some(b=>Math.abs(x-b.x)<=b.width/2+.01&&Math.abs(z-b.z)<=b.depth/2+.01
      &&y>=b.base-.01&&y<=b.base+b.height+.01),"facade left its existing solid");
  }
  const lod=scene.getObjectByName("market-row-detail-distance") as THREE.LOD,camera=new THREE.PerspectiveCamera();
  scene.updateMatrixWorld(true);camera.position.set(700,40,-1480);camera.updateMatrixWorld(true);lod.update(camera);
  assert.equal(lod.getCurrentLevel(),0);
  camera.position.set(700,40,-2400);camera.updateMatrixWorld(true);lod.update(camera);assert.equal(lod.getCurrentLevel(),1);
});
