import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RIVER, RAIL, RIVER_HALF_WIDTH, RAIL_HALF_WIDTH, distanceToPath, inRiver, DISTRICT_WALLS, DISTRICT_STREET_RAILS, DISTRICT_RIVER_FENCE, DISTRICT_RAIL_FENCE, outerTerrain, groundHeight, blockPenetration, DISTRICT_BLOCKS, blockClearsStreets, blockCorners, DISTRICT_JUNCTIONS, DISTRICT_ROUTES, DISTRICT_STREETS, createDistrictWorld,
  districtRouteGap, getDistrictRoute, pathLength, projectOntoDistrict, projectOntoPath, projectOntoPathUnindexed, routePoints } from "../src/sim/district.ts";
import { pathSamples } from "../src/sim/lanes.ts";
import { BLACKGLASS_WORLD } from "../src/sim/road-world.ts";
import { COURSE_POINTS, COURSE_WALLS, COURSE, projectOntoCourse, type CoursePoint } from "../src/sim/track.ts";
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
  // Against the kerb that is actually there, not the street's NARROWEST width.
  // The narrowest width is what lanes are laid to, and on every junction flare
  // it puts the kerb metres inboard of the real one — the same mistake
  // blockClearsStreets made, in the test that checks frontage. Measured against
  // it, 162 of 272 buildings read as off their frontage; against the real kerb,
  // 242 stand within 5 m and the median gap is 3.5 m, a pavement.
  const kerbGap = (block: typeof DISTRICT_BLOCKS[number]) => Math.min(...blockCorners(block).map(corner =>
    Math.min(...DISTRICT_STREETS.map(street => {
      const on = projectOntoPath(street.points, corner.x, corner.z);
      return on.distance - on.width / 2;
    }))));
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

// Two carriageways sharing ground is what a junction IS. Away from one it is a
// defect, and it has surfaced three times now. A radial left the ring on almost
// the ring's own bearing, traded places as nearest street and snapped the car
// 17 m vertically. Cutlers Alley left Northgate at 26 deg and shared the North
// Arterial's kerbs for 45 m. And the Wharf Bridge crossed the quay frontage at
// grade, 19 m of shared asphalt with no node anywhere near it, which nothing
// caught because it looked right and drove fine. Every one was found from a
// symptom rather than a cause. Traffic is next and it will reserve space on
// these carriageways by junction, so the cause gets a gate.
test("street carriageways only overlap approaching a junction they share", () => {
  const APRON = 28; // districtSurfaceHeight's own blend radius.
  const orphans: string[] = [];
  let worstReach = 0, reachAt = "";
  let worstStep = 0, stepAt = "";
  for (let i = 0; i < DISTRICT_STREETS.length; i++) {
    for (let j = i + 1; j < DISTRICT_STREETS.length; j++) {
      const a = DISTRICT_STREETS[i]!, b = DISTRICT_STREETS[j]!;
      const shared = [a.from, a.to].filter(id => id === b.from || id === b.to)
        .map(id => DISTRICT_JUNCTIONS.find(junction => junction.id === id)!.point);
      // Only a junction one of these two streets actually ENDS at can excuse
      // their overlap. Any node nearby would otherwise launder a crossing it has
      // nothing to do with, which is how the Wharf Bridge kept its secret.
      const aprons = DISTRICT_JUNCTIONS.filter(junction =>
        [a.from, a.to, b.from, b.to].includes(junction.id)).map(junction => junction.point);
      for (const sample of pathSamples(a.points, 2)) {
        if (aprons.some(point =>
          Math.hypot(point.x - sample.x, point.z - sample.z) <= APRON)) continue;
        const other = projectOntoPath(b.points, sample.x, sample.z);
        // Asphalt width at the sample, not the lane width: the flare into a
        // junction is real road and a car can be on it.
        const overlap = (sample.width + other.width) / 2 - other.distance;
        if (overlap <= 0) continue;
        const here = `${a.id} x ${b.id} at ${sample.x.toFixed(0)},${sample.z.toFixed(0)}`;
        // Streets that meet may share their kerbs on the approach; that is a
        // merge. Streets that never meet have no business touching at all.
        if (!shared.length) { if (overlap > 1) orphans.push(`${here} (${overlap.toFixed(1)} m)`); continue; }
        // And a merge has to resolve into the junction rather than run beside it.
        const reach = Math.min(...shared.map(point => Math.hypot(point.x - sample.x, point.z - sample.z)));
        if (reach > worstReach) { worstReach = reach; reachAt = here; }
        // The vertical constraint follows the NEAREST street, so where two
        // overlap the surface jumps between them as the car moves sideways. The
        // defect's size is the disagreement itself, and outside the apron there
        // is no junction grading to hide it. This is the 17 m snap's own measure.
        const step = Math.abs(projectOntoPath(a.points, sample.x, sample.z).height - other.height);
        if (step > worstStep) { worstStep = step; stepAt = here; }
      }
    }
  }
  assert.deepEqual(orphans, [], `streets share asphalt without sharing a junction: ${orphans.join("; ")}`);
  assert.ok(worstReach < 70, `${reachAt} still overlaps ${worstReach.toFixed(0)} m out from the junction it merges at`);
  assert.ok(worstStep < 1, `${stepAt} steps ${worstStep.toFixed(2)} m in ground both streets claim`);
});


