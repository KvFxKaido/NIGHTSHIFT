import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WHARF_ARENA_MESH } from "../sim/wharf-arena.ts";
import { STADIUM_SHELL_MESH } from "../sim/stadium-shell.ts";

export async function addWharfArena(scene: THREE.Scene, enclosure: "open" | "closed" = "open"): Promise<void> {
  const shell = enclosure === "closed" ? STADIUM_SHELL_MESH : WHARF_ARENA_MESH;
  const asset = enclosure === "closed" ? "closed-shell" : "shell";
  let group: THREE.Object3D;
  try {
    group = (await new GLTFLoader().loadAsync(`/assets/wharf-arena/${asset}.glb`)).scene;
  } catch (error) {
    // A missing asset must not leave an invisible arena-sized obstacle. The
    // collision bake is also a complete neutral visual fallback.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(shell.vertices, 3));
    geometry.setIndex(shell.indices); geometry.computeVertexNormals();
    group = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x727c80, roughness: .85, side: THREE.DoubleSide }));
    console.warn("Wharf arena asset unavailable; using the shared geometry bake", error);
  }
  group.name = "wharf-arena";
  group.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
  });
  scene.add(group);
  const bounds = new THREE.Box3().setFromObject(group, true);
  scene.userData.yardShell = { state: "ready", collision: true, enclosure, min: bounds.min.toArray(), max: bounds.max.toArray() };
}
