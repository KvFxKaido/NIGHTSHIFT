import assert from "node:assert/strict";
import test from "node:test";
import { HANDLING, maxCorneringSpeed } from "../src/sim/sim.ts";
import {
  COURSE_BRAKING_ZONES,
  COURSE_PLAN_LENGTH,
  COURSE_POINTS,
  COURSE_SEGMENTS,
  cornerRadiusAt,
  courseGap,
  findCourseSurfaceOverlaps,
  projectOntoCourse,
  signedTurnAt,
} from "../src/sim/track.ts";

function orientation(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
): number {
  return Math.sign((b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z));
}

function intersects(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
): boolean {
  return orientation(a, b, c) !== orientation(a, b, d) &&
    orientation(c, d, a) !== orientation(c, d, b);
}

test("Blackglass has a full-size lap length", () => {
  const length = COURSE_SEGMENTS.reduce((total, segment) => total + segment.length, 0);
  assert.ok(length > 1_600 && length < 1_900);
});

test("Blackglass has a substantial but street-plausible elevation profile", () => {
  const elevations = COURSE_POINTS.map((point) => point.y);
  const grades = COURSE_SEGMENTS.map((segment) => Math.abs(Math.tan(segment.pitch)));
  assert.ok(Math.max(...elevations) - Math.min(...elevations) >= 24);
  assert.ok(Math.max(...grades) < 0.12);

  const bridgeCrown = COURSE_POINTS[40]!;
  const projection = projectOntoCourse(bridgeCrown.x, bridgeCrown.z);
  assert.ok(Math.abs(projection.height - bridgeCrown.y) < 0.000001);
});

test("the course centerline does not cross itself in plan view", () => {
  for (let first = 0; first < COURSE_POINTS.length; first++) {
    const firstNext = (first + 1) % COURSE_POINTS.length;
    for (let second = first + 1; second < COURSE_POINTS.length; second++) {
      const secondNext = (second + 1) % COURSE_POINTS.length;
      const adjacent = first === second || firstNext === second || secondNext === first;
      if (adjacent) continue;
      assert.equal(
        intersects(
          COURSE_POINTS[first]!,
          COURSE_POINTS[firstNext]!,
          COURSE_POINTS[second]!,
          COURSE_POINTS[secondNext]!,
        ),
        false,
        `segments ${first} and ${second} cross`,
      );
    }
  }
});

test("non-local road surfaces never overlap", () => {
  assert.deepEqual(findCourseSurfaceOverlaps(), []);
});

test("the route has real direction changes rather than one continuous arc", () => {
  const turns = COURSE_POINTS.map((_, index) => signedTurnAt(index));
  assert.ok(turns.filter((turn) => turn > 0.08).length >= 6, "missing positive-direction corners");
  assert.ok(turns.filter((turn) => turn < -0.08).length >= 6, "missing negative-direction corners");
});

test("named braking zones cannot all be taken at theoretical top speed", () => {
  const zonesRequiringBraking = COURSE_BRAKING_ZONES.filter((zone) =>
    maxCorneringSpeed(cornerRadiusAt(zone.pointIndex)) < HANDLING.topSpeed * 0.95
  );
  assert.ok(zonesRequiringBraking.length >= 3);
  assert.ok(zonesRequiringBraking.some((zone) => signedTurnAt(zone.pointIndex) > 0));
  assert.ok(zonesRequiringBraking.some((zone) => signedTurnAt(zone.pointIndex) < 0));
});

// CourseProjection.distance is the lateral offset from the centreline, and
// `along` is distance around the lap. Reading the wrong one gives a plausible
// small number for two cars a hundred metres apart, which is exactly the bug
// this pair of fields exists to make hard to write.
test("course projection reports distance along the lap, not across it", () => {
  const start = COURSE_POINTS[0]!;
  const quarter = COURSE_POINTS[Math.floor(COURSE_POINTS.length / 4)]!;
  const atStart = projectOntoCourse(start.x, start.z);
  const atQuarter = projectOntoCourse(quarter.x, quarter.z);
  assert.ok(atStart.distance < 1, "a centreline point is barely offset from the centreline");
  assert.ok(atQuarter.distance < 1);
  assert.ok(atQuarter.along > COURSE_PLAN_LENGTH * 0.15,
    `a quarter of the way round should be well along the lap, got ${atQuarter.along}`);

  // Along must climb monotonically as the centreline is walked.
  let previous = -1;
  for (const point of COURSE_POINTS) {
    const along = projectOntoCourse(point.x, point.z).along;
    assert.ok(along >= previous - 1e-6, `along went backwards at ${point.x},${point.z}`);
    previous = along;
  }
  assert.ok(previous <= COURSE_PLAN_LENGTH + 1e-6);
});

test("a race gap is signed, and wraps the short way round the lap", () => {
  const start = COURSE_POINTS[0]!;
  const ahead = COURSE_POINTS[3]!;
  assert.ok(courseGap(start.x, start.z, ahead.x, ahead.z) > 0, "a car further round is ahead");
  assert.ok(courseGap(ahead.x, ahead.z, start.x, start.z) < 0, "and the reverse is behind");

  // A car just before the line is behind by a little, never ahead by a lap.
  const last = COURSE_POINTS.at(-1)!;
  const gap = courseGap(start.x, start.z, last.x, last.z);
  assert.ok(gap < 0 && gap > -COURSE_PLAN_LENGTH / 2,
    `wrapping should give a small negative gap, got ${gap}`);
  assert.equal(courseGap(start.x, start.z, start.x, start.z), 0);
});
