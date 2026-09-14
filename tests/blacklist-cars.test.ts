import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar, BLENDER_CARS } from "../src/render/blender-car.ts";
import { CAR_GEOMETRY } from "../src/render/car.ts";
import { drivetrainFor, isPlayerCarId } from "../src/customization/cars.ts";

const bodies = [
  { id: "latch", drive: "fwd", landmark: "liftback-canopy", minHeight: 1.4 },
  { id: "breakwater", drive: "awd", landmark: "tailgate-spare", minHeight: 1.8 },
  { id: "wager", drive: "rwd", landmark: "rotary-canopy", minHeight: 1.2 },
  { id: "meridian", drive: "awd", landmark: "wagon-cabin", minHeight: 1.5 },
  { id: "skim", drive: "fwd", landmark: "hardtop-cap", minHeight: 1.15 },
  { id: "reign", drive: "awd", landmark: "upright-coupe", minHeight: 1.4 },
] as const;

for (const body of bodies) {
  test(`${body.id}: compact valid asset, declared drivetrain and distinct body`, async () => {
    const bytes = await readFile(new URL(`../public/${BLENDER_CARS[body.id].path}`, import.meta.url));
    const report = await validator.validateBytes(bytes);
    assert.equal(report.issues.numErrors + report.issues.numWarnings, 0);
    assert.ok(bytes.length < 500_000, `${body.id}: ${bytes.length} bytes`);
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const view = createBlenderCar(asset.scene, BLENDER_CARS[body.id].root, BLENDER_CARS[body.id].model);
    assert.equal(view.car.userData.model, `ns-${body.id}`);
    assert.equal(drivetrainFor(body.id), body.drive);
    assert.equal(isPlayerCarId(body.id), false, "rival cannot become a saved garage car");
    assert.ok(view.bodyShell.getObjectByName(body.landmark));
    view.car.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(view.bodyShell);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.z > 4.1 && size.z < 4.65, `${body.id}: length ${size.z}`);
    assert.ok(size.x < 2.5);
    assert.ok(bounds.max.y > body.minHeight);
    if (body.id === "skim") assert.ok(bounds.max.y < 1.32, "roadster must stay low");
    if (body.id === "meridian") {
      const cabin = new THREE.Box3().setFromObject(view.bodyShell.getObjectByName("wagon-cabin")!);
      assert.ok(cabin.max.z > 2, "wagon cargo cabin must reach the tail");
      assert.ok(view.bodyShell.getObjectByName("rear-door-handle-left"));
    }
    if (body.id === "breakwater") {
      const spare = new THREE.Box3().setFromObject(view.bodyShell.getObjectByName("tailgate-spare")!);
      assert.ok(spare.min.z > 2, "spare belongs outside the tailgate");
      assert.equal(view.wheelPivots.length, 4, "spare is not a rolling rig wheel");
    }
  });

  test(`${body.id}: tyre surfaces clear coachwork at full steering lock`, async () => {
    const bytes = await readFile(new URL(`../public/${BLENDER_CARS[body.id].path}`, import.meta.url));
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const view = createBlenderCar(asset.scene, BLENDER_CARS[body.id].root, BLENDER_CARS[body.id].model);
    const panels: THREE.Mesh[] = [];
    view.bodyShell.traverse(object => {
      if (object instanceof THREE.Mesh) { object.material.side = THREE.DoubleSide; panels.push(object); }
    });
    for (const steering of [-CAR_GEOMETRY.maxSteerAngle, 0, CAR_GEOMETRY.maxSteerAngle]) {
      view.frontWheels.forEach(wheel => { wheel.rotation.y = steering; });
      view.car.updateMatrixWorld(true);
      for (const pivot of view.wheelPivots) {
        const center = pivot.getWorldPosition(new THREE.Vector3());
        for (const x of [-1, 0, 1]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
          const surface = new THREE.Vector3(x * CAR_GEOMETRY.tireHalfWidth,
            Math.cos(angle) * CAR_GEOMETRY.tireRadius, Math.sin(angle) * CAR_GEOMETRY.tireRadius).applyMatrix4(pivot.matrixWorld);
          const direction = surface.sub(center);
          const hits = new THREE.Raycaster(center, direction.clone().normalize(), .001, direction.length() + .005).intersectObjects(panels);
          assert.equal(hits.length, 0, `${pivot.name}, steering ${steering}: ${hits[0]?.object.name}`);
        }
      }
    }
  });
}
