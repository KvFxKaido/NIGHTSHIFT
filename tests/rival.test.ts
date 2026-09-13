import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, resetSim, step, RIVAL_RESET_TICKS, type Sim } from "../src/sim/sim.ts";
import { createAlderWorld, ALDER_RACE, projectOntoAlder } from "../src/sim/alder.ts";
import { ALDER_RIVAL } from "../src/sim/alder-rival.ts";
await RAPIER.init();
const parked={throttle:0,brake:0,steer:0,handbrake:1};
const create=(traffic=true)=>createSim("fwd",createAlderWorld(true),{race:ALDER_RACE,rival:ALDER_RIVAL,traffic});
function finish(sim:Sim, disturb?: (tick:number, sim:Sim)=>void) {
  let furthest=0;
  for(let tick=0;tick<18000&&!sim.state.rival!.race.finished;tick++) {
    disturb?.(tick,sim);
    step(sim,parked);
    const car=sim.state.rival!.vehicle;
    const road=projectOntoAlder(car.x,car.z);
    furthest=Math.max(furthest,road.distance);
    assert.ok(Number.isFinite(car.x+car.z+car.speed));
  }
  assert.equal(sim.state.rival!.race.finished,true,JSON.stringify(sim.state.rival));
  assert.equal(sim.state.rival!.race.splits.length,4);
  assert.ok(sim.state.rival!.race.ticks>6000,"AI must actually drive the route");
  return furthest;
}
test("rival shares the countdown and completes Sound to Sky with normal traffic",()=>{
  const sim=create();
  try {
    const start={...sim.state.rival!.vehicle};
    for(let tick=0;tick<180;tick++)step(sim,{throttle:1,brake:0,steer:0,handbrake:0});
    assert.ok(sim.state.rival!.vehicle.speed<.01);
    assert.equal(sim.state.rival!.race.ticks,0);
    assert.equal(sim.state.rival!.vehicle.z,start.z);
    assert.equal(sim.state.race!.countdown,0);
    finish(sim);
    // 188.7 s before traffic was judged by where it will be (2026-09-13), 182.3 s after,
    // 143.1 s once its cornering was tuned to recorded laps (RIVAL_CORNERING).
    assert.ok(sim.state.rival!.race.ticks < 150*60, `Sound to Sky took ${(sim.state.rival!.race.ticks/60).toFixed(1)} s with traffic`);
    assert.equal(sim.state.rival!.driver.recoveries,0);
    assert.equal(sim.state.rival!.driver.resets,0,"normal racing should never use fallback resets");
    for(let tick=0;tick<600;tick++)step(sim,parked);
    assert.ok(sim.state.rival!.vehicle.speed<.1,"finished rival must stop instead of reversing");
  } finally {sim.world.free();}
});
test("rival routes around a parked player and recovers from a spin",()=>{
  const sim=create();
  try {
    sim.body.setTranslation({x:-9,y:2.5,z:875},true);
    sim.body.setRotation({x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2},true);
    finish(sim,(tick,sim)=>{
      if(tick===1800){
        sim.rivalBody!.setRotation({x:0,y:1,z:0,w:0},true);
        sim.rivalBody!.setLinvel({x:0,y:0,z:0},true);
      }
    });
  } finally {sim.world.free();}
});
test("rival reverses and finds a new line after contact with an unexpected solid",()=>{
  const sim=create(false);
  try {
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(3,1,1).setTranslation(-9,2.5,875));
    finish(sim);
    assert.ok(sim.state.rival!.driver.recoveries>0);
    assert.ok(sim.state.rival!.driver.recoveries<=5,"recovery repeatedly chooses the same blocked line");
  } finally {sim.world.free();}
});
test("player and rival collide as dynamic bodies in the same solver",()=>{
  const sim=create(false);
  try {
    // Opposite moving bodies, with their centres on a straight road.
    sim.state.race!.countdown=sim.state.rival!.race.countdown=0;
    sim.body.setTranslation({x:-9,y:2.5,z:940},true);
    sim.rivalBody!.setTranslation({x:-9,y:2.5,z:930},true);
    sim.body.setLinvel({x:0,y:0,z:-20},true);
    sim.rivalBody!.setLinvel({x:0,y:0,z:10},true);
    let contact=false, rivalPushed=false;
    for(let tick=0;tick<25;tick++){
      step(sim,parked);
      sim.world.contactPair(sim.body.collider(0),sim.rivalBody!.collider(0),manifold=>{if(manifold.numSolverContacts()>0)contact=true;});
      if(sim.rivalBody!.linvel().z < -2)rivalPushed=true;
    }
    assert.ok(contact,"cars passed through one another");
    assert.ok(rivalPushed,"rival behaves like immovable kinematic traffic");
  } finally {sim.world.free();}
});
test("reset reproduces both vehicles, AI state, race clocks and the shared world",()=>{
  const sim=create();
  try {
    const run=()=>{
      for(let tick=0;tick<900;tick++)step(sim,{throttle:.6,brake:0,steer:Math.sin(tick/50)*.2,handbrake:0});
      return {state:JSON.stringify(sim.state),snapshot:sim.world.takeSnapshot()};
    };
    const first=run(); resetSim(sim); const second=run();
    assert.equal(second.state,first.state);
    assert.deepEqual(second.snapshot,first.snapshot);
  } finally {sim.world.free();}
});
test("free roam and races without an opponent retain a single player body",()=>{
  const sim=createSim("fwd",createAlderWorld());
  try {assert.equal(sim.rivalBody,null);assert.equal(sim.state.rival,null);}finally{sim.world.free();}
});


