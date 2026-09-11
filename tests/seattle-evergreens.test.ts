import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { createEvergreens, EVERGREEN_GROVES, evergreenPassage } from "../src/sim/seattle-evergreens.ts";
import { SEATTLE_EVERGREENS, SEATTLE_STREETS, SEATTLE_BLOCKS, createSeattleWorld, seattleHeight } from "../src/sim/seattle.ts";
import { blockCorners, segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { addEvergreens } from "../src/render/evergreens.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { hasContact, NEUTRAL } from "./helpers/handling.ts";

test("groves occupy open parcels while every road, alley and building keeps canopy clearance", () => {
  assert.ok(SEATTLE_EVERGREENS.length > 3000 && SEATTLE_EVERGREENS.length < 6000);
  assert.equal(new Set(SEATTLE_EVERGREENS.map(t => t.id)).size, SEATTLE_EVERGREENS.length);
  const solids = new Set(createSeattleWorld().solids);
  for (const grove of EVERGREEN_GROVES) assert.ok(SEATTLE_EVERGREENS.filter(t => t.grove === grove.id).length > 100);
  const segments = SEATTLE_STREETS.flatMap(s => s.points.slice(1).map((b, i) => ({ a: s.points[i]!, b })));
  for (const tree of SEATTLE_EVERGREENS) {
    const p = tree.trunk;
    assert.ok(solids.has(p), `${tree.id}: no physical trunk`);
    assert.ok(!evergreenPassage(p.x, p.z), `${tree.id}: blocks reserved passage`);
    for (const corner of blockCorners(p)) assert.ok(p.base <= seattleHeight(corner.x, corner.z), `${tree.id}: floating foot`);
    for (const { a, b } of segments) {
      // Independent footprint/segment query, without the placement spatial index.
      const point = { ...p, width: 0, depth: 0 };
      assert.ok(segmentFootprintDistance(point, a, b) >= Math.max(a.width, b.width) / 2 + tree.radius + 5 - 1e-6,
        `${tree.id}: canopy infringes road clearance`);
    }
    for (const block of SEATTLE_BLOCKS) {
      assert.ok(segmentFootprintDistance(block, p, p) >= tree.radius + 2 - 1e-6, `${tree.id}: canopy clips building`);
    }
  }
});

test("placement is repeatable and a newly authored building displaces trees", () => {
  const initial = createEvergreens([], [], () => 0);
  assert.deepEqual(createEvergreens([], [], () => 0), initial);
  const at = initial.find(t => t.grove === "union-commons")!.trunk;
  const building = { ...at, width: 40, depth: 30, rotation: .7 };
  const replanted = createEvergreens([], [building], () => 0);
  assert.ok(replanted.length < initial.length);
  assert.ok(!replanted.some(t => t.id === initial.find(t => t.trunk === at)!.id));
  for (const tree of replanted) assert.ok(segmentFootprintDistance(building, tree.trunk, tree.trunk) >= tree.radius + 2 - 1e-6);
});

test("geographic render batches use exactly the shared trunk poses", () => {
  const scene = new THREE.Scene();
  addEvergreens(scene, SEATTLE_EVERGREENS, false);
  const group = scene.getObjectByName("seattle-evergreens")!;
  let trunks = 0, crowns = 0;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  for (const child of group.children) {
    const mesh = child as THREE.InstancedMesh;
    assert.ok(mesh.boundingSphere && mesh.boundingBox);
    if (mesh.name.startsWith("evergreen-crowns:")) { crowns += mesh.count; continue; }
    trunks += mesh.count;
    const key = mesh.name.split(":")[1];
    const batch = SEATTLE_EVERGREENS.filter(t => `${Math.floor(t.trunk.x / 256)},${Math.floor(t.trunk.z / 256)}` === key);
    assert.equal(mesh.count, batch.length);
    batch.forEach((tree, i) => {
      mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      const t = tree.trunk;
      assert.ok(position.distanceTo(new THREE.Vector3(t.x, t.base + t.height / 2, t.z)) < .0003);
      assert.ok(scale.distanceTo(new THREE.Vector3(t.width, t.height, t.depth)) < .00001);
    });
  }
  assert.equal(trunks, SEATTLE_EVERGREENS.length);
  assert.equal(crowns, trunks);
  // Each batch shares geometry/materials; dispose each resource once.
  const meshes = group.children as THREE.InstancedMesh[];
  new Set(meshes.map(m => m.geometry)).forEach(g => g.dispose());
  new Set(meshes.flatMap(m => Array.isArray(m.material) ? m.material : [m.material])).forEach(m => m.dispose());
});

await RAPIER.init();
test("driving into a shared trunk stops the car; removing it allows the same shortcut", () => {
  const trunk = SEATTLE_EVERGREENS.find(t => t.grove === "union-commons")!.trunk;
  const baseWorld = createSeattleWorld();
  const flat = { ...baseWorld.project(trunk.x, trunk.z), height: trunk.base, pitch: 0, distance: 0 };
  function drive(blocked: boolean) {
    const sim = createSim("fwd", { id: "evergreen-collision-fixture", walls: [], solids: blocked ? [trunk] : [],
      start: { x: trunk.x - 15, z: trunk.z, y: trunk.base, heading: -Math.PI / 2, pitch: 0 },
      project: () => flat, surface: () => flat }, { traffic: false });
    try {
      sim.body.setLinvel({ x: 18, y: 0, z: 0 }, true);
      let contact = false;
      for (let tick = 0; tick < 120; tick++) { step(sim, { ...NEUTRAL, throttle: 1 }); contact ||= hasContact(sim); }
      return { x: sim.state.vehicle.x, contact };
    } finally { sim.world.free(); }
  }
  const blocked = drive(true), clear = drive(false);
  assert.ok(blocked.contact, "the rendered trunk must register contact");
  assert.ok(blocked.x < trunk.x - 2, "car passed through the tree");
  assert.ok(clear.x > trunk.x + 15, "control run must cross the trunk's location");
});
