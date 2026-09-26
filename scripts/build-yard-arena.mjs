// Bake the approved shell, its two entrances and collision from one geometry.
// Source is local/ignored; checked-in outputs make ordinary builds independent
// of the FBX. See public/assets/wharf-arena/ATTRIBUTION.md.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';

// Keep the city's cut shell stable. The venue is baked from the same source
// before clipping, so its walls recover their original profile at both gates.
const closed = process.argv.includes('--closed');
const sourcePath = process.argv.find(arg => arg.startsWith('--source='))?.slice(9)
  ?? 'inspiration/tron-light-cycle-arena/shell-preview.glb';
const bytes = await readFile(sourcePath);
const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const cuts = closed ? [] : [
  { minX: -584, maxX: -536, minZ: 780, maxZ: 930 },
  // Harbor Way's gate leads diagonally into the rounded eastern tip.
  { minX: -220, maxX: 20, minZ: -14, maxZ: 14, x: -45, z: 910, rotation: -.52 },
];
// Polygon clipping, with the complement collected at each plane. Unlike
// dropping intersecting triangles, this preserves the precise portal edges.
function split(poly, axis, bound, sign) {
  const inside = [], outside = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
    (da >= 0 ? inside : outside).push(a);
    if ((da < 0) !== (db < 0)) {
      const p = a.map((v, k) => v + (b[k] - v) * da / (da - db));
      inside.push(p); outside.push(p);
    }
  }
  return { inside, outside };
}
function cut(poly, rect) {
  if (rect.rotation) {
    const c = Math.cos(rect.rotation), s = Math.sin(rect.rotation);
    const local = poly.map(([x, y, z]) => [(x - rect.x) * c + (z - rect.z) * s, y, -(x - rect.x) * s + (z - rect.z) * c]);
    return cut(local, { ...rect, rotation: 0 }).map(face => face.map(([x, y, z]) => [rect.x + x * c - z * s, y, rect.z + x * s + z * c]));
  }
  const result = [];
  for (const [axis, bound, sign] of [[0, rect.minX, 1], [0, rect.maxX, -1], [2, rect.minZ, 1], [2, rect.maxZ, -1]]) {
    if (poly.length < 3) break;
    const splitPoly = split(poly, axis, bound, sign);
    if (splitPoly.outside.length >= 3) result.push(splitPoly.outside);
    poly = splitPoly.inside;
  }
  return result;
}
const arena = new THREE.Group(); arena.name = 'wharf-arena';
const material = new THREE.MeshStandardMaterial({ color: 0x727c80, roughness: .85, side: THREE.DoubleSide });
const vertices = [], indices = [], vertexMap = new Map();
const proxies = [];
scene.traverse(object => {
  // The little interior ramp cannot be driven by the current grounded vehicle
  // model. Keep the perimeter and tall structural feature; remove the ramp.
  if (!object.isMesh || object.name.startsWith('ramp')) return;
  const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
  const p = source.attributes.position, positions = [];
  for (let i = 0; i < p.count; i += 3) {
    let polys = [[0, 1, 2].map(j => [p.getX(i + j) * 2.16 - 600, p.getY(i + j) + 2, p.getZ(i + j) * 380 / 240.059372 + 997.5])];
    for (const rect of cuts) polys = polys.flatMap(poly => cut(poly, rect));
    for (const poly of polys) for (let j = 1; j < poly.length - 1; j++) {
      const tri = [poly[0], poly[j], poly[j + 1]].map(point => point.map(v => Math.round(v * 10000) / 10000));
      const a = new THREE.Vector3(...tri[0]), b = new THREE.Vector3(...tri[1]), c = new THREE.Vector3(...tri[2]);
      if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-10) continue;
      for (const point of tri) {
        positions.push(...point);
        const key = point.join(',');
        if (!vertexMap.has(key)) { vertexMap.set(key, vertices.length / 3); vertices.push(...point); }
        indices.push(vertexMap.get(key));
      }
      // Ground-level planning footprints. Physics uses the actual triangles,
      // not these narrow occupancy proxies (which also feed the yard grid).
      const hits = [];
      for (let k = 0; k < 3; k++) {
        const u = tri[k], v = tri[(k + 1) % 3], y = 2.7;
        if ((u[1] < y) === (v[1] < y)) continue;
        const t = (y - u[1]) / (v[1] - u[1]);
        hits.push([u[0] + (v[0] - u[0]) * t, u[2] + (v[2] - u[2]) * t]);
      }
      if (hits.length === 2) {
        const [u, v] = hits, dx = v[0] - u[0], dz = v[1] - u[1], length = Math.hypot(dx, dz);
        if (length > .05) proxies.push({ x: (u[0] + v[0]) / 2, z: (u[1] + v[1]) / 2,
          width: length, depth: .15, height: 1.5, base: 2, rotation: Math.atan2(dz, dx), collision: false });
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = object.name; arena.add(mesh);
});
// Close each cut end so the shell is not hollow when viewed or struck from
// inside a gateway. Each end is a single wall section; its convex profile
// becomes a neutral concrete jamb. The same caps enter the collision bake.
const capPositions = [];
for (const rect of cuts) {
  const c = Math.cos(rect.rotation ?? 0), s = Math.sin(rect.rotation ?? 0);
  const local = ([x, y, z]) => [(x - (rect.x ?? 0)) * c + (z - (rect.z ?? 0)) * s, y, -(x - (rect.x ?? 0)) * s + (z - (rect.z ?? 0)) * c];
  const world = ([x, y, z]) => [(rect.x ?? 0) + x * c - z * s, y, (rect.z ?? 0) + x * s + z * c];
  for (const [axis, bound, other, min, max] of [[0, rect.minX, 2, rect.minZ, rect.maxZ], [0, rect.maxX, 2, rect.minZ, rect.maxZ], [2, rect.minZ, 0, rect.minX, rect.maxX], [2, rect.maxZ, 0, rect.minX, rect.maxX]]) {
    const points = new Map();
    for (let i = 0; i < vertices.length; i += 3) {
      const p = local(vertices.slice(i, i + 3));
      if (Math.abs(p[axis] - bound) < .001 && p[other] >= min - .001 && p[other] <= max + .001)
        points.set(`${p[other].toFixed(3)},${p[1].toFixed(3)}`, [p[other], p[1]]);
    }
    const sorted = [...points.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (a, b, d) => (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const half = list => { const out = []; for (const p of list) { while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } return out; };
    const lower = half(sorted), upper = half([...sorted].reverse());
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    for (let i = 1; i < hull.length - 1; i++) for (const p of [hull[0], hull[i], hull[i + 1]]) {
      const v = [0, p[1], 0]; v[axis] = bound; v[other] = p[0];
      const point = world(v).map(n => Math.round(n * 10000) / 10000), key = point.join(',');
      capPositions.push(...point);
      if (!vertexMap.has(key)) { vertexMap.set(key, vertices.length / 3); vertices.push(...point); }
      indices.push(vertexMap.get(key));
    }
  }
}
if (capPositions.length) {
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3)); caps.computeVertexNormals();
  const capMesh = new THREE.Mesh(caps, material); capMesh.name = 'entrance-jambs'; arena.add(capMesh);
}
globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); } };
const binary = await new GLTFExporter().parseAsync(arena, { binary: true });
const io = new NodeIO(), document = await io.readBinary(new Uint8Array(binary));
await document.transform(weld(), dedup(), prune());
await mkdir('public/assets/wharf-arena', { recursive: true });
await mkdir('assets/wharf-arena', { recursive: true });
await io.write(closed ? 'public/assets/wharf-arena/closed-shell.glb' : 'assets/wharf-arena/open-shell.glb', document);
await writeFile(`assets/wharf-arena/${closed ? 'closed-collision' : 'collision'}.json`, JSON.stringify({ vertices, indices, proxies, cuts }) + '\n');
console.log(JSON.stringify({ triangles: indices.length / 3, vertices: vertices.length / 3, proxies: proxies.length, cuts }));
