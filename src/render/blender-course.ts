import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { COURSE_POINTS, pointIndexForControl } from "../sim/track.ts";
import { courseFingerprint, COURSE_ASSET_NAME, COURSE_ASSET_VERSION } from "./course-asset-contract.ts";

export interface BlenderCourse {
  root: THREE.Group;
  fixtures: { position: THREE.Vector3; kind: "tunnel" | "bridge" }[];
  lights: THREE.PointLight[];
}

export function createBlenderCourse(asset: THREE.Group): BlenderCourse {
  const model = asset.getObjectByName(COURSE_ASSET_NAME);
  if (!model) throw new Error(`Missing ${COURSE_ASSET_NAME} root`);
  if (model.userData.assetVersion !== COURSE_ASSET_VERSION ||
      model.userData.routeFingerprint !== courseFingerprint()) {
    throw new Error("Blender track does not match the current road. Reconcile and re-export the source.");
  }
  asset.updateMatrixWorld(true);
  const identity = new THREE.Matrix4();
  if (model.matrixWorld.elements.some((value, i) => Math.abs(value - identity.elements[i]!) > 1e-5)) {
    throw new Error("Blender track root must have identity position/rotation/scale");
  }
  for (const [name, control] of [["anchor-tunnel-start", 4], ["anchor-tunnel-exit", 7],
    ["anchor-bridge-end", 10]] as const) {
    const anchor = model.getObjectByName(name);
    const point = COURSE_POINTS[pointIndexForControl(control)]!;
    if (!anchor || anchor.getWorldPosition(new THREE.Vector3()).distanceTo(
      new THREE.Vector3(point.x, point.y, point.z)) > .01) {
      throw new Error(`Track anchor ${name} is missing or misaligned`);
    }
  }
  const fixtures: BlenderCourse["fixtures"] = [];
  let meshCount = 0;
  const names = new Set<string>();
  model.traverse(object => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(object.name) || names.has(object.name)) {
      throw new Error(`Track names must be unique kebab-case: ${object.name}`);
    }
    names.add(object.name);
    if (/guide|reference|collision/.test(object.name)) throw new Error("Authoring guides must not ship");
    if (object instanceof THREE.Mesh) {
      meshCount++;
      object.castShadow = true;
      object.receiveShadow = true;
    }
    if (object.name.startsWith("light-")) {
      const kind: unknown = object.userData.lightKind;
      if (kind !== "tunnel" && kind !== "bridge") throw new Error(`Invalid fixture ${object.name}`);
      fixtures.push({ position: object.getWorldPosition(new THREE.Vector3()), kind });
    }
  });
  if (meshCount === 0 || meshCount > 160 || fixtures.length < 2) throw new Error("Invalid track geometry/fixture budget");
  const root = new THREE.Group();
  root.name = "authored-course";
  root.userData.environment = COURSE_ASSET_NAME;
  root.add(asset);
  // Geometry carries emissive lenses; only four nearby fixtures illuminate the
  // runtime. No per-bulb shadow maps or hundreds of lights in the shader.
  const lights = Array.from({ length: 4 }, (_, i) => {
    const light = new THREE.PointLight(0xffffff, 0, 42, 2);
    light.name = `course-light-pool-${i}`;
    light.castShadow = false;
    root.add(light);
    return light;
  });
  return { root, fixtures, lights };
}

export async function loadBlenderCourse(url: string): Promise<BlenderCourse> {
  return createBlenderCourse((await new GLTFLoader().loadAsync(url)).scene);
}

export function updateCourseLighting(course: BlenderCourse, position: { x: number; y: number; z: number }): void {
  const target = new THREE.Vector3(position.x, position.y, position.z);
  const nearest = course.fixtures.map(fixture => ({ fixture, distance: fixture.position.distanceToSquared(target) }))
    .sort((a, b) => a.distance - b.distance).slice(0, course.lights.length);
  course.lights.forEach((light, i) => {
    const entry = nearest[i];
    if (!entry || entry.distance > 65 ** 2) { light.intensity = 0; return; }
    light.position.copy(entry.fixture.position);
    light.color.setHex(entry.fixture.kind === "tunnel" ? 0xd9edff : 0xffcf91);
    light.intensity = entry.fixture.kind === "tunnel" ? 150 : 110;
  });
}
