import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { addGrass, grassSite } from "../src/render/grass.ts";
import { ALDER_DATA, ALDER_FORECOURT, ALDER_STREETS, createAlderWorld } from "../src/sim/alder.ts";
import { createSim } from "../src/sim/sim.ts";

await RAPIER.init();

test("grass respects streets, the garage forecourt, water and rotated building footprints", () => {
  const canGrow = grassSite({ solids: [{ x: 35, z: 850, width: 5, depth: 14, height: 8, rotation: Math.PI / 4 }] });
  for (const street of ALDER_STREETS) for (const point of street.points) assert.equal(canGrow(point.x, point.z), false);
  assert.equal(canGrow(ALDER_FORECOURT.x, ALDER_FORECOURT.z), false);
  assert.equal(canGrow(ALDER_DATA.shore - 20, 850), false);
  assert.equal(canGrow(35, 850), false);
  assert.equal(canGrow(35 - 4, 850 + 4), false, "inside the long, rotated footprint");
  assert.equal(canGrow(45, 850), true, "open ground beside the building");
});

test("tyres flatten two tracks, resets do not connect them, and scenery stays bounded without changing simulation", () => {
  const world = createAlderWorld(), sim = createSim("rwd", world, { traffic: false });
  const scene = new THREE.Scene(), grass = addGrass(scene, world);
  const car = sim.state.vehicle;
  const tiles = () => scene.children as THREE.Mesh<THREE.InstancedBufferGeometry>[];
  const pressed = () => tiles().flatMap(tile => {
    const roots = tile.geometry.getAttribute("grassRoot"), press = tile.geometry.getAttribute("grassPress");
    return Array.from({ length: roots.count }, (_, i) => ({
      x: roots.getX(i) + tile.position.x, z: roots.getZ(i) + tile.position.z, amount: press.getZ(i),
    })).filter(point => point.amount > .1);
  });
  try {
    Object.assign(car, { x: 35, z: 850, heading: 0 });
    const original = JSON.stringify(sim.state);
    for (let i = 0; i < 20; i++) grass.update(sim.state, 0);
    assert.equal(JSON.stringify(sim.state), original);
    grass.update(sim.state, 1 / 60);
    for (let i = 0; i < 20; i++) { car.z -= .4; grass.update(sim.state, 1 / 60); }
    const track = pressed();
    assert.ok(track.length > 50, "a swept tyre should flatten a continuous path between frames");
    assert.ok(track.every(p => Math.abs(p.x - 35) > .4 && Math.abs(p.x - 35) < 1.5), "leave the centre strip standing");
    car.z = 815;
    grass.update(sim.state, 1 / 60);
    assert.ok(pressed().every(p => p.z > 839 || p.z < 818), "reset drew a false trail between the old and new positions");
    for (let i = 0; i < 8; i++) { car.x += 80; grass.update(sim.state, 1 / 60); }
    assert.ok(tiles().length <= 121, "driving must release distant tiles");
  } finally {
    grass.dispose(); sim.world.free();
  }
  assert.equal(scene.children.length, 0);
});
