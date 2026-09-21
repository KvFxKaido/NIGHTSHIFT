import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MARKET_ALLEYS, MARKET_PAVING } from "../sim/market-block.ts";
import type { BuildingBlock } from "../sim/building-footprint.ts";

/** Low, flush hardstanding: the same polygons exclude grass and supply tyre grip. */
export function addMarketBlock(scene: THREE.Scene, height: (x: number, z: number) => number,
  utilities: readonly BuildingBlock[]): THREE.Group {
  const root = new THREE.Group(); root.name = "alder-market-block";
  function surfaceGeometry(polygons: typeof MARKET_PAVING, lift: number) {
    const vertices: number[] = [];
    for (const polygon of polygons) {
      const contour = polygon.map(p => new THREE.Vector2(p.x, -p.z));
      for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
        for (const index of triangle) {
          const p = polygon[index]!; vertices.push(p.x, height(p.x, p.z) + lift, p.z);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    return geometry;
  }
  const paving = surfaceGeometry(MARKET_PAVING, .016);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x53595a, roughness: 1 });
  const surface = new THREE.Mesh(paving, concrete); surface.name = "market-paving"; surface.receiveShadow = true; root.add(surface);
  const alley = new THREE.Mesh(surfaceGeometry(MARKET_ALLEYS, .02),
    // The service finish overlays the common slab. Depth bias keeps the two
    // flush surfaces stable at the city camera's long clipping distance.
    new THREE.MeshStandardMaterial({ color: 0x303a40, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  alley.name = "market-alley"; alley.receiveShadow = true; root.add(alley);
  const joints = new THREE.MeshStandardMaterial({ color: 0x373e40, roughness: 1 });
  const green = new THREE.MeshStandardMaterial({ color: 0x3b514a, roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x252e32, roughness: .8 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const geometry = new THREE.BoxGeometry(w, h, d); geometry.translate(x, height(x, z) + y, z);
    const pieces = batches.get(material) ?? []; pieces.push(geometry); batches.set(material, pieces);
  }
  // Quiet concrete slab joints along the shops; rear lane stays visually open.
  for (let z = -986; z <= -938; z += 4) box(joints, 809.5, .023, z, 3, .006, .035);
  for (let x = 756; x < 782; x += 4) box(joints, x, .023, -902, .035, .006, 3.9);
  // Flush drainage at each end of the cross-alley, never a raised driving obstacle.
  for (const x of [787, 813]) {
    box(metal, x, .026, -960, .55, .015, 2);
    for (let i = 0; i < 7; i++) box(joints, x, .037, -960.8 + i * .26, .44, .008, .06);
  }
  for (const bin of utilities) {
    box(green, bin.x, .75, bin.z, bin.width, 1.15, bin.depth);
    box(metal, bin.x, 1.36, bin.z, bin.width, .08, bin.depth);
    box(metal, bin.x, .65, bin.z + bin.depth / 2 - .025, 1.4, .08, .05);
    for (const dx of [-.7, .7]) for (const dz of [-.4, .4]) box(metal, bin.x + dx, .125, bin.z + dz, .18, .25, .18);
  }
  for (const [material, pieces] of batches) {
    const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material === green ? "market-service-bins" : material === joints ? "market-paving-joints" : "market-service-metal";
    mesh.castShadow = material !== joints; mesh.receiveShadow = true; root.add(mesh);
  }
  scene.add(root); return root;
}
