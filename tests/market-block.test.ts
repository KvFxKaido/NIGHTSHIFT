import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_MARKET_UTILITIES, ALDER_SOLIDS, ALDER_STREETS, alderHeight, alderGround, alderDrivable, createAlderWorld } from "../src/sim/alder.ts";
import { MARKET_ALLEYS, MARKET_PAVING, onMarketPaving } from "../src/sim/market-block.ts";
import { blockPenetration, segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { addMarketBlock } from "../src/render/market-block.ts";
import { grassSite } from "../src/render/grass.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { NEUTRAL, hasContact } from "./helpers/handling.ts";

test("Market paving is visible, excludes grass, and joins both streets without closing access", () => {
  const world = createAlderWorld(), grass = grassSite(world);
  const root = addMarketBlock(new THREE.Scene(), alderHeight, ALDER_MARKET_UTILITIES);
  assert.equal(root.children.length, 5, "hardstanding and service details stay in five batches");
  const mesh = root.getObjectByName("market-paving") as THREE.Mesh;
  const positions = mesh.geometry.getAttribute("position"), normals = mesh.geometry.getAttribute("normal");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    assert.ok(normals.getY(i) > .99, "paving faces up");
    assert.ok(Math.abs(positions.getY(i) - alderHeight(x,z) - .016) < .001);
  }
  for (const polygon of MARKET_PAVING) {
    const x = polygon.reduce((n,p) => n+p.x,0)/polygon.length, z = polygon.reduce((n,p) => n+p.z,0)/polygon.length;
    assert.ok(onMarketPaving(x,z) && !alderGround(x,z) && !grass(x,z));
  }
  for (const polygon of MARKET_ALLEYS) for (const p of polygon) assert.ok(onMarketPaving(p.x,p.z), "dark lane stays within the shared paving");
  // Entire rear lane and cross-alley, including clearance for the chassis.
  for (let z = -983; z <= -895; z += .5) assert.ok(alderDrivable(786,z), `rear lane at ${z}`);
  for (let x = 786; x <= 832; x += .5) assert.ok(alderDrivable(x,-960), `cross-alley at ${x}`);
  for (let z = -900; z <= -877; z += .5) assert.ok(alderDrivable(764,z), `Pine shop approach at ${z}`);
  assert.ok(alderGround(779,-945), "the courtyard retains an intentional green pocket");
  for (const bin of ALDER_MARKET_UTILITIES) {
    assert.ok(world.solids!.includes(bin) && !alderDrivable(bin.x,bin.z));
    for (const other of ALDER_SOLIDS) if (other !== bin) assert.ok(blockPenetration(bin,other) <= .01);
    for (const street of ALDER_STREETS) for (let i=1;i<street.points.length;i++) {
      const a=street.points[i-1]!,b=street.points[i]!;
      assert.ok(segmentFootprintDistance(bin,a,b) > a.width/2+2.8, "service bins clear every pavement");
    }
  }
});

await RAPIER.init();
test("the rear lane and cross-alley can be driven in either direction without contact or grass grip", () => {
  for (const [a,b] of [[{x:786,z:-982},{x:786,z:-892}],[{x:786,z:-960},{x:834,z:-960}]]) {
    for (const reverse of [false,true]) {
      const from = reverse ? b! : a!, to = reverse ? a! : b!;
      const distance = Math.hypot(to.x-from.x,to.z-from.z), ux = (to.x-from.x)/distance, uz = (to.z-from.z)/distance;
      const start = {...from,y:alderHeight(from.x,from.z),heading:Math.atan2(-ux,-uz),pitch:0};
      const sim = createSim("fwd",createAlderWorld(true,start),{traffic:false});
      try {
        sim.body.setLinvel({x:ux*12,y:0,z:uz*12},true);
        let progress=0;
        for(let tick=0;tick<600 && progress<distance;tick++) {
          step(sim,{...NEUTRAL,throttle:.25});
          const car=sim.state.vehicle;
          assert.ok(!hasContact(sim), "a rendered passage has an invisible obstruction");
          assert.ok(!alderGround(car.x,car.z), `a paved passage drives as grass: ${JSON.stringify({from,to,tick,x:car.x,z:car.z})}`);
          progress=(car.x-from.x)*ux+(car.z-from.z)*uz;
        }
        assert.ok(progress>=distance, "car did not traverse the passage");
      } finally {sim.world.free();}
    }
  }
});
