import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DISTRICT_BLOCKS, DISTRICT_JUNCTIONS, DISTRICT_STREETS, DISTRICT_WALLS, laneMarkings,
  pathSamples, projectOntoDistrict, routePoints,
  type DistrictRoute, type LaneMarkingKind, type PathSample } from "../sim/district.ts";
import type { CoursePoint } from "../sim/track.ts";
import { addNightBuildings, glowTexture, tint, type BuildingSite } from "./night.ts";

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  return result;
}

/** Continuous mitered ribbon: no gaps between boxes when a connector bends. */
export function streetGeometry(points: readonly CoursePoint[]): THREE.BufferGeometry {
  // Tessellate the long legacy spans enough to follow a graded junction apron.
  points = points.flatMap((a, i) => {
    const b = points[i + 1];
    if (!b) return [a];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4);
    return Array.from({ length: count }, (_, j) => ({ ...a, x: a.x + (b.x - a.x) * j / count,
      z: a.z + (b.z - a.z) * j / count, y: a.y + (b.y - a.y) * j / count,
      width: a.width + (b.width - a.width) * j / count }));
  });
  const vertices: number[] = [], indices: number[] = [];
  const columns = 9;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]!, p = points[i]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const incoming = new THREE.Vector2(p.x - a.x, p.z - a.z).normalize();
    const outgoing = new THREE.Vector2(b.x - p.x, b.z - p.z).normalize();
    if (i === 0) incoming.copy(outgoing);
    if (i === points.length - 1) outgoing.copy(incoming);
    const normal = new THREE.Vector2(-incoming.y - outgoing.y, incoming.x + outgoing.x).normalize();
    const length = p.width / 2 / Math.max(0.5, normal.dot(new THREE.Vector2(-outgoing.y, outgoing.x)));
    for (let column = 0; column < columns; column++) {
      const side = 1 - column / (columns - 1) * 2;
      const x = p.x + normal.x * length * side, z = p.z + normal.y * length * side;
      // Sample across the width too: a junction apron is not a single tilted
      // quad. Its visible surface must agree with the sim underneath the tyres.
      vertices.push(x, projectOntoDistrict(x, z).height + 0.04, z);
    }
    if (i > 0) {
      for (let column = 0; column < columns - 1; column++) {
        const n = i * columns + column;
        indices.push(n - columns, n, n - columns + 1, n - columns + 1, n, n + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Junction aprons carry no paint: lines running through a crossing read as a
 *  mistake, and the aprons are where two streets' surfaces already overlap. */
function inJunction(x: number, z: number): boolean {
  return DISTRICT_JUNCTIONS.some(junction =>
    Math.hypot(junction.point.x - x, junction.point.z - z) < junction.point.width * 0.62 + 5);
}

/**
 * A painted line along a street: `lateral` is metres from the centreline,
 * `dash` breaks it into a repeating pattern. Every vertex is dropped onto the
 * district's own surface height, so paint follows a graded apron instead of
 * floating over it.
 */
function markingGeometry(samples: readonly PathSample[], lateral: (sample: PathSample) => number,
  halfWidth: number, dash: { period: number; length: number } | null): THREE.BufferGeometry | null {
  const vertices: number[] = [], indices: number[] = [];
  let previous: number | null = null;
  for (const sample of samples) {
    const drawn = !dash || sample.distance % dash.period < dash.length;
    const offset = lateral(sample);
    const nx = -sample.dirZ, nz = sample.dirX;
    const x = sample.x + nx * offset, z = sample.z + nz * offset;
    if (!drawn || inJunction(x, z)) { previous = null; continue; }
    // Height per rail, not per centreline. Where two streets overlap away from a
    // junction their surfaces differ by a few centimetres, and a line dropped at
    // one height for both rails vanishes under whichever surface won.
    const left = { x: x - nx * halfWidth, z: z - nz * halfWidth };
    const right = { x: x + nx * halfWidth, z: z + nz * halfWidth };
    const base = vertices.length / 3;
    vertices.push(
      left.x, projectOntoDistrict(left.x, left.z).height + 0.055, left.z,
      right.x, projectOntoDistrict(right.x, right.z).height + 0.055, right.z,
    );
    if (previous !== null) indices.push(previous, previous + 1, base, previous + 1, base + 1, base);
    previous = base;
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The paint, read off the sim's lane model rather than guessed at beside it. A
 * dashed divider means "another lane going your way is over there" and a solid
 * edge means "that is the last of the road" — statements the renderer is not
 * entitled to make up, because traffic and rivals will act on the same lanes.
 */
const MARKING_STYLE: Record<LaneMarkingKind,
  { halfWidth: number; dash: { period: number; length: number } | null }> = {
  centre: { halfWidth: 0.09, dash: null },
  divider: { halfWidth: 0.08, dash: { period: 9, length: 3.4 } },
  edge: { halfWidth: 0.11, dash: null },
};

function addLaneMarkings(scene: THREE.Scene): void {
  const yellow: THREE.BufferGeometry[] = [], white: THREE.BufferGeometry[] = [];
  for (const street of DISTRICT_STREETS) {
    const samples = pathSamples(street.points, 2.5);
    // Lane geometry breathes with the carriageway, so each marking is addressed
    // by its rank rather than by a fixed offset: ask the model where the nth
    // line of that kind sits at this sample's own width.
    const kinds = laneMarkings(samples[0]?.width ?? 0).map(marking => marking.kind);
    kinds.forEach((kind, rank) => {
      const style = MARKING_STYLE[kind];
      const geometry = markingGeometry(samples,
        sample => laneMarkings(sample.width)[rank]!.offset, style.halfWidth, style.dash);
      if (!geometry) return;
      (kind === "centre" ? yellow : white).push(geometry);
    });
  }
  const paint = (name: string, parts: THREE.BufferGeometry[], color: number) => {
    if (!parts.length) return;
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) return;
    // Paint is lit, not glowing, but a touch of emissive keeps the lines legible
    // between the lamp pools instead of vanishing into the asphalt.
    scene.add(mesh(name, geometry, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.22, roughness: 0.65,
    })));
  };
  paint("district-centre-line", yellow, 0xd8a72a);
  paint("district-lane-lines", white, 0xbfc7cc);
}

/**
 * Sodium lamps down both sides of every street, and the pool each one throws on
 * the road. The pool is an additive quad, not a light: forty real point lights
 * would cost more than the rest of the scene put together and the district has
 * a mobile performance target (GDD §18).
 */
function addStreetLighting(scene: THREE.Scene): void {
  const posts: THREE.BufferGeometry[] = [], arms: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  const sodium = new THREE.Color(0xffb057);
  let index = 0;
  for (const street of DISTRICT_STREETS) {
    for (const sample of pathSamples(street.points, 32)) {
      const side = index++ % 2 === 0 ? 1 : -1;
      const nx = -sample.dirZ * side, nz = sample.dirX * side;
      const x = sample.x + nx * (sample.width / 2 + 1.5), z = sample.z + nz * (sample.width / 2 + 1.5);
      if (inJunction(x, z)) continue;
      // Clear of its own street is not clear of the network: belts and radials
      // run close enough that a post set beside one lands in the middle of the
      // next. The sim has no collider for street furniture, so the only thing
      // keeping a lamp out of the driving line is refusing to place it there.
      const nearest = projectOntoDistrict(x, z);
      if (nearest.distance < nearest.width / 2 + 1) continue;
      const ground = projectOntoDistrict(x, z).height;
      const post = new THREE.BoxGeometry(0.18, 8.4, 0.18);
      post.translate(x, ground + 4.2, z);
      const arm = new THREE.BoxGeometry(0.14, 0.14, 2.4);
      arm.rotateY(Math.atan2(-nx, -nz));
      arm.translate(x - nx * 1.2, ground + 8.3, z - nz * 1.2);
      posts.push(post);
      // Arms are kept separate from posts because they are allowed to overhang
      // the carriageway at eight metres and the posts are not allowed to touch
      // it at all — one merged mesh would make that distinction untestable.
      arms.push(arm);
      const head = new THREE.BoxGeometry(0.5, 0.22, 1.1);
      head.rotateY(Math.atan2(-nx, -nz));
      head.translate(x - nx * 2.3, ground + 8.1, z - nz * 2.3);
      heads.push(tint(head, sodium));
      for (const [size, reach, strength] of [[26, 5, 0.34], [11, 3, 0.5]] as const) {
        const px = x - nx * reach, pz = z - nz * reach;
        // Tessellated and dropped onto the surface per vertex, not a flat plane
        // placed at its centre's height. The district reaches 5.1 m of fall
        // across half a 26 m pool, which buries one edge under the asphalt and
        // floats the other clear of it.
        const pool = new THREE.PlaneGeometry(size, size, 4, 4);
        pool.rotateX(-Math.PI / 2);
        pool.translate(px, 0, pz);
        const position = pool.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          position.setY(i, projectOntoDistrict(position.getX(i), position.getZ(i)).height + 0.07);
        }
        pools.push(tint(pool, sodium.clone().multiplyScalar(strength)));
      }
    }
  }
  const merge = (name: string, parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh | null => {
    if (!parts.length) return null;
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    return geometry ? mesh(name, geometry, material) : null;
  };
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.7, metalness: 0.4 });
  const postMesh = merge("district-lamp-posts", posts, steel);
  if (postMesh) { postMesh.castShadow = true; scene.add(postMesh); }
  const armMesh = merge("district-lamp-arms", arms, steel);
  if (armMesh) scene.add(armMesh);
  const headMesh = merge("district-lamp-heads", heads,
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  if (headMesh) scene.add(headMesh);
  const poolMesh = merge("district-lamp-pools", pools, new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false, map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  if (poolMesh) { poolMesh.renderOrder = 1; scene.add(poolMesh); }
}

/** Massing blocks, measured against the streets that can see each face. */
function buildingSites(): BuildingSite[] {
  return DISTRICT_BLOCKS.map(block => {
    const faces: [number, number, number, number] = [
      projectOntoDistrict(block.x, block.z + block.depth / 2).distance,
      projectOntoDistrict(block.x, block.z - block.depth / 2).distance,
      projectOntoDistrict(block.x + block.width / 2, block.z).distance,
      projectOntoDistrict(block.x - block.width / 2, block.z).distance,
    ];
    return { ...block, faceDistances: faces };
  });
}

/**
 * A dome, not a flat background colour: the district's horizon carries the glow
 * of the city it sits in, and a uniform sky makes every distant rooftop read as
 * a cut-out. Unfogged and drawn first, so it never occludes anything. It rides
 * with the camera (see `SKY_NAME`), because a fixed dome smaller than the
 * district would pass through the buildings at the far belts.
 */
export const SKY_NAME = "district-sky";

function addNightSky(scene: THREE.Scene): void {
  const geometry = new THREE.SphereGeometry(480, 24, 16);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color(0x040711), horizon = new THREE.Color(0x2a2a3c);
  const haze = new THREE.Color(0x4a3a3f);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const height = Math.max(0, position.getY(i) / 480);
    color.copy(horizon).lerp(zenith, Math.min(1, Math.pow(height, 0.55)));
    // A last band of sodium haze right on the skyline, where the unseen rest of
    // the city is throwing its light up into the smog.
    color.lerp(haze, Math.max(0, 1 - Math.abs(position.getY(i) / 480) * 14) * 0.5);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sky = mesh(SKY_NAME, geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  }));
  sky.renderOrder = -1;
  scene.add(sky);
}

