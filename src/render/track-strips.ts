import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Drawing a circuit from its centreline: frames along the path and strips at offsets from it, laid on whatever ground
 * the caller names. Ridge Circuit's (render/arena.ts), shared since 2026-09-25 with the stadium's circuits, whose
 * ground is the venue's level floor and not Port Alder's.
 */

export type Plan = { x: number; z: number };
export interface Frame { x: number; z: number; nx: number; nz: number; miter: number }

/** Unit normals (to the right of travel) at each sample, mitred where the path bends. */
export function frames(points: readonly Plan[], closed: boolean): Frame[] {
  const n = points.length;
  const at = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  return points.map((p, i) => {
    const prev = at(i - 1), next = at(i + 1);
    const tl = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    const tx = (next.x - prev.x) / tl, tz = (next.z - prev.z) / tl;
    // Right of travel in x-east, z-south plan is (-uz, ux).
    const nx = -tz, nz = tx;
    const out = i < n - 1 || closed ? at(i + 1) : p, from = i < n - 1 || closed ? p : at(i - 1);
    const ol = Math.hypot(out.x - from.x, out.z - from.z) || 1;
    // Stretch the offset by the half-angle so an edge keeps its width through a bend.
    const miter = 1 / Math.max(0.5, nx * -(out.z - from.z) / ol + nz * (out.x - from.x) / ol);
    return { x: p.x, z: p.z, nx, nz, miter };
  });
}

/** A strip between two offsets from the path, `lift` above the ground at each point. */
export function strip(frame: readonly Frame[], closed: boolean, inner: number, outer: number, lift: number,
  keep: (i: number) => boolean, ground: (x: number, z: number) => number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const at = (f: Frame, offset: number) => {
    const x = f.x + f.nx * offset * f.miter, z = f.z + f.nz * offset * f.miter;
    return [x, ground(x, z) + lift, z];
  };
  const count = closed ? frame.length : frame.length - 1;
  for (let i = 0; i < count; i++) {
    if (!keep(i)) continue;
    const a = frame[i]!, b = frame[(i + 1) % frame.length]!;
    const a0 = at(a, inner), a1 = at(a, outer), b0 = at(b, inner), b1 = at(b, outer);
    positions.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Wound for an upward face on a path running either way round.
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  if (normal.count && normal.getY(0) < 0) {
    for (let i = 0; i < positions.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = positions[i + 3 + k]!; positions[i + 3 + k] = positions[i + 6 + k]!; positions[i + 6 + k] = t; }
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** The present parts as one mesh, or nothing. */
export function merged(name: string, parts: (THREE.BufferGeometry | null)[], material: THREE.Material): THREE.Mesh | null {
  const present = parts.filter((part): part is THREE.BufferGeometry => !!part);
  if (!present.length) return null;
  const geometry = mergeGeometries(present);
  present.forEach(part => part.dispose());
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}
