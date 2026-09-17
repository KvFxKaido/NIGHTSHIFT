import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildingFrontage } from "../src/sim/frontage.ts";
import type { BuildingBlock } from "../src/sim/building-footprint.ts";
import type { Street } from "../src/sim/street-path.ts";
import { ALDER_BLOCKS, ALDER_GARAGE, ALDER_STREETS } from "../src/sim/alder.ts";
import { addNightBuildings } from "../src/render/night.ts";
import { addAlder, ALDER_REACH } from "../src/render/alder.ts";

// One street along x, 10 m wide. A fronts it from the north with a 10 m
// setback, C stands behind A, and R fronts it from the south turned a quarter,
// so its street wall is its local +X wall rather than a Z wall.
const STREET = { id: "s", name: "S", from: "a", to: "b", added: false, kind: "collector",
  points: [-100, 100].map(x => ({ x, y: 0, z: 0, width: 10, zone: "old-quarter" })) } as unknown as Street;
const block = (x: number, z: number, width: number, depth: number, rotation = 0): BuildingBlock =>
  ({ x, z, width, depth, height: 12, rotation, base: 0 });
const A = block(0, 25, 30, 20);
const C = block(0, 60, 30, 20);
const R = block(60, -25, 20, 30, Math.PI / 2);

test("a wall's frontage is measured along its own normal, and another building blocks it", () => {
  const [a, c, r] = buildingFrontage([A, C, R], [STREET], 60);
  // A's -Z wall stands at z = 15 and the carriageway edge at z = 5; samples fall on half metres.
  assert.deepEqual(a, [Infinity, 10.5, Infinity, Infinity]);
  // C's street wall looks straight into A.
  assert.deepEqual(c, [Infinity, Infinity, Infinity, Infinity]);
  assert.deepEqual(buildingFrontage([C], [STREET], 60)[0], [Infinity, 45.5, Infinity, Infinity]);
  // Turned a quarter, R's local +X wall is the one that faces +z, toward the street.
  assert.deepEqual(r, [Infinity, Infinity, 10.5, Infinity]);
});

// The frontage is in the sim's frame and the dressing is built in the
// renderer's; a sign on the wrong wall is the same class of error as the 218
// buildings once drawn out of their own footprints. So the claim is made on
// the drawn vertices, not on the frontage numbers.
test("the night dressing lights only the walls whose frontage is in reach", () => {
  const sites = [A, C, R];
  const frontage = buildingFrontage(sites, [STREET], ALDER_REACH.signs);
  const scene = new THREE.Scene();
  addNightBuildings(scene, sites.map((site, i) => ({ ...site, decorationIndex: i, faceDistances: frontage[i]! })),
    () => 0, ALDER_REACH);
  const seen = { A: 0, R: 0 };
  for (const name of ["district-signage", "district-signage-glow", "district-shop-spill"]) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    assert.ok(mesh, `${name} is missing`);
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      if (x < 30) {
        seen.A++;
        assert.ok(z <= 15.6, `${name} hangs on A's back or sides at ${x.toFixed(1)},${z.toFixed(1)}`);
      } else {
        seen.R++;
        assert.ok(z >= -15.6, `${name} hangs on R's back or sides at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  assert.ok(seen.A > 0 && seen.R > 0, `a street wall went dark: ${JSON.stringify(seen)}`);
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

// The rule was once switched off in Port Alder by passing zero for every wall,
// which hung neon on 97% of them, back walls and hillsides included. Every
// drawn sign is a vertical quad, so its triangles' normals say which wall it is
// on; that wall's frontage has to be in reach.
test("Port Alder hangs no sign on a wall that faces no street", () => {
  const scene = new THREE.Scene();
  addAlder(scene, "night");
  const buildings = ALDER_BLOCKS.filter(b => b !== ALDER_GARAGE.building);
  const frontage = buildingFrontage(buildings, ALDER_STREETS, ALDER_REACH.signs);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), centre = new THREE.Vector3();
  let quads = 0, offenders = 0, firstAt = "";
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith("district-signage:")) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
      normal.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      if (Math.abs(normal.y) > 0.5) continue;
      quads++;
      centre.copy(a).add(b).add(c).divideScalar(3);
      const onReachedWall = buildings.some((building, index) => {
        const cos = Math.cos(building.rotation), sin = Math.sin(building.rotation);
        const dx = centre.x - building.x, dz = centre.z - building.z;
        const localX = dx * cos + dz * sin, localZ = -dx * sin + dz * cos;
        if (Math.abs(localX) > building.width / 2 + 8 || Math.abs(localZ) > building.depth / 2 + 8) return false;
        const nx = normal.x * cos + normal.z * sin, nz = -normal.x * sin + normal.z * cos;
        const side = Math.abs(nz) > Math.abs(nx) ? (nz > 0 ? 0 : 1) : (nx > 0 ? 2 : 3);
        const wall = [localZ - building.depth / 2, -localZ - building.depth / 2, localX - building.width / 2, -localX - building.width / 2][side]!;
        return wall > 0 && wall < 1 && frontage[index]![side]! <= ALDER_REACH.signs;
      });
      if (!onReachedWall) { offenders++; if (!firstAt) firstAt = `${centre.x.toFixed(0)},${centre.z.toFixed(0)}`; }
    }
  });
  assert.ok(quads > 1000, `only ${quads} sign triangles to check`);
  assert.equal(offenders, 0, `${offenders} of ${quads} sign triangles hang on a wall with no street in reach, first at ${firstAt}`);
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});
