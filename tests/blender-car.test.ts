import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar } from "../src/render/blender-car.ts";
import { applyCarCustomization, CAR_GEOMETRY } from "../src/render/car.ts";
import { PAINT_OPTIONS, STANCE_OPTIONS, WHEEL_OPTIONS } from "../src/customization/customization.ts";
import { updateWheelPresentation } from "../src/render/wheels.ts";
import type { VehicleState } from "../src/sim/sim.ts";

const bytes = await readFile(new URL("../public/assets/cars/ns-coupe-01.glb", import.meta.url));
async function asset() {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}
async function car() { return createBlenderCar(await asset()); }
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}
function near(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test("the shipped Blender car is valid, small, texture-free glTF", async () => {
  const report = await validator.validateBytes(bytes);
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));
  assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues));
  assert.ok(bytes.length < 600_000, `asset grew to ${bytes.length} bytes`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(json.textures?.length ?? 0, 0);
  assert.equal(json.cameras?.length ?? 0, 0);
  assert.equal(json.extensions?.KHR_lights_punctual?.lights?.length ?? 0, 0);
  assert.ok(!json.nodes.some((node: { name?: string }) => /studio|clearance/.test(node.name ?? "")));
});

test("the GLB adapter preserves units, forward axis, names and wheel pivots", async () => {
  const view = await car();
  view.car.updateMatrixWorld(true);
  const all = meshes(view.car);
  assert.ok(all.length < 90, `draw-call budget: ${all.length} mesh primitives`);
  assert.equal(new Set(all.map(mesh => mesh.name)).size, all.length);
  assert.ok(all.every(mesh => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(mesh.name)));
  const size = new THREE.Box3().setFromObject(view.bodyShell).getSize(new THREE.Vector3());
  assert.ok(size.z > 4.4 && size.z < 4.7, `length: ${size.z}`);
  assert.ok(size.x > 1.9 && size.x < 2.3, `width: ${size.x}`);
  assert.ok(size.y < 1.3, `body height excluding road gap: ${size.y}`);
  assert.ok(2 * CAR_GEOMETRY.axleZ / size.z > .6);
  assert.ok(new THREE.Box3().setFromObject(view.car.getObjectByName("headlight-left-0")!).max.z < -2);
  for (const [index, pivot] of view.wheelPivots.entries()) {
    near(pivot.position.x, (index % 2 ? 1 : -1) * CAR_GEOMETRY.halfTrack);
    near(pivot.position.y, CAR_GEOMETRY.wheelCenterY);
    near(pivot.position.z, (index < 2 ? -1 : 1) * CAR_GEOMETRY.axleZ);
    const bounds = new THREE.Box3().setFromObject(pivot);
    near(bounds.max.y - bounds.min.y, CAR_GEOMETRY.tireRadius * 2);
    near(bounds.max.x - bounds.min.x, CAR_GEOMETRY.tireHalfWidth * 2);
    const inversePivot = pivot.matrixWorld.clone().invert();
    for (const part of meshes(pivot)) {
      const positions = part.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, vertex)
          .applyMatrix4(part.matrixWorld).applyMatrix4(inversePivot);
        assert.ok(Math.abs(p.x) <= CAR_GEOMETRY.tireHalfWidth + 1e-5);
        assert.ok(Math.hypot(p.y, p.z) <= CAR_GEOMETRY.tireRadius + 1e-5,
          `${part.name} exceeds the clearance test's rotating envelope`);
      }
    }
  }
});

test("every garage paint, wheel finish and stance works on the authored model", async () => {
  const view = await car();
  for (const paint of PAINT_OPTIONS) for (const wheels of WHEEL_OPTIONS) for (const stance of STANCE_OPTIONS) {
    applyCarCustomization(view, { paint: paint.id, wheels: wheels.id, stance: stance.id });
    assert.equal(view.paintMaterial.color.getHex(), paint.color);
    assert.equal(view.wheelMaterial.color.getHex(), wheels.color);
    near(view.bodyShell.position.y, stance.bodyOffset);
    for (const pivot of view.wheelPivots) {
      near(Math.abs(pivot.position.x), CAR_GEOMETRY.halfTrack - stance.wheelInset);
      near(pivot.position.y, CAR_GEOMETRY.wheelCenterY);
    }
    for (const piece of meshes(view.car)) {
      const material = piece.material as THREE.MeshStandardMaterial;
      if (material.name === "car-paint") assert.equal(material, view.paintMaterial);
      if (material.name === "wheel-finish") assert.equal(material, view.wheelMaterial);
    }
  }
});