// Buildings stood inside one another because the check was two circumscribed
// circles with 7 m of slack, and slack on a circle is slack on the rectangle
// inside it: 15 pairs interpenetrated, the worst by 4.21 m. A circle cannot say
// "these terraces share a party wall but do not overlap", which is the shape of
// every city block, so it needs the slack, so it lets buildings through.
test("no building stands inside another", () => {
  let worst = 0, worstAt = "";
  for (let i = 0; i < DISTRICT_BLOCKS.length; i++) {
    for (let j = i + 1; j < DISTRICT_BLOCKS.length; j++) {
      const a = DISTRICT_BLOCKS[i]!, b = DISTRICT_BLOCKS[j]!;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 80) continue;
      const depth = blockPenetration(a, b);
      if (depth > worst) {
        worst = depth;
        worstAt = `(${a.x.toFixed(0)},${a.z.toFixed(0)}) and (${b.x.toFixed(0)},${b.z.toFixed(0)})`;
      }
    }
  }
  assert.ok(worst <= 0, `two buildings interpenetrate by ${worst.toFixed(2)} m: ${worstAt}`);
  // And the district is still built, rather than cleared to satisfy the above.
  assert.ok(DISTRICT_BLOCKS.length >= 60, `only ${DISTRICT_BLOCKS.length} buildings survived placement`);
});

