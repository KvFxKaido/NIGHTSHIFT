import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALDER_BUILDING_FRONTS, ALDER_FRONTAGE_DOCUMENT as DOC, alderHeight } from "../src/sim/alder.ts";
import { pointFootprintDistance } from "../src/sim/building-footprint.ts";
import { parseFrontageDocument } from "../src/sim/frontage-document.ts";
import { addColdStorage, beaconPulse, COLD_STORAGE_ID, COLD_STORAGE_ROUND_SECONDS, forkliftPose } from "../src/render/cold-storage.ts";
import { updatePlaceActivity } from "../src/render/place-activity.ts";

const plan = ALDER_BUILDING_FRONTS.find(p => p.recipe.id === COLD_STORAGE_ID)!;
const worldPoints = (mesh: THREE.Mesh) => {
  mesh.updateWorldMatrix(true, false);
  const p = mesh.geometry.getAttribute("position"), points: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  return points;
};

test("the cold store is saved: hand-edited, locked against the generator, dock 01 open and the docks named", () => {
  assert.ok(plan, "the adopted building must keep its frontage (moving it in the editor changes its id)");
  const entry = DOC.entries.find(e => e.buildingId === COLD_STORAGE_ID)!;
  assert.equal(entry.locked, true); assert.equal(entry.edited, true);
  const shutters = plan.modules.filter(m => m.kind === "shutter");
  assert.deepEqual(shutters.map(m => m.open === true), [true, false]);
  assert.deepEqual(plan.modules.filter(m => m.kind === "sign" && /^0\d$/.test(m.text ?? "")).map(m => m.caption), ["CHILLED", "FROZEN"]);
});

test("an adopted place has a name of its own", () => {
  // It was ALDER COLD STORAGE, one of the generator's stock identities, painted on eight other buildings.
  const named = ALDER_BUILDING_FRONTS.filter(p => p.modules.some(m => m.text === "HOLGATE COLD STORE"));
  assert.deepEqual(named.map(p => p.recipe.id), [COLD_STORAGE_ID]);
});

test("only a shutter opens", () => {
  const raw = JSON.parse(JSON.stringify(DOC));
  const modules = raw.entries.find((e: { buildingId: string }) => e.buildingId === COLD_STORAGE_ID).plan.modules;
  const door = modules.find((m: { kind: string }) => m.kind === "door");
  door.open = true;
  assert.throws(() => parseFrontageDocument(raw), /Only a shutter opens/);
  delete door.open;
  modules.find((m: { kind: string; open?: boolean }) => m.kind === "shutter" && m.open).open = false;
  assert.throws(() => parseFrontageDocument(raw), /Only a shutter opens/);
});

test("the plant stands on the cold store's roof and nowhere else, drawn with no lights and a small budget", () => {
  const scene = new THREE.Scene(), group = addColdStorage(scene, plan, alderHeight);
  const roof = plan.block.base + plan.block.height;
  const plant = group.getObjectByName("cold-storage-plant") as THREE.Mesh;
  for (const p of worldPoints(plant)) {
    assert.ok(pointFootprintDistance(plan.block, p.x, p.z) === 0, `plant vertex off the roof at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
    assert.ok(p.y >= roof - 1e-4, `plant vertex below the roof at ${p.y}`);
  }
  // Set back from the street edge, so it reads as plant on a roof and not as a second storey on the wall.
  const face = plan.wallX + plan.block.x;
  assert.ok(Math.max(...worldPoints(plant).map(p => p.x)) < face - 1.2);
  let triangles = 0;
  group.traverse(o => {
    assert.ok(!(o instanceof THREE.Light), "a place must not add a dynamic light");
    if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
  });
  assert.ok(triangles < 2500, `${triangles} triangles`);
});

test("the forklift works inside dock 01's doorway through its whole round, and moves smoothly", () => {
  const scene = new THREE.Scene(), group = addColdStorage(scene, plan, alderHeight);
  const dock = plan.modules.find(m => m.kind === "shutter" && m.open)!;
  const body = group.getObjectByName("cold-storage-forklift-body") as THREE.Mesh;
  const wall = group.getObjectByName("cold-storage-wall")!;
  let last = forkliftPose(0);
  for (let tick = 0; tick <= COLD_STORAGE_ROUND_SECONDS * 60; tick++) {
    const seconds = tick / 60, pose = forkliftPose(seconds);
    assert.ok(Math.abs(pose.x - last.x) < .03, `the forklift jumped at ${seconds.toFixed(2)} s`);
    last = pose;
    if (tick % 6) continue;
    updatePlaceActivity(scene, seconds);
    wall.updateWorldMatrix(true, false);
    const inWall = new THREE.Matrix4().copy(wall.matrixWorld).invert();
    for (const p of worldPoints(body)) {
      const local = p.applyMatrix4(inWall);
      assert.ok(Math.abs(local.x - dock.x) <= (dock.width - .1) / 2, `forklift outside the doorway at ${seconds.toFixed(2)} s`);
      assert.ok(local.y >= -1e-6 && local.y <= dock.height - .5, `forklift under the rolled door (${local.y})`);
      assert.ok(local.z > .115 && local.z < .17, "in front of the racking and behind the door frame");
    }
  }
  assert.deepEqual(forkliftPose(COLD_STORAGE_ROUND_SECONDS), forkliftPose(0));
  const pulses = Array.from({ length: 600 }, (_, i) => beaconPulse(i / 60));
  assert.ok(Math.max(...pulses) > .99 && Math.min(...pulses) === 0, "the beacon flashes and goes dark");
});

test("building the city twice keeps one cold store activity", () => {
  const scene = new THREE.Scene();
  addColdStorage(scene, plan, alderHeight); addColdStorage(scene, plan, alderHeight);
  assert.equal((scene.userData.placeActivity as Map<string, unknown>).size, 1);
});
