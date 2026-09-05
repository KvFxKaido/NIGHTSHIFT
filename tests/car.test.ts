import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  ARCH_INNER_RADIUS,
  CAR_GEOMETRY,
  TIRE_CROWN_Y,
  applyCarCustomization,
  createCar,
  type CarView,
} from "../src/render/car.ts";
import { STANCE_OPTIONS } from "../src/customization/customization.ts";

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  return found;
}

function posed(stance: string, steering = 0, spin = 0): CarView {
  const car = createCar();
  applyCarCustomization(car, { paint: "signal", wheels: "graphite", stance });
  car.frontWheels.forEach((wheel) => { wheel.rotation.y = steering; });
  car.allWheels.forEach((wheel) => { wheel.rotation.x = spin; });
  car.car.updateMatrixWorld(true);
  return car;
}

interface ConvexMesh {
  mesh: THREE.Mesh;
  points: THREE.Vector3[];
  normals: THREE.Vector3[];
  edges: THREE.Vector3[];
  bounds: THREE.Box3;
}

// SAT tests the actual convex meshes, including face crossings and containment.
// Sampling a few tyre points misses thin panels between samples.
function convexMesh(mesh: THREE.Mesh): ConvexMesh {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const points = Array.from({ length: positions.count }, (_, index) =>
    mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, index)));
  const normals: THREE.Vector3[] = [];
  const edges: THREE.Vector3[] = [];
  const addDirection = (list: THREE.Vector3[], direction: THREE.Vector3) => {
    if (direction.lengthSq() < 1e-12) return;
    direction.normalize();
    if (!list.some((other) => Math.abs(other.dot(direction)) > 1 - 1e-8)) list.push(direction);
  };
  const indices = geometry.index;
  const count = indices?.count ?? positions.count;
  for (let index = 0; index < count; index += 3) {
    const a = points[indices ? indices.getX(index) : index]!;
    const b = points[indices ? indices.getX(index + 1) : index + 1]!;
    const c = points[indices ? indices.getX(index + 2) : index + 2]!;
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    addDirection(normals, ab.clone().cross(ac));
    for (const edge of [ab, ac, c.clone().sub(b)]) addDirection(edges, edge);
  }
  const uniquePoints = [...new Map(points.map((point) => [
    point.toArray().map((coordinate) => coordinate.toFixed(7)).join(","), point,
  ])).values()];
  return { mesh, points: uniquePoints, normals, edges, bounds: new THREE.Box3().setFromPoints(points) };
}

function intersects(a: ConvexMesh, b: ConvexMesh): boolean {
  if (!a.bounds.intersectsBox(b.bounds)) return false;
  const separated = (axis: THREE.Vector3): boolean => {
    if (axis.lengthSq() < 1e-12) return false;
    axis.normalize();
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const point of a.points) {
      const projection = point.dot(axis);
      aMin = Math.min(aMin, projection);
      aMax = Math.max(aMax, projection);
    }
    for (const point of b.points) {
      const projection = point.dot(axis);
      bMin = Math.min(bMin, projection);
      bMax = Math.max(bMax, projection);
    }
    return aMax <= bMin + 1e-6 || bMax <= aMin + 1e-6;
  };
  for (const axis of [...a.normals, ...b.normals]) if (separated(axis)) return false;
  for (const edgeA of a.edges) {
    for (const edgeB of b.edges) {
      if (separated(edgeA.clone().cross(edgeB))) return false;
    }
  }
  return true;
}

function disposeCar(car: CarView): void {
  const materials = new Set<THREE.Material>();
  for (const mesh of meshesOf(car.car)) {
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
    }
  }
  materials.forEach((material) => material.dispose());
}

test("clearance check catches thin panels inside a wheel and separates a near miss", () => {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02));
  panel.position.set(0.18, 0, 0.18);
  wheel.updateMatrixWorld(true);
  panel.updateMatrixWorld(true);
  assert.ok(intersects(convexMesh(wheel), convexMesh(panel)));
  panel.position.set(0.34, 0, 0.34);
  panel.updateMatrixWorld(true);
  assert.ok(!intersects(convexMesh(wheel), convexMesh(panel)));
});

test("wheels clear bodywork through steering and rotation at every stance", () => {
  // Three unequal polygon counts (16/12/8) repeat after a quarter revolution.
  const spins = [0, Math.PI / 32, Math.PI / 16, Math.PI / 8, Math.PI / 4, Math.PI * 3 / 8];
  for (const stance of STANCE_OPTIONS) {
    const car = posed(stance.id);
    const body = meshesOf(car.bodyShell).map(convexMesh);
    for (let step = -8; step <= 8; step++) {
      const steering = CAR_GEOMETRY.maxSteerAngle * step / 8;
      car.frontWheels.forEach((wheel) => { wheel.rotation.y = steering; });
      for (const spin of spins) {
        car.allWheels.forEach((wheel) => { wheel.rotation.x = spin; });
        car.car.updateMatrixWorld(true);
        for (const pivot of car.wheelPivots) {
          for (const wheelMesh of meshesOf(pivot)) {
            const wheel = convexMesh(wheelMesh);
            for (const panel of body) {
              assert.ok(!intersects(wheel, panel),
                `${stance.name}, steer ${steering.toFixed(3)}, spin ${spin.toFixed(3)}: ` +
                `wheel at ${pivot.position.toArray()} intersects ${panel.mesh.name || "panel"} ` +
                `at ${panel.mesh.position.toArray()}`);
            }
          }
        }
      }
    }
    disposeCar(car);
  }
});

