import * as THREE from "three";
export { isPlayerCarId as isBlenderCarId } from "../customization/cars.ts";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAR_GEOMETRY, type CarView } from "./car.ts";
import { celCar } from "./cel.ts";

export const BLENDER_CAR_PATH = "assets/cars/ns-coupe-01.glb";

/**
 * The Blender-authored bodies, keyed by asset id. `model` is the id
 * the debug tools and deep links round-trip on, so it must stay stable.
 *
 * Cinder is the starter, Bulwark can be bought, and Moth's Kestrel can be won. Rival bodies belong
 * to the Blacklist; registration alone does not create an encounter or unlock.
 * Bodies do not change the simulation collider or HANDLING.
 */
export const BLENDER_CARS = {
  blender: { path: BLENDER_CAR_PATH, root: "ns-coupe-01", model: "ns-01" },
  /** The NS-01 won back from Sable: the same body, under the player car id that "blender" can no longer be. */
  ns01: { path: BLENDER_CAR_PATH, root: "ns-coupe-01", model: "ns-01" },
  cinder: { path: "assets/cars/ns-cinder-01.glb", root: "ns-cinder-01", model: "ns-cinder" },
  kestrel: { path: "assets/cars/ns-kestrel-01.glb", root: "ns-kestrel-01", model: "ns-kestrel" },
  vesper: { path: "assets/cars/ns-vesper-01.glb", root: "ns-vesper-01", model: "ns-vesper" },
  hammer: { path: "assets/cars/ns-hammer-01.glb", root: "ns-hammer-01", model: "ns-hammer" },
  latch: { path: "assets/cars/ns-latch-01.glb", root: "ns-latch-01", model: "ns-latch" },
  breakwater: { path: "assets/cars/ns-breakwater-01.glb", root: "ns-breakwater-01", model: "ns-breakwater" },
  wager: { path: "assets/cars/ns-wager-01.glb", root: "ns-wager-01", model: "ns-wager" },
  meridian: { path: "assets/cars/ns-meridian-01.glb", root: "ns-meridian-01", model: "ns-meridian" },
  skim: { path: "assets/cars/ns-skim-01.glb", root: "ns-skim-01", model: "ns-skim" },
  reign: { path: "assets/cars/ns-reign-01.glb", root: "ns-reign-01", model: "ns-reign" },
  bulwark: { path: "assets/cars/ns-bulwark-01.glb", root: "ns-bulwark-01", model: "ns-bulwark" },
} as const;
export type BlenderCarId = keyof typeof BLENDER_CARS;
const CORNERS = ["front-left", "front-right", "rear-left", "rear-right"] as const;

function required(root: THREE.Object3D, name: string): THREE.Object3D {
  const found: THREE.Object3D[] = [];
  root.traverse(object => { if (object.name === name) found.push(object); });
  if (found.length !== 1) throw new Error(`NS-01 requires exactly one '${name}'; found ${found.length}`);
  return found[0]!;
}

function normalized(object: THREE.Object3D): void {
  if (object.quaternion.angleTo(new THREE.Quaternion()) > 1e-5 ||
      object.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-5) {
    throw new Error(`NS-01 '${object.name}' needs applied rotation/scale in Blender`);
  }
}

// glTF empties load as Object3D; the existing view contract uses Group. Keep
// authored transforms, but give both car renderers the same explicit adapter.
function takeGroup(object: THREE.Object3D): THREE.Group {
  if (object instanceof THREE.Mesh) throw new Error(`NS-01 '${object.name}' must be an empty/group, not a mesh`);
  normalized(object);
  const group = new THREE.Group();
  group.name = object.name;
  group.position.copy(object.position);
  for (const child of object.children.slice()) group.add(child);
  object.removeFromParent();
  return group;
}

/** Adapt the actual shipped GLB, also used by the headless asset tests.
 *
 * The defaults are NS-01. A second body (the Bulwark, authored in
 * assets/cars/ns-bulwark-01.blend) needs only its root and model id, because
 * every other name this reads — body-shell, wheel-*, rolling-*, car-paint,
 * wheel-finish — is a shared authoring convention rather than one car's.
 * Validation uses the shared NS-01 asset contract for both bodies. */