function cage(sim: Sim) {
  sim.state.race!.countdown = sim.state.rival!.race.countdown = 0;
  sim.rivalBody!.setTranslation({x:-9,y:2.5,z:850},true);
  for (const [x,z,width,depth] of [[-14,850,1,10],[-4,850,1,10],[-9,845,10,1],[-9,855,10,1]]) {
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(width!/2,1,depth!/2).setTranslation(x!,2.5,z!));
  }
}

test("twelve seconds without net progress resets a trapped rival nearby at rest",()=>{
  const sim=create(false);
  try {
    cage(sim);
    for(let tick=0;tick<1000 && sim.state.rival!.driver.noProgressTicks<RIVAL_RESET_TICKS-1;tick++) {
      step(sim,parked);
      assert.equal(sim.state.rival!.driver.resets,0,"reset fired before its timeout");
    }
    const rival=sim.state.rival!;
    assert.equal(rival.driver.noProgressTicks,RIVAL_RESET_TICKS-1);
    const old={...rival.vehicle}, clock=rival.race.ticks;
    step(sim,parked);
    assert.equal(rival.driver.resets,1);
    assert.ok(Math.hypot(old.x-rival.vehicle.x,old.z-rival.vehicle.z)<35);
    assert.equal(rival.vehicle.speed,0);
    assert.equal(rival.race.checkpoint,0);
    assert.equal(rival.race.ticks,clock+1,"reset must not rewind the race clock");
    assert.deepEqual(rival.race.splits,[]);
    for(let tick=0;tick<300;tick++)step(sim,parked);
    assert.ok(rival.vehicle.z<800,"reset did not let the rival escape the trap");
  } finally {sim.world.free();}
});

test("reset waits when local placements are obstructed and retries when clear",()=>{
  const sim=create(false);
  try {
    sim.state.rival!.race.countdown=0;
    sim.state.rival!.driver.noProgressTicks=RIVAL_RESET_TICKS;
    sim.state.rival!.driver.progressMark=10000;
    const blocker=sim.world.createCollider(RAPIER.ColliderDesc.cuboid(50,10,100).setTranslation(-9,2.5,947));
    step(sim,parked);
    assert.equal(sim.state.rival!.driver.resets,0);
    assert.ok(sim.state.rival!.driver.resetCheckIn>0);
    sim.world.removeCollider(blocker,true);
    for(let tick=0;tick<65;tick++)step(sim,parked);
    assert.equal(sim.state.rival!.driver.resets,1);
  } finally {sim.world.free();}
});

test("a reset cannot award an unpassed checkpoint or land on the player",()=>{
  const sim=create(false);
  try {
    const rival=sim.state.rival!, gate=ALDER_RACE.checkpoints[0]!;
    rival.race.countdown=0;
    rival.driver.along=ALDER_RIVAL.gates[0]!;
    rival.driver.progressMark=rival.driver.along+100;
    rival.driver.noProgressTicks=RIVAL_RESET_TICKS;
    sim.rivalBody!.setTranslation({x:gate.x,y:2.5,z:gate.z},true);
    sim.body.setTranslation({x:gate.x-25,y:2.5,z:gate.z},true);
    step(sim,parked);
    assert.equal(rival.driver.resets,1);
    assert.equal(rival.race.checkpoint,0);
    assert.ok(Math.hypot(rival.vehicle.x-gate.x,rival.vehicle.z-gate.z)>gate.radius);
    assert.ok(Math.hypot(rival.vehicle.x-sim.state.vehicle.x,rival.vehicle.z-sim.state.vehicle.z)>=8);
  } finally {sim.world.free();}
});

test("countdown and finished rivals never use the fallback reset",()=>{
  const sim=create(false);
  try {
    sim.state.rival!.driver.noProgressTicks=RIVAL_RESET_TICKS;
    step(sim,parked);
    assert.equal(sim.state.rival!.driver.resets,0);
    sim.state.rival!.race.countdown=0;sim.state.rival!.race.finished=true;
    step(sim,parked);
    assert.equal(sim.state.rival!.driver.resets,0);
  } finally {sim.world.free();}
});

test("fallback reset repeats deterministically with the same obstruction",()=>{
  const run=()=>{
    const sim=create(false);
    try {
      cage(sim);
      for(let tick=0;tick<1000;tick++)step(sim,parked);
      assert.equal(sim.state.rival!.driver.resets,1);
      return {state:JSON.stringify(sim.state),world:sim.world.takeSnapshot()};
    }finally{sim.world.free();}
  };
  const first=run(),second=run();
  assert.deepEqual(second,first);
});
