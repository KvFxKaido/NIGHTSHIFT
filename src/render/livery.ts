import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { CarView } from "./car.ts";
import type { Livery, LiveryLayer, Panel } from "../customization/livery.ts";

const zones: Record<Panel, { center: number[]; rotation: number[]; size: number[] }> = {
  hood: { center: [0, .96, -1.5], rotation: [-Math.PI / 2, 0, 0], size: [1.7, 1.25, .5] },
  roof: { center: [0, 1.42, .15], rotation: [-Math.PI / 2, 0, 0], size: [1.25, 1, .3] },
  left: { center: [-1.02, .68, 0], rotation: [0, -Math.PI / 2, 0], size: [1.85, .56, .35] },
  right: { center: [1.02, .68, 0], rotation: [0, Math.PI / 2, 0], size: [1.85, .56, .35] },
  rear: { center: [0, .65, 2.24], rotation: [0, 0, 0], size: [1.65, .36, .3] },
};

/** Bake only painted, outward-facing triangles into body-local coordinates. */
export function liverySurface(car: CarView, panel: Panel): THREE.BufferGeometry {
  car.car.updateWorldMatrix(true, true);
  const inverse = car.bodyShell.matrixWorld.clone().invert();
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...zones[panel].rotation as [number, number, number]));
  const positions: number[] = [];
  car.bodyShell.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.material !== car.paintMaterial) return;
    const transform = inverse.clone().multiply(object.matrixWorld);
    const g = object.geometry, attribute = g.getAttribute("position");
    const count = g.index?.count ?? attribute.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(attribute, g.index?.getX(i + j) ?? i + j).applyMatrix4(transform));
      const face = vertices[1]!.clone().sub(vertices[0]!).cross(vertices[2]!.clone().sub(vertices[0]!)).normalize();
      if (face.dot(normal) < .55) continue;
      for (const vertex of vertices) positions.push(...vertex.toArray());
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); return geometry;
}

function graphicTexture(layer: LiveryLayer): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.fillStyle = layer.color; c.strokeStyle = layer.color; c.lineWidth = 32;
  switch (layer.graphic) {
    case "stripe": c.fillRect(18, 86, 476, 36); c.fillRect(18, 138, 476, 14); break;
    case "number":
      c.beginPath(); c.ellipse(256,128,230* zones[layer.panel].size[1]! / zones[layer.panel].size[0]!,115,0,0,Math.PI*2); c.stroke();
      c.translate(256,136); c.scale(2 * zones[layer.panel].size[1]! / zones[layer.panel].size[0]!,1);
      c.font = "900 150px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(layer.text || "07",0,0,182); break;
    case "label": c.font = "900 72px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(layer.text || "NIGHTSHIFT",256,128,470); break;
    case "chevron":
      for (const x of [60,200,340]) { c.beginPath(); c.moveTo(x,35); c.lineTo(x+80,128); c.lineTo(x,221); c.stroke(); } break;
    case "bolt": c.beginPath(); c.moveTo(285,12); c.lineTo(130,145); c.lineTo(246,145); c.lineTo(210,244); c.lineTo(390,100); c.lineTo(272,100); c.closePath(); c.fill(); break;
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

export function projectedLayer(surface: THREE.BufferGeometry, layer: LiveryLayer, panel = layer.panel): THREE.BufferGeometry {
  const zone = zones[panel];
  const mirrored = panel !== layer.panel;
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...zone.rotation as [number, number, number]));
  const center = new THREE.Vector3(...zone.center as [number, number, number]);
  center.add(new THREE.Vector3((mirrored ? -layer.x : layer.x) * zone.size[0]! * .45, layer.y * zone.size[1]! * .45, 0).applyQuaternion(orientation));
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), THREE.MathUtils.degToRad(layer.rotation * (mirrored ? -1 : 1))));
  return new DecalGeometry(new THREE.Mesh(surface), center, new THREE.Euler().setFromQuaternion(orientation),
    new THREE.Vector3(zone.size[0]! * layer.scale, zone.size[1]! * layer.scale, zone.size[2]!));
}

export function createLiveryRenderer() {
  let active: CarView | null = null;
  let signature = "";
  let surfaces: Partial<Record<Panel, THREE.BufferGeometry>> = {};
  const overlay = new THREE.Group(); overlay.name = "livery-layers";
  function clear() {
    for (const object of [...overlay.children]) {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      mesh.geometry.dispose(); mesh.material.map?.dispose(); mesh.material.dispose(); overlay.remove(mesh);
    }
    overlay.removeFromParent();
  }
  return { apply(car: CarView, design: Livery) {
    const changedCar = active?.bodyShell !== car.bodyShell;
    const key = JSON.stringify(design);
    if (!changedCar && key === signature) return;
    clear();
    if (changedCar) { for (const geometry of Object.values(surfaces)) geometry.dispose(); surfaces = {}; }
    active = { ...car }; signature = key;
    if (!design.enabled || car.car.userData.model !== "ns-01") return;
    car.paintMaterial.color.set(design.base);
    car.paintMaterial.roughness = { gloss: .18, satin: .48, matte: .85 }[design.finish];
    car.paintMaterial.metalness = .25;
    car.bodyShell.add(overlay);
    design.layers.forEach((layer, index) => {
      const panels: Panel[] = [layer.panel];
      if (layer.mirror && (layer.panel === "left" || layer.panel === "right")) panels.push(layer.panel === "left" ? "right" : "left");
      for (const panel of panels) {
        const surface = surfaces[panel] ??= liverySurface(car, panel);
        const geometry = projectedLayer(surface, layer, panel);
        const material = new THREE.MeshStandardMaterial({ map: graphicTexture(layer), transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -1 - index, polygonOffsetUnits: -1 - index, roughness: .5, metalness: .05 });
        const mesh = new THREE.Mesh(geometry, material); mesh.name = `livery-${layer.id}-${panel}`; mesh.renderOrder = 10 + index; overlay.add(mesh);
      }
    });
  }, invalidate() { signature = ""; }, dispose() { clear(); for (const geometry of Object.values(surfaces)) geometry.dispose(); } };
}
