import assert from "node:assert/strict";
import test from "node:test";
import { createStreetNamer, plateName } from "../src/ui/street-name.ts";

// The HUD's street plate (MCLA's, 2026-09-26). A crossroads: Harbor Way east-west through the origin, 1st Ave north
// from it in two entries that meet at z = -100, as the street data splits roads.
const width = 16;
const street = (name: string, points: [number, number][]) => ({ name, points: points.map(([x, z]) => ({ x, z, width })) });
const streets = [
  street("Harbor Way", [[-300, 0], [300, 0]]),
  street("1St Ave", [[0, 0], [0, -100]]),
  street("1St Ave", [[0, -100], [0, -300]]),
];

test("plate names are upper case with single spaces", () => {
  assert.equal(plateName("1St Ave S"), "1ST AVE S");
  assert.equal(plateName("  Queen  Anne Ave N "), "QUEEN ANNE AVE N");
});

test("the plate names the street under the car", () => {
  const namer = createStreetNamer(streets);
  assert.equal(namer.at(-150, 2, 0), "HARBOR WAY");
  assert.equal(createStreetNamer(streets).at(3, -200, 0), "1ST AVE");
});

// At a junction the car is on both streets' asphalt, and the nearer centreline swaps as it crosses: the plate keeps
// what it has, and changes once the car has left that street.
test("driving straight through a junction keeps the street; turning takes the new one once off the old", () => {
  const namer = createStreetNamer(streets);
  for (let x = -60; x <= 60; x += 2) assert.equal(namer.at(x, 1, 0), "HARBOR WAY", `through the junction at x = ${x}`);
  const turning = createStreetNamer(streets);
  assert.equal(turning.at(-40, 0, 0), "HARBOR WAY");
  assert.equal(turning.at(1, -8, 0), "HARBOR WAY", "still on Harbor Way's asphalt, closer to 1st Ave's centreline");
  assert.equal(turning.at(1, -30, 0), "1ST AVE", "off Harbor Way, on 1st Ave");
});

test("the seam between two entries of one street does not move the name", () => {
  const namer = createStreetNamer(streets);
  for (let z = -60; z >= -140; z -= 2) assert.equal(namer.at(2, z, 0), "1ST AVE", `at z = ${z}`);
});

test("off every street the last name holds for the grace, then the plate clears", () => {
  const namer = createStreetNamer(streets, { grace: 1500 });
  assert.equal(namer.at(-150, 0, 0), "HARBOR WAY");
  assert.equal(namer.at(-150, 60, 100), "HARBOR WAY", "just off the road");
  assert.equal(namer.at(-150, 60, 1500), "HARBOR WAY", "within the grace");
  assert.equal(namer.at(-150, 60, 1700), null, "past it");
  assert.equal(namer.at(-150, 60, 5000), null);
  assert.equal(namer.at(-150, 0, 5100), "HARBOR WAY", "back on the road");
  assert.equal(createStreetNamer([]).at(0, 0, 0), null, "no streets, no plate");
});

test("Port Alder's start is on 1st Ave S", async () => {
  const { ALDER_STREETS } = await import("../src/sim/alder.ts");
  const first = ALDER_STREETS.filter(road => road.name === "1St Ave S").sort((a, b) => b.points.length - a.points.length)[0]!;
  const middle = first.points[Math.floor(first.points.length / 2)]!;
  assert.equal(createStreetNamer(ALDER_STREETS).at(middle.x, middle.z, 0), "1ST AVE S");
});
