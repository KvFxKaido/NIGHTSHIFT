import * as THREE from "three";
import type { Evergreen } from "../sim/alder-evergreens.ts";
import { firGeometry, firMaterials } from "./fir-tree.ts";

/** Two instanced draws per geographic batch; only the visible trunks collide. */
export function addEvergreens(scene: THREE.Scene, trees: readonly Evergreen[], _night: boolean): void {
  const { trunk: trunkGeometry, crown: crownGeometry } = firGeometry();
  const { trunk: trunkMaterial, crown: crownMaterial } = firMaterials();
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
      const growth = tree.oldGrowth ? 1.5 : 1;
      pose.position.y = t.base; pose.rotation.y = tree.height/growth; pose.scale.set(tree.radius, tree.height, tree.radius);
      pose.updateMatrix(); crowns.setMatrixAt(i, pose.matrix);
      const originalRadius = tree.radius/growth;
      color.setRGB(.78 + originalRadius * .04, .85 + originalRadius * .025, .8 + originalRadius * .03);
      crowns.setColorAt(i, color);
    });
    for (const mesh of [trunks, crowns]) {
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
    }
  }
  scene.add(group);
}
