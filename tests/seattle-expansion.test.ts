import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import released from "../assets/maps/seattle/belltown-slice.json" with { type: "json" };
import extension from "../assets/maps/seattle/east-hills-layout.json" with { type: "json" };
import { SEATTLE_DATA, SEATTLE_TREES, SEATTLE_STREETS, seattleHeight, createSeattleWorld } from "../src/sim/seattle.ts";
import { createSim, step } from "../src/sim/sim.ts";
import type { RivalDefinition } from "../src/sim/rival.ts";

// Measure the connected streets, excluding terrain padding and renderer bounds.
function hullArea(points: number[][]): number {
  const sorted = [...new Map(points.map(p=>[p.join(","),p])).values()].sort((a,b)=>a[0]!-b[0]!||a[1]!-b[1]!);
  const cross = (a:number[],b:number[],c:number[]) => (b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
  function half(ordered:number[][]) {
    const result:number[][]=[];
    for(const point of ordered) {
      while(result.length>1&&cross(result.at(-2)!,result.at(-1)!,point)<=0)result.pop();
      result.push(point);
    }
    return result.slice(0,-1);
  }
  const hull=[...half(sorted),...half([...sorted].reverse())];
  return Math.abs(hull.reduce((sum,p,i)=>{const q=hull[(i+1)%hull.length]!;return sum+p[0]!*q[1]!-q[0]!*p[1]!;},0))/2;
}

test("expanded connected streets enclose at least ten square kilometres without terrain padding", () => {
  const points=SEATTLE_DATA.roads.flatMap(road=>road.points);
  const area=hullArea(points)/1e6;
  assert.ok(area>=10,`street footprint only ${area} km²`);
  assert.ok(Math.abs(area-SEATTLE_DATA.roadHullKm2)<.0001);
  const graph=new Map<string,string[]>();
  for(const street of SEATTLE_STREETS) for(const [from,to] of [[street.from,street.to],[street.to,street.from]]) {
    graph.set(from!,[...graph.get(from!)??[],to!]);
  }
  const seen=new Set<string>(),todo=[SEATTLE_STREETS[0]!.from];
  while(todo.length){const at=todo.pop()!;if(seen.has(at))continue;seen.add(at);todo.push(...graph.get(at)??[]);}
  assert.equal(seen.size,graph.size,"new districts must connect to the garage's network");
  for(const [node,neighbors] of graph)assert.ok(neighbors.length>=2,`dead end at ${node}`);
});

test("expansion preserves released southwest roads, plots and their grades", () => {
  assert.deepEqual(SEATTLE_DATA.roads.slice(0,released.roads.length),released.roads);
  assert.deepEqual(SEATTLE_DATA.buildings.slice(0,released.buildings.length),released.buildings);
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  for(const road of released.roads)for(const [x,z] of road.points) {
    assert.equal(seattleHeight(x!,z!),2+34*smooth((x!+50)/640)*smooth((330-z!)/500));
  }
  for(const tree of SEATTLE_TREES)assert.ok(createSeattleWorld().solids!.includes(tree));
  assert.ok(seattleHeight(-730,-2420)>50,"Queen Anne needs a distinct climb");
  assert.ok(seattleHeight(1150,-2240)>80,"Capitol Hill needs its high ground");
});

await RAPIER.init();
test("traffic height reaches the exact endpoint on graded lanes",()=>{
  const network=createSeattleWorld().traffic!;
  for(const lane of network.lanes) {
    const pose=network.pose(lane.id,lane.length);
    assert.ok(Math.abs(pose.y-seattleHeight(pose.x,pose.z))<.00001,`lane ${lane.id} endpoint height`);
  }
});
for(const name of ["Queen Anne Climb","Ridge Scenic Way"])test(`the real rival drives ${name} through the new hills`,()=>{
  const authored=extension.roads.find(r=>r.name===name)!;
  const points:{x:number;y:number;z:number;width:number;zone:"old-quarter"}[]=[];
  for(let i=1;i<authored.points.length;i++) {
    const a=authored.points[i-1]!,b=authored.points[i]!,count=Math.ceil(Math.hypot(b[0]!-a[0]!,b[1]!-a[1]!)/25);
    for(let j=i===1?0:1;j<=count;j++) {
      const x=a[0]!+(b[0]!-a[0]!)*j/count,z=a[1]!+(b[1]!-a[1]!)*j/count;
      points.push({x,z,y:seattleHeight(x,z),width:authored.width,zone:"old-quarter"});
    }
  }
  const along=[0];for(let i=1;i<points.length;i++)along.push(along.at(-1)!+Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.z-points[i-1]!.z));
  const first=points[0]!,next=points[1]!,last=points.at(-1)!;
  const rival:RivalDefinition={id:name,points,along,gates:[along.at(-1)!],start:{...first,heading:Math.atan2(first.x-next.x,first.z-next.z),pitch:0}};
  const race={id:name,name,countdownTicks:0,checkpoints:[{id:"finish",name:"Finish",x:last.x,z:last.z,radius:20}]};
  const sim=createSim("fwd",createSeattleWorld(),{traffic:false,race,rival});
  try {
    for(let tick=0;tick<30000&&!sim.state.rival!.race.finished;tick++)step(sim,{throttle:0,brake:0,steer:0,handbrake:1});
    assert.ok(sim.state.rival!.race.finished,`${name}: ${JSON.stringify(sim.state.rival!.driver)}`);
    assert.equal(sim.state.rival!.driver.resets,0,"a clear new road must not require a reset");
  }finally{sim.world.free();}
});
