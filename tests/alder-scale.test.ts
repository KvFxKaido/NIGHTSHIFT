import assert from "node:assert/strict";
import test from "node:test";
import data from "../src/sim/alder-data.json" with { type: "json" };
import { ALDER_BLOCKS, GENERATED_ALDER_BLOCKS, ALDER_EVERGREENS, ALDER_STREETS, ARENA_ROADS, ALDER_TREES,
  ALDER_CORNER_SOLIDS, ALDER_PARKING_RESERVES, alderHeight, createAlderWorld } from "../src/sim/alder.ts";
import landmarks from "../src/sim/alder-landmarks.json" with { type: "json" };
import { YARD_STRUCTURES, YARD_RESERVE } from "../src/sim/drift-yard.ts";
import { SKYLINE_PEAKS, scaleAlderSkyline } from "../src/sim/alder-skyline.ts";
import { createEvergreens, evergreenPassage } from "../src/sim/alder-evergreens.ts";
import { facadeGrid } from "../src/render/night.ts";
import { parseAuthoredLayout } from "../src/sim/building-layout.ts";

test("sixteen skyline peaks add floors while preserving every building footprint and shared collision", () => {
  const scaled=scaleAlderSkyline(data.buildings);
  assert.deepEqual(GENERATED_ALDER_BLOCKS.slice(0,-1),scaled);
  let changed=0;
  for(let i=0;i<scaled.length;i++) {
    const before=data.buildings[i]!,after=scaled[i]!;
    assert.deepEqual({...after,height:before.height},before);
    if(after.height===before.height) continue;
    changed++; assert.equal(after.height,before.height*1.5);
    const live=ALDER_BLOCKS.find(b=>b.x===after.x&&b.z===after.z)!;
    assert.equal(live.height,after.height);assert.ok(createAlderWorld().solids!.includes(live));
    const floors=facadeGrid(after.width,after.height).floors;
    assert.ok(floors>facadeGrid(before.width,before.height).floors);
    assert.ok(Math.abs(after.height/floors-3.6)<.2,"add normal floors rather than tall windows");
  }
  assert.equal(changed,SKYLINE_PEAKS.length);assert.equal(changed,16);
  assert.equal(Math.max(...scaled.map(b=>b.height)),111);
  const b=scaled.find(b=>b.height===111)!;
  assert.doesNotThrow(()=>parseAuthoredLayout({schema:2,retired:[],authored:[{...b,id:"authored-tall-tower"}]}));
  assert.throws(()=>parseAuthoredLayout({schema:2,retired:[],authored:[{...b,id:"authored-tall-tower",height:151}]}));
});

test("old growth enlarges a small repeatable subset without moving, adding or deleting any tree", () => {
  const baseline=createEvergreens([...ALDER_STREETS,...ARENA_ROADS],
    [...ALDER_BLOCKS,...YARD_STRUCTURES,YARD_RESERVE,landmarks.broadcastTower,...ALDER_TREES,...ALDER_CORNER_SOLIDS,...ALDER_PARKING_RESERVES,
      {x:6.5,z:910,width:35,depth:44,height:1,base:2,rotation:0}],alderHeight,{oldGrowth:false});
  assert.equal(ALDER_EVERGREENS.filter(t=>t.grove!=="broadcast-campus").length,4439);
  assert.equal(ALDER_EVERGREENS.filter(t=>t.grove==="broadcast-campus").length,90);
  assert.equal(baseline.length,ALDER_EVERGREENS.length);
  let changed=0;
  ALDER_EVERGREENS.forEach((tree,i)=>{
    const before=baseline[i]!;assert.equal(tree.id,before.id);
    assert.equal(tree.trunk.x,before.trunk.x);assert.equal(tree.trunk.z,before.trunk.z);
    if(!tree.oldGrowth) {assert.deepEqual(tree,before);return;}
    changed++;assert.notEqual(tree.grove,"freight-edge");
    assert.equal(tree.height,before.height*1.5);assert.equal(tree.radius,before.radius*1.5);
    assert.equal(tree.trunk.width,before.trunk.width*1.5);assert.equal(tree.trunk.depth,before.trunk.depth*1.5);
    assert.ok(!evergreenPassage(tree.trunk.x,tree.trunk.z,tree.radius),"keep the full grown crown off reserved passages");
  });
  assert.ok(changed/baseline.length>=.04 && changed/baseline.length<=.065,`old-growth share: ${changed/baseline.length}`);
});
