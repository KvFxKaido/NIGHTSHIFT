import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, type Input } from "../src/sim/sim.ts";
import {
  createFreeRoamWorld, DISTRICT_STREETS, DISTRICT_BLOCKS, districtSurface, groundHeight, outerTerrain,
  projectOntoDistrict,
} from "../src/sim/district.ts";
import { pathSamples } from "../src/sim/lanes.ts";
import type { RoadWorld } from "../src/sim/road-world.ts";

await RAPIER.init();

/** A kerb with open ground beyond it and no rail: somewhere the car can leave
 *  the road, on the hill so the ground beside the road is not the road's
 *  height. Chosen by measurement rather than by name so a layout change does
 *  not quietly turn this into a test of a wall. */
function openKerb() {
  let best: { x: number; z: number; heading: number; contrast: number } | null = null;
  for (const street of DISTRICT_STREETS.filter(s => s.added && s.kind !== "alley")) {
    for (const sample of pathSamples(street.points, 12)) {
      for (const side of [-1, 1] as const) {
        const nx = -sample.dirZ * side, nz = sample.dirX * side;
        const kerb = sample.width / 2;
        const outX = sample.x + nx * (kerb + 20), outZ = sample.z + nz * (kerb + 20);
        const road = projectOntoDistrict(sample.x, sample.z).height;
        const drop = road - outerTerrain(sample.x + nx * (kerb + 4), sample.z + nz * (kerb + 4));
        if (drop >= 1.4) continue;                       // a rail stands here, rightly
        if (projectOntoDistrict(outX, outZ).distance < 30) continue;   // another road out there
        if (DISTRICT_BLOCKS.some(b => Math.hypot(b.x - outX, b.z - outZ) < 28)) continue;
        const contrast = Math.abs(road - groundHeight(outX, outZ));
        if (contrast < 1.5) continue;                    // ground must differ from the road to prove anything
        if (!best || contrast > best.contrast) best = { x: sample.x, z: sample.z, heading: Math.atan2(-nx, -nz), contrast };
      }
    }
  }
  assert.ok(best, "no open kerb with contrasting ground found");
  return best!;
}

// With the rails gone the car can leave the road. It must then ride the ground
// it can see — not float on the nearest road's height — and the kerb must be a
// chamfer, not a step: the ground is clamped 0.35 m under the road beside it.
test("off the kerb the car rides the ground, without a step", () => {
  const spot = openKerb();
  const base = createFreeRoamWorld();
  const world: RoadWorld = { ...base, traffic: undefined, start: {
    x: spot.x, z: spot.z, y: projectOntoDistrict(spot.x, spot.z).height, heading: spot.heading, pitch: 0 } };
  const sim = createSim("fwd", world, { traffic: false });
  try {
    const flat: Input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    let previousY = sim.state.vehicle.y, maxStep = 0, farthest = 0, worstFloat = 0, offRoadTicks = 0;
    for (let tick = 0; tick < 240; tick++) {
      step(sim, flat);
      const car = sim.state.vehicle;
      maxStep = Math.max(maxStep, Math.abs(car.y - previousY));
      previousY = car.y;
      const road = projectOntoDistrict(car.x, car.z);
      const over = road.distance - road.width / 2;
      farthest = Math.max(farthest, over);
      if (over > 2) { offRoadTicks++; worstFloat = Math.max(worstFloat, Math.abs(car.y - groundHeight(car.x, car.z))); }
    }
    assert.ok(farthest > 8, `the car never left the road: ${farthest.toFixed(1)} m past the kerb at most`);
    assert.ok(offRoadTicks > 30, `only ${offRoadTicks} ticks off the road`);
    assert.ok(worstFloat < 0.6, `off the road the car floats ${worstFloat.toFixed(2)} m from the ground`);
    assert.ok(maxStep < 0.25, `the kerb is a ${maxStep.toFixed(2)} m step in one tick`);
  } finally { sim.world.free(); }
});

// And the surface is continuous where it matters: on the carriageway it IS the
// road, and past the chamfer it IS the ground.
test("the driven surface is the road on the road and the ground beyond the chamfer", () => {
  const street = DISTRICT_STREETS.find(s => s.id === "north-2")!;
  for (const sample of pathSamples(street.points, 20)) {
    const nx = -sample.dirZ, nz = sample.dirX, kerb = sample.width / 2;
    const on = districtSurface(sample.x, sample.z), road = projectOntoDistrict(sample.x, sample.z);
    assert.equal(on.height, road.height, "on the carriageway the surface is the road");
    const outX = sample.x + nx * (kerb + 3), outZ = sample.z + nz * (kerb + 3);
    // Only where that point really is past the chamfer of whichever street is
    // nearest to it — beside a junction the neighbour can be the nearer one.
    const there = projectOntoDistrict(outX, outZ);
    if (there.distance - there.width / 2 < 1.5) continue;
    assert.ok(Math.abs(districtSurface(outX, outZ).height - groundHeight(outX, outZ)) < 1e-9,
      "past the chamfer the surface is the ground");
  }
});