// The ground was drawn over the road on 39% of samples, up to 4.23 m, because
// outerTerrain conforms to the ORIGINAL loop and only it, while every street
// added since is graded on its own terms. At night that ground is nearly black,
// so the road ran into what looked like water.
//
// Resolution was not the cause and would not have been the cure: 110 to 880
// segments, 64x the triangles, moved 898 buried samples to 893 and made the
// worst case worse.
test("the drawn ground never covers the road", () => {
  const scene = new THREE.Scene();
  addDistrict(scene, getDistrictRoute("market-loop"));
  const ground = scene.getObjectByName("district-ground") as THREE.Mesh;
  const position = ground.geometry.getAttribute("position");
  // A PlaneGeometry's vertices are row-major, (n+1) squared of them. Read the
  // mesh that is actually drawn rather than re-deriving what it ought to be.
  const side = Math.round(Math.sqrt(position.count));
  const n = side - 1;
  const minX = position.getX(0), maxX = position.getX(side - 1);
  const cell = (maxX - minX) / n;
  // The plane is rotated -PI/2 about X: local +Y is world -Z, local +Z is up.
  const heightAt = (ix: number, iz: number) => position.getZ(iz * side + ix);
  const worldZ = (iz: number) => -position.getY(iz * side);

  let worst = 0, worstAt = "";
  for (const street of DISTRICT_STREETS) {
    for (const sample of pathSamples(street.points, 4)) {
      const road = projectOntoDistrict(sample.x, sample.z).height;
      for (const side_ of [-1, 0, 1] as const) {
        const x = sample.x + -sample.dirZ * side_ * sample.width * 0.5;
        const z = sample.z + sample.dirX * side_ * sample.width * 0.5;
        const fx = (x - minX) / cell;
        const fz = (z - worldZ(0)) / cell;
        const ix = Math.max(0, Math.min(n - 1, Math.floor(fx)));
        const iz = Math.max(0, Math.min(n - 1, Math.floor(fz)));
        const tx = fx - ix, tz = fz - iz;
        const h = (heightAt(ix, iz) * (1 - tx) + heightAt(ix + 1, iz) * tx) * (1 - tz)
          + (heightAt(ix, iz + 1) * (1 - tx) + heightAt(ix + 1, iz + 1) * tx) * tz;
        if (h - road > worst) { worst = h - road; worstAt = `${street.id} at ${x.toFixed(0)},${z.toFixed(0)}`; }
      }
    }
  }
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  assert.ok(worst <= 0, `the ground stands ${worst.toFixed(2)} m over the road at ${worstAt}`);
});

// The building you cannot drive through must be the building you can see. The
// collider carried the footprint's yaw NUMBER with the opposite handedness —
// roadRotation is a rotation about +Y, whose width axis is (cos, -sin); the
// footprint, the drawn mesh and every placement test use (cos, sin) — so each
// physics box was the mirror image of its footprint. Near-square blocks in the
// core hid it for two days. A 32 x 11 warehouse on Crane Alley put an
// invisible wall across the road at dead centre, and the first race found it.
//
// Executed against Rapier itself, not against the arithmetic: for every
// building long enough to tell a mirror from itself, its own corner must lie
// inside its collider and the mirror's corner must not.
test("a building's collider stands where its footprint does, not where its mirror does", () => {
  const sim = createSim("fwd", createDistrictWorld(getDistrictRoute("market-loop")), { traffic: false });
  try {
    // Rapier's spatial queries answer nothing until the world has stepped once:
    // the query pipeline is built by the step. Asked cold, every probe below
    // read false — including the centre of the box — and it looked like the
    // collider was somewhere else entirely.
    sim.world.step();
    const inThisBuilding = (block: typeof DISTRICT_BLOCKS[number], x: number, z: number) => {
      let hit = false;
      // Mid-height of the box where it actually stands, not half its height above datum.
      sim.world.intersectionsWithPoint({ x, y: block.base + block.height / 2, z }, collider => {
        // Rapier stores translations as f32; 1e-6 against an f64 misses a
        // building at |x| > 100 on rounding alone.
        const t = collider.translation();
        if (Math.abs(t.x - block.x) < 1e-3 && Math.abs(t.z - block.z) < 1e-3) { hit = true; return false; }
        return true;
      });
      return hit;
    };
    let checked = 0, mirrorsTested = 0;
    for (const block of DISTRICT_BLOCKS) {
      if (block.width < block.depth * 1.8 && block.depth < block.width * 1.8) continue;
      const cos = Math.cos(block.rotation), sin = Math.sin(block.rotation);
      const lx = block.width / 2 - 0.5, lz = block.depth / 2 - 0.5;
      // The footprint's own corner, half a metre in.
      const ownX = block.x + lx * cos - lz * sin, ownZ = block.z + lx * sin + lz * cos;
      assert.ok(inThisBuilding(block, ownX, ownZ),
        `building at ${block.x.toFixed(0)},${block.z.toFixed(0)}: its own corner is outside its collider`);
      checked++;
      // The same corner under the opposite handedness: where the mirror stood.
      // Only a probe where the mirror actually leaves the footprint — an
      // axis-aligned box is its own mirror and cannot tell.
      const mirX = block.x + lx * cos + lz * sin, mirZ = block.z - lx * sin + lz * cos;
      const dx = mirX - block.x, dz = mirZ - block.z;
      const along = dx * cos + dz * sin, across = -dx * sin + dz * cos;
      if (Math.abs(along) < block.width / 2 + 0.5 && Math.abs(across) < block.depth / 2 + 0.5) continue;
      mirrorsTested++;
      assert.ok(!inThisBuilding(block, mirX, mirZ),
        `building at ${block.x.toFixed(0)},${block.z.toFixed(0)}: its MIRROR's corner is inside its collider`);
    }
    // 29 buildings are long enough to tell a mirror from itself, and 20-odd of
    // them stand at an angle where the mirror leaves the footprint. Enough to
    // mean something; the floors guard against the loop silently skipping all.
    assert.ok(checked >= 20, `only ${checked} long buildings to check`);
    assert.ok(mirrorsTested >= 10, `only ${mirrorsTested} buildings where the mirror differs`);
  } finally { sim.world.free(); }
});

