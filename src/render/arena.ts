import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { frames, merged, strip as stripOn, type Frame, type Plan } from "./track-strips.ts";
import { ARENA, ARENA_LAYOUT_IDS, arenaLap } from "../sim/arena.ts";
import { ARENA_ROADS, alderHeight } from "../sim/alder.ts";
import { projectOntoPath } from "../sim/street-path.ts";
import { glowTexture } from "./night.ts";
import type { CoursePoint } from "../sim/track.ts";

/** Corners at or under this radius get kerbs; the Drop, the kink and T9's long entry do not. */
export const ARENA_KERB_RADIUS = 60;
/** Metres between lamps along a path; one lamp stands for any other within `LAMP_SHARE`. */
const LAMP_SPACING = 55, LAMP_SHARE = 30;

/** A strip between two offsets from the path, following the terrain (track-strips.ts, on Port Alder's ground). */
const strip = (frame: readonly Frame[], closed: boolean, inner: number, outer: number, lift: number,
  keep: (i: number) => boolean = () => true) => stripOn(frame, closed, inner, outer, lift, keep, alderHeight);

/** Is a plan point on some other path's racing surface? Edge paint and kerbs stop at junction mouths. */
function onOtherRoad(x: number, z: number, self: string): boolean {
  return ARENA_ROADS.some(road => road.id !== self && projectOntoPath(road.points, x, z).distance < road.points[0]!.width / 2 - 0.3);
}

/**
 * The circuit: asphalt to the shoulder, white edge lines, red and white kerbs
 * on the tight corners, a chequered line per start, and lamps with pools of
 * light. No barriers and no colliders: the sim's `ARENA_ROADS` are the surface,
 * and nothing drawn here decides anything. Everything is local to the site, so
 * each merged mesh culls on its own bounds.
 */
