import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { trafficBodyGeometry } from "../src/render/traffic-body.ts";
import { addTraffic, updateTraffic } from "../src/render/traffic.ts";
import { TRAFFIC_KINDS, createTraffic, type TrafficKind } from "../src/sim/traffic.ts";
import { createAlderWorld } from "../src/sim/alder.ts";

test("traffic bodies stay within collision dimensions apart from shallow trim and taxi sign", () => {
  for (const kind of Object.keys(TRAFFIC_KINDS) as TrafficKind[]) {
    const spec = TRAFFIC_KINDS[kind], geometries = trafficBodyGeometry(kind);
    for (const geometry of Object.values(geometries)) {
      const bounds = geometry.boundingBox!;
      assert.ok(bounds.min.y >= -.001, `${kind} below ground`);
      assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= spec.width / 2 + .04, `${kind} too wide`);
      assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= spec.length / 2 + .09, `${kind} too long`);
      assert.ok(bounds.max.y <= spec.height + (kind === "taxi" ? .18 : .04), `${kind} too tall`);
      assert.ok(geometry.index!.count / 3 < 2200, `${kind} exceeds per-layer triangle budget`);
      assert.ok(Array.from(geometry.getAttribute("position").array).every(Number.isFinite));
      geometry.dispose();
    }
  }
});

test("every spawned traffic kind keeps trim and lamps attached through turns, hills and braking", () => {
  const network = createAlderWorld(true).traffic!;
  const traffic = createTraffic(network);
  assert.deepEqual(new Set(traffic.vehicles.map(v => v.kind)), new Set(Object.keys(TRAFFIC_KINDS)));
  const view = addTraffic(new THREE.Scene(), traffic, network, () => ({ gradeX: .12, gradeZ: -.08 }));
  const before = JSON.stringify(traffic);
  updateTraffic(view, traffic, .2);
  assert.equal(JSON.stringify(traffic), before, "drawing cannot change the simulation");
  const expected = new THREE.Matrix4(), actual = new THREE.Matrix4();
  traffic.vehicles.forEach((v, i) => {
    const slot = view.slots[i]!;
    view.bodies.get(v.kind)!.getMatrixAt(slot, expected);
    for (const meshes of [view.details, view.lamps]) {
      meshes.get(v.kind)!.getMatrixAt(slot, actual);
      assert.deepEqual(actual.elements, expected.elements);
    }
    v.braking = true;
  });
  updateTraffic(view, traffic, .1);
  traffic.vehicles.forEach((v, i) => {
    view.bodies.get(v.kind)!.getMatrixAt(view.slots[i]!, expected);
    view.brakes.get(v.kind)!.getMatrixAt(view.slots[i]!, actual);
    assert.deepEqual(actual.elements, expected.elements);
  });
  assert.equal(view.root.children.length, 6 * Object.keys(TRAFFIC_KINDS).length, "draw sets scale with kinds, not vehicles");
});
