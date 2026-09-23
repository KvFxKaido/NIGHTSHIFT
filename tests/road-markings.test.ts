import { test } from "node:test";
import assert from "node:assert/strict";
import { roadMarkings } from "../src/render/road-markings.ts";
import type { Street } from "../src/sim/street-path.ts";
import { ALDER_FORECOURT, ALDER_STREETS, ALDER_SHOULDER } from "../src/sim/alder.ts";
import { projectOntoPath } from "../src/sim/street-path.ts";

function street(id: string, points: [number, number][], kind: Street["kind"] = "arterial"): Street {
  return { id, name: id, from: id + "a", to: id + "b", added: false, kind,
    points: points.map(([x, z]) => ({ x, z, y: 2, width: 20, zone: "freight" })) };
}

test("paint clears crossings in the middle of unsplit roads, including oblique crossings", () => {
  for (const skew of [0, 35]) {
    const roads = [street("main", [[-80, 0], [80, 0]]), street("cross", [[-skew, -80], [skew, 80]])];
    const paint = roadMarkings(roads);
    assert.ok(paint.some(p => p.color === "white"));
    assert.ok(paint.some(p => p.color === "yellow"));
    for (const mark of paint) {
      const x = (mark.ax + mark.bx) / 2, z = (mark.az + mark.bz) / 2;
      assert.ok(roads.filter(r => projectOntoPath(r.points, x, z).distance < 11.4).length <= 1);
    }
  }
});

test("alleys have no lane paint", () => {
  assert.deepEqual(roadMarkings([street("alley", [[0, 0], [100, 0]], "alley")]), []);
});

test("solid white shoulder boundaries follow both original carriageway edges",()=>{
  const road=street("main",[[-80,0],[80,0]]);
  const paint=roadMarkings([road],{shoulderWidth:5.6});
  const edges=paint.filter(p=>p.kind==="edge");
  assert.equal(edges.length,156);
  for(const mark of edges) {
    assert.equal(mark.color,"white");assert.equal(Math.abs(mark.az),10);assert.equal(mark.az,mark.bz);
    assert.ok(Math.abs(mark.bx-mark.ax)<=2);
  }
});

test("all paint stops before the widened crossing, including T junctions and oblique approaches",()=>{
  for(const skew of [0,35])for(const end of [0,80]) {
    const roads=[street("main",[[-80,0],[80,0]]),street("cross",[[-skew,-80],[skew,end]])];
    const paint=roadMarkings(roads,{shoulderWidth:5.6});
    assert.ok(paint.some(p=>p.kind==="edge"));
    for(const mark of paint)for(const t of [0,.25,.5,.75,1]) {
      const x=mark.ax+(mark.bx-mark.ax)*t,z=mark.az+(mark.bz-mark.az)*t;
      for(const road of roads.filter(r=>r.id!==mark.streetId)) {
        const on=projectOntoPath(road.points,x,z);
        assert.ok(on.distance>=on.width/2+5.6+1.49,`${mark.kind} extends into a crossing`);
      }
    }
  }
});

test("Port Alder markings leave every crossing shoulder clear",()=>{
  const paint=roadMarkings(ALDER_STREETS,{shoulderWidth:ALDER_SHOULDER});
  const bounds=ALDER_STREETS.map(street=>({street,
    minX:Math.min(...street.points.map(p=>p.x-p.width/2))-ALDER_SHOULDER-1.5,
    maxX:Math.max(...street.points.map(p=>p.x+p.width/2))+ALDER_SHOULDER+1.5,
    minZ:Math.min(...street.points.map(p=>p.z-p.width/2))-ALDER_SHOULDER-1.5,
    maxZ:Math.max(...street.points.map(p=>p.z+p.width/2))+ALDER_SHOULDER+1.5}));
  assert.ok(paint.filter(p=>p.kind==="edge").length>1000);
  for(const mark of paint)for(const t of [0,.5,1]) {
    const x=mark.ax+(mark.bx-mark.ax)*t,z=mark.az+(mark.bz-mark.az)*t;
    for(const b of bounds)if(b.street.id!==mark.streetId&&x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ) {
      const on=projectOntoPath(b.street.points,x,z);
      assert.ok(on.distance>=on.width/2+ALDER_SHOULDER+1.49,`${mark.streetId} paint extends into ${b.street.id}`);
    }
  }
});

test("Wharf apron meets the east kerb without covering the carriageway", () => {
  const road = ALDER_STREETS.find(s => s.id === "sea-29")!;
  const west = ALDER_FORECOURT.x - ALDER_FORECOURT.width / 2;
  for (const z of [890, 910, 930]) {
    const on = projectOntoPath(road.points, west, z);
    assert.ok(on.distance >= on.width / 2);
    assert.ok(on.distance < on.width / 2 + .1);
  }
});
