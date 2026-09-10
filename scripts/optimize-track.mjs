import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBlenderCourse } from '../src/render/blender-course.ts';
import { courseFingerprint, COURSE_ASSET_VERSION, COURSE_ASSET_NAME } from '../src/render/course-asset-contract.ts';

const source = new URL('../artifacts/blackglass-rivergate.raw.glb', import.meta.url);
const target = new URL('../assets/tracks/blackglass-rivergate.glb', import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(fileURLToPath(source));
const root = doc.getRoot().listNodes().find(node => node.getName() === 'shipping-track-root');
if (!root || root.getExtras().routeFingerprint !== courseFingerprint() ||
    root.getExtras().assetVersion !== COURSE_ASSET_VERSION) {
  throw new Error('Track/route mismatch. Reconcile the Blender road guides with the current sim before exporting.');
}
root.setName(COURSE_ASSET_NAME);
for (const node of doc.getRoot().listNodes()) {
  node.setName(node.getName().replace(/^shipping-/, '').replace(/-export$/, ''));
}
await doc.transform(weld(), dedup(), prune({ keepLeaves: true, keepAttributes: true }));
const bytes = await io.writeBinary(doc);
const report = await validator.validateBytes(bytes);
if (report.issues.numErrors || report.issues.numWarnings) {
  throw new Error(`glTF validation failed: ${JSON.stringify(report.issues)}`);
}
if (bytes.length > 2_500_000 || doc.getRoot().listMeshes().length > 160) {
  throw new Error('Track exceeds the 2.5 MB / 160 spatial-material batch budget.');
}
// Validate the same root/anchor/name/light contract as the game BEFORE replacing
// its last good file. The separate triangle-clearance test still follows export.
createBlenderCourse((await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
await mkdir(new URL('.', target), { recursive: true });
await writeFile(target, bytes);
console.log(`Blackglass: ${(await readFile(source)).length} -> ${bytes.length} bytes; ` +
  `${doc.getRoot().listMeshes().length} meshes; ${doc.getRoot().listMaterials().length} materials; validation clean.`);
