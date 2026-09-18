import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { ALDER_DATA as data, ALDER_BLOCKS, ALDER_GARAGE, ALDER_STREETS, ALDER_RACE, createAlderWorld, alderHeight, projectOntoAlder } from "../src/sim/alder.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { createSim, step } from "../src/sim/sim.ts";
import { createTraffic, stepTraffic, TRAFFIC_KINDS, type TrafficVehicleState } from "../src/sim/traffic.ts";
import { TRAFFIC_HEIGHT_STEP } from "../src/sim/street-traffic.ts";
import { hasContact } from "./helpers/handling.ts";

await RAPIER.init();

test("Port Alder is connected with alternate routes and reachable race gates", () => {
  const graph = new Map<string,string[]>();
  for (const s of ALDER_STREETS) {
    graph.set(s.from,[...(graph.get(s.from)??[]),s.to]);
    graph.set(s.to,[...(graph.get(s.to)??[]),s.from]);
  }
  const seen = new Set<string>(), pending = [ALDER_STREETS[0]!.from];
  while (pending.length) { const node = pending.pop()!; if(seen.has(node))continue; seen.add(node);pending.push(...graph.get(node)!); }
  assert.equal(seen.size,graph.size);
  assert.ok(ALDER_STREETS.length-graph.size+1 >= 10,"too few route choices");
  for (const neighbors of graph.values()) assert.ok(neighbors.length>=2,"unconnected map edge");
  for (const gate of ALDER_RACE.checkpoints) assert.ok(projectOntoAlder(gate.x,gate.z).distance<.01);
});

test("Port Alder rendered terrain follows the physics surface within 2 cm", () => {
  let maximum = 0;
  for (const points of [data.asphalt,data.pavement,data.ground]) {
    for (let i=0;i<points.length;i+=6) {
      const [ax,az,bx,bz,cx,cz]=points.slice(i,i+6) as [number,number,number,number,number,number];
      assert.ok((bx-ax)*(cz-az)-(bz-az)*(cx-ax)<=.001,"downward triangle");
      for (const [u,v,w] of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]) {
        const height=alderHeight(ax,az)*u!+alderHeight(bx,bz)*v!+alderHeight(cx,cz)*w!;
        maximum=Math.max(maximum,Math.abs(height-alderHeight(ax*u!+bx*v!+cx*w!,az*u!+bz*v!+cz*w!)));
      }
    }
  }
  assert.ok(maximum<.02,`surface deviation ${maximum} m`);
});

test("Port Alder building footprints leave every carriageway clear", () => {
  for (const s of ALDER_STREETS) for(let i=1;i<s.points.length;i++)
    for(const block of ALDER_BLOCKS) assert.ok(segmentFootprintDistance(block,s.points[i-1]!,s.points[i]!)>=s.points[i]!.width/2+2.8,
      `${s.id} clips building at ${block.x},${block.z}`);
});

test("Port Alder race spawn drives north clear of buildings and replays identically", () => {
  const world=createAlderWorld(true);
  const drive=()=>{
    const sim=createSim("fwd",world,{traffic:false});
    try {
      let contacts=0;
      for(let i=0;i<240;i++){step(sim,{throttle:1,brake:0,steer:0,handbrake:0});if(hasContact(sim))contacts++;}
      assert.equal(contacts,0);
      assert.ok(sim.state.vehicle.z<world.start.z-40,"spawn does not face north");
      assert.ok(projectOntoAlder(sim.state.vehicle.x,sim.state.vehicle.z).distance<8);
      return {...sim.state.vehicle};
    } finally {sim.world.free();}
  };
  assert.deepEqual(drive(),drive());
});

test("Port Alder free roam starts at the garage while races retain their street grid",()=>{
  assert.deepEqual(createAlderWorld().start,ALDER_GARAGE.entrance);
  assert.notDeepEqual(createAlderWorld(true).start,ALDER_GARAGE.entrance);
  const entrance=ALDER_GARAGE.entrance,building=ALDER_GARAGE.building;
  assert.ok(segmentFootprintDistance(building,entrance,{x:entrance.x,z:entrance.z+9})>=4.9,"chase camera sits inside garage");
});

// A vehicle changing lanes is written onto the new lane at the distance it
// carried across -- and consecutive lanes do not meet, so the pose jumps. Every
// other invariant here samples every tenth tick and compares vehicles to each
// other, which cannot see a one-tick discontinuity at all.
//
// It is not cosmetic. Traffic bodies are kinematic, so a jump sweeps the body
// through whatever is beside it, and Rapier evicts a dynamic car caught in that
// volume: measured at 84.9% of turns, worst 15.25 m, and it launched the Sound
// to Sky rival at 42 m/s into a fallback reset. Nothing may cover more ground in
// one tick than it could have driven.
test("no traffic vehicle teleports when it changes lane", () => {
  const network = createAlderWorld().traffic!;
  const traffic = createTraffic(network);
  let previous = traffic.vehicles.map(v => ({ x: v.x, z: v.z }));
  let worst = 0, worstAt = "", jumps = 0;
  for (let tick = 0; tick < 3600; tick++) {
    stepTraffic(network, traffic, 1 / 60);
    traffic.vehicles.forEach((v, i) => {
      const moved = Math.hypot(v.x - previous[i]!.x, v.z - previous[i]!.z);
      // Twice its legal step: closing a junction offset while still driving
      // forward covers ground on both counts, and that is the whole allowance.
      const allowed = TRAFFIC_KINDS[v.kind].cruise / 60 * 2 + 1e-6;
      if (moved > allowed) {
        jumps++;
        if (moved > worst) {
          worst = moved;
          worstAt = `${v.kind} #${v.id} moved ${moved.toFixed(2)} m in one tick ` +
            `at tick ${tick} (could have driven ${allowed.toFixed(3)} m)`;
        }
      }
      previous[i] = { x: v.x, z: v.z };
    });
  }
  assert.equal(jumps, 0, `${jumps} teleports; worst ${worstAt}`);
});