test("Blender wheels keep independent steering and roll around the authored centres", async () => {
  const view = await car();
  const wheelStates = Object.fromEntries(view.wheelPivots.map((pivot, index) =>
    [pivot.name.replace("wheel-", ""), { steeringAngle: index < 2 ? .17 + index * .04 : 0,
      rollingDistance: .5 + index * .3 }]));
  const vehicle = { wheels: wheelStates } as unknown as VehicleState;
  updateWheelPresentation(view, vehicle);
  for (const [index, pivot] of view.wheelPivots.entries()) {
    near(pivot.rotation.y, index < 2 ? -(.17 + index * .04) : 0);
    near(view.allWheels[index]!.rotation.x, -(.5 + index * .3) / CAR_GEOMETRY.tireRadius);
    assert.equal(view.allWheels[index]!.position.length(), 0);
  }
});

test("bad export contracts fail explicitly instead of silently substituting a car", async () => {
  const missing = await asset();
  missing.getObjectByName("body-shell")!.name = "wrong-shell";
  assert.throws(() => createBlenderCar(missing), /body-shell/);
  const scaled = await asset();
  scaled.getObjectByName("ns-coupe-01")!.scale.setScalar(100);
  assert.throws(() => createBlenderCar(scaled), /rotation\/scale/);
  const wheelbase = await asset();
  wheelbase.getObjectByName("wheel-front-left")!.position.z += .1;
  assert.throws(() => createBlenderCar(wheelbase), /wheelbase\/track/);
});

interface Triangle {
  points: THREE.Vector3[];
  bounds: THREE.Box3;
  edges: THREE.Vector3[];
  normal: THREE.Vector3;
  name: string;
}
function triangles(root: THREE.Object3D): Triangle[] {
  root.updateWorldMatrix(true, true);
  return meshes(root).flatMap(mesh => {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const result: Triangle[] = [];
    for (let offset = 0; offset < (index?.count ?? positions.count); offset += 3) {
      const points = [0, 1, 2].map(corner => new THREE.Vector3()
        .fromBufferAttribute(positions, index ? index.getX(offset + corner) : offset + corner)
        .applyMatrix4(mesh.matrixWorld));
      const edges = points.map((point, i) => points[(i + 1) % 3]!.clone().sub(point));
      result.push({ points, edges, normal: edges[0]!.clone().cross(edges[1]!),
        bounds: new THREE.Box3().setFromPoints(points), name: mesh.name });
    }
    return result;
  });
}

// Convex tyre envelope vs ONE body triangle, not SAT against the concave car.
// This circumscribed cylinder encloses every tyre spin, including bevels/rims,
// plus a 2 mm margin. Triangles have zero thickness: separation must be strict.
function tyreEnvelope(matrix: THREE.Matrix4) {
  const points: THREE.Vector3[] = [];
  const normals = [new THREE.Vector3(1, 0, 0).transformDirection(matrix)];
  const edges = [normals[0]!];
  const radius = (CAR_GEOMETRY.tireRadius + .002) / Math.cos(Math.PI / 32);
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    for (const x of [-.127, .127]) {
      points.push(new THREE.Vector3(x, Math.cos(angle) * radius, Math.sin(angle) * radius).applyMatrix4(matrix));
    }
    const mid = angle + Math.PI / 32;
    normals.push(new THREE.Vector3(0, Math.cos(mid), Math.sin(mid)).transformDirection(matrix));
    edges.push(new THREE.Vector3(0, -Math.sin(mid), Math.cos(mid)).transformDirection(matrix));
  }
  return { points, normals, edges, bounds: new THREE.Box3().setFromPoints(points) };
}
function hitsTriangle(tyre: ReturnType<typeof tyreEnvelope>, triangle: Triangle): boolean {
  if (!tyre.bounds.intersectsBox(triangle.bounds)) return false;
  const separated = (axis: THREE.Vector3) => {
    if (axis.lengthSq() < 1e-16) return false;
    axis.normalize();
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of tyre.points) { const d = p.dot(axis); aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
    for (const p of triangle.points) { const d = p.dot(axis); bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
    return aMax < bMin - 1e-7 || bMax < aMin - 1e-7;
  };
  for (const normal of [...tyre.normals, triangle.normal]) if (separated(normal.clone())) return false;
  for (const edge of tyre.edges) for (const other of triangle.edges) {
    if (separated(edge.clone().cross(other))) return false;
  }
  return true;
}

test("triangle clearance detects a thin crossing face and rejects a near miss", () => {
  const tyre = tyreEnvelope(new THREE.Matrix4());
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.1, .1));
  panel.position.set(0, .2, 0);
  assert.ok(triangles(panel).some(triangle => hitsTriangle(tyre, triangle)));
  panel.position.set(0, .5, 0);
  assert.ok(triangles(panel).every(triangle => !hitsTriangle(tyre, triangle)));
});

