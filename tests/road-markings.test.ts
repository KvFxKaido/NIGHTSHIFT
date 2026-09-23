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

// A junction approach has a square end just beyond its axis, rather than a
// semicircle that reaches across the far-side lanes of a T junction.
function beyondApproach(road: Street, x: number, z: number): boolean {
  const p = road.points, first = p[0]!, last = p.at(-1)!;
  if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) return false;
  const on = projectOntoPath(p, x, z);
  const dot = (origin: typeof first, to: typeof first) =>
    ((x - origin.x) * (to.x - origin.x) + (z - origin.z) * (to.z - origin.z)) / Math.hypot(to.x - origin.x, to.z - origin.z);
  return (on.segmentIndex === 0 && dot(first, p[1]!) < -1.5) ||
    (on.segmentIndex === p.length - 2 && dot(last, p.at(-2)!) < -1.5);
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
        if (beyondApproach(road, x, z)) continue;
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
      if (beyondApproach(b.street, x, z)) continue;
      const on=projectOntoPath(b.street.points,x,z);
      assert.ok(on.distance>=on.width/2+ALDER_SHOULDER+1.49,`${mark.streetId} paint extends into ${b.street.id}`);
    }
  }
});

test("a T junction opens the near shoulder but preserves the opposite shoulder line", () => {
  const paint = roadMarkings([street("main", [[-80, 0], [80, 0]]), street("side", [[0, -80], [0, 0]])], { shoulderWidth: 5.6 });
  const far = paint.filter(p => p.streetId === "main" && p.kind === "edge" && p.az === 10 && p.ax >= -20 && p.bx <= 20);
  assert.equal(far.reduce((sum, p) => sum + p.bx - p.ax, 0), 40);
  assert.ok(!paint.some(p => p.streetId === "main" && p.kind === "edge" && p.az === -10 && Math.abs((p.ax + p.bx) / 2) < 17));
});

test("right-angle and oblique bends keep edge paint on its offset rail without diagonal jumps", () => {
  for (const end of [[60, 60], [100, 45], [30, 70]] as [number, number][]) {
    const road = street("bend", [[0, 0], [60, 0], end]);
    const paint = roadMarkings([road]);
    for (const p of paint) {
      assert.ok(Math.hypot(p.bx - p.ax, p.bz - p.az) <= 2.00001, "a bend stretched a paint strip");
      if (p.kind !== "edge") continue;
      for (const t of [0, .25, .5, .75, 1]) {
        const on = projectOntoPath(road.points, p.ax + (p.bx - p.ax) * t, p.az + (p.bz - p.az) * t);
        assert.ok(Math.abs(on.distance - 10) < .04, `edge cut diagonally across the corner: ${on.distance}`);
      }
    }
  }
});

test("divider dashes retain four metres of paint through bends, and closed solid rails have no seam", () => {
  const road = street("bend", [[0, 0], [60, 0], [60, 60]]);
  const divider = roadMarkings([road]).filter(p => p.kind === "divider");
  const runs: number[] = [];
  let last = divider[0]!, length = 0;
  for (const p of divider) {
    if (length && Math.hypot(last.bx - p.ax, last.bz - p.az) > 1e-5) { runs.push(length); length = 0; }
    length += Math.hypot(p.bx - p.ax, p.bz - p.az); last = p;
  }
  runs.push(length);
  assert.ok(runs.filter(n => Math.abs(n - 4) < 1e-4).length >= 16, "full dashes lost their measured length");
  const loop = roadMarkings([street("loop", [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]])]).filter(p => p.kind === "centre");
  for (const p of loop)
    assert.ok(loop.some(next => Math.hypot(p.bx - next.ax, p.bz - next.az) < 1e-5), "closed centreline has an artificial gap");
});

test("no Port Alder corner stretches a two-metre paint strip across a lane", () => {
  for (const p of roadMarkings(ALDER_STREETS, { shoulderWidth: ALDER_SHOULDER }))
    assert.ok(Math.hypot(p.bx - p.ax, p.bz - p.az) <= 2.00001, `${p.streetId} has a diagonal paint jump`);
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
