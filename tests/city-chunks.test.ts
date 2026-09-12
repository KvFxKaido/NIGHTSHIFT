import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { chunkMesh, CHUNK_SIZE, CHUNKED_SCENERY } from "../src/render/city-chunks.ts";

/** A flat, finely divided sheet: many small triangles carrying position, normal
 *  and uv, which is the shape of every merged surface in Port Alder. */
function sheet(): THREE.Mesh<THREE.BufferGeometry> {
  const geometry = new THREE.PlaneGeometry(2048, 2048, 24, 24).toNonIndexed();
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = "alder-ground";
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.renderOrder = 2;
  return mesh;
}

function records(geometry: THREE.BufferGeometry): string[] {
  const result: string[] = [];
  for (let i = 0; i < geometry.getAttribute("position").count; i += 3) {
    const values: number[] = [];
    for (let vertex = i; vertex < i + 3; vertex++) {
      for (const name of ["position", "normal", "uv"]) {
        const attribute = geometry.getAttribute(name);
        for (let c = 0; c < attribute.itemSize; c++) values.push(attribute.getComponent(vertex, c));
      }
    }
    result.push(JSON.stringify(values));
  }
  return result;
}

// A chunker that drops a triangle, an attribute or a shadow flag is a renderer
// quietly drawing something other than what was authored. Compare every
// triangle's whole vertex record, order-independently, before and after.
test("spatial batching preserves every triangle, attribute and material flag", () => {
  const mesh = sheet();
  const material = mesh.material;
  const before = records(mesh.geometry).sort();
  const chunked = chunkMesh(mesh, 256);

  assert.ok(chunked.children.length > 1, "a city-sized sheet must divide");
  assert.equal(chunked.name, "alder-ground", "the group keeps the mesh's name");
  const after: string[] = [];
  for (const object of chunked.children) {
    const part = object as THREE.Mesh<THREE.BufferGeometry>;
    assert.equal(part.material, material, "chunks share the source material");
    assert.ok(part.castShadow && part.receiveShadow, "shadow flags carry over");
    assert.equal(part.renderOrder, 2);
    // Per-chunk bounds are the whole point: without them nothing culls.
    assert.ok(part.geometry.boundingBox && part.geometry.boundingSphere, "chunk has no bounds");
    // The evergreens' `name:cell` convention, so __ns.pick still names a piece.
    assert.match(part.name, /^alder-ground:-?\d+,-?\d+$/);
    after.push(...records(part.geometry));
  }
  assert.deepEqual(after.sort(), before, "chunking changed the geometry");
});

// The mechanism being bought: each piece must occupy its own cell, because a
// chunk whose bounds still span the city is culled exactly as rarely as the
// single mesh it replaced.
test("each chunk's bounds stay inside its own cell, which is what lets culling work", () => {
  const size = 256;
  const chunked = chunkMesh(sheet(), size);
  // Triangles are bucketed by centroid, so a chunk may overhang its cell by at
  // most one triangle; the sheet's are 2048/24 across.
  const overhang = 2048 / 24 + 1e-6;
  for (const object of chunked.children) {
    const part = object as THREE.Mesh<THREE.BufferGeometry>;
    const [x, z] = part.name.split(":")[1]!.split(",").map(Number) as [number, number];
    const box = part.geometry.boundingBox!;
    assert.ok(box.min.x >= x * size - overhang && box.max.x <= (x + 1) * size + overhang,
      `${part.name} spans x ${box.min.x}..${box.max.x}`);
    assert.ok(box.min.z >= z * size - overhang && box.max.z <= (z + 1) * size + overhang,
      `${part.name} spans z ${box.min.z}..${box.max.z}`);
  }
});

test("the chunked list names only merged static scenery, and the cell size is sane", () => {
  // Cars, traffic, instanced props and the editable building boxes own their
  // own transforms; chunking one would take a moving object apart.
  for (const name of ["alder-buildings", "evergreen-trunks", "traffic-lamps-sedan", "elliott-bay"]) {
    assert.ok(!(CHUNKED_SCENERY as readonly string[]).includes(name), `${name} must not be chunked`);
  }
  assert.ok(CHUNK_SIZE >= 128 && CHUNK_SIZE <= 1024, "cell size outside the measured range");
});
