import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ALDER_BLOCKS, createAlderWorld } from "../src/sim/alder.ts";
import { addBrickCorner, isBrickCorner } from "../src/render/brick-corner.ts";

test("brick corner preserves its occupied plot and keeps its geometry and material cost bounded", () => {
  const sites = ALDER_BLOCKS.filter(isBrickCorner);
  assert.equal(sites.length, 3);
  const textures = new Set<THREE.Texture>();
  const scene = new THREE.Scene();
  let totalTriangles = 0;
  for (const block of sites) {
    assert.equal(isBrickCorner({ ...block, height: 3 }), false, "a resized editor plot must use its ordinary matching shell");
    assert.equal(isBrickCorner({ ...block, x: block.x + 10 }), false, "the prototype must not follow unrelated plots");
    assert.ok(createAlderWorld().solids!.includes(block));
    const group = addBrickCorner(scene, block);
    assert.equal(group.children.length, 9, "all repeated details should share material batches");
    assert.equal(group.position.x, block.x); assert.equal(group.position.z, block.z);
    assert.equal(group.position.y, block.base); assert.equal(group.rotation.y, -block.rotation);
    let triangles = 0;
    for (const object of group.children) {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
      assert.ok(mesh.geometry.boundingBox && mesh.geometry.boundingSphere);
      const p = mesh.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        assert.ok(Math.abs(p.getX(i)) <= block.width / 2 + .01, `${mesh.name}: crossed the solid footprint`);
        assert.ok(Math.abs(p.getZ(i)) <= block.depth / 2 + .01, `${mesh.name}: crossed the solid footprint`);
        assert.ok(p.getY(i) >= -.001 && p.getY(i) <= block.height + .001, `${mesh.name}: exceeded the existing building height`);
      }
      triangles += (mesh.geometry.index?.count ?? p.count) / 3;
      if (mesh.material.map) textures.add(mesh.material.map);
      if (mesh.material.gradientMap) textures.add(mesh.material.gradientMap);
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    assert.ok(triangles < 22000, `building geometry budget: ${triangles}`);
    totalTriangles += triangles;
  }
  assert.ok(totalTriangles < 55000, `whole block geometry budget: ${totalTriangles}`);
  assert.equal(textures.size, 2, "one original concrete tile and one shared cel ramp");
  textures.forEach(texture => texture.dispose());
});
