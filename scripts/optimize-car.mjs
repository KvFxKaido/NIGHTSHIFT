import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';

// Defaults to NS-01 so `pnpm assets:car` is unchanged; --car=<slug> ships a
// second body through the identical weld/dedup/prune and validation path.
const slug = process.argv.find(argument => argument.startsWith('--car='))?.slice(6) ?? 'ns-coupe-01';
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`Unsafe car slug: ${slug}`);
const source = new URL(`../artifacts/${slug}.raw.glb`, import.meta.url);
const target = new URL(`../public/assets/cars/${slug}.glb`, import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(fileURLToPath(source));
// Preserve named pivots and the small silhouette. No lossy simplification or
// decoder dependency is warranted for this one low-poly, texture-free car.
await doc.transform(weld(), dedup(), prune({ keepLeaves: true, keepAttributes: true }));
const bytes = await io.writeBinary(doc);
const report = await validator.validateBytes(bytes);
if (report.issues.numErrors || report.issues.numWarnings) {
  throw new Error(`glTF validation failed: ${JSON.stringify(report.issues, null, 2)}`);
}
await mkdir(new URL('.', target), { recursive: true });
await writeFile(target, bytes);
const original = await readFile(source);
console.log(`${slug}: ${original.byteLength.toLocaleString()} -> ${bytes.byteLength.toLocaleString()} bytes; ` +
  `${doc.getRoot().listMeshes().length} meshes, ${doc.getRoot().listMaterials().length} materials, ` +
  `${doc.getRoot().listTextures().length} textures; glTF validation clean.`);
