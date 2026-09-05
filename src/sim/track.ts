export type CourseZone =
  | "boulevard"
  | "tunnel"
  | "bridge"
  | "waterfront"
  | "freight"
  | "old-quarter";

export interface CoursePoint {
  x: number;
  y: number;
  z: number;
  width: number;
  zone: CourseZone;
}

interface AuthoredCoursePoint extends CoursePoint {
  label: string;
}

export interface CourseSegment {
  index: number;
  x: number;
  y: number;
  z: number;
  length: number;
  surfaceLength: number;
  rise: number;
  pitch: number;
  width: number;
  rotation: number;
  ux: number;
  uz: number;
  zone: CourseZone;
}

export interface CourseWall {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  pitch: number;
  accent: "red" | "white";
  zone: CourseZone;
}

export interface CourseLandmark {
  name: string;
  pointIndex: number;
  note: string;
}

export interface BrakingZone {
  name: string;
  pointIndex: number;
  markerSide: -1 | 1;
}

export interface CourseSurfaceOverlap {
  firstSegment: number;
  secondSegment: number;
  clearance: number;
  requiredClearance: number;
}

export interface CourseProjection {
  segmentIndex: number;
  distance: number;
  height: number;
  pitch: number;
  ux: number;
  uz: number;
  width: number;
}

export const COURSE_SCALE = 1.08;
export const CURVE_SAMPLES_PER_SPAN = 5;

// The authored points are the route's vocabulary rather than its render
// tessellation. A closed Catmull-Rom pass turns them into short, measurable
// segments shared by physics, presentation, tests, and driving-line tools.
// The freight district deliberately reverses direction twice; the rest of the
// lap is an urban perimeter with distinct braking corners, not one long arc.
const AUTHORED_COURSE_POINTS: readonly AuthoredCoursePoint[] = [
  { x: -150, y: 0, z: -180, width: 22, zone: "boulevard", label: "Neon Boulevard" },
  { x: 40, y: 0, z: -180, width: 22, zone: "boulevard", label: "Grandstand Straight" },
  { x: 140, y: 2, z: -165, width: 22, zone: "boulevard", label: "Marquee Approach" },
  { x: 200, y: 5, z: -120, width: 20, zone: "boulevard", label: "Marquee Bend" },
  { x: 225, y: 9, z: -55, width: 18, zone: "tunnel", label: "Blackglass Portal" },
  { x: 225, y: 12, z: 30, width: 18, zone: "tunnel", label: "Tunnel Compression" },
  { x: 210, y: 15, z: 95, width: 18, zone: "tunnel", label: "Tunnel Kink" },
  { x: 165, y: 20, z: 145, width: 20, zone: "bridge", label: "Rivergate Rise" },
  { x: 70, y: 24, z: 175, width: 20, zone: "bridge", label: "Bridge Crown" },
  { x: -40, y: 18, z: 175, width: 20, zone: "bridge", label: "Bridge Descent" },
  { x: -130, y: 9, z: 145, width: 19, zone: "waterfront", label: "Quayside Sweep" },
  { x: -195, y: 3, z: 95, width: 18, zone: "waterfront", label: "Dockside Braking" },
  { x: -225, y: 0, z: 35, width: 17, zone: "freight", label: "Freight Gate" },
  { x: -220, y: 0, z: -20, width: 16, zone: "freight", label: "Container Wall" },
  { x: -185, y: 1, z: -55, width: 16, zone: "freight", label: "Freight S One" },
  { x: -135, y: 4, z: -45, width: 16, zone: "freight", label: "Freight S Two" },
  { x: -100, y: 8, z: -80, width: 16, zone: "freight", label: "Freight S Three" },
  { x: -125, y: 11, z: -120, width: 17, zone: "old-quarter", label: "Civic Switchback" },
  { x: -180, y: 10, z: -125, width: 17, zone: "old-quarter", label: "Hotel Approach" },
  { x: -225, y: 8, z: -145, width: 19, zone: "boulevard", label: "Hotel Braking" },
  { x: -235, y: 7, z: -175, width: 20, zone: "boulevard", label: "Hotel Hairpin" },
  { x: -210, y: 4, z: -185, width: 21, zone: "boulevard", label: "Hairpin Exit" },
] as const;

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t2 +
    (-a + 3 * b - 3 * c + d) * t3
  );
}

