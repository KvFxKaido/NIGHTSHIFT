import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { NodeIO } from "@gltf-transform/core";
import { WHARF_ARENA_MESH, WHARF_ARENA_PROXIES } from "../src/sim/wharf-arena.ts";
import { createAlderWorld, alderGround } from "../src/sim/alder.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { STADIUM_GATES, inStadium, stadiumGateAt } from "../src/sim/stadium.ts";
import { canChallenge } from "../src/sim/encounter.ts";
import * as THREE from "three";
import { YARD_STRUCTURES, GATE_STRUCTURES, SABLE_CITY, SABLE } from "../src/sim/drift-yard.ts";

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
  const doc = await new NodeIO().read("public/assets/wharf-arena/closed-shell.glb");
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

test("both city approaches reach their loading markers but cannot drive into the stadium", () => {
  for (const gate of STADIUM_GATES) {
    const { marker, leave } = gate.city;
    const heading = Math.atan2(leave.x - marker.x, leave.z - marker.z);
    const sim = createSim("rwd", createAlderWorld(true, { ...leave, heading }), { traffic: false, parkedRivals: [SABLE_CITY] });
    let reached = false;
    try {
      for (let tick = 0; tick < 600; tick++) {
        step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
        const car = sim.state.vehicle;
        reached ||= Math.hypot(car.x - marker.x, car.z - marker.z) < 3;
        assert.equal(inStadium(car.x, car.z), false, gate.id + ': drove through the closed city shell at tick ' + tick);
      }
      assert.ok(reached, gate.id + ': loading marker blocked by the shell');
      assert.equal(alderGround(marker.x, marker.z), false);
      assert.equal(stadiumGateAt('city', { ...marker, speed: 0 }, false)?.id, gate.id);
    } finally { sim.world.free(); }
  }
});

test("Sable's street challenge stays outside the shell and leaves room for the loading prompt", () => {
  assert.equal(inStadium(SABLE_CITY.start.x, SABLE_CITY.start.z), false);
  assert.equal(inStadium(SABLE.start.x, SABLE.start.z), true, 'the venue must keep its own Sable pose');
  assert.equal(alderGround(SABLE_CITY.start.x, SABLE_CITY.start.z), false);
  for (const gate of STADIUM_GATES) {
    assert.equal(canChallenge({ ...gate.city.marker, y: 2 }, SABLE_CITY.start, false), false,
      gate.id + ': rival card would hide the loading prompt');
  }
  const sim = createSim('rwd', createAlderWorld(true, { ...SABLE_CITY.start, z: SABLE_CITY.start.z + 20 }),
    { traffic: false, parkedRivals: [SABLE_CITY] });
  try {
    for (let tick = 0; tick < 180; tick++) step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
    const rival = sim.state.parkedRivals[0]!.vehicle;
    assert.ok(Math.hypot(rival.x - SABLE_CITY.start.x, rival.z - SABLE_CITY.start.z) < .1, 'Sable intersects a solid');
    assert.equal(canChallenge(sim.state.vehicle, rival, false), true);
  } finally { sim.world.free(); }
});
