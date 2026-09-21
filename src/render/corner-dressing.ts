import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CORNER_SITES, type CornerProp } from "../sim/corner-dressing.ts";

/** All hard masses use the exact collision boxes. Decoration stays attached
 * to those masses; whole sites use normal frustum culling, never a near fade. */
export function addCornerDressing(scene: THREE.Scene, props: readonly CornerProp[]): void {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x898b80, roughness: .95 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x656e70, roughness: 1 });
  const coping = new THREE.MeshStandardMaterial({ color: 0xb3b5a4, roughness: .9 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x37352a, roughness: 1 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0x496449, roughness: 1, flatShading: true });
  const timber = new THREE.MeshStandardMaterial({ color: 0x8a7354, roughness: 1 });
  const joints = new THREE.MeshStandardMaterial({ color: 0x343b3b, roughness: .9 });
  const reflector = new THREE.MeshBasicMaterial({ color: 0xbe965b, toneMapped: false });
  const cube = new THREE.BoxGeometry(1, 1, 1), pose = new THREE.Object3D();
  const root = new THREE.Group(); root.name = "alder-corner-dressing";
  for (const site of CORNER_SITES) {
    const batch = props.filter(prop => prop.site === site.id);
    if (!batch.length) continue;
    const group = new THREE.Group(); group.name = `corner-dressing:${site.id}`;
    const decoration = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const record = (material: THREE.Material, geometry: THREE.BufferGeometry) => {
      const list = decoration.get(material) ?? []; list.push(geometry); decoration.set(material, list);
    };
    for (const form of ["edge", "crate"] as const) {
      const parts = batch.filter(prop => prop.form === form);
      if (!parts.length) continue;
      const material = form === "crate" ? timber : site.kind === "terrace" ? stone : concrete;
      const bodies = new THREE.InstancedMesh(cube, material, parts.length);
      bodies.name = `corner-solids:${site.id}:${form}`;
      bodies.userData.propIds = parts.map(prop => prop.id);
      parts.forEach(({ solid: b }, i) => {
        pose.position.set(b.x, b.base + b.height / 2, b.z);
        // BuildingBlock rotates in the X/Z plane; Three's yaw has opposite sign.
        pose.rotation.set(0, -b.rotation, 0); pose.scale.set(b.width, b.height, b.depth);
        pose.updateMatrix(); bodies.setMatrixAt(i, pose.matrix);
      });
      bodies.castShadow = bodies.receiveShadow = true;
      bodies.computeBoundingBox(); bodies.computeBoundingSphere(); group.add(bodies);
    }
    for (const prop of batch) {
      const b = prop.solid, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
      function box(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        geometry.rotateY(-b.rotation);
        geometry.translate(b.x + x * c - z * s, b.base + y, b.z + x * s + z * c);
        record(material, geometry);
      }
      if (prop.form === "crate") {
        for (const side of [-1, 1]) {
          for (let level = .25; level < b.height; level += .35) {
            box(joints, 0, level, side * (b.depth / 2 + .008), b.width, .026, .016);
            box(joints, side * (b.width / 2 + .008), level, 0, .016, .026, b.depth);
          }
          box(coping, side * b.width * .3, b.height + .008, 0, .06, .016, b.depth);
          box(joints, side * b.width * .3, b.height / 2, b.depth / 2 + .013, .065, b.height, .026);
        }
        continue;
      }
      // Bright coping and a dark plinth reveal the mass under street lighting.
      box(coping, 0, b.height - .05, 0, b.width + .015, .1, b.depth + .015);
      box(joints, 0, .12, 0, b.width + .01, .1, b.depth + .01);
      if (site.kind === "freight") {
        for (const side of [-1, 1]) for (const x of [-.3, .3]) {
          box(joints, x * b.width, b.height * .68, side * (b.depth / 2 + .014), .44, .3, .025);
          box(reflector, x * b.width, b.height * .68, side * (b.depth / 2 + .03), .28, .16, .014);
        }
      } else {
        if (site.kind === "terrace") {
          for (let level = .36; level < b.height - .1; level += .36) {
            box(joints, 0, level, b.depth / 2 + .012, b.width, .025, .02);
            for (let x = -b.width / 2 + .6; x < b.width / 2; x += 1.1) {
              box(joints, x, level - .17, b.depth / 2 + .014, .022, .32, .02);
            }
          }
        }
        // Low planting belongs to the bed and keeps intersection sightlines open.
        box(soil, 0, b.height + .004, 0, b.width - .36, .008, b.depth - .36);
        const longX = b.width > b.depth, length = Math.max(b.width, b.depth);
        for (let along = -length / 2 + .65; along < length / 2 - .3; along += 1.1) {
          const x = longX ? along : 0, z = longX ? 0 : along;
          const shrub = new THREE.IcosahedronGeometry(1, 0);
          shrub.scale(longX ? .7 : b.width * .34, .4, longX ? b.depth * .34 : .7);
          shrub.rotateY(along * 1.7);
          shrub.translate(x, b.height + .25, z); shrub.rotateY(-b.rotation);
          shrub.translate(b.x, b.base, b.z); record(leaves, shrub);
        }
      }
    }
    for (const [material, geometries] of decoration) {
      const geometry = mergeGeometries(geometries)!;
      geometries.forEach(g => g.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `corner-detail:${site.id}:${material.uuid}`;
      mesh.castShadow = material !== reflector; mesh.receiveShadow = true; group.add(mesh);
    }
    root.add(group);
  }
  scene.add(root);
}