export function addArena(scene: THREE.Scene, night: boolean): THREE.Group {
  const group = new THREE.Group(); group.name = "ridge-circuit"; scene.add(group);
  const paved = new THREE.MeshStandardMaterial({ color: night ? 0x232d35 : 0x3d474d, roughness: .7, metalness: .06,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const paint = (color: number) => new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const asphalt: THREE.BufferGeometry[] = [], lines: (THREE.BufferGeometry | null)[] = [], red: (THREE.BufferGeometry | null)[] = [], white: (THREE.BufferGeometry | null)[] = [];

  ARENA_ROADS.forEach((road, index) => {
    const closed = road.id !== "arena-access";
    const plan: readonly CoursePoint[] = closed ? road.points.slice(0, -1) : road.points;
    const frame = frames(plan, closed);
    const half = road.points[0]!.width / 2;
    // Overlapping layouts are the same asphalt; a few millimetres keeps coplanar copies from shimmering.
    const surface = strip(frame, closed, -(half + ARENA.shoulder), half + ARENA.shoulder, .03 + index * .004);
    if (surface) asphalt.push(surface);
    if (!closed) return;
    for (const side of [-1, 1]) {
      const edge = (half - .15) * side;
      lines.push(strip(frame, closed, edge - .125, edge + .125, .06, i => {
        const f = frame[i]!, g = frame[(i + 1) % frame.length]!;
        const x = (f.x + g.x) / 2 + f.nx * edge, z = (f.z + g.z) / 2 + f.nz * edge;
        return !onOtherRoad(x, z, road.id);
      }));
    }
    // Kerbs: the tight corners' arcs and a few metres either side, one block per sample.
    const lap = arenaLap(road.id.replace("arena-", "") as (typeof ARENA_LAYOUT_IDS)[number]);
    for (const corner of lap.corners.filter(c => c.radius <= ARENA_KERB_RADIUS)) {
      const within = (i: number) => lap.along[i]! >= corner.from - 6 && lap.along[i]! <= corner.to + 6;
      const kerbOnRoad = (i: number, side: number) => {
        const f = frame[i]!;
        return onOtherRoad(f.x + f.nx * (half + .5) * side, f.z + f.nz * (half + .5) * side, road.id);
      };
      for (const side of [-1, 1]) {
        // A side that crosses another road anywhere is a junction mouth: no kerb on it at all,
        // rather than stubs either side of the gap.
        if (frame.some((_, i) => within(i) && lap.along[i]! >= corner.from && lap.along[i]! <= corner.to && kerbOnRoad(i, side))) continue;
        for (const colour of [0, 1]) {
          (colour ? white : red).push(strip(frame, closed, (half + .05) * side, (half + 1.05) * side, .07,
            i => within(i) && i % 2 === colour && !kerbOnRoad(i, side)));
        }
      }
    }
  });

  const surface = mergeGeometries(asphalt);
  asphalt.forEach(part => part.dispose());
  if (surface) {
    const mesh = new THREE.Mesh(surface, paved); mesh.name = "arena-asphalt"; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const mesh of [merged("arena-edge-lines", lines, paint(0xe8e4d8)), merged("arena-kerbs-red", red, paint(0xb73a2e)),
    merged("arena-kerbs-white", white, paint(0xe8e4d8))]) if (mesh) group.add(mesh);

  // A chequered band across the track at each distinct start line.
  const checks: THREE.BufferGeometry[][] = [[], []];
  const starts = new Map<string, { x: number; z: number; ux: number; uz: number }>();
  for (const id of ARENA_LAYOUT_IDS) {
    const lap = arenaLap(id), a = lap.points[0]!, b = lap.points[1]!, l = Math.hypot(b.x - a.x, b.z - a.z);
    starts.set(`${Math.round(a.x)},${Math.round(a.z)}`, { x: a.x, z: a.z, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l });
  }
  for (const line of starts.values()) {
    const cells = 14, size = ARENA.width / cells;
    for (let row = 0; row < 2; row++) for (let cell = 0; cell < cells; cell++) {
      const right = -ARENA.width / 2 + (cell + .5) * size, back = (row - .5) * size;
      const x = line.x - line.ux * back - line.uz * right, z = line.z - line.uz * back + line.ux * right;
      const tile = new THREE.PlaneGeometry(size, size); tile.rotateX(-Math.PI / 2); tile.rotateY(Math.atan2(-line.ux, -line.uz));
      tile.translate(x, alderHeight(x, z) + .075, z);
      checks[(row + cell) % 2]!.push(tile);
    }
  }
  for (const [i, colour] of [[0, 0xe8e4d8], [1, 0x14181c]] as const) {
    const mesh = merged(`arena-start-line-${i ? "dark" : "light"}`, checks[i]!, paint(colour));
    if (mesh) group.add(mesh);
  }

  // Lamps on the outside of every path, shared where paths run together.
  const placed: Plan[] = [], posts: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  for (const road of ARENA_ROADS) {
    const half = road.points[0]!.width / 2;
    let travelled = LAMP_SPACING / 2;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!, b = road.points[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
      for (; travelled < length; travelled += LAMP_SPACING) {
        const t = travelled / length, x0 = a.x + (b.x - a.x) * t, z0 = a.z + (b.z - a.z) * t;
        const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
        for (const side of [1, -1]) {
          const x = x0 - uz * (half + ARENA.shoulder + 3) * side, z = z0 + ux * (half + ARENA.shoulder + 3) * side;
          if (placed.some(p => Math.hypot(p.x - x, p.z - z) < LAMP_SHARE)) continue;
          if (ARENA_ROADS.some(other => projectOntoPath(other.points, x, z).distance < other.points[0]!.width / 2 + ARENA.shoulder + 2)) continue;
          placed.push({ x, z });
          const y = alderHeight(x, z);
          posts.push(new THREE.BoxGeometry(.26, 9, .26).translate(x, y + 4.5, z));
          const head = new THREE.BoxGeometry(2.4, .22, .6); head.rotateY(Math.atan2(-ux, -uz)); heads.push(head.translate(x - (-uz) * side * .9, y + 9, z - ux * side * .9));
          if (night) {
            const pool = new THREE.PlaneGeometry(26, 26, 6, 6); pool.rotateX(-Math.PI / 2);
            const position = pool.getAttribute("position");
            const cx = x0 - uz * half * .4 * side, cz = z0 + ux * half * .4 * side;
            for (let j = 0; j < position.count; j++) {
              const px = position.getX(j) + cx, pz = position.getZ(j) + cz;
              position.setXYZ(j, px, alderHeight(px, pz) + .09, pz);
            }
            pools.push(pool);
          }
          break;
        }
      }
      travelled -= length;
    }
  }
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4e5d64, roughness: .9 });
  for (const mesh of [merged("arena-lamp-posts", posts, concrete), merged("arena-lamp-heads", heads, new THREE.MeshBasicMaterial({ color: 0xfff0cf }))]) if (mesh) group.add(mesh);
  const poolMesh = merged("arena-lamp-pools", pools, new THREE.MeshBasicMaterial({ color: 0xd8c7a0, map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: .3, toneMapped: false }));
  if (poolMesh) { poolMesh.receiveShadow = false; group.add(poolMesh); }

  // A gantry over the main start line, named in the renderer only when a canvas exists.
  const main = [...starts.values()][0]!;
  const span = ARENA.width / 2 + ARENA.shoulder + 2;
  const gantry = new THREE.MeshStandardMaterial({ color: 0x39434d, roughness: .8 });
  const heading = Math.atan2(-main.ux, -main.uz);
  for (const side of [-1, 1]) {
    const x = main.x - main.uz * span * side, z = main.z + main.ux * span * side;
    const post = new THREE.Mesh(new THREE.BoxGeometry(.5, 8, .5), gantry);
    post.name = "arena-gantry-post"; post.position.set(x, alderHeight(x, z) + 4, z); group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + .5, 1.6, .5), gantry);
  beam.name = "arena-gantry-beam"; beam.rotation.y = heading; beam.position.set(main.x, alderHeight(main.x, main.z) + 8.3, main.z); group.add(beam);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#101820"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#f2eee3"; context.font = "bold 64px monospace"; context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(ARENA.name.toUpperCase(), canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      for (const face of [1, -1]) {
        const label = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1, 1.4), new THREE.MeshBasicMaterial({ map: texture }));
        label.name = "arena-gantry-sign";
        label.rotation.y = heading + (face > 0 ? 0 : Math.PI);
        label.position.set(main.x - main.ux * .27 * face, alderHeight(main.x, main.z) + 8.3, main.z - main.uz * .27 * face);
        group.add(label);
      }
    }
  }
  return group;
}
