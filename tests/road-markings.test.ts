import { test } from "node:test";
import assert from "node:assert/strict";
import { roadMarkings } from "../src/render/road-markings.ts";
import type { Street } from "../src/sim/street-path.ts";
import { ALDER_FORECOURT, ALDER_STREETS } from "../src/sim/alder.ts";
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

test("Wharf apron meets the east kerb without covering the carriageway", () => {
  const road = ALDER_STREETS.find(s => s.id === "sea-29")!;
  const west = ALDER_FORECOURT.x - ALDER_FORECOURT.width / 2;
  for (const z of [890, 910, 930]) {
    const on = projectOntoPath(road.points, west, z);
    assert.ok(on.distance >= on.width / 2);
    assert.ok(on.distance < on.width / 2 + .1);
  }
});
