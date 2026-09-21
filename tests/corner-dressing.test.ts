import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CORNER_SITES, createCornerProps } from "../src/sim/corner-dressing.ts";
import { ALDER_CORNER_PROPS, ALDER_CORNER_SOLIDS, ALDER_SOLIDS, ALDER_STREETS, ALDER_FORECOURT,
  ARENA_ROADS, alderHeight, alderDrivable, alderGround, createAlderWorld } from "../src/sim/alder.ts";
import { blockCorners, blockPenetration, segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { YARD_RESERVE } from "../src/sim/drift-yard.ts";
import { evergreenPassage } from "../src/sim/alder-evergreens.ts";
import { addCornerDressing } from "../src/render/corner-dressing.ts";
import { grassSite } from "../src/render/grass.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { NEUTRAL, hasContact } from "./helpers/handling.ts";
import { cornerRoute } from "./helpers/corner-route.ts";

test("eight corner sites preserve every road, pavement, alley and reserved entrance", () => {
  assert.equal(CORNER_SITES.length, 8);
  assert.deepEqual(createCornerProps(alderHeight), ALDER_CORNER_PROPS);
  const existing = ALDER_SOLIDS.filter(b => !ALDER_CORNER_SOLIDS.includes(b));
  const segments = [...ALDER_STREETS, ...ARENA_ROADS].flatMap(s => s.points.slice(1).map((b, i) => ({ a: s.points[i]!, b })));
  const grassAllowed = grassSite(createAlderWorld());
  for (const { id, solid: b } of ALDER_CORNER_PROPS) {
    assert.ok(createAlderWorld().solids!.includes(b), `${id}: missing collision`);
    assert.ok(!alderDrivable(b.x, b.z) && !grassAllowed(b.x, b.z));
    assert.ok(!evergreenPassage(b.x, b.z));
    for (const { a, b: end } of segments) {
      assert.ok(segmentFootprintDistance(b, a, end) >= Math.max(a.width, end.width) / 2 + 3.8, `${id}: crowded a road or pavement`);
    }
    for (const other of [...existing, ALDER_FORECOURT, YARD_RESERVE]) {
      assert.ok(blockPenetration(b, other) <= .01, `${id}: overlaps an existing solid or access reserve`);
    }
    for (const corner of blockCorners(b)) {
      assert.ok(alderGround(corner.x, corner.z), `${id}: stands on paving`);
      assert.ok(b.base <= alderHeight(corner.x, corner.z), `${id}: floating base`);
      assert.ok(b.base + b.height >= alderHeight(corner.x, corner.z) + .99, `${id}: buried top`);
    }
  }
});

test("drawn corner masses exactly match all collision poses, without a distance fade", () => {
  const scene = new THREE.Scene(); addCornerDressing(scene, ALDER_CORNER_PROPS);
  const found = new Set<string>(), matrix = new THREE.Matrix4();
  scene.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    assert.ok(object.boundingBox && object.boundingSphere);
    const ids = object.userData.propIds as string[];
    assert.equal(ids.length, object.count);
    ids.forEach((id, i) => {
      const b = ALDER_CORNER_PROPS.find(p => p.id === id)!.solid;
      object.getMatrixAt(i, matrix);
      const expected = blockCorners(b);
      for (const x of [-.5, .5]) for (const z of [-.5, .5]) {
        const foot = new THREE.Vector3(x, -.5, z).applyMatrix4(matrix);
        assert.ok(expected.some(p => Math.hypot(p.x - foot.x, p.z - foot.z) < .001), `${id}: wrong footprint yaw`);
        assert.ok(Math.abs(foot.y - b.base) < .001);
        const top = new THREE.Vector3(x, .5, z).applyMatrix4(matrix);
        assert.ok(Math.abs(top.y - b.base - b.height) < .001);
      }
      found.add(id);
    });
  });
  assert.equal(found.size, ALDER_CORNER_PROPS.length);
});

await RAPIER.init();
test("deep cuts hit the new masses, while the same cuts were open before and shallow clips remain open", () => {
  const baseline = createAlderWorld(true);
  const oldSolids = baseline.solids!.filter(s => !ALDER_CORNER_SOLIDS.includes(s as typeof ALDER_CORNER_SOLIDS[number]));
  for (const site of CORNER_SITES) {
    const c = Math.cos(site.rotation), s = Math.sin(site.rotation);
    function drive(offset: number, dressed: boolean) {
      const x = site.x - c * 17 - s * offset, z = site.z - s * 17 + c * offset;
      const start = { x, z, y: alderHeight(x, z), pitch: 0, heading: Math.atan2(-c, -s) };
      // AWD makes the control independent of the grass penalty: solids do the work.
      const sim = createSim("awd", { ...baseline, start, solids: dressed ? baseline.solids : oldSolids }, { traffic: false });
      try {
        sim.body.setLinvel({ x: c * 20, y: 0, z: s * 20 }, true);
        let contact = false;
        for (let tick = 0; tick < 120; tick++) { step(sim, { ...NEUTRAL, throttle: .5 }); contact ||= hasContact(sim); }
        const car = sim.state.vehicle;
        return { contact, progress: (car.x - site.x) * c + (car.z - site.z) * s };
      } finally { sim.world.free(); }
    }
    const before = drive(0, false), after = drive(0, true), shallow = drive(7, true);
    assert.ok(!before.contact && before.progress > 10, `${site.id}: the control cut was already blocked`);
    assert.ok(after.contact && after.progress < before.progress - 8, `${site.id}: deep cut has no physical cost`);
    assert.ok(!shallow.contact && shallow.progress > 10, `${site.id}: shallow apex clip was closed`);
  }
});

test("rivals clear all eight dressed corners in both directions, with and without traffic", () => {
  for (const site of CORNER_SITES) for (const reverse of [false, true]) for (const traffic of [false, true]) {
    const route = cornerRoute(site, reverse), end = route.points.at(-1)!;
    const sim = createSim("fwd", createAlderWorld(), { traffic, rival: route,
      race: { id: route.id, name: route.id, countdownTicks: 0, checkpoints: [{ id: "finish", name: "Finish", x: end.x, z: end.z, radius: 14 }] } });
    try {
      const propHandles = new Set<number>();
      sim.world.forEachCollider(collider => {
        const p = collider.translation();
        if (ALDER_CORNER_SOLIDS.some(b => Math.hypot(b.x - p.x, b.z - p.z) < .002)) propHandles.add(collider.handle);
      });
      assert.equal(propHandles.size, ALDER_CORNER_SOLIDS.length);
      let contacts = 0;
      for (let tick = 0; tick < 3600 && !sim.state.rival!.race.finished; tick++) {
        step(sim, { ...NEUTRAL, handbrake: 1 });
        sim.world.contactPairsWith(sim.rivalBody!.collider(0), other => {
          if (propHandles.has(other.handle)) sim.world.contactPair(sim.rivalBody!.collider(0), other, manifold => {
            if (manifold.numSolverContacts() > 0) contacts++;
          });
        });
      }
      const rival = sim.state.rival!, label = `${route.id} traffic=${traffic}`;
      assert.ok(rival.race.finished, `${label}: did not finish`);
      assert.equal(contacts, 0, `${label}: struck the new dressing`);
      assert.equal(rival.driver.resets + rival.driver.unseenResets, 0, `${label}: reset at the corner`);
    } finally { sim.world.free(); }
  }
});
