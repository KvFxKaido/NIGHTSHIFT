import assert from "node:assert/strict";
import test from "node:test";
import { HANDLING, maxCorneringSpeed } from "../src/sim/sim.ts";
import {
  COURSE_BRAKING_ZONES,
  COURSE_POINTS,
  COURSE_SEGMENTS,
  cornerRadiusAt,
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
