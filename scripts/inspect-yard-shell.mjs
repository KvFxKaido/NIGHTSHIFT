import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const source = 'inspiration/tron-light-cycle-arena/source/lightcycle arena1.fbx';
const bytes = await readFile(source);
const manager = new THREE.LoadingManager();
manager.addHandler(/.*/, { load: () => new THREE.Texture() });
const root = new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
root.updateMatrixWorld(true);
const report = [];
root.traverse(object => {
  if (!object.isMesh) return;
  const box = new THREE.Box3().setFromObject(object, true);
  report.push({ name: object.name, min: box.min.toArray(), max: box.max.toArray(),
    triangles: (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3,
    materials: (Array.isArray(object.material) ? object.material : [object.material]).map(m => m.name),
    groups: object.geometry.groups });
});
await mkdir('artifacts/yard-shell', { recursive: true });
await writeFile('artifacts/yard-shell/source.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.filter(part => !part.name.includes('gridfloor')), null, 2));

// A local study only: no downloaded geometry or textures enters public/assets.
const shell = new THREE.Group(); shell.name = 'yard-reference-shell';
const material = new THREE.MeshStandardMaterial({ color: 0x727c80, roughness: .85, side: THREE.DoubleSide });
const floorParts = report.filter(part => part.name.includes('gridfloor'));
const floorMaxZ = Math.max(...floorParts.map(part => part.max[2]));
let removedTriangles = 0;
root.traverse(object => {
  if (!object.isMesh || object.name.includes('gridfloor') || object.name === 'light') return;
  let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
  if (object.name === 'light_cycle_arena1') {
    // Fourteen outlier vertices lie thousands of units beyond the last floor
    // tile, forming long spikes rather than arena walls. Drop their faces.
    if (geometry.index) geometry = geometry.toNonIndexed();
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    const positions = [], normals = [];
    for (let i = 0; i < p.count; i += 3) {
      if ([i, i + 1, i + 2].some(j => p.getZ(j) > floorMaxZ + 300)) { removedTriangles++; continue; }
      for (let j = i; j < i + 3; j++) {
        positions.push(p.getX(j), p.getY(j), p.getZ(j));
        normals.push(n.getX(j), n.getY(j), n.getZ(j));
      }
    }
    geometry.dispose(); geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  // Retain the source structures and ramp, with neutral materials and no textures.
  for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
  const mesh = new THREE.Mesh(geometry, material); mesh.name = object.name; shell.add(mesh);
});
const bounds = new THREE.Box3().setFromObject(shell, true), centre = bounds.getCenter(new THREE.Vector3());
const sourceScale = 500 / (bounds.max.x - bounds.min.x);
shell.children.forEach(mesh => {
  mesh.geometry.translate(-centre.x, -2.2412, -centre.z);
  mesh.geometry.scale(sourceScale, sourceScale, sourceScale);
});
// GLTFExporter needs this small browser API shim for binary buffers, not images.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const binary = await new GLTFExporter().parseAsync(shell, { binary: true, onlyVisible: true });
const output = 'inspiration/tron-light-cycle-arena/shell-preview.glb';
await writeFile(output, Buffer.from(binary));
console.log(JSON.stringify({ output, bytes: binary.byteLength, sourceScale, removedTriangles, bounds: new THREE.Box3().setFromObject(shell, true) }));