/**
 * `night` is the district's real presentation. `blockout` is the flat work view
 * the layout was judged under, and it stays a genuine blockout — no dressing at
 * all, because neon and lit windows hide exactly the surface errors it exists
 * to find.
 */
export type DistrictDressing = "night" | "blockout";

export function addDistrict(scene: THREE.Scene, route: DistrictRoute | null, authored?: THREE.Group,
  dressing: DistrictDressing = "night"): void {
  // Wet, not matte: the district is night-only, and a low-roughness road is what
  // lets the lamp pools and neon streak instead of sitting flat on grey felt.
  const asphalt = dressing === "night"
    ? new THREE.MeshStandardMaterial({ color: 0x353d49, roughness: 0.48, metalness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: 0x343d47, roughness: 0.96 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x65717a, roughness: 0.9 });
  // Sized from the network, not fixed: the ground was authored around a 500 m
  // loop and the belts now reach past 470 m in every direction.
  const spread = Math.max(...DISTRICT_STREETS.flatMap(street =>
    street.points.flatMap(point => [Math.abs(point.x), Math.abs(point.z)]))) * 2 + 320;
  const ground = mesh("district-ground", new THREE.PlaneGeometry(spread, spread),
    new THREE.MeshStandardMaterial({ color: dressing === "night" ? 0x0d1117 : 0x202a2d, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15; scene.add(ground);

  for (const street of DISTRICT_STREETS) {
    const road = mesh(`district-road-${street.id}`, streetGeometry(street.points), asphalt);
    road.receiveShadow = true; scene.add(road);
  }

  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, DISTRICT_WALLS.length);
  walls.name = "district-boundaries";
  const transform = new THREE.Object3D();
  DISTRICT_WALLS.forEach((wall, i) => {
    transform.position.set(wall.x, wall.y + 0.65, wall.z);
    transform.rotation.set(0, wall.rotation, wall.pitch, "YXZ");
    transform.scale.set(wall.width, 1.3, wall.depth);
    transform.updateMatrix(); walls.setMatrixAt(i, transform.matrix);
  });
  walls.receiveShadow = true; walls.castShadow = true; scene.add(walls);

  if (dressing === "night") {
    addNightSky(scene);
    addNightBuildings(scene, buildingSites(), (x, z) => projectOntoDistrict(x, z).height);
    addLaneMarkings(scene);
    addStreetLighting(scene);
  } else {
    const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5962, roughness: 1 });
    DISTRICT_BLOCKS.forEach((block, i) => {
      const body = mesh(`district-massing-${i}`,
        new THREE.BoxGeometry(block.width, block.height, block.depth), blockMaterial);
      body.position.set(block.x, block.height / 2, block.z); body.castShadow = true; scene.add(body);
    });
  }
  if (authored) scene.add(authored);

  // Free roam draws the district and stops: no arrows, no gates, nothing telling
  // you where to go. The streets and boundaries above are identical either way.
  if (!route) return;

  const points = routePoints(route), arrows: THREE.BufferGeometry[] = [];
  let spacing = 25;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    for (let t = spacing; t < length; t += 25) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -2.4, -1.1, 0, 1.2, 1.1, 0, 1.2], 3));
      const x = a.x + dx * t / length, z = a.z + dz * t / length;
      const road = projectOntoDistrict(x, z);
      geometry.rotateX(road.pitch * (road.ux * dx + road.uz * dz) / length);
      geometry.rotateY(Math.atan2(-dx, -dz));
      geometry.translate(x, road.height + 0.12, z);
      arrows.push(geometry);
    }
    spacing = ((spacing - length) % 25 + 25) % 25;
  }
  if (arrows.length) {
    const geometry = mergeGeometries(arrows);
    arrows.forEach(arrow => arrow.dispose());
    scene.add(mesh("district-route-arrows", geometry, new THREE.MeshBasicMaterial({ color: route.color, toneMapped: false })));
  }
  const gate = (point: CoursePoint, next: CoursePoint, name: string, color: number) => {
    const group = new THREE.Group(); group.name = name;
    group.position.set(point.x, point.y, point.z);
    group.rotation.y = Math.atan2(point.x - next.x, point.z - next.z);
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const side of [-1, 1]) {
      const post = mesh(`${name}-post`, new THREE.BoxGeometry(0.35, 5, 0.35), material);
      post.position.set(side * (point.width / 2 - 0.6), 2.5, 0); group.add(post);
    }
    const beam = mesh(`${name}-beam`, new THREE.BoxGeometry(point.width - 0.8, 0.25, 0.35), material);
    beam.position.y = 5; group.add(beam); scene.add(group);
  };
  gate(points[0]!, points[1]!, "district-start", 0x63d6df);
  if (route.kind === "sprint") gate(points.at(-1)!, points.at(-2)!, "district-finish", 0xefb968);
}
