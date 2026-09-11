import assert from "node:assert/strict";
import test from "node:test";
import base from "../assets/maps/seattle/base-slice.json" with { type: "json" };
import landmarks from "../src/sim/seattle-landmarks.json" with { type: "json" };
import { SEATTLE_DATA, SEATTLE_STREETS, SEATTLE_VERSION, createSeattleWorld } from "../src/sim/seattle.ts";
import { segmentFootprintDistance } from "../src/sim/building-footprint.ts";

test("north expansion preserves original street identities, shapes and building plots", () => {
  assert.deepEqual(SEATTLE_DATA.roads.slice(0,base.roads.length),base.roads);
  assert.deepEqual(SEATTLE_DATA.buildings.slice(0,base.buildings.length),base.buildings);
  assert.equal(SEATTLE_DATA.version,SEATTLE_VERSION);
  assert.equal(new Set(SEATTLE_STREETS.map(s=>s.id)).size,SEATTLE_STREETS.length);
});

test("waterfront and downtown approaches all reach Seattle Center through the addition", () => {
  const graph = new Map<string,string[]>();
  for (const street of SEATTLE_STREETS.filter(s=>s.id.startsWith("sea-north-"))) {
    graph.set(street.from,[...(graph.get(street.from)??[]),street.to]);
    graph.set(street.to,[...(graph.get(street.to)??[]),street.from]);
  }
  for (const start of ["-589.36,-708.02","-524.683,-775.007","-213.0,-628.0","-117.0,-680.0"]) {
    const seen = new Set<string>(), todo = [start];
    while (todo.length) {
      const at = todo.pop()!;
      if (seen.has(at)) continue;
      seen.add(at);todo.push(...graph.get(at)??[]);
    }
    assert.ok(seen.has("-989.0,-1480.0"),`${start} cannot reach Mercer / Queen Anne`);
  }
});

test("Space Needle has a shared solid footprint with road clearance", () => {
  assert.ok(createSeattleWorld().solids!.includes(landmarks.needle));
  for (const street of SEATTLE_STREETS) for (let i=1;i<street.points.length;i++) {
    assert.ok(segmentFootprintDistance(landmarks.needle,street.points[i-1]!,street.points[i]!)>
      street.points[i]!.width/2+2.8,`landmark obstructs ${street.name}`);
  }
});
