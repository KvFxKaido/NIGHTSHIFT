import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addDistrict } from "../src/render/district.ts";
import { DISTRICT_APRONS, DISTRICT_JUNCTIONS, DISTRICT_STREETS, RIBBON_COLUMNS, districtSurfaceAt, districtSurfaceHeight, pathLength, pathPointAt, projectOntoDistrict,
  projectOntoPath } from "../src/sim/district.ts";

// One surface per junction. Inside 18 of 35 junction aprons two road ribbons
// used to overlap at different heights — 1.07 m at Lower Hill — and the car
// rode whichever street was nearest, which flips at the bisector. Now the sim
// blends every street's claim on a point, each ribbon stops where its overlap
// with the other arms ends, and one mesh per junction fills the rest.

const streetOf = (id: string) => DISTRICT_STREETS.find(street => street.id === id)!;

test("overlapping grading discs do not switch heights at a disc boundary", () => {
  let overlaps = 0;
  for (const junction of DISTRICT_JUNCTIONS) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.025) {
      const x = junction.point.x + Math.cos(angle) * 28, z = junction.point.z + Math.sin(angle) * 28;
      if (!DISTRICT_JUNCTIONS.some(other => other !== junction && Math.hypot(x - other.point.x, z - other.point.z) < 27)) continue;
      const before = districtSurfaceHeight(x - Math.cos(angle) * 0.001, z - Math.sin(angle) * 0.001, 7);
      const after = districtSurfaceHeight(x + Math.cos(angle) * 0.001, z + Math.sin(angle) * 0.001, 7);
      assert.ok(Math.abs(after - before) < 0.005, `${junction.id}: grading-disc edge steps ${Math.abs(after - before)} m`);
      overlaps++;
    }
  }
  assert.ok(overlaps > 100, `only ${overlaps} overlapping-disc boundary probes`);
});

test("the graded hairpin does not jump when its nearest centreline segment flips", t => {
  const street = streetOf("ring-hotel");
  let worst = 0, legacyWorst = 0, probes = 0;
  // Scan across the inside kerb in 2 cm steps. The old centreline-foot
  // projection changes segment here; this must test that actual failure.
  for (let z = -191; z <= -182; z += 0.25) {
    for (let x = -250; x <= -240; x += 0.02) {
      const a = projectOntoPath(street.points, x, z), b = projectOntoPath(street.points, x + 0.02, z);
      if (a.distance > a.width / 2 - 0.1 || b.distance > b.width / 2 - 0.1) continue;
      worst = Math.max(worst, Math.abs(districtSurfaceAt(x + 0.02, z) - districtSurfaceAt(x, z)));
      legacyWorst = Math.max(legacyWorst, Math.abs(districtSurfaceHeight(x + 0.02, z, b.height) -
        districtSurfaceHeight(x, z, a.height)));
      probes++;
    }
  }
  t.diagnostic(`${probes} hairpin probes; largest 2 cm step ${worst.toFixed(4)} m; old projection ${legacyWorst.toFixed(4)} m`);
  assert.ok(probes > 10000);
  assert.ok(legacyWorst > 0.35, "the scan no longer reaches the original segment-flip defect");
  assert.ok(worst < 0.03, `hairpin height jumps ${worst.toFixed(4)} m in 2 cm`);
});

test("past its cut, a ribbon overlaps no other arm of its junction", () => {
  for (const apron of DISTRICT_APRONS) {
    for (const arm of apron.arms) {
      const street = streetOf(arm.street);
      const out = arm.reversed ? [...street.points].reverse() : street.points;
      const others = apron.arms.filter(other => other !== arm).map(other => streetOf(other.street));
      assert.equal(arm.section.length, RIBBON_COLUMNS);
      assert.ok(arm.cut > 0 && arm.cut < pathLength(out) / 2, `${apron.id}: ${arm.street} cut at ${arm.cut} m`);
      for (let along = arm.cut; along < Math.min(pathLength(out), arm.cut + 40); along += 1) {
        const at = pathPointAt(out, along);
        const nx = -at.uz, nz = at.ux;
        for (let column = 0; column < RIBBON_COLUMNS; column++) {
          const side = 1 - column / (RIBBON_COLUMNS - 1) * 2;
          const x = at.x + nx * at.width / 2 * side, z = at.z + nz * at.width / 2 * side;
          for (const other of others) {
            const on = projectOntoPath(other.points, x, z);
            assert.ok(on.distance > on.width / 2,
              `${apron.id}: ${arm.street} at ${along} m, past its cut at ${arm.cut.toFixed(1)} m, is inside ${other.id}`);
          }
        }
      }
    }
  }
});

test("the driven surface is continuous across every apron", () => {
  // A 1 m grid over each apron. Every step between covered neighbours is a
  // grade, never a kerb: the roads' own steepest metre is 0.114 m, and the
  // blend's ramps reach 0.30 m where two streets disagree by a metre at the far
  // end of their overlap. The nearest-street surface stepped 1.07 m.
  let worst = 0, where = "";
  for (const apron of DISTRICT_APRONS) {
    const reach = apron.radius + 6;
    const heights = new Map<string, number>();
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        if (Math.hypot(dx, dz) > reach) continue;
        const surface = projectOntoDistrict(apron.x + dx, apron.z + dz);
        if (surface.distance > surface.width / 2) continue;
        heights.set(`${dx},${dz}`, surface.height);
      }
    }
    for (const [key, height] of heights) {
      const [dx, dz] = key.split(",").map(Number) as [number, number];
      for (const neighbour of [`${dx + 1},${dz}`, `${dx},${dz + 1}`]) {
        const other = heights.get(neighbour);
        if (other === undefined) continue;
        const step = Math.abs(other - height);
        if (step > worst) { worst = step; where = `${apron.id} at (${(apron.x + dx).toFixed(0)}, ${(apron.z + dz).toFixed(0)})`; }
      }
    }
  }
  assert.ok(worst < 0.35, `the surface steps ${worst.toFixed(3)} m over one metre at ${where}`);
});