test("stance can never drop the body far enough to cut into the wheels", () => {
  // The arches are arcs about the axle, so the only way a wheel reaches paint
  // is if a stance spends more than the clearance the arch was built with.
  const deepestDrop = Math.min(...STANCE_OPTIONS.map((option) => option.bodyOffset));
  assert.ok(
    -deepestDrop < CAR_GEOMETRY.archClearance,
    `stance drops ${-deepestDrop} m into ${CAR_GEOMETRY.archClearance} m of arch clearance`,
  );
  assert.ok(ARCH_INNER_RADIUS > CAR_GEOMETRY.tireRadius);
  assert.equal(TIRE_CROWN_Y, CAR_GEOMETRY.wheelCenterY + CAR_GEOMETRY.tireRadius);
});

// A loft along X applied inside the mirrored side loop tapers both halves the
// same way in world space. It typechecks, it clears the wheels, it seals — and
// the nose comes out visibly twisted. Only a symmetry check catches it.
// The leak test casts outward and tolerates 1%, so a narrow slot at the end of
// a window passes it while still being a clear line of sight to a seat from
// outside. Cast inward instead and name what a viewer actually lands on.
test("no cabin interior is the first thing a viewer sees from outside", () => {
  const car = posed("street");
  const shell = meshesOf(car.bodyShell);
  const interior = /^(seat-base|seat-back|headrest|dash|floor-tub|wheel-hub)/;

  const raycaster = new THREE.Raycaster();
  const target = new THREE.Vector3(0, 0.85, 0.1);
  const exposed = new Set<string>();
  const samples = 3000;
  for (let index = 0; index < samples; index++) {
    const y = 1 - (index / (samples - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    const direction = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
    if (direction.y < 0) continue; // nobody looks up at the car from below
    const origin = target.clone().addScaledVector(direction, 6);
    raycaster.set(origin, direction.clone().negate());
    const hit = raycaster.intersectObjects(shell, false)[0];
    const name = (hit?.object as THREE.Mesh | undefined)?.name ?? "";
    if (interior.test(name)) exposed.add(name);
  }
  assert.deepEqual([...exposed], [], "interior parts reachable without passing through glass or body");
});

test("the body is bilaterally symmetric apart from the driver-side details", () => {
  const car = posed("street");
  const asymmetric = new Set(["cowl-scoop", "cowl-vent", "wheel-hub"]);
  const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

  const points = new Map<string, string>();
  for (const mesh of meshesOf(car.bodyShell)) {
    const position = mesh.geometry.getAttribute("position");
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index++) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      points.set(key(vertex), mesh.name);
    }
  }

  const offenders = new Set<string>();
  for (const [point, owner] of points) {
    if (asymmetric.has(owner.replace(/-(left|right|\d+)$/g, ""))) continue;
    const [x, y, z] = point.split(",").map(Number) as [number, number, number];
    if (!points.has(`${(-x).toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`)) offenders.add(owner);
  }
  assert.deepEqual([...offenders], [], "meshes with no mirrored counterpart");
});

test("the body has no holes an outside viewer could see through", () => {
  const car = posed("street");
  const shell = meshesOf(car.bodyShell);
  // Rays leaving the cabin strike panels from behind, so read both faces.
  for (const panel of shell) (panel.material as THREE.Material).side = THREE.DoubleSide;

  const raycaster = new THREE.Raycaster();
  raycaster.far = 12;
  // Cabin, both head positions, and the volumes fore and aft of it. Testing
  // only the cabin let a slot open under the rear deck without anything failing.
  const origins = [
    new THREE.Vector3(0, 0.95, 0.05),
    new THREE.Vector3(-0.36, 1.05, 0.2),
    new THREE.Vector3(0.36, 1.05, 0.2),
    new THREE.Vector3(0, 0.8, CAR_GEOMETRY.axleZ - 0.03),
    new THREE.Vector3(0, 0.55, 1.8),
    new THREE.Vector3(0, 0.55, -1.9),
  ];
  const samples = 1500;

  for (const origin of origins) {
    let cast = 0;
    let escaped = 0;
    for (let index = 0; index < samples; index++) {
      const y = 1 - (index / (samples - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      const direction = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      if (direction.y < -0.25) continue; // the underbody is open on purpose
      cast++;
      raycaster.set(origin, direction);
      if (raycaster.intersectObjects(shell, false).length === 0) escaped++;
    }
    const leakage = escaped / cast;
    assert.ok(
      leakage < 0.01,
      `${(leakage * 100).toFixed(1)}% of rays from ` +
        `(${origin.x}, ${origin.y}, ${origin.z}) escape the shell`,
    );
  }
});
