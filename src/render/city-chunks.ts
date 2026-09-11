import * as THREE from "three";

/** Keep complete triangles and every vertex attribute; only draw boundaries
 * change. A city-wide mesh otherwise survives culling wherever the car is. */
export function chunkMesh(mesh: THREE.Mesh<THREE.BufferGeometry>, size = 512): THREE.Group {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const position = source.getAttribute("position");
  const cells = new Map<string, number[]>();
  for (let i = 0; i < position.count; i += 3) {
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
      const values = new Float32Array(vertices.length * attribute.itemSize);
      vertices.forEach((vertex, i) => {
        for (let component = 0; component < attribute.itemSize; component++) {
          values[i * attribute.itemSize + component] = attribute.getComponent(vertex, component);
        }
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const child = new THREE.Mesh(geometry, mesh.material);
    child.name = `${mesh.name}:${key}`;
    child.castShadow = mesh.castShadow; child.receiveShadow = mesh.receiveShadow;
    child.renderOrder = mesh.renderOrder;
    group.add(child);
  }
  if (source !== mesh.geometry) source.dispose();
  mesh.geometry.dispose();
  return group;
}

/** Only static merged scenery. Cars, instancing and editable building boxes
 * keep their existing ownership and transforms. No simulation objects move. */
export function chunkSeattleScenery(scene: THREE.Scene): void {
  const names = new Set(["seattle-asphalt", "seattle-pavement", "seattle-ground", "seattle-outskirts",
    "seattle-lane-paint", "district-facades", "district-roofs", "district-signage",
    "district-signage-glow", "district-shop-spill"]);
  for (const object of [...scene.children]) {
    if (!(object instanceof THREE.Mesh) || !names.has(object.name)) continue;
    scene.remove(object); scene.add(chunkMesh(object));
  }
}