function sampleCourse(): CoursePoint[] {
  const sampled: CoursePoint[] = [];
  for (let index = 0; index < AUTHORED_COURSE_POINTS.length; index++) {
    const previous = AUTHORED_COURSE_POINTS[
      (index - 1 + AUTHORED_COURSE_POINTS.length) % AUTHORED_COURSE_POINTS.length
    ]!;
    const start = AUTHORED_COURSE_POINTS[index]!;
    const end = AUTHORED_COURSE_POINTS[(index + 1) % AUTHORED_COURSE_POINTS.length]!;
    const following = AUTHORED_COURSE_POINTS[(index + 2) % AUTHORED_COURSE_POINTS.length]!;

    for (let sample = 0; sample < CURVE_SAMPLES_PER_SPAN; sample++) {
      const t = sample / CURVE_SAMPLES_PER_SPAN;
      sampled.push({
        x: catmullRom(previous.x, start.x, end.x, following.x, t) * COURSE_SCALE,
        y: Math.max(0, catmullRom(previous.y, start.y, end.y, following.y, t)),
        z: catmullRom(previous.z, start.z, end.z, following.z, t) * COURSE_SCALE,
        width: start.width + (end.width - start.width) * t,
        zone: start.zone,
      });
    }
  }
  return sampled;
}

export const COURSE_POINTS: readonly CoursePoint[] = sampleCourse();

export function pointIndexForControl(controlIndex: number): number {
  return controlIndex * CURVE_SAMPLES_PER_SPAN;
}

function segmentAt(index: number): CourseSegment {
  const start = COURSE_POINTS[index]!;
  const end = COURSE_POINTS[(index + 1) % COURSE_POINTS.length]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  return {
    index,
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: (start.z + end.z) * 0.5,
    length,
    surfaceLength: Math.hypot(length, dy),
    rise: dy,
    pitch: Math.atan2(dy, length),
    width: (start.width + end.width) * 0.5,
    rotation: -Math.atan2(dz, dx),
    ux: dx / length,
    uz: dz / length,
    zone: start.zone,
  };
}

export const COURSE_SEGMENTS: readonly CourseSegment[] = COURSE_POINTS.map((_, index) => segmentAt(index));

const BARRIER_DEPTH = 0.9;

function boundaryPoint(index: number, side: -1 | 1): { x: number; y: number; z: number } {
  const point = COURSE_POINTS[index]!;
  const previous = COURSE_SEGMENTS[(index - 1 + COURSE_SEGMENTS.length) % COURSE_SEGMENTS.length]!;
  const next = COURSE_SEGMENTS[index]!;
  const previousNormal = { x: -previous.uz, z: previous.ux };
  const nextNormal = { x: -next.uz, z: next.ux };
  const sumX = previousNormal.x + nextNormal.x;
  const sumZ = previousNormal.z + nextNormal.z;
  const sumLength = Math.hypot(sumX, sumZ);
  const miterX = sumLength > 0.001 ? sumX / sumLength : nextNormal.x;
  const miterZ = sumLength > 0.001 ? sumZ / sumLength : nextNormal.z;
  const offset = point.width * 0.5 + BARRIER_DEPTH * 0.5;
  const projection = Math.max(0.45, Math.abs(miterX * nextNormal.x + miterZ * nextNormal.z));
  const miterLength = Math.min(offset / projection, offset * 2.2);
  return {
    x: point.x + miterX * miterLength * side,
    y: point.y,
    z: point.z + miterZ * miterLength * side,
  };
}

export const COURSE_WALLS: readonly CourseWall[] = COURSE_SEGMENTS.flatMap((segment) =>
  ([-1, 1] as const).map((side): CourseWall => {
    const start = boundaryPoint(segment.index, side);
    const end = boundaryPoint((segment.index + 1) % COURSE_POINTS.length, side);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const horizontalLength = Math.hypot(dx, dz);
    return {
      x: (start.x + end.x) * 0.5,
      y: (start.y + end.y) * 0.5,
      z: (start.z + end.z) * 0.5,
      width: Math.hypot(horizontalLength, dy) + 0.3,
      depth: BARRIER_DEPTH,
      rotation: -Math.atan2(dz, dx),
      pitch: Math.atan2(dy, horizontalLength),
      accent: (segment.index + (side > 0 ? 1 : 0)) % 2 === 0 ? "white" : "red",
      zone: segment.zone,
    };
  }),
);

