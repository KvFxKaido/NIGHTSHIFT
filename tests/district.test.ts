import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { DISTRICT_BLOCKS, DISTRICT_JUNCTIONS, DISTRICT_ROUTES, DISTRICT_STREETS, createDistrictWorld,
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
  for (const street of DISTRICT_STREETS.filter(s => s.added)) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!;
      assert.ok(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z) < 0.12);
      assert.ok(b.width >= 16);
    }
  }
  assert.ok(DISTRICT_BLOCKS.length > 5);
  for (const block of DISTRICT_BLOCKS) {
    const road = projectOntoDistrict(block.x, block.z);
    assert.ok(road.distance > road.width / 2 + Math.hypot(block.width, block.depth) / 2 + 6);
  }
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
