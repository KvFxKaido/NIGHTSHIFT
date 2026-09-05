import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CAR_GEOMETRY, createCar } from "../src/render/car.ts";
import { addCourse } from "../src/render/course.ts";
import { createGarageScene } from "../src/render/garage.ts";
import { parseDriveScript } from "../src/debug/debug.ts";

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  return found;
}

// Typechecking cannot see a helper that calls itself, and no other test builds
// these scenes, so a renderer that throws on construction reaches the browser.
test("the course scene builds", () => {
  const scene = new THREE.Scene();
  addCourse(scene);
  assert.ok(meshesOf(scene).length > 100);
});

test("the garage scene builds", () => {
  assert.ok(meshesOf(createGarageScene()).length > 10);
});

test("every car mesh has a name, and no two share one", () => {
  const meshes = meshesOf(createCar().car);
  const unnamed = meshes.filter((mesh) => !mesh.name);
  assert.deepEqual(unnamed.map((mesh) => mesh.geometry.type), [], "unnamed car meshes");

  const seen = new Set<string>();
  const duplicates = meshes.map((mesh) => mesh.name).filter((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
  // __ns.pick() promises to name exactly one mesh, so duplicates make it a lie.
  assert.deepEqual(duplicates, [], "duplicate car mesh names");
});

// Names are an API: __ns.find('front-arch-rib') and ?scene= links both assume a
// single convention. Two conventions in the same file is how that quietly rots.
test("mesh names are kebab-case throughout", () => {
  const scene = new THREE.Scene();
  addCourse(scene);
  const offenders = [...meshesOf(createCar().car), ...meshesOf(scene)]
    .map((mesh) => mesh.name)
    .filter((name) => name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name));
  assert.deepEqual([...new Set(offenders)], []);
});

test("every course mesh has a name", () => {
  const scene = new THREE.Scene();
  addCourse(scene);
  const unnamed = meshesOf(scene).filter((mesh) => !mesh.name);
  assert.deepEqual(unnamed.map((mesh) => mesh.geometry.type), [], "unnamed course meshes");
});

// Long overhangs are most of what makes a car read as boxy rather than designed.
// The reference model sits at 0.67; below about 0.60 the nose and tail sag.
test("the wheels sit near the corners rather than under a long overhang", () => {
  const car = createCar();
  car.car.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(car.bodyShell).getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.z);
  const ratio = (CAR_GEOMETRY.axleZ * 2) / length;
  assert.ok(ratio > 0.6 && ratio < 0.72, `wheelbase / length is ${ratio.toFixed(3)}`);
});

test("drive scripts parse into held inputs and tick counts", () => {
  assert.deepEqual(parseDriveScript("W600,WD90,B45"), [
    { input: { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, ticks: 600 },
    { input: { throttle: 1, brake: 0, steer: 1, handbrake: 0 }, ticks: 90 },
    { input: { throttle: 0, brake: 0, steer: 0, handbrake: 1 }, ticks: 45 },
  ]);
  assert.deepEqual(parseDriveScript("120"), [
    { input: { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, ticks: 120 },
  ]);
  assert.deepEqual(parseDriveScript("nonsense,W-5"), []);
});
