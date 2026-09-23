import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { NodeIO } from "@gltf-transform/core";
import { WHARF_ARENA_MESH, WHARF_ARENA_PROXIES } from "../src/sim/wharf-arena.ts";
import { createAlderWorld, alderGround } from "../src/sim/alder.ts";
import { createSim, step } from "../src/sim/sim.ts";
import * as THREE from "three";
import { YARD_STRUCTURES, GATE_STRUCTURES } from "../src/sim/drift-yard.ts";

await RAPIER.init();

test("yard buildings, containers and lights do not clip the shell", () => {
  const { vertices, indices } = WHARF_ARENA_MESH;
  for (const s of [...YARD_STRUCTURES, ...GATE_STRUCTURES]) {
    const box = new THREE.Box3(new THREE.Vector3(s.x - s.width / 2, s.base, s.z - s.depth / 2),
      new THREE.Vector3(s.x + s.width / 2, s.base + s.height, s.z + s.depth / 2));
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map(v => new THREE.Vector3().fromArray(vertices, v * 3));
      assert.ok(!box.intersectsTriangle(new THREE.Triangle(a!, b!, c!)), `${s.id} clips shell triangle ${i / 3}`);
    }
  }
});

test("the shipping mesh and physics bake contain the same triangles", async () => {
  const doc = await new NodeIO().read("public/assets/wharf-arena/shell.glb");
  const key = (vertices: number[][]) => vertices.map(v => v.map(n => n.toFixed(3)).join(",")).sort().join(";");
  const physics = new Map<string, number>(), visual = new Map<string, number>();
  const add = (map: Map<string, number>, k: string) => map.set(k, (map.get(k) ?? 0) + 1);
  const { vertices, indices } = WHARF_ARENA_MESH;
  for (let i = 0; i < indices.length; i += 3)
    add(physics, key(indices.slice(i, i + 3).map(v => Array.from(new Float32Array(vertices.slice(v * 3, v * 3 + 3))))));
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const p = primitive.getAttribute("POSITION")!, index = primitive.getIndices()!;
    for (let i = 0; i < index.getCount(); i += 3)
      add(visual, key([0, 1, 2].map(j => p.getElement(index.getScalar(i + j), []))));
  }
  assert.deepEqual(visual, physics);
  assert.ok(indices.length / 3 < 5000, "shell exceeds its triangle budget");
  assert.ok(WHARF_ARENA_PROXIES.every(p => p.collision === false));
});

test("both arena entrances pass real cars; the uncut perimeter stops one", () => {
  // Drive through each portal, not just through the old posts outside it.
  for (const start of [
    { x: -560, z: 795, heading: Math.PI, targetZ: 965 },
    { x: -65, z: 920, heading: Math.PI / 2 + .52, targetZ: 990 },
  ]) {
    const sim = createSim("rwd", createAlderWorld(true, { ...start, y: 2, pitch: 0 }), { traffic: false });
    try {
      for (let tick = 0; tick < 550; tick++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      assert.ok(sim.state.vehicle.z > start.targetZ, `entrance blocked at ${sim.state.vehicle.x}, ${sim.state.vehicle.z}`);
      assert.equal(alderGround(sim.state.vehicle.x, sim.state.vehicle.z), false);
    } finally { sim.world.free(); }
  }
  const sim = createSim("rwd", createAlderWorld(true, { x: -730, z: 1090, y: 2, heading: Math.PI, pitch: 0 }), { traffic: false });
  try {
    for (let tick = 0; tick < 500; tick++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    assert.ok(sim.state.vehicle.z < 1170, "car passed through the southern wall");
    assert.ok(sim.state.vehicle.z > 1110, "car did not reach the wall");
  } finally { sim.world.free(); }
});
