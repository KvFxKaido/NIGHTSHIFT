import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { CarView } from "./car.ts";
import { celMaterial } from "./cel.ts";
import type { Livery, LiveryLayer, Panel } from "../customization/livery.ts";

/**
 * Where a decal sits on a body.
 *
 * `liverySurface` does not return one panel's geometry: the face filter is a
 * dot product against a direction, so "up-facing" is the hood, the roof and the
 * boot lid at once, and on the NS-01 it spans the whole 4.5 m of the car. The
 * zone box is what actually localises a decal, because DecalGeometry clips the
 * surface to it. The box is the panel definition.
 *
 * These were five hand-measured NS-01 boxes, which is why the editor was
 * NS-01-only. They are derived per body now: proportions of the body's own
 * bounding box for position and extent, and a measured height for the two
 * horizontal panels, because a hood is not at roof height and a bounding box
 * cannot tell you where it is. Measured against the hand-authored table the
 * derivation reproduces it to 0.12 m at worst, which is inside the thickness of
 * the decal box; see design/DISTRICT.md.
 */
export interface Zone {
  center: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
}
export type Zones = Record<Panel, Zone>;

/** Which way each panel faces. A fact about the panel, not about any car. */
const PANEL_ROTATION: Record<Panel, [number, number, number]> = {
  hood: [-Math.PI / 2, 0, 0],
  roof: [-Math.PI / 2, 0, 0],
  left: [0, -Math.PI / 2, 0],
  right: [0, Math.PI / 2, 0],
  rear: [0, 0, 0],
};

/** Bake only painted, outward-facing triangles into body-local coordinates. */
export function liverySurface(car: CarView, panel: Panel): THREE.BufferGeometry {
  car.car.updateWorldMatrix(true, true);
  const inverse = car.bodyShell.matrixWorld.clone().invert();
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...PANEL_ROTATION[panel]));
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

/** The body's own box, in the same body-local frame the surfaces are baked in. */
function bodyBounds(car: CarView): THREE.Box3 {
  car.car.updateWorldMatrix(true, true);
  const inverse = car.bodyShell.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  car.bodyShell.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    box.union(object.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
  });
  return box;
}

function triangleHeights(surface: THREE.BufferGeometry, box: THREE.Box3, from: number, to: number): number[] {
  const position = surface.getAttribute("position");
  const length = box.max.z - box.min.z;
  const heights: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    if (z < box.min.z + length * from || z > box.min.z + length * to) continue;
    heights.push((position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3);
  }
  return heights;
}

