import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DISTRICT_BLOCKS, DISTRICT_STREETS, DISTRICT_WALLS, projectOntoDistrict, routePoints,
  type DistrictRoute } from "../sim/district.ts";
import type { CoursePoint } from "../sim/track.ts";

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

export function addDistrict(scene: THREE.Scene, route: DistrictRoute | null, authored?: THREE.Group): void {
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x343d47, roughness: 0.96 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x65717a, roughness: 0.9 });
  // Sized from the network, not fixed: the ground was authored around a 500 m
  // loop and the belts now reach past 470 m in every direction.
  const spread = Math.max(...DISTRICT_STREETS.flatMap(street =>
    street.points.flatMap(point => [Math.abs(point.x), Math.abs(point.z)]))) * 2 + 320;
  const ground = mesh("district-ground", new THREE.PlaneGeometry(spread, spread),
    new THREE.MeshStandardMaterial({ color: 0x202a2d, roughness: 1 }));
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

  const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5962, roughness: 1 });
  DISTRICT_BLOCKS.forEach((block, i) => {
    const body = mesh(`district-massing-${i}`, new THREE.BoxGeometry(block.width, block.height, block.depth), blockMaterial);
    body.position.set(block.x, block.height / 2, block.z); body.castShadow = true; scene.add(body);
  });
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
