import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCar, BLENDER_CARS } from "../src/render/blender-car.ts";
import { applyCarCustomization, CAR_GEOMETRY } from "../src/render/car.ts";
import { STANCE_OPTIONS } from "../src/customization/customization.ts";

// The Bulwark is a rival body with no rival system yet, reachable at
// ?car=bulwark. It ships, so it earns the gates NS-01 has — plus one the coupe
// cannot have: a load bed that must be open while the cab stays sealed.
const bytes = await readFile(new URL("../public/assets/cars/ns-bulwark-01.glb", import.meta.url));
async function asset() {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}
async function car() {
  return createBlenderCar(await asset(), BLENDER_CARS.bulwark.root, BLENDER_CARS.bulwark.model);
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

test("the shipped Bulwark is valid, small, texture-free glTF with no rig or cutters", async () => {
  const report = await validator.validateBytes(new Uint8Array(bytes));
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
  assert.ok(bytes.byteLength < 600_000, `${bytes.byteLength} bytes is too large for one low-poly body`);
  const json = JSON.parse(new TextDecoder().decode(
    bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))));
  assert.ok(!json.nodes.some((node: { name?: string }) => /studio|clearance/.test(node.name ?? "")),
    "the studio rig or a boolean cutter leaked into the runtime asset");
  assert.ok(!json.images?.length && !json.textures?.length);
});

test("the Bulwark satisfies the shared car contract and the handling wheelbase", async () => {
  const view = await car();
  assert.equal(view.car.userData.model, "ns-bulwark");
  for (const [index, corner] of ["front-left", "front-right", "rear-left", "rear-right"].entries()) {
    const expected = new THREE.Vector3((index % 2 ? 1 : -1) * CAR_GEOMETRY.halfTrack,
      CAR_GEOMETRY.wheelCenterY, (index < 2 ? -1 : 1) * CAR_GEOMETRY.axleZ);
    assert.ok(view.wheelPivots[index]!.position.distanceTo(expected) < 1e-5,
      `${corner} no longer sits on the axles the simulation drives`);
  }
  // Reusing the coupe's customization material names is the whole point: it is
  // what demonstrates the garage keys off a convention, not off one car.
  assert.ok(view.paintMaterial && view.wheelMaterial);
  assert.ok(meshes(view.bodyShell).every(mesh => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(mesh.name)));
});

test("the Bulwark has matching left and right silhouettes", async () => {
  const view = await car();
  view.car.updateMatrixWorld(true);
  const panels = panelsOf(view);
  for (let z = -2.4; z <= 2.4; z += .073) for (let y = .3; y < 1.6; y += .079) {
    const left = new THREE.Raycaster(new THREE.Vector3(-3, y, z), new THREE.Vector3(1, 0, 0), 0, 3)
      .intersectObjects(panels, false)[0]?.distance;
    const right = new THREE.Raycaster(new THREE.Vector3(3, y, z), new THREE.Vector3(-1, 0, 0), 0, 3)
      .intersectObjects(panels, false)[0]?.distance;
    if (left === undefined || right === undefined) assert.equal(left, right, `Y ${y}, Z ${z}`);
    else assert.ok(Math.abs(left - right) < .001, `Y ${y}, Z ${z}: ${Math.abs(left - right)} m apart`);
  }
});

test("the cab seals, the load bed is open, and the bed floor is solid", async () => {
  const view = await car();
  view.car.updateMatrixWorld(true);
  const panels = panelsOf(view);
  const escapes = (origin: THREE.Vector3, filter?: (direction: THREE.Vector3) => boolean) => {
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(), 0, 10);
    let out = 0;
    for (let i = 0; i < 800; i++) {
      const y = i / 799, r = Math.sqrt(1 - y * y), angle = i * Math.PI * (1 + Math.sqrt(5));
      const direction = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r).normalize();
      if (filter && !filter(direction)) continue;
      ray.ray.direction.copy(direction);
      if (!ray.intersectObjects(panels, false).length) out++;
    }
    return out;
  };
  for (const [label, origin] of [
    ["cab centre", new THREE.Vector3(0, 1.25, -.15)],
    ["cab left", new THREE.Vector3(-.45, 1.27, -.10)],
    ["cab right", new THREE.Vector3(.45, 1.27, -.10)],
    ["under the bed floor", new THREE.Vector3(0, .65, 1.60)],
    ["engine bay", new THREE.Vector3(0, .65, -2.00)],
  ] as const) {
    assert.equal(escapes(origin), 0, `rays escape from the ${label}`);
  }
  // The one volume that must NOT be sealed, and the floor that still must be.
  // A lower bed floor would tear straight through into the wheel openings,
  // whose tops reach 0.915 m, which is what the downward check catches.
  const bed = new THREE.Vector3(0, 1.06, 1.45);
  assert.ok(escapes(bed, direction => direction.y > .3) > 50,
    "the load bed must be open to the sky");
  assert.equal(escapes(bed, direction => direction.y < -.3), 0,
    "rays escaped downward: the bed floor has holes into the wheel wells");
});

test("the Bulwark body clears spinning wheels through steering at all stances", async () => {
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