// What a settled vehicle stands on. The traffic guard below can only see the
// positions vehicles happen to occupy at a sampled tick, and the worst errors
// sit at narrow curvature kinks: it catches a 4 m step (7.9 cm) but a 2 m one
// (4.8 cm) survives it, because nobody is standing on the bad spot when it
// looks. This checks every lane position, whoever is driving where.
//
// The probe has to be finer than the step or it lands on the stored samples,
// where interpolation is exact by construction and the test measures nothing --
// a 0.5 m probe against a 0.5 m step reported a perfect 0.00 cm. At 0.25 m it
// checks midpoints; the true worst, probed at 0.1 m, is 1.12 cm.
test("the stored lane height profile follows the ground it stands on", () => {
  const network = createAlderWorld().traffic!;
  const PROBE = 0.25;
  assert.ok(PROBE < TRAFFIC_HEIGHT_STEP, "the probe must be finer than the step it judges");
  let worst = 0, where = "";
  for (const lane of network.lanes) {
    for (let d = 0; d <= lane.length; d += PROBE) {
      const pose = network.pose(lane.id, d);
      const drop = Math.abs(pose.y - alderHeight(pose.x, pose.z));
      if (drop > worst) { worst = drop; where = `lane ${lane.id} at ${d.toFixed(2)} m`; }
    }
  }
  assert.ok(worst < .02,
    `lane profile is ${(worst * 100).toFixed(2)} cm off the surface at ${where}`);
});

test("Port Alder traffic keeps moving on finite, connected lane paths", () => {
  const network=createAlderWorld().traffic!;
  for(const lane of network.lanes){assert.ok(lane.movements.length);assert.ok(lane.entry>0&&lane.entry<lane.length);}
  const traffic=createTraffic(network);
  assert.ok(traffic.vehicles.length>10);
  const extent=(v:TrafficVehicleState,x:number,z:number)=>{
    const spec=TRAFFIC_KINDS[v.kind];
    return Math.abs(-Math.sin(v.heading)*x-Math.cos(v.heading)*z)*spec.length/2
      +Math.abs(Math.cos(v.heading)*x-Math.sin(v.heading)*z)*spec.width/2;
  };
  let worst=0,where="";
  // Every vehicle, every sampled tick. Checking only the final state caught a
  // mid-crossing error by luck once, and would not have caught the profile at
  // all: at a 4 m step the stored heights missed the hills by up to 7.9 cm.
  //
  // Both halves have to hold for this to pass. A crossing vehicle is between
  // two lanes and has its height resampled exactly; a settled one takes it from
  // the stored profile, whose step (TRAFFIC_HEIGHT_STEP) is sized to stay
  // inside this tolerance rather than merely near it.
  let offGround="";
  for(let tick=0;tick<7200;tick++){
    stepTraffic(network,traffic,1/60);
    if(tick%10)continue;
    if(!offGround)for(const v of traffic.vehicles){
      const drop=Math.abs(v.y-alderHeight(v.x,v.z));
      if(drop>=.02){offGround=`#${v.id} ${drop.toFixed(3)} m off the ground at tick ${tick}`+
        `${v.blendLeft>0?" (mid-crossing)":" (settled on its lane)"}`;break;}
    }
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
    assert.ok(Math.abs(v.y-alderHeight(v.x,v.z))<.02);
  }
  assert.ok(!offGround,`traffic left the road surface: ${offGround}`);
  assert.ok(traffic.vehicles.filter(v=>v.turns>0).length>traffic.vehicles.length*.5,"most traffic never crossed a junction");
});

// A road cut across a hillside tilts the car with it. Queen Anne Climb falls
// 8 degrees across its carriageway here and hardly at all along it, and the car
// used to sit level on it: pitch came from the slope along the road and nothing
// read the slope across. Roll is drawn only, like pitch; the authored course,
// with no ground under it to slope, keeps the car level across.
test("a car on a hillside leans with it; on authored track it stays level", () => {
  const x = -974, z = -2468, road = projectOntoAlder(x, z);
  // A race world, since only a race honours a start of its own; free roam starts at the garage.
  const world = createAlderWorld(true, { x, y: road.height, z, heading: Math.atan2(-road.ux, -road.uz), pitch: 0 });
  const sim = createSim("rwd", world, { traffic: false });
  try {
    for (let i = 0; i < 120; i++) step(sim, { throttle: 0, brake: 1, steer: 0, handbrake: 1 });
    const car = sim.state.vehicle, ground = projectOntoAlder(car.x, car.z);
    const across = Math.atan(ground.gradeX! * Math.cos(car.heading) - ground.gradeZ! * Math.sin(car.heading));
    const along = Math.atan(-ground.gradeX! * Math.sin(car.heading) - ground.gradeZ! * Math.cos(car.heading));
    assert.ok(Math.abs(across) > 0.12, `the test spot is not the hillside it was: ${across.toFixed(3)} rad across`);
    assert.ok(Math.abs(car.roll - across) < 0.002, `roll ${car.roll.toFixed(4)} against the ground's ${across.toFixed(4)}`);
    assert.ok(Math.abs(car.pitch - along) < 0.002, `pitch ${car.pitch.toFixed(4)} against the ground's ${along.toFixed(4)}`);
  } finally { sim.world.free(); }
  const track = createSim("awd");
  try {
    for (let i = 0; i < 240; i++) step(track, { throttle: 1, brake: 0, steer: 0.3, handbrake: 0 });
    assert.equal(track.state.vehicle.roll, 0);
  } finally { track.world.free(); }
});
