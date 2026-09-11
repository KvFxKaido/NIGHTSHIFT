import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Evergreen } from "../sim/alder-evergreens.ts";

/** Two instanced draws per geographic batch; only the visible trunks collide. */
export function addEvergreens(scene: THREE.Scene, trees: readonly Evergreen[], night: boolean): void {
  const layers = [[1, .5, .47], [.76, .44, .68], [.48, .32, .84]].map(([radius, height, y], i) => {
    const geometry = new THREE.ConeGeometry(radius, height, 7);
    geometry.rotateY(i * .37); geometry.translate(0, y!, 0); return geometry;
  });
  const crownGeometry = mergeGeometries(layers)!;
  layers.forEach(layer => layer.dispose());
  const trunkGeometry = new THREE.BoxGeometry(1, 1, 1);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x695346, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: night ? 0x406449 : 0x4a7851, roughness: 1 });
  const batches = new Map<string, Evergreen[]>();
  for (const tree of trees) {
    const key = `${Math.floor(tree.trunk.x / 256)},${Math.floor(tree.trunk.z / 256)}`;
    const batch = batches.get(key) ?? []; batch.push(tree); batches.set(key, batch);
  }
  const pose = new THREE.Object3D(), color = new THREE.Color();
  const group = new THREE.Group(); group.name = "alder-evergreens";
  for (const [key, batch] of batches) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, batch.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, batch.length);
    trunks.name = `evergreen-trunks:${key}`; crowns.name = `evergreen-crowns:${key}`;
    batch.forEach((tree, i) => {
      const t = tree.trunk;
      pose.rotation.set(0, 0, 0); pose.position.set(t.x, t.base + t.height / 2, t.z);
      pose.scale.set(t.width, t.height, t.depth); pose.updateMatrix(); trunks.setMatrixAt(i, pose.matrix);
      pose.position.y = t.base; pose.rotation.y = tree.height; pose.scale.set(tree.radius, tree.height, tree.radius);
      pose.updateMatrix(); crowns.setMatrixAt(i, pose.matrix);
      color.setRGB(.78 + tree.radius * .04, .85 + tree.radius * .025, .8 + tree.radius * .03);
      crowns.setColorAt(i, color);
    });
    for (const mesh of [trunks, crowns]) {
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
    }
  }
  scene.add(group);
}
