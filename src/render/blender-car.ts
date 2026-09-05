import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAR_GEOMETRY, type CarView } from "./car.ts";

export const BLENDER_CAR_PATH = "assets/cars/ns-coupe-01.glb";
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

/** Adapt the actual shipped GLB, also used by the headless asset tests. */
export function createBlenderCar(asset: THREE.Group): CarView {
  const root = required(asset, "ns-coupe-01");
  normalized(asset);
  normalized(root);
  if (asset.position.length() > 1e-5 || root.position.length() > 1e-5) {
    throw new Error("NS-01 root must stay at the origin");
  }
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const names = new Set<string>();
  root.traverse(object => {
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
  car.userData.model = "ns-01";
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

export async function loadBlenderCar(url: string): Promise<CarView> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return createBlenderCar(gltf.scene);
}