function quantile(values: number[], q: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/**
 * The height of a horizontal panel, measured from the geometry that is actually
 * there. Bodies are not tessellated evenly -- the Hammer has three triangles
 * across its bonnet -- so a thin band widens once, then gives up and takes a
 * proportion of the body instead of trusting two samples.
 */
function panelHeight(surface: THREE.BufferGeometry, box: THREE.Box3,
  from: number, to: number, q: number, fallback: number): number {
  let heights = triangleHeights(surface, box, from, to);
  if (heights.length < 8) heights = triangleHeights(surface, box, Math.max(0, from - .1), Math.min(1, to + .12));
  return heights.length < 4 ? fallback : quantile(heights, q);
}

export function deriveZones(car: CarView): Zones {
  const box = bodyBounds(car);
  const width = box.max.x - box.min.x, length = box.max.z - box.min.z, height = box.max.y - box.min.y;
  const up = liverySurface(car, "hood");
  const hoodY = panelHeight(up, box, .04, .34, .85, box.min.y + height * .62);
  const roofY = panelHeight(up, box, .38, .74, .9, box.max.y - height * .01);
  up.dispose();
  const zone = (center: [number, number, number], rotation: Panel, size: [number, number, number]): Zone =>
    ({ center, rotation: PANEL_ROTATION[rotation], size });
  return {
    hood: zone([0, hoodY, box.min.z + length * .19], "hood", [width * .78, length * .28, .5]),
    roof: zone([0, roofY, box.min.z + length * .56], "roof", [width * .58, length * .22, .3]),
    left: zone([box.min.x + .07, box.min.y + height * .36, (box.min.z + box.max.z) / 2], "left",
      [length * .4, height * .48, .35]),
    right: zone([box.max.x - .07, box.min.y + height * .36, (box.min.z + box.max.z) / 2], "right",
      [length * .4, height * .48, .35]),
    rear: zone([0, box.min.y + height * .33, box.max.z - .04], "rear", [width * .76, height * .31, .3]),
  };
}

function graphicTexture(layer: LiveryLayer, zone: Zone): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const aspect = zone.size[1] / zone.size[0];
  c.fillStyle = layer.color; c.strokeStyle = layer.color; c.lineWidth = 32;
  switch (layer.graphic) {
    case "stripe": c.fillRect(18, 86, 476, 36); c.fillRect(18, 138, 476, 14); break;
    case "number":
      c.beginPath(); c.ellipse(256,128,230 * aspect,115,0,0,Math.PI*2); c.stroke();
      c.translate(256,136); c.scale(2 * aspect,1);
      c.font = "900 150px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(layer.text || "07",0,0,182); break;
    case "label": c.font = "900 72px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(layer.text || "NIGHTSHIFT",256,128,470); break;
    case "chevron":
      for (const x of [60,200,340]) { c.beginPath(); c.moveTo(x,35); c.lineTo(x+80,128); c.lineTo(x,221); c.stroke(); } break;
    case "bolt": c.beginPath(); c.moveTo(285,12); c.lineTo(130,145); c.lineTo(246,145); c.lineTo(210,244); c.lineTo(390,100); c.lineTo(272,100); c.closePath(); c.fill(); break;
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

export function projectedLayer(surface: THREE.BufferGeometry, layer: LiveryLayer, zones: Zones,
  panel: Panel = layer.panel): THREE.BufferGeometry {
  const zone = zones[panel];
  const mirrored = panel !== layer.panel;
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...zone.rotation));
  const center = new THREE.Vector3(...zone.center);
  center.add(new THREE.Vector3((mirrored ? -layer.x : layer.x) * zone.size[0] * .45, layer.y * zone.size[1] * .45, 0).applyQuaternion(orientation));
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), THREE.MathUtils.degToRad(layer.rotation * (mirrored ? -1 : 1))));
  return new DecalGeometry(new THREE.Mesh(surface), center, new THREE.Euler().setFromQuaternion(orientation),
    new THREE.Vector3(zone.size[0] * layer.scale, zone.size[1] * layer.scale, zone.size[2]));
}

export function createLiveryRenderer() {
  let active: CarView | null = null;
  let signature = "";
  let surfaces: Partial<Record<Panel, THREE.BufferGeometry>> = {};
  let zones: Zones | null = null;
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
    if (changedCar) {
      for (const geometry of Object.values(surfaces)) geometry.dispose();
      surfaces = {}; zones = null;
    }
    active = { ...car }; signature = key;
    if (!design.enabled) return;
    // Every body gets zones of its own, so any car can carry a livery.
    zones ??= deriveZones(car);
    car.paintMaterial.color.set(design.base);
    car.paintMaterial.roughness = { gloss: .18, satin: .48, matte: .85 }[design.finish];
    car.paintMaterial.metalness = .25;
    car.bodyShell.add(overlay);
    design.layers.forEach((layer, index) => {
      const panels: Panel[] = [layer.panel];
      if (layer.mirror && (layer.panel === "left" || layer.panel === "right")) panels.push(layer.panel === "left" ? "right" : "left");
      for (const panel of panels) {
        const surface = surfaces[panel] ??= liverySurface(car, panel);
        const geometry = projectedLayer(surface, layer, zones!, panel);
        const material = celMaterial(new THREE.MeshStandardMaterial({ map: graphicTexture(layer, zones![panel]), transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -1 - index, polygonOffsetUnits: -1 - index, roughness: .5, metalness: .05 }));
        const mesh = new THREE.Mesh(geometry, material); mesh.name = `livery-${layer.id}-${panel}`; mesh.renderOrder = 10 + index; overlay.add(mesh);
      }
    });
  }, invalidate() { signature = ""; }, dispose() { clear(); for (const geometry of Object.values(surfaces)) geometry.dispose(); } };
}