// Every building stood at y = 0 on a district that climbs 20 m: 227 of 321 had
// their base more than a metre underground, 32 past half their height, and a
// road on an embankment ran through a building's upper floors — which read,
// from the car, as a building clipping the road. The dressing knew, in its own
// way: it skipped shopfronts wherever the road stood more than 3 m over the
// base, and called that a viaduct.
test("every building stands on the ground it is on, and no corner floats", () => {
  let worstFloat = 0, floatAt = "", worstBury = 0, buryAt = "";
  for (const block of DISTRICT_BLOCKS) {
    const grounds = [groundHeight(block.x, block.z),
      ...blockCorners(block).map(corner => groundHeight(corner.x, corner.z))];
    const lowest = Math.min(...grounds), highest = Math.max(...grounds);
    // The base sits on the lowest ground under the footprint...
    const float = block.base - lowest;
    if (float > worstFloat) { worstFloat = float; floatAt = `${block.x.toFixed(0)},${block.z.toFixed(0)}`; }
    // ...and is buried on the uphill side only by the ground's own spread.
    const bury = highest - block.base;
    if (bury > worstBury) { worstBury = bury; buryAt = `${block.x.toFixed(0)},${block.z.toFixed(0)}`; }
  }
  assert.ok(worstFloat < 0.15, `a building at ${floatAt} floats ${worstFloat.toFixed(2)} m above the ground`);
  // Placement refuses a plot whose ground drops more than 4 m across it, and
  // stores the base to 0.1 m; so 4 m is the limit and a tenth is rounding.
  assert.ok(worstBury <= 4.15, `a building at ${buryAt} is buried ${worstBury.toFixed(2)} m on its uphill side`);
});

