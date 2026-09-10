import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { SEATTLE_DATA as data, SEATTLE_BLOCKS, SEATTLE_GARAGE, SEATTLE_STREETS, SEATTLE_RACE, createSeattleWorld, seattleHeight, projectOntoSeattle } from "../src/sim/seattle.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { createTraffic, stepTraffic, TRAFFIC_KINDS, type TrafficVehicleState } from "../src/sim/traffic.ts";
import { hasContact } from "./helpers/handling.ts";

await RAPIER.init();

test("Seattle is connected with alternate routes and reachable race gates", () => {
  const graph = new Map<string,string[]>();
  for (const s of SEATTLE_STREETS) {
    graph.set(s.from,[...(graph.get(s.from)??[]),s.to]);
    graph.set(s.to,[...(graph.get(s.to)??[]),s.from]);
  }
  const seen = new Set<string>(), pending = [SEATTLE_STREETS[0]!.from];
  while (pending.length) { const node = pending.pop()!; if(seen.has(node))continue; seen.add(node);pending.push(...graph.get(node)!); }
  assert.equal(seen.size,graph.size);
  assert.ok(SEATTLE_STREETS.length-graph.size+1 >= 10,"too few route choices");
  for (const neighbors of graph.values()) assert.ok(neighbors.length>=2,"unconnected map edge");
  for (const gate of SEATTLE_RACE.checkpoints) assert.ok(projectOntoSeattle(gate.x,gate.z).distance<.01);
});

test("Seattle rendered terrain follows the physics surface within 2 cm", () => {
  let maximum = 0;
  for (const points of [data.asphalt,data.pavement,data.ground]) {
    for (let i=0;i<points.length;i+=6) {
      const [ax,az,bx,bz,cx,cz]=points.slice(i,i+6) as [number,number,number,number,number,number];
      assert.ok((bx-ax)*(cz-az)-(bz-az)*(cx-ax)<=.001,"downward triangle");
      for (const [u,v,w] of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]) {
        const height=seattleHeight(ax,az)*u!+seattleHeight(bx,bz)*v!+seattleHeight(cx,cz)*w!;
        maximum=Math.max(maximum,Math.abs(height-seattleHeight(ax*u!+bx*v!+cx*w!,az*u!+bz*v!+cz*w!)));
      }
    }
  }
  assert.ok(maximum<.02,`surface deviation ${maximum} m`);
});

test("Seattle building footprints leave every carriageway clear", () => {
  for (const s of SEATTLE_STREETS) for(let i=1;i<s.points.length;i++)
    for(const block of SEATTLE_BLOCKS) assert.ok(segmentFootprintDistance(block,s.points[i-1]!,s.points[i]!)>=s.points[i]!.width/2+2.8,
      `${s.id} clips building at ${block.x},${block.z}`);
});

test("Seattle race spawn drives north clear of buildings and replays identically", () => {
  const world=createSeattleWorld(true);
  const drive=()=>{
    const sim=createSim("fwd",world,{traffic:false});
    try {
      let contacts=0;
      for(let i=0;i<240;i++){step(sim,{throttle:1,brake:0,steer:0,handbrake:0});if(hasContact(sim))contacts++;}
      assert.equal(contacts,0);
      assert.ok(sim.state.vehicle.z<world.start.z-40,"spawn does not face north");
      assert.ok(projectOntoSeattle(sim.state.vehicle.x,sim.state.vehicle.z).distance<8);
      return {...sim.state.vehicle};
    } finally {sim.world.free();}
  };
  assert.deepEqual(drive(),drive());
});

test("Seattle free roam starts at the garage while races retain their street grid",()=>{
  assert.deepEqual(createSeattleWorld().start,SEATTLE_GARAGE.entrance);
  assert.notDeepEqual(createSeattleWorld(true).start,SEATTLE_GARAGE.entrance);
  const entrance=SEATTLE_GARAGE.entrance,building=SEATTLE_GARAGE.building;
  assert.ok(segmentFootprintDistance(building,entrance,{x:entrance.x,z:entrance.z+9})>=4.9,"chase camera sits inside garage");
});

test("Seattle traffic keeps moving on finite, connected lane paths", () => {
  const network=createSeattleWorld().traffic!;
  for(const lane of network.lanes){assert.ok(lane.movements.length);assert.ok(lane.entry>0&&lane.entry<lane.length);}
  const traffic=createTraffic(network);
  assert.ok(traffic.vehicles.length>10);
  const extent=(v:TrafficVehicleState,x:number,z:number)=>{
    const spec=TRAFFIC_KINDS[v.kind];
    return Math.abs(-Math.sin(v.heading)*x-Math.cos(v.heading)*z)*spec.length/2
      +Math.abs(Math.cos(v.heading)*x-Math.sin(v.heading)*z)*spec.width/2;
  };
  let worst=0,where="";
  for(let tick=0;tick<7200;tick++){
    stepTraffic(network,traffic,1/60);
    if(tick%10)continue;
    for(let i=0;i<traffic.vehicles.length;i++)for(let j=i+1;j<traffic.vehicles.length;j++){
      const a=traffic.vehicles[i]!,b=traffic.vehicles[j]!;
      if(Math.hypot(a.x-b.x,a.z-b.z)>12)continue;
      let depth=Infinity;
      for(const v of [a,b])for(const [x,z] of [[-Math.sin(v.heading),-Math.cos(v.heading)],[Math.cos(v.heading),-Math.sin(v.heading)]]){
        depth=Math.min(depth,extent(a,x!,z!)+extent(b,x!,z!)-Math.abs((b.x-a.x)*x!+(b.z-a.z)*z!));
      }
      if(depth>worst){worst=depth;where=`${a.id}/${b.id} at ${a.x},${a.z} tick ${tick}`;}
    }
  }
  assert.ok(worst<.25,`traffic overlap ${worst} m: ${where}`);
  for(const v of traffic.vehicles){
    assert.ok([v.x,v.y,v.z,v.speed,v.heading].every(Number.isFinite));
    assert.ok(Math.abs(v.y-seattleHeight(v.x,v.z))<.02);
  }
  assert.ok(traffic.vehicles.filter(v=>v.turns>0).length>traffic.vehicles.length*.5,"most traffic never crossed a junction");
});
