import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar, BLENDER_CARS } from "../src/render/blender-car.ts";
import { applyCarCustomization, CAR_GEOMETRY } from "../src/render/car.ts";
import { STANCE_OPTIONS } from "../src/customization/customization.ts";

// The shipped hero sedan must fit the shared animation and customization rig.
const bytes = await readFile(new URL("../public/assets/cars/ns-cinder-01.glb", import.meta.url));
async function asset() {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}
async function car() {
  return createBlenderCar(await asset(), BLENDER_CARS.cinder.root, BLENDER_CARS.cinder.model);
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) out.push(object); });
  return out;
}
/** Double-sided so a ray cannot slip out through a back face. */
function panelsOf(view: Awaited<ReturnType<typeof car>>): THREE.Mesh[] {
  const panels = meshes(view.bodyShell);
  for (const panel of panels) (panel.material as THREE.Material).side = THREE.DoubleSide;
  return panels;
}

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
    const positions = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
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
function hits(tyre: ReturnType<typeof tyreEnvelope>, triangle: Triangle): boolean {
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

test("the shipped Cinder is valid, small, texture-free glTF with no rig or cutters", async () => {
  const report = await validator.validateBytes(new Uint8Array(bytes));
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
  assert.ok(bytes.byteLength < 600_000, `${bytes.byteLength} bytes is too large for one low-poly body`);
  const json = JSON.parse(new TextDecoder().decode(
    bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))));
  assert.ok(!json.nodes.some((node: { name?: string }) => /studio|clearance/.test(node.name ?? "")),
    "the studio rig or a boolean cutter leaked into the runtime asset");
  assert.ok(!json.images?.length && !json.textures?.length);
});

test("the Cinder body clears spinning wheels through steering at all stances", async () => {
  const view = await car();
  panelsOf(view);
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
          assert.ok(!hits(tyre, triangle),
            `${stance.id}, steering ${steering.toFixed(3)}: ${pivot.name} clips ${triangle.name}`);
        }
      }
    }
  }
});