function pointToSegmentDistance(
  point: CoursePoint,
  start: CoursePoint,
  end: CoursePoint,
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

function segmentDistance(
  firstStart: CoursePoint,
  firstEnd: CoursePoint,
  secondStart: CoursePoint,
  secondEnd: CoursePoint,
): number {
  const cross = (a: CoursePoint, b: CoursePoint, c: CoursePoint): number =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const firstA = cross(firstStart, firstEnd, secondStart);
  const firstB = cross(firstStart, firstEnd, secondEnd);
  const secondA = cross(secondStart, secondEnd, firstStart);
  const secondB = cross(secondStart, secondEnd, firstEnd);
  if (firstA * firstB <= 0 && secondA * secondB <= 0) return 0;
  return Math.min(
    pointToSegmentDistance(firstStart, secondStart, secondEnd),
    pointToSegmentDistance(firstEnd, secondStart, secondEnd),
    pointToSegmentDistance(secondStart, firstStart, firstEnd),
    pointToSegmentDistance(secondEnd, firstStart, firstEnd),
  );
}

/** Finds non-local road ribbons that occupy the same physical space. */
export function findCourseSurfaceOverlaps(
  points: readonly CoursePoint[] = COURSE_POINTS,
  localArcAllowance = 55,
  safetyMargin = 1,
): CourseSurfaceOverlap[] {
  const segments = points.map((start, index) => {
    const end = points[(index + 1) % points.length]!;
    return {
      start,
      end,
      length: Math.hypot(end.x - start.x, end.z - start.z),
      width: (start.width + end.width) * 0.5,
    };
  });
  const cumulative = [0];
  for (const segment of segments) cumulative.push(cumulative[cumulative.length - 1]! + segment.length);
  const lapLength = cumulative[cumulative.length - 1]!;
  const overlaps: CourseSurfaceOverlap[] = [];

  for (let first = 0; first < segments.length; first++) {
    for (let second = first + 1; second < segments.length; second++) {
      const firstMidpoint = cumulative[first]! + segments[first]!.length * 0.5;
      const secondMidpoint = cumulative[second]! + segments[second]!.length * 0.5;
      const directArcDistance = Math.abs(firstMidpoint - secondMidpoint);
      const arcDistance = Math.min(directArcDistance, lapLength - directArcDistance);
      if (arcDistance < localArcAllowance) continue;

      const clearance = segmentDistance(
        segments[first]!.start,
        segments[first]!.end,
        segments[second]!.start,
        segments[second]!.end,
      );
      const requiredClearance =
        (segments[first]!.width + segments[second]!.width) * 0.5 + safetyMargin;
      if (clearance < requiredClearance) {
        overlaps.push({ firstSegment: first, secondSegment: second, clearance, requiredClearance });
      }
    }
  }
  return overlaps;
}

/** Projects an x/z world position onto the road ribbon's elevation profile. */
export function projectOntoCourse(x: number, z: number): CourseProjection {
  let nearest: CourseProjection = {
    segmentIndex: 0,
    distance: Number.POSITIVE_INFINITY,
    height: COURSE_POINTS[0]!.y,
    pitch: COURSE_SEGMENTS[0]!.pitch,
    ux: COURSE_SEGMENTS[0]!.ux,
    uz: COURSE_SEGMENTS[0]!.uz,
    width: COURSE_SEGMENTS[0]!.width,
  };

  for (const segment of COURSE_SEGMENTS) {
    const start = COURSE_POINTS[segment.index]!;
    const dx = segment.ux * segment.length;
    const dz = segment.uz * segment.length;
    const t = Math.max(
      0,
      Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / (segment.length ** 2)),
    );
    const projectedX = start.x + dx * t;
    const projectedZ = start.z + dz * t;
    const distance = Math.hypot(x - projectedX, z - projectedZ);
    if (distance >= nearest.distance) continue;

    const previous = COURSE_SEGMENTS[
      (segment.index - 1 + COURSE_SEGMENTS.length) % COURSE_SEGMENTS.length
    ]!;
    const next = COURSE_SEGMENTS[(segment.index + 1) % COURSE_SEGMENTS.length]!;
    const startPitch = (previous.pitch + segment.pitch) * 0.5;
    const endPitch = (segment.pitch + next.pitch) * 0.5;
    nearest = {
      segmentIndex: segment.index,
      distance,
      height: start.y + segment.rise * t,
      pitch: startPitch + (endPitch - startPitch) * t,
      ux: segment.ux,
      uz: segment.uz,
      width: segment.width,
    };
  }
  return nearest;
}