test("the shipped concave body clears spinning wheels throughout steering at all stances", async () => {
  const view = await car();
  for (const panel of meshes(view.bodyShell)) (panel.material as THREE.Material).side = THREE.DoubleSide;
  for (const stance of STANCE_OPTIONS) {
    applyCarCustomization(view, { paint: "signal", wheels: "graphite", stance: stance.id });
    const body = triangles(view.bodyShell);
    for (let step = -16; step <= 16; step++) {
      const steering = CAR_GEOMETRY.maxSteerAngle * step / 16;
      view.frontWheels.forEach(pivot => { pivot.rotation.y = steering; });
      view.car.updateMatrixWorld(true);
      for (const pivot of view.wheelPivots) {
        const tyre = tyreEnvelope(pivot.matrixWorld);
        for (const triangle of body) {
          assert.ok(!hitsTriangle(tyre, triangle),
            `${stance.id}, steering ${steering}: ${pivot.name} clips ${triangle.name}`);
        }
        const ray = new THREE.Raycaster(pivot.getWorldPosition(new THREE.Vector3()),
          new THREE.Vector3(Math.sign(pivot.position.x), 0, 0), 0, 1);
        assert.equal(ray.intersectObjects(meshes(view.bodyShell), false).length, 0,
          `${pivot.name} centre buried in bodywork`);
      }
    }
  }
});

test("the authored body has matching left and right silhouettes", async () => {
  const view = await car();
  view.car.updateMatrixWorld(true);
  const panels = meshes(view.bodyShell);
  for (const panel of panels) (panel.material as THREE.Material).side = THREE.DoubleSide;
  for (let z = -2.3; z <= 2.3; z += .073) for (let y = .3; y < 1.5; y += .079) {
    const leftHit = new THREE.Raycaster(new THREE.Vector3(-3, y, z), new THREE.Vector3(1, 0, 0), 0, 3)
      .intersectObjects(panels, false)[0];
    const rightHit = new THREE.Raycaster(new THREE.Vector3(3, y, z), new THREE.Vector3(-1, 0, 0), 0, 3)
      .intersectObjects(panels, false)[0];
    const left = leftHit?.distance;
    const right = rightHit?.distance;
    if (left === undefined || right === undefined) assert.equal(left, right);
    else assert.ok(Math.abs(left - right) < .001,
      `Y ${y}, Z ${z}: ${leftHit!.object.name} vs ${rightHit!.object.name}, difference ${Math.abs(left - right)} m`);
  }
});

test("the authored greenhouse and body enclose the cabin without open seams", async () => {
  const view = await car();
  view.car.updateMatrixWorld(true);
  const panels = meshes(view.bodyShell);
  for (const panel of panels) (panel.material as THREE.Material).side = THREE.DoubleSide;
  const origins = [new THREE.Vector3(0, 1.1, .25), new THREE.Vector3(-.36, 1.12, .25),
    new THREE.Vector3(.36, 1.12, .25), new THREE.Vector3(0, .6, 1.8), new THREE.Vector3(0, .6, -1.8)];
  for (const origin of origins) {
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(), 0, 10);
    let escaped = 0;
    for (let i = 0; i < 800; i++) {
      const y = i / 799;
      const r = Math.sqrt(1 - y * y);
      const angle = i * Math.PI * (1 + Math.sqrt(5));
      ray.ray.direction.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      if (!ray.intersectObjects(panels, false).length) escaped++;
    }
    assert.equal(escaped, 0, `${escaped} rays escape from ${origin.toArray()}`);
  }
});
