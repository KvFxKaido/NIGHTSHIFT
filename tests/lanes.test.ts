import assert from "node:assert/strict";
import test from "node:test";
import {
  DISTRICT_LANES, DISTRICT_STREETS, districtLaneLength, districtLanePose, projectOntoDistrict,
  CENTRE_MARGIN, LANES_PER_DIRECTION, SHOULDER,
  laneMarkings, laneOffset, laneWidth, lanes, pathLength, pathPoint,
} from "../src/sim/district.ts";

const streetOf = (id: string) => DISTRICT_STREETS.find(street => street.id === id)!;
const widths = DISTRICT_STREETS.flatMap(street => street.points.map(point => point.width));

test("every lane fits inside its carriageway and stays off the centreline", () => {
  for (const width of new Set(widths)) {
    const lane = laneWidth(width);
    assert.ok(lane > 3, `${width} m street gives ${lane.toFixed(2)} m lanes`);
    for (const candidate of lanes()) {
      const offset = laneOffset(width, candidate);
      const inner = Math.abs(offset) - lane / 2, outer = Math.abs(offset) + lane / 2;
      assert.ok(inner >= CENTRE_MARGIN - 1e-9, `lane ${candidate.index} crosses the centre band`);
      assert.ok(outer <= width / 2 - SHOULDER + 1e-9, `lane ${candidate.index} overhangs the kerb`);
    }
    // Opposing lanes are never the same piece of road, at any width.
    const forward = lanes().filter(l => l.direction === 1).map(l => laneOffset(width, l));
    const back = lanes().filter(l => l.direction === -1).map(l => laneOffset(width, l));
    assert.ok(Math.min(...forward) > Math.max(...back));
  }
});

// The whole point of a signed offset is that a car never has to know which way
// round the street was authored. If this convention inverts, oncoming traffic
// appears in the player's lane and nothing else in the model complains.
test("every lane is on the right of its own direction of travel", () => {
  for (const lane of DISTRICT_LANES) {
    const points = streetOf(lane.street).points;
    const length = districtLaneLength(lane);
    for (const fraction of [0.15, 0.5, 0.85]) {
      const distance = length * fraction;
      const pose = districtLanePose(lane, distance);
      const centre = pathPoint(points, lane.direction === 1 ? distance : length - distance);
      // Right of the heading, in the sim's frame where forward is (-sin, -cos).
      const rightX = Math.cos(pose.heading), rightZ = -Math.sin(pose.heading);
      const toLane = (pose.x - centre.x) * rightX + (pose.z - centre.z) * rightZ;
      assert.ok(toLane > 0,
        `${lane.street} lane ${lane.index} dir ${lane.direction} sits ${toLane.toFixed(2)} m left of centre`);
    }
  }
});

// Offsetting a centreline sample sideways by its own segment normal makes the
// lane jump at every authored vertex — 2.79 m on the ring hotel bend, most of a
// lane width, and a car driving it would visibly teleport. The 5 m sweep below
// steps straight over a discontinuity, so it needs its own test either side of
// each corner.
test("a lane is continuous through every authored corner", () => {
  let worst = 0, worstAt = "";
  for (const lane of DISTRICT_LANES) {
    const points = streetOf(lane.street).points;
    const length = districtLaneLength(lane);
    let travelled = 0;
    for (let i = 1; i < points.length - 1; i++) {
      travelled += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
      const at = lane.direction === 1 ? travelled : length - travelled;
      const before = districtLanePose(lane, at - 0.001);
      const after = districtLanePose(lane, at + 0.001);
      const jump = Math.hypot(after.x - before.x, after.z - before.z);
      if (jump > worst) { worst = jump; worstAt = `${lane.street} vertex ${i}`; }
    }
  }
  // 2 mm of sampling either side, so anything under a centimetre is the probe.
  assert.ok(worst < 0.01, `a lane jumps ${worst.toFixed(3)} m at ${worstAt}`);
});

test("a lane pose advances along its own heading, both ways down a street", () => {
  for (const lane of DISTRICT_LANES) {
    const length = districtLaneLength(lane);
    const from = districtLanePose(lane, length * 0.4);
    const to = districtLanePose(lane, length * 0.4 + 10);
    const forwardX = -Math.sin(from.heading), forwardZ = -Math.cos(from.heading);
    const travelled = (to.x - from.x) * forwardX + (to.z - from.z) * forwardZ;
    assert.ok(travelled > 8, `${lane.street} lane advanced ${travelled.toFixed(2)} m of an intended 10`);
  }
});

// Traffic will drive these poses. A lane that leaves the road is a van in a
// wall, and no amount of follower logic recovers from bad geometry.
test("lane poses stay on the road and on its graded surface", () => {
  let worstOverhang = -Infinity, worstHeight = 0;
  for (const lane of DISTRICT_LANES) {
    const length = districtLaneLength(lane);
    for (let distance = 0; distance <= length; distance += 5) {
      const pose = districtLanePose(lane, distance);
      const road = projectOntoDistrict(pose.x, pose.z);
      worstOverhang = Math.max(worstOverhang, road.distance - road.width / 2);
      worstHeight = Math.max(worstHeight, Math.abs(pose.y - road.height));
    }
  }
  assert.ok(worstOverhang <= 0, `a lane pose sits ${worstOverhang.toFixed(2)} m past the road edge`);
  assert.ok(worstHeight < 1e-9, `a lane pose floats ${worstHeight.toFixed(3)} m off the surface`);
});

test("the paint marks lane boundaries, not arbitrary fractions of the road", () => {
  for (const width of new Set(widths)) {
    const marks = laneMarkings(width);
    const lane = laneWidth(width);
    assert.equal(marks.filter(mark => mark.kind === "centre").length, 2, "a centre line is a double");
    assert.equal(marks.filter(mark => mark.kind === "edge").length, 2);
    assert.equal(marks.filter(mark => mark.kind === "divider").length, (LANES_PER_DIRECTION - 1) * 2);

    // Each divider and edge lands exactly on a boundary between lanes, or on
    // the outside of the last one — never in the middle of a driving lane.
    const boundaries = new Set<string>();
    for (const side of [1, -1]) {
      for (let i = 1; i <= LANES_PER_DIRECTION; i++) boundaries.add((side * (CENTRE_MARGIN + lane * i)).toFixed(6));
    }
    for (const mark of marks) {
      if (mark.kind === "centre") {
        assert.ok(Math.abs(mark.offset) < CENTRE_MARGIN, "a centre line sits inside the centre band");
        continue;
      }
      assert.ok(boundaries.has(mark.offset.toFixed(6)), `${mark.kind} at ${mark.offset} is not a lane boundary`);
    }
    // The edge line is the outermost mark, and the shoulder is behind it.
    const edge = Math.max(...marks.map(mark => Math.abs(mark.offset)));
    assert.ok(Math.abs(width / 2 - edge - SHOULDER) < 1e-9);
  }
});

test("pathLength still measures what the routes are measured by", () => {
  const street = streetOf("ring-boulevard");
  assert.equal(pathLength(street.points), districtLaneLength({ street: street.id, direction: 1, index: 0 }));
  assert.ok(pathLength(street.points) > 100);
});
