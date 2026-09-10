import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildingId, parseBuildingLayout, layoutFingerprint } from "../src/sim/building-layout.ts";
import { GENERATED_SEATTLE_BLOCKS, SEATTLE_LAYOUT_BASELINE, SEATTLE_BLOCKS, GARAGE_PLOT_ID,
  resolveSeattleLayout, SEATTLE_STREETS, createSeattleWorld } from "../src/sim/seattle.ts";
import { importEditorScene, layoutFromPlacements, placementFromMesh, placeBuilding, exportEditorScene } from "../src/editor/exchange.ts";
import { createSim } from "../src/sim/sim.ts";

function sceneForExport(): THREE.Scene {
  const scene = new THREE.Scene(); scene.userData.nightshiftBaseline = SEATTLE_LAYOUT_BASELINE;
  for (const block of GENERATED_SEATTLE_BLOCKS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData.nightshiftBuildingId = buildingId(block); placeBuilding(mesh, block); scene.add(mesh);
  }
  return scene;
}
const source = GENERATED_SEATTLE_BLOCKS.find(block => buildingId(block) !== GARAGE_PLOT_ID)!;
const edited = { ...source, id: buildingId(source), height: source.height + 2 };
const layout = () => ({ schema: 1, baseline: SEATTLE_LAYOUT_BASELINE, buildings: [edited] });

test("unchanged footprints survive the actual Three.js scene JSON round trip", () => {
  const scene = sceneForExport();
  assert.deepEqual(importEditorScene(JSON.parse(JSON.stringify(exportEditorScene(scene)))).buildings, []);
  const objectLoaderScene = new THREE.ObjectLoader().parse(exportEditorScene(scene));
  assert.deepEqual(importEditorScene(objectLoaderScene.toJSON()).buildings, []);
});

test("visual scale and yaw become shared solid dimensions with the correct handedness", async () => {
  await RAPIER.init();
  const scene = sceneForExport(), mesh = scene.children[0]!;
  mesh.scale.y += 2; mesh.updateMatrix();
  const imported = importEditorScene(scene.toJSON());
  const resolved = resolveSeattleLayout(imported);
  assert.deepEqual(resolved.issues, []);
  const block = resolved.blocks[0]!;
  const sim = createSim("fwd", { ...createSeattleWorld(), solids: resolved.blocks }, { traffic: false });
  try {
    sim.world.step();
    let hit = false;
    sim.world.intersectionsWithPoint({ x: block.x, y: block.base + block.height - 0.1, z: block.z }, collider => {
      if (Math.abs(collider.translation().x - block.x) < 1e-3) hit = true;
      return true;
    });
    assert.ok(hit, "authored height did not reach the physics collider");
    assert.equal(block.height, GENERATED_SEATTLE_BLOCKS[0]!.height + 2);
    assert.ok(Math.abs(block.rotation + mesh.rotation.y) < 1e-6);
  } finally { sim.world.free(); }
});

test("invalid and stale imports cannot silently replace the layout", () => {
  assert.throws(() => parseBuildingLayout({ ...layout(), buildings: [edited, edited] }), /duplicate/);
  assert.throws(() => parseBuildingLayout({ ...layout(), buildings: [{ ...edited, x: NaN }] }), /x must/);
  assert.throws(() => resolveSeattleLayout({ ...layout(), baseline: "old" }), /district changed/);
  assert.throws(() => resolveSeattleLayout({ ...layout(), buildings: [{ ...edited, id: GARAGE_PLOT_ID }] }), /Garage is fixed/);
  assert.throws(() => resolveSeattleLayout({ ...layout(), buildings: [{ ...edited, id: "missing" }] }), /Unknown/);
  const scene = sceneForExport(); scene.children[0]!.rotation.x = 0.2; scene.updateMatrixWorld(true);
  assert.throws(() => importEditorScene(scene.toJSON()), /upright/);
  scene.remove(scene.children[0]!);
  assert.throws(() => importEditorScene(scene.toJSON()), /missing/);
});

test("road and neighbouring-building overlaps are reported before save", () => {
  const point = SEATTLE_STREETS[0]!.points[0]!;
  const inRoad = resolveSeattleLayout({ ...layout(), buildings: [{ ...edited, x: point.x, z: point.z }] });
  assert.ok(inRoad.issues.some(issue => /road|street/.test(issue)));
  const neighbour = GENERATED_SEATTLE_BLOCKS[1]!;
  const inNeighbour = resolveSeattleLayout({ ...layout(), buildings: [{ ...edited, x: neighbour.x, z: neighbour.z }] });
  assert.ok(inNeighbour.issues.some(issue => /another building/.test(issue)));
  assert.deepEqual(SEATTLE_BLOCKS[0], GENERATED_SEATTLE_BLOCKS[0], "draft validation mutated the live layout");
});

test("placement identity changes with edits and returns when edits are undone", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); placeBuilding(mesh, source);
  const initial = layoutFromPlacements([placementFromMesh(mesh, buildingId(source))]);
  mesh.scale.y += 2;
  const changed = layoutFromPlacements([placementFromMesh(mesh, buildingId(source))]);
  assert.notEqual(layoutFingerprint(initial), layoutFingerprint(changed));
  placeBuilding(mesh, source);
  assert.equal(layoutFingerprint(initial), layoutFingerprint(layoutFromPlacements([placementFromMesh(mesh, buildingId(source))])));
});
