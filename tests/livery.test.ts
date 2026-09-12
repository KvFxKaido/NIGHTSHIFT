import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BLENDER_CARS, createBlenderCar } from "../src/render/blender-car.ts";
import { deriveZones, liverySurface, projectedLayer } from "../src/render/livery.ts";
import { copyLivery, decodeLivery, defaultLivery, LiveryHistory, MAX_LAYERS, newLayer, PANELS } from "../src/customization/livery.ts";
import type { CarView } from "../src/render/car.ts";

test("livery persistence round-trips layered designs and rejects damaged or oversized data", () => {
  const design=defaultLivery();design.enabled=true;
  design.layers.push(newLayer(design,'number','left'));
  const encode=(d: unknown)=>JSON.stringify({version:1,design:d});
  assert.deepEqual(decodeLivery(encode(design)).design,design);
  for(const d of [{...design,base:'red'}, {...design,finish:'unknown'}, {...design,layers:Array(MAX_LAYERS+1).fill(design.layers[0])},
    {...design,layers:[{...design.layers[0],scale:99}]}, {...design,layers:[{...design.layers[0],text:'<script>'}]},
    {...design,layers:[design.layers[0],design.layers[0]]}]) assert.equal(decodeLivery(encode(d)).recovered,true);
  assert.equal(decodeLivery('{').recovered,true);
  assert.equal(decodeLivery(null).recovered,false);
});

test("undo restores deletion, panel placement and order; a new edit invalidates redo", () => {
  const history=new LiveryHistory(defaultLivery());
  const first=copyLivery(history.current);first.enabled=true;first.layers.push(newLayer(first,'stripe','hood'));history.commit(first);
  const second=copyLivery(history.current);second.layers.push(newLayer(second,'number','left'));history.commit(second);
  const third=copyLivery(history.current);third.layers.reverse();third.layers[0]!.rotation=45;history.commit(third);
  history.undo();assert.deepEqual(history.current,second);
  history.redo();assert.deepEqual(history.current,third);
  history.commit({...copyLivery(third),layers:[]});history.undo();assert.deepEqual(history.current,third);
  history.undo();history.commit({...copyLivery(history.current),base:'#59d8ff'});assert.equal(history.canRedo,false);
  assert.equal(first.layers.length,1,'history does not mutate caller snapshots');
});

const loaded = new Map<string, CarView>();
async function body(id: keyof typeof BLENDER_CARS): Promise<CarView> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const spec = BLENDER_CARS[id];
  const bytes = await readFile(new URL(`../public/${spec.path}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const car = createBlenderCar(gltf.scene, spec.root, spec.model);
  loaded.set(id, car);
  return car;
}

// The five boxes the editor shipped with, measured by hand against the NS-01.
// Deriving them is only worth doing if it reproduces them, so they stay here as
// the oracle: whatever the derivation computes has to land on the car Codex
// actually measured. Worst observed error is 0.12 m of centre and 0.03 m of
// size, which is inside the thickness of the decal box.
const HAND_MEASURED = {
  hood: { center: [0, .96, -1.5], size: [1.7, 1.25] },
  roof: { center: [0, 1.42, .15], size: [1.25, 1] },
  left: { center: [-1.02, .68, 0], size: [1.85, .56] },
  right: { center: [1.02, .68, 0], size: [1.85, .56] },
  rear: { center: [0, .65, 2.24], size: [1.65, .36] },
} as const;

test("derived zones reproduce the hand-measured NS-01 table", async () => {
  const zones = deriveZones(await body("blender"));
  for (const panel of PANELS) {
    const want = HAND_MEASURED[panel];
    for (let i = 0; i < 3; i++) {
      const off = Math.abs(zones[panel].center[i]! - want.center[i]!);
      assert.ok(off <= .15, `${panel} centre[${i}] drifted ${off.toFixed(3)} m from the measured table`);
    }
    for (let i = 0; i < 2; i++) {
      const off = Math.abs(zones[panel].size[i]! - want.size[i]!);
      assert.ok(off <= .06, `${panel} size[${i}] drifted ${off.toFixed(3)} m from the measured table`);
    }
  }
});

// The point of deriving them: a body nobody measured still gets usable panels.
test("every body derives zones inside itself, roof above hood and doors mirrored", async () => {
  for (const id of Object.keys(BLENDER_CARS) as (keyof typeof BLENDER_CARS)[]) {
    const car = await body(id);
    const zones = deriveZones(car);
    const box = new THREE.Box3().setFromObject(car.bodyShell);
    assert.ok(zones.roof.center[1] > zones.hood.center[1] + .05, `${id}: roof is not above the hood`);
    assert.ok(zones.hood.center[2] < zones.roof.center[2], `${id}: hood is not ahead of the roof`);
    // Not bit-exact: the Bulwark's box is symmetric to six decimals and its
    // flanks still sum to 1.19e-7, which is float round-trip noise out of the
    // GLB rather than a lopsided car.
    assert.ok(Math.abs(zones.left.center[0] + zones.right.center[0]) < 1e-6, `${id}: doors are not mirrored`);
    assert.ok(zones.rear.center[2] > zones.roof.center[2], `${id}: rear is not behind the roof`);
    for (const panel of PANELS) {
      const zone = zones[panel];
      assert.ok(zone.size.every(v => v > .1), `${id} ${panel}: zone collapsed to ${zone.size.join()}`);
      assert.ok(box.containsPoint(new THREE.Vector3(...zone.center)), `${id} ${panel}: centre outside the body`);
    }
  }
});

// The behaviour the zones exist for. A decal has to land on painted triangles
// near where its zone put it -- projecting onto the far side of the car is the
// failure the NS-01-only guard used to prevent by refusing to run at all.
test("graphics land on paint near their zone, on every body, doors on their own side", async () => {
  for (const id of ["blender", "cinder", "bulwark"] as const) {
    const car = await body(id);
    const zones = deriveZones(car);
    for (const panel of PANELS) {
      const surface = liverySurface(car, panel);
      const geometry = projectedLayer(surface, newLayer(defaultLivery(), 'number', panel), zones);
      geometry.computeBoundingBox();
      assert.ok(geometry.getAttribute('position').count > 0, `${id} ${panel}: no painted triangles under the decal`);
      const bounds = geometry.boundingBox!;
      const middle = bounds.getCenter(new THREE.Vector3());
      const zone = zones[panel];
      const reach = Math.max(...zone.size) + .35;
      assert.ok(middle.distanceTo(new THREE.Vector3(...zone.center)) < reach,
        `${id} ${panel}: decal landed ${middle.distanceTo(new THREE.Vector3(...zone.center)).toFixed(2)} m from its zone`);
      if (panel === 'left') assert.ok(bounds.max.x < 0, `${id}: left door crossed the centreline`);
      if (panel === 'right') assert.ok(bounds.min.x > 0, `${id}: right door crossed the centreline`);
      geometry.dispose(); surface.dispose();
    }
  }
});
