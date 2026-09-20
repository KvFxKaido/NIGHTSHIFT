import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { trafficBodyGeometry } from "../src/render/traffic-body.ts";
import { addTraffic, updateTraffic } from "../src/render/traffic.ts";
import { CEL_INK, CEL_UNIFORMS, celMaterial, setLook, trafficDrawn } from "../src/render/cel.ts";
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
  for (const kind of Object.keys(TRAFFIC_KINDS)) {
    assert.equal(view.root.getObjectByName(`traffic-ink-${kind}`), undefined, "traffic is undrawn unless asked for");
    assert.equal(view.bodies.get(kind as TrafficKind)!.material.userData.cel, undefined);
  }
});

test("?look=cel-traffic bands traffic without a named car's accents and inks one silhouette per kind", () => {
  const network = createAlderWorld(true).traffic!;
  const traffic = createTraffic(network);
  setLook("cel-traffic");
  try {
    assert.equal(trafficDrawn(), true);
    const view = addTraffic(new THREE.Scene(), traffic, network);
    const kinds = Object.keys(TRAFFIC_KINDS) as TrafficKind[];
    assert.equal(view.root.children.length, 7 * kinds.length, "one ink set per kind, not per vehicle");
    updateTraffic(view, traffic, .2);
    for (const kind of kinds) {
      const body = view.bodies.get(kind)!, ink = view.root.getObjectByName(`traffic-ink-${kind}`) as THREE.InstancedMesh;
      assert.equal(ink.material, CEL_INK);
      assert.equal(ink.count, body.count);
      // Shared, not copied: an outline can never be somewhere its body is not.
      assert.equal(ink.instanceMatrix, body.instanceMatrix);
      assert.ok(ink.geometry.index!.count / 3 <= 36, `${kind} ink is ${ink.geometry.index!.count / 3} triangles a vehicle`);
      for (const material of [body.material, view.details.get(kind)!.material] as THREE.MeshStandardMaterial[]) {
        assert.equal(material.userData.cel, CEL_UNIFORMS);
        assert.equal(material.customProgramCacheKey(), "cel-bands", "the stripe and the cyan rim are a named car's");
      }
      // Lamps, signals and brakes stay lit as they were: they do the announcing.
      assert.ok(view.lamps.get(kind)!.material instanceof THREE.MeshBasicMaterial);
      // The hull's normals point out of corners and are shared across a corner's faces.
      const normal = ink.geometry.getAttribute("normal"), position = ink.geometry.getAttribute("position");
      const seen = new Map<string, string>();
      for (let i = 0; i < normal.count; i++) {
        assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-6);
        assert.ok(Math.abs(Math.abs(normal.getX(i)) - Math.sqrt(1 / 3)) < 1e-6, "a corner normal, not a face normal");
      }
      // Within one solid, coincident vertices agree, or the hull cracks along that edge.
      for (let solid = 0; solid < position.count / 24; solid++) {
        seen.clear();
        for (let i = solid * 24; i < solid * 24 + 24; i++) {
          const at = [position.getX(i), position.getY(i), position.getZ(i)].map(n => n.toFixed(5)).join(",");
          const n = [normal.getX(i), normal.getY(i), normal.getZ(i)].map(n => n.toFixed(5)).join(",");
          assert.equal(seen.get(at) ?? n, n, `${kind} solid ${solid} splits at ${at}`);
          seen.set(at, n);
        }
      }
    }
  } finally { setLook(null); }
  assert.equal(trafficDrawn(), false);
  assert.equal(celMaterial(new THREE.MeshStandardMaterial()).userData.cel, undefined, "the look is off again for whatever runs next");
});
