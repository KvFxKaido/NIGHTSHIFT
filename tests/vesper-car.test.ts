import { drivetrainFor, isPlayerCarId } from "../src/customization/cars.ts";
import { decodeProgress, ownsCar } from "../src/settings/progress.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar } from "../src/render/blender-car.ts";

const bytes = await readFile(new URL("../public/assets/cars/ns-vesper-01.glb", import.meta.url));
async function car() {
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return createBlenderCar(gltf.scene, "ns-vesper-01", "ns-vesper");
}

test("Vesper ships valid compact glTF and fits the car adapter without correction", async () => {
  const report = await validator.validateBytes(bytes);
  assert.equal(report.issues.numErrors + report.issues.numWarnings, 0);
  assert.ok(bytes.length < 500_000);
  const view = await car();
  assert.equal(view.car.userData.model, "ns-vesper");
  view.car.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(view.bodyShell).getSize(new THREE.Vector3());
  assert.ok(size.z > 4.1 && size.z < 4.6);
  assert.ok(size.x < 2.5);
  assert.ok(view.bodyShell.getObjectByName("forward-canopy"));
  assert.ok(view.bodyShell.getObjectByName("tally-left-1-slash"));
  assert.ok(view.bodyShell.getObjectByName("tail-band"));
  for (const name of ["popup-left", "popup-right"]) {
    const pod = view.bodyShell.getObjectByName(name)!;
    assert.ok(pod);
    assert.ok(pod.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  }
  assert.equal(drivetrainFor("vesper"), "rwd");
  // Tally's pink slip: a saved garage car once won, never before.
  assert.equal(isPlayerCarId("vesper"), true, "a won Vesper must round-trip through garage saves");
  assert.equal(ownsCar(decodeProgress(null), "vesper"), false, "the Vesper must be won from Tally first");
  assert.equal(ownsCar({ names: { tally: { wins: 3, races: [] } } }, "vesper"), true);

});

test("Vesper wheel centres and swept tyre surfaces clear the coachwork", async () => {
  const view = await car();
  const panels: THREE.Mesh[] = [];
  view.bodyShell.traverse(object => {
    if (object instanceof THREE.Mesh) { object.material.side = THREE.DoubleSide; panels.push(object); }
  });
  for (const steering of [-.42, 0, .42]) {
    view.frontWheels.forEach(wheel => { wheel.rotation.y = steering; });
    view.car.updateMatrixWorld(true);
    for (const pivot of view.wheelPivots) {
      const center = pivot.getWorldPosition(new THREE.Vector3());
      for (const x of [-1, 0, 1]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
        const local = new THREE.Vector3(x * .14, Math.cos(angle)*.36, Math.sin(angle)*.36);
        const surface = local.clone().applyMatrix4(pivot.matrixWorld);
        const direction = surface.clone().sub(center);
        const hits = new THREE.Raycaster(center, direction.clone().normalize(), .001, direction.length() + .005).intersectObjects(panels);
        assert.equal(hits.length, 0, `${pivot.name}, steering ${steering}: ${hits[0]?.object.name}`);
      }
    }
  }
});


test("pop-up pods sweep out of their pockets without crossing fixed coachwork", async () => {
  const view = await car();
  const pods = ["popup-left", "popup-right"].map(name => view.bodyShell.getObjectByName(name)!);
  const fixed: THREE.Mesh[] = [];
  view.bodyShell.traverse(object => {
    if (object instanceof THREE.Mesh && !pods.some(pod => object.parent === pod)) {
      object.material.side = THREE.DoubleSide;
      fixed.push(object);
    }
  });
  for (const pod of pods) {
    const points: { mesh: THREE.Mesh; local: THREE.Vector3 }[] = [];
    pod.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) points.push({ mesh: object, local: new THREE.Vector3().fromBufferAttribute(positions, i) });
    });
    view.car.updateMatrixWorld(true);
    let previous = points.map(p => p.mesh.localToWorld(p.local.clone()));
    for (let step = 1; step <= 30; step++) {
      pod.rotation.x = step / 30 * Math.PI / 3;
      view.car.updateMatrixWorld(true);
      const current = points.map(p => p.mesh.localToWorld(p.local.clone()));
      current.forEach((point, index) => {
        const travel = point.clone().sub(previous[index]!);
        const distance = travel.length();
        if (distance < .00001) return;
        const hits = new THREE.Raycaster(previous[index]!, travel.normalize(), .000001, distance).intersectObjects(fixed);
        assert.equal(hits.length, 0, `${pod.name} step ${step}: ${hits[0]?.object.name}`);
      });
      previous = current;
    }
  }
});