export function signedTurnAt(pointIndex: number): number {
  const previous = COURSE_POINTS[(pointIndex - 1 + COURSE_POINTS.length) % COURSE_POINTS.length]!;
  const point = COURSE_POINTS[pointIndex]!;
  const next = COURSE_POINTS[(pointIndex + 1) % COURSE_POINTS.length]!;
  const incomingX = point.x - previous.x;
  const incomingZ = point.z - previous.z;
  const outgoingX = next.x - point.x;
  const outgoingZ = next.z - point.z;
  return Math.atan2(
    incomingX * outgoingZ - incomingZ * outgoingX,
    incomingX * outgoingX + incomingZ * outgoingZ,
  );
}

export function cornerRadiusAt(pointIndex: number): number {
  const previous = COURSE_POINTS[(pointIndex - 1 + COURSE_POINTS.length) % COURSE_POINTS.length]!;
  const point = COURSE_POINTS[pointIndex]!;
  const next = COURSE_POINTS[(pointIndex + 1) % COURSE_POINTS.length]!;
  const a = Math.hypot(point.x - previous.x, point.z - previous.z);
  const b = Math.hypot(next.x - point.x, next.z - point.z);
  const c = Math.hypot(next.x - previous.x, next.z - previous.z);
  const doubleArea = Math.abs(
    (point.x - previous.x) * (next.z - previous.z) -
    (point.z - previous.z) * (next.x - previous.x),
  );
  return doubleArea < 0.0001 ? Number.POSITIVE_INFINITY : (a * b * c) / (2 * doubleArea);
}

const firstSegment = COURSE_SEGMENTS[0]!;

export const COURSE = {
  name: "Blackglass Circuit",
  targetLapSeconds: "75–90",
  start: {
    x: COURSE_POINTS[0]!.x,
    y: COURSE_POINTS[0]!.y,
    z: COURSE_POINTS[0]!.z,
    heading: Math.atan2(-firstSegment.ux, -firstSegment.uz),
    pitch: firstSegment.pitch,
  },
  bounds: { minX: -295, maxX: 295, minY: -2, maxY: 25, minZ: -235, maxZ: 235 },
} as const;

export const COURSE_LANDMARKS: readonly CourseLandmark[] = [
  { name: "Neon Boulevard", pointIndex: pointIndexForControl(0), note: "Launch and longest sightline" },
  { name: "Marquee Bend", pointIndex: pointIndexForControl(3), note: "First committed braking corner" },
  { name: "Blackglass Tunnel", pointIndex: pointIndexForControl(4), note: "Compression and a blind exit kink" },
  { name: "Rivergate Bridge", pointIndex: pointIndexForControl(7), note: "Skyline release and steel rhythm" },
  { name: "Freight S", pointIndex: pointIndexForControl(14), note: "Three-apex direction change" },
  { name: "Civic Switchback", pointIndex: pointIndexForControl(17), note: "Tight opposite lock under warm light" },
  { name: "Hotel Hairpin", pointIndex: pointIndexForControl(20), note: "Slowest corner and handbrake invitation" },
] as const;

export const COURSE_BRAKING_ZONES: readonly BrakingZone[] = [
  { name: "Marquee Bend", pointIndex: pointIndexForControl(3), markerSide: 1 },
  { name: "Freight Gate", pointIndex: pointIndexForControl(12), markerSide: -1 },
  { name: "Civic Switchback", pointIndex: pointIndexForControl(17), markerSide: 1 },
  { name: "Hotel Hairpin", pointIndex: pointIndexForControl(20), markerSide: -1 },
] as const;