// Rule: buildings cannot clip barriers or roads. Roads were already covered —
// every footprint edge is sampled against the asphalt that is actually there.
// Barriers were not: placement cleared the streets and nothing else, so 46
// buildings put a corner in the river corridor, 7 in the lineside, and 27 rail
// pieces stood inside 19 of them with the fence running through the building.
test("no barrier stands inside a building, and no building stands in a corridor", () => {
  const inside = (block: typeof DISTRICT_BLOCKS[number], x: number, z: number) => {
    const cos = Math.cos(-block.rotation), sin = Math.sin(-block.rotation);
    const dx = x - block.x, dz = z - block.z;
    return Math.abs(dx * cos - dz * sin) <= block.width / 2 && Math.abs(dx * sin + dz * cos) <= block.depth / 2;
  };
  const offenders: string[] = [];
  for (const wall of DISTRICT_WALLS) {
    for (const block of DISTRICT_BLOCKS) {
      if (Math.hypot(block.x - wall.x, block.z - wall.z) > 40) continue;
      if (inside(block, wall.x, wall.z)) offenders.push(`rail at ${wall.x.toFixed(0)},${wall.z.toFixed(0)}`);
    }
  }
  assert.deepEqual(offenders.slice(0, 5), [], `${offenders.length} rail pieces stand inside buildings`);
  for (const block of DISTRICT_BLOCKS) {
    for (const corner of [...blockCorners(block), { x: block.x, z: block.z }]) {
      assert.ok(distanceToPath(RIVER, corner.x, corner.z) > RIVER_HALF_WIDTH,
        `a building at ${block.x.toFixed(0)},${block.z.toFixed(0)} has its back in the river`);
      assert.ok(distanceToPath(RAIL, corner.x, corner.z) > RAIL_HALF_WIDTH,
        `a building at ${block.x.toFixed(0)},${block.z.toFixed(0)} stands on the line`);
    }
  }
});

// Rule: ground cannot clip above road textures. The terrain was already tested;
// verges, the river and the rail are ground too. Their tolerance is 10 cm: the
// rail ribbon stands 5 cm proud of the road at a level crossing on purpose, and
// a verge's inner edge IS the kerb, at exactly road height.
test("no ground-like surface rises above the road across the carriageway", () => {
  const scene = new THREE.Scene();
  addDistrict(scene, getDistrictRoute("market-loop"));
  const vertex = new THREE.Vector3();
  for (const name of ["district-ground", "district-verges", "district-river", "district-rail"]) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    assert.ok(mesh, `${name} is not in the scene`);
    mesh.updateMatrixWorld(true);
    const position = mesh.geometry.getAttribute("position");
    let worst = -Infinity, worstAt = "";
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const road = projectOntoDistrict(vertex.x, vertex.z);
      if (road.distance > road.width / 2 - 0.3) continue;
      const over = vertex.y - road.height;
      if (over > worst) { worst = over; worstAt = `${vertex.x.toFixed(0)},${vertex.z.toFixed(0)}`; }
    }
    assert.ok(worst < 0.1, `${name} rises ${worst.toFixed(2)} m above the road at ${worstAt}`);
  }
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

// Rule: buildings cannot clip barriers — and the tunnel's walls and the
// bridge's deck are barriers the street data never mentioned. Placement
// cleared the road ribbon and its pavement, and 14 buildings stood inside the
// tunnel bore 12-15 m off its centreline: five on the floor beside the road,
// nine rising 24-40 m through its walls and roof from the low ground beside it.
// From the car it is a lit building standing in the tunnel.
test("no building stands in the tunnel bore or on the bridge deck", () => {
  const spans: CoursePoint[][] = [];
  COURSE_POINTS.forEach((point, i) => {
    if (point.zone !== "tunnel" && point.zone !== "bridge") return;
    const last = spans.at(-1);
    if (last && last.at(-1) === COURSE_POINTS[i - 1]) last.push(point); else spans.push([point]);
  });
  // One span, not two: on this loop the tunnel runs straight onto the bridge,
  // so the structural points are contiguous. The first version demanded two.
  assert.ok(spans.length >= 1, "the loop has a tunnel and a bridge");
  for (const block of DISTRICT_BLOCKS) {
    for (const corner of [...blockCorners(block), { x: block.x, z: block.z }]) {
      for (const span of spans) {
        const on = projectOntoPath(span, corner.x, corner.z);
        assert.ok(on.distance > on.width / 2 + 4,
          `a building at ${block.x.toFixed(0)},${block.z.toFixed(0)} stands ${on.distance.toFixed(0)} m from the ${span[0]!.zone} centreline`);
      }
    }
  }
});