export function createBlenderCar(asset: THREE.Group, rootName = "ns-coupe-01", model = "ns-01"): CarView {
  const root = required(asset, rootName);
  normalized(asset);
  normalized(root);
  if (asset.position.length() > 1e-5 || root.position.length() > 1e-5) {
    throw new Error("NS-01 root must stay at the origin");
  }
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const names = new Set<string>();
  root.traverse(object => {
    if (object.userData.customizationSlot) {
      object.visible = object.userData.customizationOption === "stock";
    }
    if (!(object instanceof THREE.Mesh)) return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`NS-01 '${object.name}' must use an exported standard material`);
    }
    const material = object.material;
    const previous = materials.get(material.name);
    if (previous && previous !== material) throw new Error(`NS-01 duplicate material '${material.name}'`);
    materials.set(material.name, material);
    // Blender splits multi-material meshes into primitives. Keep __ns.pick()
    // readable and stable rather than exposing exporter-generated '_1' names.
    if (/_\d+$/.test(object.name)) object.name = `${object.parent!.name}-${material.name}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(object.name) || names.has(object.name)) {
      throw new Error(`NS-01 has an invalid or duplicate mesh name: '${object.name}'`);
    }
    names.add(object.name);
    object.castShadow = true;
    // Like the original car, the small body casts onto the road but does not
    // receive the coarse track/garage shadow maps: those produce striping on
    // the windshield and along the new continuous panels.
    object.receiveShadow = false;
  });
  const paintMaterial = materials.get("car-paint");
  const wheelMaterial = materials.get("wheel-finish");
  if (!paintMaterial || !wheelMaterial) throw new Error("NS-01 is missing its customization materials");

  const bodyShell = takeGroup(required(root, "body-shell"));
  if (bodyShell.position.length() > 1e-5) throw new Error("NS-01 body-shell must stay at the origin");
  const wheelPivots: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];
  for (const [index, corner] of CORNERS.entries()) {
    const pivotNode = required(root, `wheel-${corner}`);
    const expected = new THREE.Vector3(
      (index % 2 ? 1 : -1) * CAR_GEOMETRY.halfTrack,
      CAR_GEOMETRY.wheelCenterY,
      (index < 2 ? -1 : 1) * CAR_GEOMETRY.axleZ,
    );
    if (pivotNode.position.distanceTo(expected) > 1e-5) {
      throw new Error(`NS-01 '${pivotNode.name}' no longer matches the handling wheelbase/track`);
    }
    const rolling = takeGroup(required(pivotNode, `rolling-${corner}`));
    if (rolling.position.length() > 1e-5) throw new Error(`NS-01 '${rolling.name}' has an offset spin origin`);
    const pivot = takeGroup(pivotNode);
    pivot.add(rolling);
    wheelPivots.push(pivot);
    allWheels.push(rolling);
  }
  if (root.children.length) {
    throw new Error("NS-01 has loose root objects; parent bodywork to body-shell or wheels to their rolling pivot");
  }

  const car = new THREE.Group();
  car.name = "car";
  car.userData.model = model;
  const carVisual = new THREE.Group();
  carVisual.name = "car-visual";
  carVisual.add(bodyShell, ...wheelPivots);
  car.add(carVisual);

  // Light sources are runtime presentation, not exported studio lighting.
  const headlight = new THREE.SpotLight(0xd8f7ff, 44, 52, 0.47, 0.72, 1.2);
  headlight.position.set(0, 0.78, -1.7);
  headlight.target.position.set(0, 0.05, -28);
  car.add(headlight, headlight.target);
  const tailGlow = new THREE.PointLight(0xff0d20, 2.2, 2.8, 2);
  tailGlow.position.set(0, .73, 2.35);
  bodyShell.add(tailGlow);

  return { car, carVisual, bodyShell, wheelPivots, allWheels,
    frontWheels: wheelPivots.slice(0, 2), paintMaterial, wheelMaterial };
}

export async function loadBlenderCar(url: string, car: BlenderCarId = "blender"): Promise<CarView> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const { root, model } = BLENDER_CARS[car];
  // Every loaded body is drawn (render/cel.ts) unless ?look=plain; the headless
  // asset tests build with createBlenderCar and never see it.
  return celCar(createBlenderCar(gltf.scene, root, model));
}
