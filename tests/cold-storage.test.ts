import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALDER_BUILDING_FRONTS, ALDER_FRONTAGE_DOCUMENT as DOC, alderHeight } from "../src/sim/alder.ts";
import { pointFootprintDistance } from "../src/sim/building-footprint.ts";
import { OPEN_DOCK_HEIGHT, parseFrontageDocument } from "../src/sim/frontage-document.ts";
import { openDockParts } from "../src/render/building-fronts.ts";
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

test("the forklift works inside dock 01's doorway through its whole round, and nothing drawn of it jumps a tick", () => {
  const scene = new THREE.Scene(), group = addColdStorage(scene, plan, alderHeight);
  const dock = plan.modules.find(m => m.kind === "shutter" && m.open)!;
  const views = ["cold-storage-forklift-body", "cold-storage-forklift-end"].map(name => group.getObjectByName(name) as THREE.Mesh | undefined).filter((m): m is THREE.Mesh => !!m);
  const beacon = group.getObjectByName("cold-storage-beacon")!;
  const wall = group.getObjectByName("cold-storage-wall")!;
  // Every vertex it draws, in the wall's frame; a view that is hidden draws nothing and is left out.
  const drawn = () => {
    wall.updateWorldMatrix(true, true);
    const inWall = new THREE.Matrix4().copy(wall.matrixWorld).invert();
    return views.map(mesh => mesh.visible ? worldPoints(mesh).map(p => p.applyMatrix4(inWall)) : null);
  };
  let last = drawn(), lastBeacon = beacon.getWorldPosition(new THREE.Vector3());
  for (let tick = 0; tick <= COLD_STORAGE_ROUND_SECONDS * 60; tick++) {
    const seconds = tick / 60;
    updatePlaceActivity(scene, seconds);
    const now = drawn(), at = beacon.getWorldPosition(new THREE.Vector3());
    // Driving moves it 2 cm a tick and a turn 7 cm at the fork tips. Mirroring the side view at 0.45 of its length,
    // as the first version did, fails here: body jumped 0.45 m at 5.40 s, mid-turn.
    now.forEach((points, view) => points && last[view] && points.forEach((p, i) =>
      assert.ok(p.distanceTo(last[view]![i]!) < .1, `${views[view]!.name} jumped ${p.distanceTo(last[view]![i]!).toFixed(2)} m at ${seconds.toFixed(2)} s`)));
    assert.ok(at.distanceTo(lastBeacon) < .1, `the beacon jumped at ${seconds.toFixed(2)} s`);
    last = now; lastBeacon = at;
    for (const local of now.flatMap(points => points ?? [])) {
      assert.ok(Math.abs(local.x - dock.x) <= (dock.width - .1) / 2, `forklift outside the doorway at ${seconds.toFixed(2)} s`);
      assert.ok(local.y >= -1e-6 && local.y <= dock.height - .5, `forklift under the rolled door (${local.y})`);
      assert.ok(local.z > .115 && local.z < .17, "in front of the racking and behind the door frame");
    }
  }
  assert.ok(Array.from({ length: 721 }, (_, i) => forkliftPose(i / 60)).some(p => p.endOn > .99), "a turn shows the truck end on");
  assert.deepEqual(forkliftPose(COLD_STORAGE_ROUND_SECONDS), forkliftPose(0));
  const pulses = Array.from({ length: 600 }, (_, i) => beaconPulse(i / 60));
  assert.ok(Math.max(...pulses) > .99 && Math.min(...pulses) === 0, "the beacon flashes and goes dark");
});

test("an open dock's inside stays within its opening at any height a dock may open at", () => {
  // The generator's shutters are 4.3 m (freight) and 3.6 m (workshop bays); racking laid out for 4.3 at fixed heights
  // put the upper pallets of a 3.6 m bay above its light, and a 0.9 m one built boxes of negative height.
  for (const h of [OPEN_DOCK_HEIGHT, 3.6, 4.3, 6, 10]) for (const w of [2, 5.8]) {
    const y = h / 2, parts = openDockParts(0, y, w, h), top = y + h / 2 - .47, bottom = y - h / 2;
    assert.ok(parts.length > 10);
    for (const p of parts) {
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0, `a part of no size at ${h} m`);
      assert.ok(Math.abs(p.x) + p.w / 2 <= w / 2 + 1e-9, `a part past the jambs of a ${w} m dock`);
      assert.ok(p.y - p.h / 2 >= bottom - 1e-9 && p.y + p.h / 2 <= top + 1e-9, `a part outside the lit inside of a ${h} m dock`);
    }
  }
  const raw = JSON.parse(JSON.stringify(DOC));
  const dock = raw.entries.find((e: { buildingId: string }) => e.buildingId === COLD_STORAGE_ID).plan.modules
    .find((m: { kind: string; open?: boolean }) => m.kind === "shutter" && m.open);
  Object.assign(dock, { height: OPEN_DOCK_HEIGHT - .1, y: (OPEN_DOCK_HEIGHT - .1) / 2 });
  assert.throws(() => parseFrontageDocument(raw), /An open dock needs 2.4 metres/);
  Object.assign(dock, { height: 3.6, y: 1.8 });
  assert.doesNotThrow(() => parseFrontageDocument(raw));
});

test("building the city twice keeps one cold store activity", () => {
  const scene = new THREE.Scene();
  addColdStorage(scene, plan, alderHeight); addColdStorage(scene, plan, alderHeight);
  assert.equal((scene.userData.placeActivity as Map<string, unknown>).size, 1);
});