// The rail rule. Of 10,808 pieces, 70% guarded open ground and 20% stood in
// front of a building that is already solid; the district drove like a
// slot-car track and the gaps between buildings — the shortcuts — did not
// exist. A rail now stands only where it guards something: the boundary, the
// river and rail fences, the tunnel and bridge, or a drop of 1.5 m beside the
// road. Every kept street rail has to justify itself.
test("a rail stands only where it guards something", () => {
  // By source, not by geometry: classifying by distance mistook a fence piece
  // inside the river's bend for a street rail guarding nothing.
  let street = 0, unjustified = 0, firstAt = "";
  for (const wall of DISTRICT_STREET_RAILS) {
    street++;
    if (wall.zone === "bridge" || wall.zone === "tunnel") continue;
    const nx = Math.sin(wall.rotation), nz = Math.cos(wall.rotation);
    const drop = Math.max(wall.y - outerTerrain(wall.x + nx * 4, wall.z + nz * 4),
      wall.y - outerTerrain(wall.x - nx * 4, wall.z - nz * 4));
    if (drop >= 1.4) continue;
    // Water is a drop the terrain does not show.
    if (inRiver(wall.x + nx * 4, wall.z + nz * 4) || inRiver(wall.x - nx * 4, wall.z - nz * 4)) continue;
    unjustified++;
    if (!firstAt) firstAt = `${wall.x.toFixed(0)},${wall.z.toFixed(0)} (drop ${drop.toFixed(2)} m)`;
  }
  // Under a fifth of the 9,607 there were: the rule keeps 1,363, and 527 of
  // those are river-side rails that count the water as their drop.
  assert.ok(street < 2000, `${street} street rails is most of a slot-car track again`);
  assert.equal(unjustified, 0, `${unjustified} rails guard nothing, first at ${firstAt}`);
});

// What remains has to be whole. A fence with a hole in it is a shortcut into
// the river.
test("the river and rail fences are continuous away from their crossings", () => {
  for (const [label, path, pieces] of [["river", RIVER, DISTRICT_RIVER_FENCE], ["rail", RAIL, DISTRICT_RAIL_FENCE]] as const) {
    // Along-corridor distance and side, from the polyline.
    const along = (x: number, z: number) => {
      let travelled = 0, best = { along: 0, side: 1, distance: Infinity };
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i]!, [bx, bz] = path[i + 1]!;
        const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length * length)));
        const px = ax + dx * t, pz = az + dz * t, distance = Math.hypot(x - px, z - pz);
        if (distance < best.distance) best = { along: travelled + length * t, side: Math.sign(dx * (z - pz) - dz * (x - px)) || 1, distance };
        travelled += length;
      }
      return best;
    };
    // A crossing is a road that is near AND transverse to the fence. Ferry
    // Reach runs alongside the river fence for eighty metres; near alone would
    // excuse the hole it used to open.
    // A gap is excused where a road CROSSES the fence — near and transverse —
    // or where the fence line lies ON a road: the west bank's line runs down
    // Wharf Road's carriageway, and there the road's own drop rail is the
    // barrier. The first version passed two arguments to this four-parameter
    // function; tests are not type-checked, the dot product was NaN, and every
    // gap failed including the bridges.
    const crossing = (x: number, z: number, ux: number, uz: number) => DISTRICT_STREETS.some(street => {
      const on = projectOntoPath(street.points, x, z);
      // Sampled along the straight chord between two kept pieces, while the
      // fence itself bends between them — at the river's bend the chord runs
      // 4-7 m off the pieces that were removed. Eight metres of grace is sound
      // now: the generator removes a piece only when it is ON a road or at a
      // transverse crossing, so a gap beside a parallel road can only be the
      // former, and the old "near a road" hole cannot come back through here.
      if (on.distance < on.width / 2 + 8) return true;
      return on.distance < on.width / 2 + 10 && Math.abs(on.ux * ux + on.uz * uz) < 0.7;
    });
    for (const side of [-1, 1]) {
      const marks = pieces.map(wall => ({ wall, at: along(wall.x, wall.z) })).filter(k => k.at.side === side)
        .sort((p, q) => p.at.along - q.at.along);
      for (let i = 1; i < marks.length; i++) {
        // Ordered along the river, but measured in SPACE: the fence is a mitred
        // offset of the river and on the inside of a bend it is shorter than the
        // river is, so along-values jump there and two touching pieces read as a
        // 44 m hole. Two pieces are contiguous when their centres are no further
        // apart than their half-widths add up to.
        const a = marks[i - 1]!.wall, b = marks[i]!.wall;
        const gap = Math.hypot(b.x - a.x, b.z - a.z) - (a.width + b.width) / 2;
        if (gap < 3) continue;
        const gx = b.x - a.x, gz = b.z - a.z, gl = Math.hypot(gx, gz) || 1;
        // Sampled along the gap, the way the generator decided piece by piece:
        // one midpoint sat 12 m from Ferry Reach while both missing pieces were
        // on it.
        let excused = false;
        for (let d = 0; d <= gl && !excused; d += 5) {
          excused = crossing(a.x + gx / gl * d, a.z + gz / gl * d, gx / gl, gz / gl);
        }
        if (excused) continue;
        assert.fail(`${label} fence has a ${gap.toFixed(0)} m hole between ${a.x.toFixed(0)},${a.z.toFixed(0)} and ${b.x.toFixed(0)},${b.z.toFixed(0)}`);
      }
    }
  }
});


