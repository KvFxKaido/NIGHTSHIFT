import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar } from "../src/render/blender-car.ts";

const bytes = await readFile(new URL("../public/assets/cars/ns-hammer-01.glb", import.meta.url));
async function car() {
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return createBlenderCar(gltf.scene, "ns-hammer-01", "ns-hammer");
}

test("Hammer ships valid compact glTF and fits the car adapter without correction", async () => {
  const report = await validator.validateBytes(bytes);
  assert.equal(report.issues.numErrors + report.issues.numWarnings, 0);
  assert.ok(bytes.length < 500_000);
  const view = await car();
  assert.equal(view.car.userData.model, "ns-hammer");
  view.car.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(view.bodyShell).getSize(new THREE.Vector3());
  assert.ok(size.z > 4.4 && size.z < 4.8);
  assert.ok(size.x < 2.5);
  assert.ok(view.bodyShell.getObjectByName("hood-scoop"));
  const widths = view.wheelPivots.map(pivot => new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3()).x);
  assert.ok(widths[2]! > widths[0]! * 1.5, "rear slicks should be wider than front tyres");
});

test("Hammer wheel centres and swept tyre surfaces clear the coachwork", async () => {
  const view = await car();
  const panels: THREE.Mesh[] = [];
  view.bodyShell.traverse(object => {
    if (object instanceof THREE.Mesh) { object.material.side = THREE.DoubleSide; panels.push(object); }
  });
  for (const steering of [-.42, 0, .42]) {
    view.frontWheels.forEach(wheel => { wheel.rotation.y = steering; });
    view.car.updateMatrixWorld(true);
    for (const [i, pivot] of view.wheelPivots.entries()) {
      const center = pivot.getWorldPosition(new THREE.Vector3());
      for (const x of [-1, 0, 1]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
        const local = new THREE.Vector3(x * (i < 2 ? .11 : .18), Math.cos(angle)*.36, Math.sin(angle)*.36);
        const surface = local.clone().applyMatrix4(pivot.matrixWorld);
        const direction = surface.clone().sub(center);
        const hits = new THREE.Raycaster(center, direction.clone().normalize(), .001, direction.length() + .005).intersectObjects(panels);
        assert.equal(hits.length, 0, `${pivot.name}, steering ${steering}: ${hits[0]?.object.name}`);
      }
    }
  }
});
