import assert from "node:assert/strict";
import test from "node:test";
import { ALDER_STREETS, ALDER_SOLIDS, ALDER_BLOCKS, ALDER_CORNER_SOLIDS,
  ALDER_LAMP_POSES, ALDER_BIN_POSES, ALDER_SHOULDER, ALDER_PAVED_MARGIN,
  ALDER_GENERATED_SITES, ALDER_FRONTAGE_ISSUES, ALDER_GROUNDS_ISSUES } from "../src/sim/alder.ts";
import { blockCorners, blockPenetration, segmentFootprintDistance, spatialIndex } from "../src/sim/building-footprint.ts";
import clearance from "../src/sim/alder-clearance.json" with { type: "json" };

const segments=ALDER_STREETS.flatMap(street=>street.points.slice(1).map((b,i)=>({a:street.points[i]!,b})));
const near=spatialIndex(segments,({a,b})=>{
  const reach=Math.max(a.width,b.width)/2+ALDER_PAVED_MARGIN+1;
  return {minX:Math.min(a.x,b.x)-reach,maxX:Math.max(a.x,b.x)+reach,
    minZ:Math.min(a.z,b.z)-reach,maxZ:Math.max(a.z,b.z)+reach};
});

test("all collision footprints and street props clear every asphalt shoulder",()=>{
  const props=[...ALDER_LAMP_POSES,...ALDER_BIN_POSES].map(p=>({...p,width:1,depth:1,height:1,base:0,rotation:0}));
  for(const block of [...ALDER_SOLIDS,...props]) {
    const candidates=new Set([block,...blockCorners(block)].flatMap(p=>near(p.x,p.z)));
    for(const {a,b} of candidates)assert.ok(segmentFootprintDistance(block,a,b)>=Math.max(a.width,b.width)/2+ALDER_SHOULDER-.002,
      `shoulder obstructed at ${block.x},${block.z}`);
  }
});

test("cleared buildings and corner groups leave the sidewalk open without new building overlaps",()=>{
  for(const block of [...ALDER_BLOCKS,...ALDER_CORNER_SOLIDS]) {
    for(const {a,b} of new Set([block,...blockCorners(block)].flatMap(p=>near(p.x,p.z))))
      assert.ok(segmentFootprintDistance(block,a,b)>=Math.max(a.width,b.width)/2+ALDER_PAVED_MARGIN-.002);
  }
  for(const site of ALDER_GENERATED_SITES.filter(s=>s.id in clearance.buildings))
    for(const other of ALDER_BLOCKS)if(other!==site.block && Math.hypot(other.x-site.block.x,other.z-site.block.z)<100
      && !(other.x===site.block.x&&other.z===site.block.z))
      assert.ok(blockPenetration(site.block,other)<=.001,`${site.id}: relocation overlaps another building`);
  assert.deepEqual(ALDER_FRONTAGE_ISSUES,[]);
  assert.deepEqual(ALDER_GROUNDS_ISSUES,[]);
});
