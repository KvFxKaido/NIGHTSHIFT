import * as THREE from "three";

/**
 * Port Alder's static scenery is merged into a handful of city-wide meshes, and
 * a city-wide mesh has a city-wide bounding sphere: it is drawn in full from
 * every position on the map, so frustum culling saves nothing. Measured on
 * master before this existed, driving from the freight blocks to mid-city moved
 * the draw calls from 102 to 452 while the triangle count stayed between 832k
 * and 874k — a 3% spread across the whole district.
 *
 * Splitting those meshes on a grid gives each piece its own bounds, so the far
 * side of the city stops being submitted. The trees already worked this way
 * (`render/evergreens.ts` batches instances per 256 m cell); this is the same
 * idea for merged geometry, and the two are complements rather than rivals.
 *
 * Nothing here changes what is drawn, only how it is divided: every triangle,
 * vertex attribute, material and shadow flag survives. No simulation object is
 * touched — collision reads the sim's own solids, never these meshes.
 */

/** Keep complete triangles and every vertex attribute; only draw boundaries change. */
export function chunkMesh(mesh: THREE.Mesh<THREE.BufferGeometry>, size = CHUNK_SIZE): THREE.Group {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const position = source.getAttribute("position");
  const cells = new Map<string, number[]>();
  for (let i = 0; i < position.count; i += 3) {
    // Bucket by the triangle's centroid so a triangle is never split in two.
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;
    let vertices = cells.get(key);
    if (!vertices) { vertices = []; cells.set(key, vertices); }
    vertices.push(i, i + 1, i + 2);
  }
  const group = new THREE.Group(); group.name = mesh.name;
  group.position.copy(mesh.position); group.quaternion.copy(mesh.quaternion); group.scale.copy(mesh.scale);
  for (const [key, vertices] of cells) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      // Copy the raw elements rather than getComponent's reading of them.
      // getComponent denormalizes, so a normalized Uint8 colour read that way
      // and written back into a Uint8 array truncates every channel to zero --
      // the corruption a type-preserving copy exists to avoid. Raw elements
      // keep the source's array type and normalized flag exactly, and cost a
      // packed attribute its own size instead of four times it.
      const size = attribute.itemSize;
      const ArrayType = attribute.array.constructor as { new (length: number): typeof attribute.array };
      const values = new ArrayType(vertices.length * size);
      vertices.forEach((vertex, i) => {
        for (let component = 0; component < size; component++) {
          values[i * size + component] = attribute.array[vertex * size + component]!;
        }
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(values, size, attribute.normalized));
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const child = new THREE.Mesh(geometry, mesh.material);
    // The evergreens' `name:cell` convention, so __ns.pick still names a piece.
    child.name = `${mesh.name}:${key}`;
    child.castShadow = mesh.castShadow; child.receiveShadow = mesh.receiveShadow;
    child.renderOrder = mesh.renderOrder;
    group.add(child);
  }
  if (source !== mesh.geometry) source.dispose();
  mesh.geometry.dispose();
  return group;
}

/**
 * The grid the district is divided on. Larger cells cull less; smaller cells
 * cost a draw call each. See design/DISTRICT.md for the measurements behind it.
 */
export const CHUNK_SIZE = 512;

/**
 * The merged, static, city-wide meshes. Cars, traffic, instanced props and the
 * editable building boxes keep their own ownership and transforms; a name that
 * is not in this list is left exactly as it was built.
 */
export const CHUNKED_SCENERY = [
  "alder-asphalt", "alder-pavement", "alder-ground", "alder-outskirts", "alder-lane-paint",
  "alder-lamp-posts", "alder-lamp-heads", "alder-lamp-pools",
  "district-facades", "district-roofs", "district-signage", "district-signage-glow", "district-shop-spill",
] as const;

export function chunkAlderScenery(scene: THREE.Scene, size = CHUNK_SIZE): void {
  const names = new Set<string>(CHUNKED_SCENERY);
  for (const object of [...scene.children]) {
    if (!(object instanceof THREE.Mesh) || !names.has(object.name)) continue;
    scene.remove(object);
    scene.add(chunkMesh(object as THREE.Mesh<THREE.BufferGeometry>, size));
  }
}
