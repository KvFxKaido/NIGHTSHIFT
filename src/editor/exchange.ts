import * as THREE from "three";
import { parseAuthoredLayout, authoredFromId, AUTHORED_ID_PREFIX, type AuthoredLayout,
  type BuildingPlacement } from "../sim/building-layout.ts";
import { ALDER_LAYOUT_BASELINE, ALDER_GENERATED_SITES, GARAGE_PLOT_ID, groundBuilding } from "../sim/alder.ts";
import type { BuildingBlock } from "../sim/building-footprint.ts";

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

/** What the editor knows about one building: a generated plot (with the plot
 *  it was generated as, so an unchanged one writes nothing) or an authored one. */
export interface EditorEntry {
  id: string;
  source: "generated" | "authored";
  placement: BuildingPlacement;
  original?: BuildingBlock;
  deleted?: boolean;
}

const PLACEMENT_KEYS = ["x", "z", "width", "depth", "height", "rotation"] as const;
export const placementDiffers = (a: Omit<BuildingPlacement, "id">, b: Omit<BuildingPlacement, "id">): boolean =>
  PLACEMENT_KEYS.some(key => Math.abs(a[key] - b[key]) > 1e-5);

/**
 * The layout the editor's buildings describe. A generated plot that was moved
 * or resized is retired and stands again as `authored-from-<plot>`, so the
 * editor can pair them on reload; a deleted one is retired; an unchanged one
 * writes nothing. Authored plots are written as they stand.
 */
export function layoutFromEditor(entries: readonly EditorEntry[]): AuthoredLayout {
  const authored: BuildingPlacement[] = [], retired: string[] = [];
  for (const entry of entries) {
    if (entry.source === "generated") {
      if (!entry.original) throw new Error(`Unknown building: ${entry.id}`);
      if (entry.deleted) { retired.push(entry.id); continue; }
      if (!placementDiffers(entry.original, entry.placement)) continue;
      if (entry.id === GARAGE_PLOT_ID) throw new Error("Wharf Garage is fixed in this editor version");
      retired.push(entry.id);
      authored.push({ ...entry.placement, id: authoredFromId(entry.id) });
    } else if (!entry.deleted) {
      authored.push({ ...entry.placement, id: entry.id });
    }
  }
  return parseAuthoredLayout({ schema: 2, authored, retired });
}

/**
 * Read only tagged transforms. Never load imported textures, scripts or
 * geometry. A generated plot's box that is missing from the scene was
 * deleted; an authored box may be one this project has never seen.
 */
export function importEditorScene(value: unknown): AuthoredLayout {
  const root = (value as { scene?: unknown })?.scene ?? value;
  const object = (root as { object?: Record<string, unknown> })?.object;
  if (!object) throw new Error("Choose a NIGHTSHIFT scene exported by this editor");
  if ((object.userData as Record<string, unknown>)?.nightshiftBaseline !== ALDER_LAYOUT_BASELINE) {
    throw new Error("This scene belongs to a different district layout");
  }
  const originals = new Map(ALDER_GENERATED_SITES.map(({id,block}) => [id, block]));
  const seen = new Map<string, BuildingPlacement>();
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
      if ((!originals.has(id) && !id.startsWith(AUTHORED_ID_PREFIX)) || seen.has(id)) throw new Error(`Unknown or duplicated building: ${id}`);
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
      // Imported Y is re-seated on district ground. It is not an independent
      // physics elevation; X/Z, dimensions and yaw are the editable intent.
      seen.set(id, placementFromMesh(mesh, id));
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("Invalid scene children");
    for (const child of (node.children ?? []) as Record<string, unknown>[]) walk(child, matrix, depth + 1);
  };
  walk(object, new THREE.Matrix4(), 0);
  const garage = seen.get(GARAGE_PLOT_ID);
  if (!garage || placementDiffers(garage, originals.get(GARAGE_PLOT_ID)!)) throw new Error("Wharf Garage is fixed in this editor version");
  const entries: EditorEntry[] = [];
  for (const [id, original] of originals) {
    const placement = seen.get(id);
    entries.push(placement ? { id, source: "generated", placement, original } : { id, source: "generated", placement: { ...original, id }, original, deleted: true });
  }
  for (const [id, placement] of seen) if (!originals.has(id)) entries.push({ id, source: "authored", placement });
  return layoutFromEditor(entries);
}
