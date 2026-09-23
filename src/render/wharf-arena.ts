import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WHARF_ARENA_MESH } from "../sim/wharf-arena.ts";

export async function addWharfArena(scene: THREE.Scene): Promise<void> {
  let group: THREE.Object3D;
  try {
    group = (await new GLTFLoader().loadAsync("/assets/wharf-arena/shell.glb")).scene;
  } catch (error) {
    // A missing asset must not leave an invisible arena-sized obstacle. The
    // collision bake is also a complete neutral visual fallback.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(WHARF_ARENA_MESH.vertices, 3));
    geometry.setIndex(WHARF_ARENA_MESH.indices); geometry.computeVertexNormals();
    group = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x727c80, roughness: .85, side: THREE.DoubleSide }));
    console.warn("Wharf arena asset unavailable; using the shared geometry bake", error);
  }
  group.name = "wharf-arena";
  group.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
  });
  scene.add(group);
  const bounds = new THREE.Box3().setFromObject(group, true);
  scene.userData.yardShell = { state: "ready", collision: true, min: bounds.min.toArray(), max: bounds.max.toArray() };
}
