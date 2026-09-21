import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addBroadcastTower, STATION_BOOTH } from "../src/render/broadcast-tower.ts";
import { buildingFrontage } from "../src/sim/frontage.ts";
import { ALDER_STREETS } from "../src/sim/alder.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import landmarks from "../src/sim/alder-landmarks.json" with { type: "json" };

test("Signal House matches its shared solid and exceeds twice the old 120m landmark within budget", () => {
  const scene = new THREE.Scene(); addBroadcastTower(scene, true); scene.updateMatrixWorld(true);
  const site = landmarks.broadcastTower;
  const group = scene.getObjectByName("alder-broadcast-tower")!;
  const base = new THREE.Box3().setFromObject(scene.getObjectByName("broadcast-station-solid")!);
  assert.deepEqual(base.getSize(new THREE.Vector3()).toArray(), [site.width, site.height, site.depth]);
  assert.deepEqual(base.getCenter(new THREE.Vector3()).toArray(), [site.x, site.base + site.height / 2, site.z]);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(site.mastHeight >= 240);
  assert.ok(site.height >= 150, "an occupied skyscraper, not only a taller antenna");
  assert.ok(Math.abs(bounds.max.y - (site.base + site.mastHeight + .85)) < .001);
  const meshes = group.children as THREE.Mesh[];
  assert.ok(meshes.length <= 8, "merge repeated beams and sign pixels by material");
  const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
  assert.ok(triangles < 30000, `${triangles} triangles for one landmark`);
  assert.ok(!group.children.some(child => child instanceof THREE.Light));
});

test("the enlarged station leaves every carriageway and its pedestrian margin clear", () => {
  for (const street of ALDER_STREETS) for (let i = 1; i < street.points.length; i++) {
    const a = street.points[i - 1]!, b = street.points[i]!;
    assert.ok(segmentFootprintDistance(landmarks.broadcastTower, a, b) >= Math.max(a.width, b.width) / 2 + 2.8,
      `${street.id} clips the tower plaza entrance`);
  }
});

test("PORT ALDER lettering faces outward on all four sides without mirrored P stems", () => {
  const scene = new THREE.Scene(); addBroadcastTower(scene, false); scene.updateMatrixWorld(true);
  const site = landmarks.broadcastTower;
  const letters = scene.getObjectByName("broadcast-letters")!;
  const origin = new THREE.Vector3(site.x, site.base, site.z);
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const axis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(axis, angle);
    function hits(pixel: number) {
      const point = new THREE.Vector3((pixel - 29) * .31, 15.2 - 5 * .31, 20).applyAxisAngle(axis, angle).add(origin);
      return new THREE.Raycaster(point, direction, 0, 15).intersectObject(letters).length > 0;
    }
    assert.ok(hits(0), `face ${face}: P stem must appear on the viewer's left`);
    assert.ok(!hits(4), `face ${face}: lower-right of P must remain empty`);
  }
});

// design/LOOK.md, "Lit means occupied": after dark the station is dark but for
// the overnight booth, where the DJ is, and the booth faces the street a driver
// is on, never a blank side.
test("only the street studio and crown control room are lit; the street booth faces Broad St", () => {
  const scene = new THREE.Scene(); addBroadcastTower(scene, true); scene.updateMatrixWorld(true);
  const site = landmarks.broadcastTower;
  const windows = scene.getObjectByName("broadcast-windows") as THREE.Mesh;
  const booth = scene.getObjectByName("broadcast-booth") as THREE.Mesh;
  assert.equal((windows.material as THREE.MeshStandardMaterial).emissiveIntensity, 0, "the empty offices are lit");
  assert.ok((booth.material as THREE.MeshStandardMaterial).emissiveIntensity > 1, "the booth is dark");
  // Each pane is a 24-vertex box; find the face it sits on from its centre.
  const position = booth.geometry.getAttribute("position");
  assert.equal(position.count, 24 * (STATION_BOOTH.length + 1), "three street panes and one crown control room");
  const frontage = buildingFrontage([{ x: site.x, z: site.z, width: site.width, depth: site.depth, height: site.height,
    base: site.base, rotation: site.rotation }], ALDER_STREETS, 200)[0]!;
  for (let pane = 0; pane < STATION_BOOTH.length; pane++) {
    const centre = new THREE.Vector3();
    for (let v = 0; v < 24; v++) centre.add(new THREE.Vector3().fromBufferAttribute(position, pane * 24 + v));
    centre.divideScalar(24).applyMatrix4(booth.matrixWorld);
    const dx = centre.x - site.x, dz = centre.z - site.z;
    // frontage.ts's face order: +Z, -Z, +X, -X.
    const face = Math.abs(dz) > Math.abs(dx) ? (dz > 0 ? 0 : 1) : (dx > 0 ? 2 : 3);
    assert.ok(Number.isFinite(frontage[face]), `booth pane ${pane} is on a face with no street (${frontage.join(", ")})`);
  }
  // By day the booth is one window among the rest.
  const day = new THREE.Scene(); addBroadcastTower(day, false);
  const lit = (name: string) => ((day.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity;
  assert.equal(lit("broadcast-booth"), lit("broadcast-windows"));
});