test("every point of carriageway is drawn once, on the driven surface", t => {
  // Rays down through the road meshes alone. One hit: no ribbon under another
  // and no hole at a seam. At the driven height: the mesh is the sim's surface.
  const scene = new THREE.Scene();
  addDistrict(scene, null, undefined, "blockout");
  const roads: THREE.Mesh[] = [];
  scene.traverse(object => {
    if (object instanceof THREE.Mesh && /^district-(road|apron)-/.test(object.name)) roads.push(object);
  });
  assert.ok(roads.some(road => road.name.startsWith("district-apron-")), "no apron meshes");
  for (const road of roads) { road.geometry.computeBoundingBox(); road.updateMatrixWorld(true); }
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const deviations: { off: number; label: string }[] = [];
  const probe = (x: number, z: number, label: string) => {
    const candidates = roads.filter(road => {
      const box = road.geometry.boundingBox!;
      return x >= box.min.x - 0.5 && x <= box.max.x + 0.5 && z >= box.min.z - 0.5 && z <= box.max.z + 0.5;
    });
    origin.set(x, 200, z);
    raycaster.set(origin, down);
    const hits = raycaster.intersectObjects(candidates, false);
    // Coincident interiors are still two ribbons, even at identical height.
    // Only shared triangle edges may legitimately produce duplicate hits.
    const interior = hits.filter(hit => {
      const positions = (hit.object as THREE.Mesh).geometry.getAttribute("position"), face = hit.face!;
      const triangle = new THREE.Triangle(...[face.a, face.b, face.c].map(index =>
        new THREE.Vector3().fromBufferAttribute(positions, index)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
      const barycentric = triangle.getBarycoord(hit.point, new THREE.Vector3());
      return barycentric && Math.min(barycentric.x, barycentric.y, barycentric.z) > 1e-4;
    });
    assert.ok(interior.length <= 1, `${label}: ${interior.length} overlapping triangle interiors at (${x}, ${z}): ${interior.map(hit => hit.object.name).join(", ")}`);
    // A seam reports its shared edge from both triangles: one surface.
    const surfaces = hits.filter((hit, i) => i === 0 || Math.abs(hit.point.y - hits[i - 1]!.point.y) > 0.002);
    assert.equal(surfaces.length, 1, `${label}: ${surfaces.length} road surfaces at (${x.toFixed(1)}, ${z.toFixed(1)}) — ${
      surfaces.map(hit => `${hit.object.name} at ${hit.point.y.toFixed(2)}`).join(", ") || "none"}`);
    const expected = projectOntoDistrict(x, z).height + 0.04;
    deviations.push({ off: Math.abs(surfaces[0]!.point.y - expected), label: `${label}: ${surfaces[0]!.object.name} (${x}, ${z})` });
  };
  for (const street of DISTRICT_STREETS) {
    const length = pathLength(street.points);
    for (let along = 3; along < length - 3; along += 5) {
      const at = pathPointAt(street.points, along);
      for (const side of [-0.8, -0.4, 0, 0.4, 0.8]) {
        probe(at.x - at.uz * at.width / 2 * side, at.z + at.ux * at.width / 2 * side, `${street.id} at ${along} m, side ${side}`);
      }
    }
  }
  for (const apron of DISTRICT_APRONS) {
    for (const arm of apron.arms) {
      const street = streetOf(arm.street);
      const points = arm.reversed ? [...street.points].reverse() : street.points;
      const direction = pathPointAt(points, arm.cut);
      for (let i = 1; i < arm.section.length; i++) {
        const a = arm.section[i - 1]!, b = arm.section[i]!;
        for (const fraction of [0.25, 0.5, 0.75]) for (const offset of [-0.05, 0, 0.05]) {
          probe(a.x + (b.x - a.x) * fraction + direction.ux * offset,
            a.z + (b.z - a.z) * fraction + direction.uz * offset, `${apron.id}/${arm.street} seam (${offset} m)`);
        }
      }
    }
    const reach = apron.radius + 4;
    for (let dx = -reach; dx <= reach; dx += 2) {
      for (let dz = -reach; dz <= reach; dz += 2) {
        const x = apron.x + dx, z = apron.z + dz;
        const owner = projectOntoDistrict(x, z);
        if (owner.distance > owner.width / 2 - 0.3) continue;
        probe(x, z, `${apron.id} apron`);
      }
    }
  }
  assert.ok(deviations.length > 3000, `only ${deviations.length} probes`);
  // The remaining deviation is interpolation of the curved junction blend
  // across flat mesh facets; graded bends blend nearby segment heights continuously.
  deviations.sort((a, b) => a.off - b.off);
  const p99 = deviations[Math.floor(deviations.length * 0.99)]!, worst = deviations[deviations.length - 1]!;
  assert.ok(p99.off < 0.05, `99% of the road is within ${p99.off.toFixed(3)} m of the surface (${p99.label})`);
  t.diagnostic(`${deviations.length} probes; p99 ${p99.off.toFixed(4)} m; max ${worst.off.toFixed(4)} m (${worst.label})`);
  assert.ok(worst.off < 0.05, `the road is ${worst.off.toFixed(3)} m off the surface at ${worst.label}`);
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

