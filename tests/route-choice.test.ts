import assert from "node:assert/strict";
import test from "node:test";
import { sightDistance, blindness, routeRisk, SIGHT_CLEAR, buildRoutingGraph, route } from "../src/sim/route-choice.ts";
import { alderRouting, ALDER_STREETS, ALDER_GARAGE, alderHeight } from "../src/sim/alder.ts";
import released from "../assets/maps/alder/belltown-slice.json" with { type: "json" };

// Blind corners are sight distances: how far before a corner a driver first
// sees down the other arm past what stands on the inside. Measured at bends
// inside a street and at every junction approach, and the second is what makes
// the term live on a grid, where the turns are at the junctions.

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

test("the sight triangle: a corner ten metres in from both kerbs of a right-angle junction is seen from twenty metres", () => {
  const at = { x: 0, z: 0 };
  const back = { x: -1, z: 0 };          // the approach came from the west
  const arm = { x: 0, z: -1 };           // the other arm runs north
  // Inside the wedge, on the bisector: projection 10√2, over cos 45° = 20 m.
  assert.ok(near(sightDistance(at, back, arm, [{ x: -10, z: -10 }]), 20), `got ${sightDistance(at, back, arm, [{ x: -10, z: -10 }])}`);
  // The nearer of two corners decides.
  assert.ok(near(sightDistance(at, back, arm, [{ x: -10, z: -10 }, { x: -5, z: -5 }]), 10));
  // Across the approach, or beyond the arm: not in the wedge, not in the way.
  assert.equal(sightDistance(at, back, arm, [{ x: -10, z: 10 }]), Infinity);
  assert.equal(sightDistance(at, back, arm, [{ x: 10, z: -10 }]), Infinity);
  // Straight on: nothing can stand between you and it.
  assert.equal(sightDistance(at, back, { x: 1, z: 0 }, [{ x: -1, z: -1 }, { x: 1, z: -1 }]), Infinity);
  // A 60° corner: a corner ten metres down the bisector is seen from 10 / cos 30°.
  const sharp = { x: -0.5, z: -Math.sqrt(3) / 2 };
  assert.ok(near(sightDistance(at, back, sharp, [{ x: -8.660254037844386, z: -5 }]), 10 / Math.cos(Math.PI / 6), 1e-6));
});

test("blindness is 1 − sight / clear, floored at nothing and capped at everything", () => {
  assert.equal(blindness(Infinity), 0);
  assert.equal(blindness(SIGHT_CLEAR), 0);
  assert.ok(near(blindness(SIGHT_CLEAR / 2), 0.5));
  assert.equal(blindness(0), 1);
});

test("on released southwest Port Alder the blindest approach remains Yesler at 1st, and dozens are inside the clear distance", () => {
  // This measured distribution describes v3, not every future city expansion.
  const graph = buildRoutingGraph(ALDER_STREETS.slice(0,released.roads.length),alderHeight,
    [...released.buildings,ALDER_GARAGE.building]);
  const approaches = graph.drives;
  const nearest = Math.min(...approaches.map(d => d.sight));
  assert.ok(nearest > 20 && nearest < 30, `nearest sight ${nearest.toFixed(1)} m`);
  const blindest = approaches.filter(d => near(d.sight, nearest, 0.01));
  assert.ok(blindest.some(d => graph.nodeName(d.to).includes("Yesler Way") && graph.nodeName(d.to).includes("1St Ave")),
    `blindest approaches arrive at ${[...new Set(blindest.map(d => graph.nodeName(d.to)))].join("; ")}`);
  const inside = approaches.filter(d => d.sight < SIGHT_CLEAR).length;
  assert.ok(inside >= 30 && inside <= approaches.length / 3, `${inside} of ${approaches.length} approaches inside ${SIGHT_CLEAR} m`);
  // Bends inside a street measure the same way; 6th Ave S's right angle is under the clear distance.
  const sixth = [...graph.measures.values()].find(m => m.name === "6Th Ave S")!;
  assert.ok(sixth.sight < SIGHT_CLEAR && sixth.blind > 0, `6th Ave S bend sees ${sixth.sight.toFixed(0)} m`);
});

test("cached all-destination routing preserves target-stopped paths and turn costs", () => {
  const graph = alderRouting();
  for (const from of [graph.nodes[0]!,graph.nodes[Math.floor(graph.nodes.length/2)]!,graph.nodes.at(-1)!]) {
    for (const to of graph.nodes) {
      // A nonexistent closure forces the uncached target-stopped search while
      // leaving exactly the same streets available. Includes cycles to origin.
      assert.deepEqual(route(graph,from,to),route(graph,from,to,"absent-street"),`${from} -> ${to}`);
    }
  }
});

test("a blind approach raises the risk of the route that takes it, and an open one does not", () => {
  const graph = alderRouting();
  let raised = 0;
  for (const d of graph.drives) {
    const street = graph.measures.get(d.id)!.risk, route = routeRisk(graph, [d]);
    if (d.sight < SIGHT_CLEAR) { assert.ok(route > street + 1e-9, `${d.id} arrives blind at ${d.sight.toFixed(0)} m but costs nothing`); raised++; }
    else assert.ok(near(route, street), `${d.id} arrives open but its route risk moved`);
  }
  assert.ok(raised >= 30, `only ${raised} approaches raised a route's risk`);
});
