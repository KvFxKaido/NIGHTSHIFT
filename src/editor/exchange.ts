import * as THREE from "three";
import { buildingId, type BuildingLayout, type BuildingPlacement } from "../sim/building-layout.ts";
import { SEATTLE_LAYOUT_BASELINE, GENERATED_SEATTLE_BLOCKS, GARAGE_PLOT_ID, groundBuilding } from "../sim/seattle.ts";

/** Reference meshes need millimetres, not the JSON expansion of float32 noise.
 * Building transforms retain their full precision for placement round trips. */
export function exportEditorScene(scene: THREE.Scene): ReturnType<THREE.Scene["toJSON"]> {
  const value=scene.toJSON();
  const {geometries}=value as typeof value & {geometries?:{data?:{attributes?:Record<string,{array?:number[]}>}}[]};
  for(const geometry of geometries??[])for(const [name,attribute] of Object.entries(geometry.data?.attributes??{})){
    if(!attribute.array)continue;
    const precision=name==="position"?1000:100000;
    attribute.array=attribute.array.map(number=>Math.round(number*precision)/precision);
  }
  return value;
}

export function placeBuilding(mesh: THREE.Object3D, block: Omit<BuildingPlacement, "id">): void {
  const grounded = groundBuilding(block);
  mesh.position.set(block.x, grounded.base + block.height / 2, block.z);
  mesh.rotation.set(0, -block.rotation, 0);
  mesh.scale.set(block.width, block.height, block.depth);
  mesh.updateMatrix();
}

export function placementFromMesh(mesh: THREE.Object3D, id: string): BuildingPlacement {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { id, x: round(mesh.position.x), z: round(mesh.position.z),
    width: round(mesh.scale.x), height: round(mesh.scale.y), depth: round(mesh.scale.z),
    rotation: round(-Math.atan2(Math.sin(mesh.rotation.y), Math.cos(mesh.rotation.y))) };
}

export function layoutFromPlacements(placements: readonly BuildingPlacement[]): BuildingLayout {
  const originals = new Map(GENERATED_SEATTLE_BLOCKS.map(block => [buildingId(block), block]));
  return { schema: 1, baseline: SEATTLE_LAYOUT_BASELINE, buildings: placements.filter(placement => {
    const original = originals.get(placement.id);
    if (!original) throw new Error(`Unknown building: ${placement.id}`);
    return (["x", "z", "width", "depth", "height", "rotation"] as const).some(key => Math.abs(original[key] - placement[key]) > 1e-5);
  }).sort((a, b) => a.id.localeCompare(b.id, "en")) };
}

/** Read only tagged transforms. Never load imported textures, scripts or geometry. */
export function importEditorScene(value: unknown): BuildingLayout {
  const root = (value as { scene?: unknown })?.scene ?? value;
  const object = (root as { object?: Record<string, unknown> })?.object;
  if (!object) throw new Error("Choose a NIGHTSHIFT scene exported by this editor");
  if ((object.userData as Record<string, unknown>)?.nightshiftBaseline !== SEATTLE_LAYOUT_BASELINE) {
    throw new Error("This scene belongs to a different district layout");
  }
  const placements: BuildingPlacement[] = [];
  const seen = new Set<string>();
  const known = new Set(GENERATED_SEATTLE_BLOCKS.map(buildingId));
  let count = 0;
  const walk = (node: Record<string, unknown>, parent: THREE.Matrix4, depth: number) => {
    if (++count > 15000 || depth > 64) throw new Error("Scene hierarchy is too large");
    const numbers = node.matrix as number[];
    if (!Array.isArray(numbers) || numbers.length !== 16 || numbers.some(n => typeof n !== "number" || !Number.isFinite(n))) {
      throw new Error("Scene contains an invalid transform");
    }
    const matrix = new THREE.Matrix4().multiplyMatrices(parent, new THREE.Matrix4().fromArray(numbers));
    const id = (node.userData as Record<string, unknown>)?.nightshiftBuildingId;
    if (typeof id === "string") {
      if (!known.has(id) || seen.has(id)) throw new Error(`Unknown or duplicated building: ${id}`);
      seen.add(id);
      const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);
      const recomposed = new THREE.Matrix4().compose(position, quaternion, scale);
      if (matrix.elements.some((v, i) => Math.abs(v - recomposed.elements[i]!) > 1e-5) ||
          scale.x <= 0 || scale.y <= 0 || scale.z <= 0 ||
          new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).distanceTo(new THREE.Vector3(0, 1, 0)) > 1e-5) {
        throw new Error(`${id}: keep buildings upright with positive dimensions`);
      }
      const yaw = Math.atan2(matrix.elements[8]! / scale.z, matrix.elements[10]! / scale.z);
      const mesh = new THREE.Object3D();
      mesh.position.copy(position); mesh.scale.copy(scale); mesh.rotation.y = yaw;
      const placement = placementFromMesh(mesh, id);
      // Imported Y is re-seated on district ground. It is not an independent
      // physics elevation; X/Z, dimensions and yaw are the editable intent.
      placements.push(placement);
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("Invalid scene children");
    for (const child of (node.children ?? []) as Record<string, unknown>[]) walk(child, matrix, depth + 1);
  };
  walk(object, new THREE.Matrix4(), 0);
  if (seen.size !== known.size) throw new Error("Buildings are missing. Deletion is not supported; export the complete scene.");
  const layout = layoutFromPlacements(placements);
  if (layout.buildings.some(block => block.id === GARAGE_PLOT_ID)) throw new Error("Wharf Garage is fixed in this editor version");
  return layout;
}
