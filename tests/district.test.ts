import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RIVER, outerTerrain, DISTRICT_BLOCKS, blockClearsStreets, blockCorners, carriagewayWidth, DISTRICT_JUNCTIONS, DISTRICT_ROUTES, DISTRICT_STREETS, createDistrictWorld,
  districtRouteGap, getDistrictRoute, pathLength, projectOntoDistrict, projectOntoPath, routePoints } from "../src/sim/district.ts";
import { BLACKGLASS_WORLD } from "../src/sim/road-world.ts";
import { COURSE_POINTS, COURSE_WALLS, COURSE, projectOntoCourse } from "../src/sim/track.ts";
import { createSim, resetSim, step } from "../src/sim/sim.ts";
import { streetGeometry, addDistrict } from "../src/render/district.ts";
import { driveDistrictRoute } from "./helpers/district-driver.ts";
import { hasContact } from "./helpers/handling.ts";

await RAPIER.init();

test("district perimeter references every original segment without moving the baseline", () => {
  assert.equal(BLACKGLASS_WORLD.walls, COURSE_WALLS);
  assert.equal(BLACKGLASS_WORLD.start, COURSE.start);
  assert.equal(BLACKGLASS_WORLD.project, projectOntoCourse);
  const original = DISTRICT_STREETS.filter(street => !street.added).flatMap(street => street.points.slice(0, -1));
  assert.equal(original.length, COURSE_POINTS.length);
  for (const point of COURSE_POINTS) assert.ok(original.includes(point));
});

test("routes form connected directed walks with exact shared endpoints", () => {
  for (const route of DISTRICT_ROUTES) {
    const ends = route.legs.map(leg => {
      const street = DISTRICT_STREETS.find(s => s.id === leg.street)!;
      return leg.reverse ? [street.to, street.from] : [street.from, street.to];
    });
    ends.slice(1).forEach((pair, i) => assert.equal(ends[i]![1], pair[0]));
    if (route.kind === "circuit") assert.equal(ends.at(-1)![1], ends[0]![0]);
    else assert.notEqual(ends.at(-1)![1], ends[0]![0]);
    assert.ok(pathLength(routePoints(route)) > 450);
  }
  for (const street of DISTRICT_STREETS) {
    assert.deepEqual(street.points[0], DISTRICT_JUNCTIONS.find(j => j.id === street.from)!.point);
    assert.deepEqual(street.points.at(-1), DISTRICT_JUNCTIONS.find(j => j.id === street.to)!.point);
  }
  assert.throws(() => getDistrictRoute("not-a-route"), /Unknown district route/);
});

test("connector elevations remain driveable and building envelopes clear all streets", () => {
  // Width is a hierarchy now: an alley is deliberately too narrow for two cars
  // abreast, which is what makes knowing one worth something.
  const floor = { arterial: 20, collector: 15, local: 11, alley: 7 };
  for (const street of DISTRICT_STREETS.filter(s => s.added)) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!;
      assert.ok(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z) < 0.12,
        `${street.id} is too steep between ${a.z} and ${b.z}`);
      assert.ok(b.width >= floor[street.kind], `${street.id} (${street.kind}) narrows to ${b.width}`);
    }
  }
  assert.ok(DISTRICT_STREETS.some(s => s.kind === "alley"), "shortcuts exist");
  assert.ok(DISTRICT_STREETS.filter(s => s.kind === "alley").length <= 6,
    "alleys stay a shortcut layer rather than becoming the network");
  assert.ok(DISTRICT_BLOCKS.length > 40, `only ${DISTRICT_BLOCKS.length} buildings`);
  // Clearance is a rectangle problem. The circumscribed circle this replaces
  // demanded a 35 m setback on an arterial, which is why massing used to float
  // in the middle of its face instead of standing on the frontage.
  for (const block of DISTRICT_BLOCKS) {
    assert.ok(blockClearsStreets(block, 2.4),
      `a building at ${block.x.toFixed(0)},${block.z.toFixed(0)} intrudes on a carriageway`);
  }
  // And they have to actually reach it, or "filled to the street edge" is a
  // claim rather than a property.
  const kerbGap = (block: typeof DISTRICT_BLOCKS[number]) => Math.min(...blockCorners(block).map(corner =>
    Math.min(...DISTRICT_STREETS.map(street =>
      projectOntoPath(street.points, corner.x, corner.z).distance
        - carriagewayWidth(street.points) / 2))));
  const fronting = DISTRICT_BLOCKS.filter(block => kerbGap(block) < 5).length;
  assert.ok(fronting > DISTRICT_BLOCKS.length * 0.6,
    `only ${fronting}/${DISTRICT_BLOCKS.length} buildings stand on a frontage`);
});

