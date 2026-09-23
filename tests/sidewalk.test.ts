import assert from "node:assert/strict";
import test from "node:test";
import { sidewalkSampler, curbRise } from "../src/sim/sidewalk.ts";
import { ALDER_DATA, ALDER_FORECOURT, ALDER_PARKING, alderSidewalkLift, createAlderWorld, alderHeight } from "../src/sim/alder.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step } from "../src/sim/sim.ts";
import { BLACKGLASS_WORLD } from "../src/sim/road-world.ts";
await RAPIER.init();

test("sidewalk triangles interpolate their visible ramp and stay zero outside",()=>{
  const sample=sidewalkSampler([0,0,1,0,0,1],[0,.15,.15]);
  assert.ok(Math.abs(sample(.25,.25)-.075)<1e-9);
  assert.equal(sample(2,2),0);
  assert.equal(sample(-.1,.1),0);
});

test("curb response catches fast crossings but does not tax cruising or descending",()=>{
  const sample=(x:number)=>Math.max(0,Math.min(.15,x*.6));
  assert.ok(Math.abs(curbRise(sample,-1,0,3,0)-.15)<1e-9);
  assert.equal(curbRise(sample,2,0,3,0),0);
  assert.equal(curbRise(sample,2,0,-3,0),0);
});

test("a real car mounts the sidewalk with a small speed loss and no blocking collision",()=>{
  const results=[];
  for(const raised of [false,true]) {
    const curb=(_x:number,z:number)=>raised?Math.max(0,Math.min(.15,-z*.6)):0;
    const sim=createSim("fwd",{...BLACKGLASS_WORLD,walls:[],
      start:{x:0,y:0,z:2,heading:0,pitch:0},curb,
      surface:(x,z)=>({...BLACKGLASS_WORLD.project(x,z),height:curb(x,z),gradeX:0,gradeZ:0,pitch:0})}, {traffic:false});
    try {
      sim.body.setLinvel({x:0,y:0,z:-10},true);
      for(let i=0;i<30;i++)step(sim,{throttle:0,brake:0,steer:0,handbrake:0});
      assert.ok(sim.state.vehicle.z < -2,"crosses the curb");
      results.push({speed:sim.state.vehicle.speed,y:sim.body.translation().y});
    } finally {sim.world.free();}
  }
  assert.ok(results[0]!.speed-results[1]!.speed>.2);
  assert.ok(results[0]!.speed-results[1]!.speed<.7);
  assert.ok(Math.abs(results[1]!.y-results[0]!.y-.15)<.001);
});

test("city sidewalk mesh and driving height agree; garage and parking entrances stay dropped",()=>{
  const data=ALDER_DATA, world=createAlderWorld();
  assert.equal(data.pavementLifts.length,data.pavement.length/2);
  assert.ok(data.pavementLifts.every(h=>Number.isFinite(h)&&h>=0&&h<=.15));
  let raised=0;
  for(let i=0;i<data.pavement.length;i+=600) {
    const x=(data.pavement[i]!+data.pavement[i+2]!+data.pavement[i+4]!)/3;
    const z=(data.pavement[i+1]!+data.pavement[i+3]!+data.pavement[i+5]!)/3;
    const lift=(data.pavementLifts[i/2]!+data.pavementLifts[i/2+1]!+data.pavementLifts[i/2+2]!)/3;
    assert.ok(Math.abs(alderSidewalkLift(x,z)-lift)<.001);
    assert.ok(Math.abs(world.surface!(x,z).height-alderHeight(x,z)-lift)<.001);
    if(lift>.14)raised++;
  }
  assert.ok(raised>20);
  for(const b of [ALDER_FORECOURT,...ALDER_PARKING.map(p=>p.entrance)]) {
    const c=Math.cos(b.rotation),s=Math.sin(b.rotation);
    for(let d=-b.depth/2;d<=b.depth/2;d+=.5)
      assert.equal(alderSidewalkLift(b.x-d*s,b.z+d*c),0);
  }
});
