import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addBroadcastTower } from "../src/render/broadcast-tower.ts";
import landmarks from "../src/sim/alder-landmarks.json" with { type: "json" };

test("broadcast station matches its shared solid and the mast remains a cheap 120m landmark", () => {
  const scene = new THREE.Scene(); addBroadcastTower(scene, true); scene.updateMatrixWorld(true);
  const site = landmarks.broadcastTower;
  const group = scene.getObjectByName("alder-broadcast-tower")!;
  const base = new THREE.Box3().setFromObject(scene.getObjectByName("broadcast-station-solid")!);
  assert.deepEqual(base.getSize(new THREE.Vector3()).toArray(), [site.width, site.height, site.depth]);
  assert.deepEqual(base.getCenter(new THREE.Vector3()).toArray(), [site.x, site.base + site.height / 2, site.z]);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(Math.abs(bounds.max.y - (site.base + site.mastHeight + .85)) < .001);
  const meshes = group.children as THREE.Mesh[];
  assert.ok(meshes.length <= 8, "merge repeated beams and sign pixels by material");
  const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
  assert.ok(triangles < 30000, `${triangles} triangles for one landmark`);
});

test("PORT ALDER lettering faces outward on all four sides without mirrored P stems", () => {
  const scene = new THREE.Scene(); addBroadcastTower(scene, false); scene.updateMatrixWorld(true);
  const site = landmarks.broadcastTower;
  const letters = scene.getObjectByName("broadcast-letters")!;
  const origin = new THREE.Vector3(site.x, site.base, site.z);
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const axis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(axis, angle);
    function hits(pixel: number) {
      const point = new THREE.Vector3((pixel - 11) * .48, 67.6 - 5 * .48, 20).applyAxisAngle(axis, angle).add(origin);
      return new THREE.Raycaster(point, direction, 0, 15).intersectObject(letters).length > 0;
    }
    assert.ok(hits(0), `face ${face}: P stem must appear on the viewer's left`);
    assert.ok(!hits(4), `face ${face}: lower-right of P must remain empty`);
  }
});