test("blockout streets face upward and share the simulation boundary transforms", () => {
  for (const street of DISTRICT_STREETS) {
    const geometry = streetGeometry(street.points);
    const position = geometry.getAttribute("position"), indices = geometry.index!;
    // Winding, not a centreline grade test: inside hairpin paving can be steeper
    // than the driven line. Check every actual triangle, not averaged normals.
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < indices.count; i += 3) {
      a.fromBufferAttribute(position, indices.getX(i));
      b.fromBufferAttribute(position, indices.getX(i + 1));
      c.fromBufferAttribute(position, indices.getX(i + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).y > 0, street.id);
    }
    geometry.dispose();
  }
  const scene = new THREE.Scene(), route = getDistrictRoute("market-loop");
  addDistrict(scene, route);
  const walls = scene.getObjectByName("district-boundaries") as THREE.InstancedMesh;
  const world = createDistrictWorld(route);
  assert.equal(walls.count, world.walls.length);
  const matrix = new THREE.Matrix4(), translation = new THREE.Vector3();
  world.walls.forEach((wall, i) => {
    walls.getMatrixAt(i, matrix); translation.setFromMatrixPosition(matrix);
    assert.ok(translation.distanceTo(new THREE.Vector3(wall.x, wall.y + 0.65, wall.z)) < 1e-4);
  });
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

for (const route of DISTRICT_ROUTES) test(`inspection driver completes ${route.name} with real road collisions`, t => {
  const roads = DISTRICT_STREETS.map(street => new THREE.Mesh(streetGeometry(street.points), new THREE.MeshBasicMaterial()));
  const ray = new THREE.Raycaster(); let maxSurfaceError = 0;
  const result = driveDistrictRoute(route, sim => {
    if (sim.state.tick % 15 !== 0) return;
    const car = sim.state.vehicle;
    ray.set(new THREE.Vector3(car.x, car.y + 5, car.z), new THREE.Vector3(0, -1, 0));
    const surface = ray.intersectObjects(roads, false)[0];
    assert.ok(surface, `no rendered road under car at ${car.x},${car.z}`);
    maxSurfaceError = Math.max(maxSurfaceError, Math.abs(surface.point.y - car.y));
  });
  for (const road of roads) { road.geometry.dispose(); road.material.dispose(); }
  t.diagnostic(JSON.stringify({ ...result, maxSurfaceError }));
  assert.equal(result.completed, true);
  assert.equal(result.contactTicks, 0);
  assert.ok(result.maxHeightStep < 0.2, "junction projection must not snap the car vertically");
  assert.ok(maxSurfaceError < 0.15, "rendered surface must follow the car's simulation height");
});

test("district reset and replay preserve route world, drivetrain and deterministic contact state", () => {
  const world = createDistrictWorld(getDistrictRoute("market-loop"));
  const sim = createSim("fwd", world);
  const inputs = Array.from({ length: 500 }, (_, i) => ({ throttle: 0.7, brake: 0, steer: i > 150 ? 0.5 : 0, handbrake: 0 }));
  try {
    let contacts = 0;
    const states = inputs.map(input => { step(sim, input); if (hasContact(sim)) contacts++; return structuredClone(sim.state); });
    assert.ok(contacts > 0, "replay fixture must actually hit a district barrier");
    const snapshot = sim.world.takeSnapshot();
    resetSim(sim);
    assert.equal(sim.roadWorld, world);
    inputs.forEach((input, i) => { step(sim, input); assert.deepEqual(sim.state, states[i]); });
    assert.deepEqual(sim.world.takeSnapshot(), snapshot);
    resetSim(sim, "rwd"); assert.equal(sim.state.drivetrain, "rwd"); assert.equal(sim.roadWorld, world);
    assert.equal(projectOntoPath(routePoints(getDistrictRoute("market-loop")), sim.state.vehicle.x, sim.state.vehicle.z).along, 0);
  } finally { sim.world.free(); }
});

test("district circuit gaps wrap, but a sprint finish is ahead of its start", () => {
  for (const route of DISTRICT_ROUTES) {
    const points = routePoints(route), first = points[1]!, last = points.at(-2)!;
    const gap = districtRouteGap(route, first.x, first.z, last.x, last.z);
    if (route.kind === "circuit") assert.ok(gap < 0 && Math.abs(gap) < 70);
    else assert.ok(gap > pathLength(points) * 0.9);
    assert.ok(Math.abs(gap + districtRouteGap(route, last.x, last.z, first.x, first.z)) < 1e-8);
  }
});

// The ground conforms to the original loop where the loop is graded, which is
// what stops streets leaving it in a cutting. Applied without limit it also
// raised the whole valley to meet a bridge deck 24 m up, and drew the river
// 23.5 m in the air beneath its own bridge.
test("the ground passes under the bridge instead of rising to meet it", () => {
  for (const [x, z] of RIVER) {
    const ground = outerTerrain(x, z);
    assert.ok(ground < 8, `the river bed at ${x},${z} sits ${ground.toFixed(1)} m up`);
  }
  // And the bridge is still a bridge: it has to clear the water it crosses.
  const [bx, bz] = [-40, 188];
  const clearance = projectOntoCourse(bx, bz).height - outerTerrain(bx, bz);
  assert.ok(clearance > 12, `the bridge clears its river by only ${clearance.toFixed(1)} m`);
});

// A street's height is eased so no leg exceeds grade; the ground it crosses is
// not. That difference is a real embankment and gets verge geometry, but it has
// to stay an embankment rather than becoming a cliff nothing could stand on.
test("graded streets stay within an embankment of the ground", () => {
  let worst = 0, worstAt = "";
  for (const street of DISTRICT_STREETS.filter(candidate => candidate.added)) {
    for (const point of street.points) {
      const gap = Math.abs(point.y - outerTerrain(point.x, point.z));
      if (gap > worst) { worst = gap; worstAt = street.id; }
    }
  }
  assert.ok(worst < 6, `${worstAt} stands ${worst.toFixed(2)} m off the ground`);
});
