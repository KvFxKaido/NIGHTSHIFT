import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildingId, parseAuthoredLayout, layoutFingerprint, authoredFromId } from "../src/sim/building-layout.ts";
import { GENERATED_SEATTLE_BLOCKS, SEATTLE_LAYOUT_BASELINE, SEATTLE_BLOCKS, GARAGE_PLOT_ID,
  resolveSeattleLayout, SEATTLE_STREETS, createSeattleWorld } from "../src/sim/seattle.ts";
import { importEditorScene, layoutFromEditor, placementFromMesh, placeBuilding, exportEditorScene } from "../src/editor/exchange.ts";
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
const sourceId = buildingId(source);
const edited = { id: authoredFromId(sourceId), x: source.x, z: source.z, width: source.width, depth: source.depth,
  height: source.height + 2, rotation: source.rotation };
/** The layout the editor writes for one generated plot made two metres taller. */
const layout = () => ({ schema: 2, authored: [edited], retired: [sourceId] });
const empty = { schema: 2, authored: [], retired: [] };

test("unchanged footprints survive the actual Three.js scene JSON round trip", () => {
  const scene = sceneForExport();
  assert.deepEqual(importEditorScene(JSON.parse(JSON.stringify(exportEditorScene(scene)))), empty);
  const objectLoaderScene = new THREE.ObjectLoader().parse(exportEditorScene(scene));
  assert.deepEqual(importEditorScene(objectLoaderScene.toJSON()), empty);
});

test("visual scale and yaw become shared solid dimensions with the correct handedness", async () => {
  await RAPIER.init();
  const scene = sceneForExport(), mesh = scene.children[0]!;
  mesh.scale.y += 2; mesh.updateMatrix();
  const imported = importEditorScene(scene.toJSON());
  assert.deepEqual(imported.retired, [buildingId(GENERATED_SEATTLE_BLOCKS[0]!)]);
  const resolved = resolveSeattleLayout(imported);
  assert.deepEqual(resolved.issues, []);
  const block = resolved.entries.find(entry => entry.source === "authored")!.block;
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
  assert.throws(() => parseAuthoredLayout({ ...layout(), authored: [edited, edited] }), /duplicate/);
  assert.throws(() => parseAuthoredLayout({ ...layout(), authored: [{ ...edited, x: NaN }] }), /x must/);
  assert.throws(() => parseAuthoredLayout({ ...layout(), authored: [{ ...edited, id: "plot-1-2" }] }), /authored id/);
  assert.throws(() => parseAuthoredLayout({ ...layout(), retired: ["authored-1"] }), /Retired ids/);
  // A schema-1 file is upgraded on read, and only against the generation it edited.
  assert.throws(() => resolveSeattleLayout({ schema: 1, baseline: "old", buildings: [{ ...source, id: sourceId }] }), /district changed/);
  const upgraded = resolveSeattleLayout({ schema: 1, baseline: SEATTLE_LAYOUT_BASELINE, buildings: [{ ...edited, id: sourceId }] });
  assert.deepEqual(upgraded.layout, layout());
  assert.throws(() => resolveSeattleLayout({ ...layout(), retired: [GARAGE_PLOT_ID] }), /Garage is fixed/);
  const scene = sceneForExport(); scene.children[0]!.rotation.x = 0.2; scene.updateMatrixWorld(true);
  assert.throws(() => importEditorScene(scene.toJSON()), /upright/);
  const garageless = sceneForExport();
  garageless.remove(garageless.children.find(child => child.userData.nightshiftBuildingId === GARAGE_PLOT_ID)!);
  assert.throws(() => importEditorScene(garageless.toJSON()), /Garage is fixed/);
});

test("a retired plot the generator no longer produces is ignored, and a box missing from a scene is a deletion", () => {
  const resolved = resolveSeattleLayout({ ...empty, retired: ["plot-1.000-2.000"] });
  assert.deepEqual(resolved.issues, []);
  assert.equal(resolved.blocks.length, GENERATED_SEATTLE_BLOCKS.length);
  const scene = sceneForExport();
  scene.remove(scene.children[0]!);
  const imported = importEditorScene(scene.toJSON());
  assert.deepEqual(imported, { ...empty, retired: [buildingId(GENERATED_SEATTLE_BLOCKS[0]!)] });
  assert.equal(resolveSeattleLayout(imported).blocks.length, GENERATED_SEATTLE_BLOCKS.length - 1);
});

test("road overlaps are reported before save; a generated neighbour stands down, an authored one is an issue", () => {
  const point = SEATTLE_STREETS[0]!.points[0]!;
  const inRoad = resolveSeattleLayout({ ...layout(), authored: [{ ...edited, x: point.x, z: point.z }] });
  assert.ok(inRoad.issues.some(issue => /road|street/.test(issue)));
  const neighbour = GENERATED_SEATTLE_BLOCKS.find(block => buildingId(block) !== sourceId && buildingId(block) !== GARAGE_PLOT_ID)!;
  const onNeighbour = resolveSeattleLayout({ ...layout(), authored: [{ ...edited, x: neighbour.x, z: neighbour.z }] });
  assert.deepEqual(onNeighbour.issues, []);
  assert.deepEqual(onNeighbour.displaced, [buildingId(neighbour)]);
  assert.ok(!onNeighbour.blocks.includes(neighbour), "the displaced plot still stands");
  const twoAuthored = resolveSeattleLayout({ ...layout(), authored: [edited, { ...edited, id: "authored-2", x: edited.x + 1 }] });
  assert.ok(twoAuthored.issues.some(issue => /another authored/.test(issue)));
  assert.deepEqual(SEATTLE_BLOCKS[0], GENERATED_SEATTLE_BLOCKS[0], "draft validation mutated the live layout");
});

test("placement identity changes with edits and returns when edits are undone", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); placeBuilding(mesh, source);
  const entry = () => [{ id: sourceId, source: "generated" as const, placement: placementFromMesh(mesh, sourceId), original: source }];
  const initial = layoutFromEditor(entry());
  assert.deepEqual(initial, empty);
  mesh.scale.y += 2;
  const changed = layoutFromEditor(entry());
  assert.deepEqual(changed.retired, [sourceId]);
  assert.equal(changed.authored[0]!.id, authoredFromId(sourceId));
  assert.notEqual(layoutFingerprint(initial), layoutFingerprint(changed));
  placeBuilding(mesh, source);
  assert.equal(layoutFingerprint(initial), layoutFingerprint(layoutFromEditor(entry())));
});