test("the indexed projection is the plain scan, field for field", () => {
  // Seeded, not random: the sim's law applies to its tests too. Points spread
  // over the district and beyond it, plus points ON each path, where a run's
  // box gap is zero and the skip must not fire early.
  let seed = 7;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let compared = 0;
  for (const street of DISTRICT_STREETS) {
    const samples: { x: number; z: number }[] = [];
    for (let i = 0; i < 60; i++) samples.push({ x: next() * 1200 - 600, z: next() * 1200 - 650 });
    for (const point of street.points) samples.push({ x: point.x + next() - 0.5, z: point.z + next() - 0.5 });
    for (const { x, z } of samples) {
      const fast = projectOntoPath(street.points, x, z), plain = projectOntoPathUnindexed(street.points, x, z);
      for (const key of ["along", "segmentIndex", "distance", "height", "pitch", "ux", "uz", "width"] as const) {
        assert.ok(Math.abs(fast[key] - plain[key]) <= 1e-9, `${street.id} ${key} at (${x.toFixed(1)}, ${z.toFixed(1)}): ${fast[key]} vs ${plain[key]}`);
      }
      compared++;
    }
  }
  assert.ok(compared > 4000, `only ${compared} projections compared`);
});

test("the nearest street is the nearest street, on the road and in open ground", () => {
  // Brute force over every street is the reference. Seeded points across the
  // whole terrain, most of them nowhere near a road: that is where the boxes
  // used to answer with whichever long street's box happened to hold the point.
  let seed = 11;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let offRoad = 0;
  for (let i = 0; i < 3000; i++) {
    const x = next() * 1400 - 700, z = next() * 1400 - 750;
    const fast = projectOntoDistrict(x, z);
    let plain: ReturnType<typeof projectOntoPathUnindexed> | undefined;
    for (const street of DISTRICT_STREETS) {
      const projected = projectOntoPathUnindexed(street.points, x, z);
      if (!plain || projected.distance < plain.distance) plain = projected;
    }
    assert.ok(Math.abs(fast.distance - plain!.distance) <= 1e-9,
      `at (${x.toFixed(0)}, ${z.toFixed(0)}) the district answered ${fast.distance.toFixed(2)} m, the nearest street is ${plain!.distance.toFixed(2)} m`);
    if (plain!.distance > 30) offRoad++;
  }
  assert.ok(offRoad > 1000, `only ${offRoad} points were in open ground`);
});
