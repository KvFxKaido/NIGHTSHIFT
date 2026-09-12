import assert from "node:assert/strict";
import test from "node:test";
import { kerbPoses, ALDER_LAMPS, ALDER_BINS, type KerbSpec } from "../src/sim/kerb-props.ts";
import { pathLength, pathSamples } from "../src/sim/lanes.ts";
import { ALDER_STREETS, ALDER_BLOCKS } from "../src/sim/alder.ts";
import { pointFootprintDistance, type BuildingBlock } from "../src/sim/building-footprint.ts";

// The extraction gate. The lamps were placed inline in render/alder.ts, and
// nothing in the suite pinned them, so this recomputes that exact arithmetic
// and demands the anchor agree to the bit. If this drifts, the street lamps
// moved, and moving them is a visual change nobody asked for.
test("the anchor reproduces the lamps the renderer used to place inline", () => {
  const expected: { street: string; x: number; z: number }[] = [];
  for (const street of ALDER_STREETS) {
    const length = pathLength(street.points);
    for (const sample of pathSamples(street.points, 55)) {
      if (sample.distance < 20 || sample.distance > length - 15) continue;
      expected.push({
        street: street.id,
        x: sample.x - sample.dirZ * (sample.width / 2 + 1.7),
        z: sample.z + sample.dirX * (sample.width / 2 + 1.7),
      });
    }
  }
  const poses = kerbPoses(ALDER_STREETS, ALDER_LAMPS);
  assert.ok(expected.length > 100, `only ${expected.length} lamps to compare`);
  assert.equal(poses.length, expected.length);
  poses.forEach((pose, i) => {
    assert.equal(pose.street, expected[i]!.street);
    assert.equal(pose.x, expected[i]!.x, `lamp ${i} moved in x`);
    assert.equal(pose.z, expected[i]!.z, `lamp ${i} moved in z`);
  });
});

test("poses clear the junctions at both ends and stand off the carriageway", () => {
  const spec: KerbSpec = { ...ALDER_LAMPS, sides: [1, -1] };
  const poses = kerbPoses(ALDER_STREETS, spec);
  const streets = new Map(ALDER_STREETS.map(street => [street.id, street]));
  let checked = 0;
  for (const pose of poses) {
    const street = streets.get(pose.street)!;
    const length = pathLength(street.points);
    // Nearest sample is enough: poses are generated from samples.
    const near = pathSamples(street.points, spec.spacing)
      .reduce((best, s) => Math.hypot(s.x - pose.x, s.z - pose.z) < Math.hypot(best.x - pose.x, best.z - pose.z) ? s : best);
    assert.ok(near.distance >= spec.clearStart - 1e-9, `${pose.street} pose inside the start junction`);
    assert.ok(near.distance <= length - spec.clearEnd + 1e-9, `${pose.street} pose inside the end junction`);
    // Off the road: at least the offset beyond the carriageway edge.
    const across = Math.hypot(pose.x - near.x, pose.z - near.z);
    assert.ok(across >= near.width / 2, `${pose.street} pose stands in the road`);
    checked++;
  }
  assert.ok(checked > 200, `only ${checked} poses checked`);
});

test("sides are opposite kerbs, and the pose faces away from the road", () => {
  const left = kerbPoses(ALDER_STREETS, { ...ALDER_LAMPS, sides: [1] });
  const right = kerbPoses(ALDER_STREETS, { ...ALDER_LAMPS, sides: [-1] });
  assert.equal(left.length, right.length);
  for (let i = 0; i < left.length; i++) {
    // Mirrored normals: the two kerbs of one street point opposite ways.
    assert.ok(Math.abs(left[i]!.outX + right[i]!.outX) < 1e-12);
    assert.ok(Math.abs(left[i]!.outZ + right[i]!.outZ) < 1e-12);
    // Heading is the sim's: forward is (-sin, -cos), and forward is "out".
    const pose = left[i]!;
    assert.ok(Math.abs(-Math.sin(pose.heading) - pose.outX) < 1e-9, "heading does not face out");
    assert.ok(Math.abs(-Math.cos(pose.heading) - pose.outZ) < 1e-9, "heading does not face out");
  }
});

test("thinning is deterministic, keyed to position, and roughly the density asked for", () => {
  const once = kerbPoses(ALDER_STREETS, ALDER_BINS, ALDER_BLOCKS);
  const twice = kerbPoses(ALDER_STREETS, ALDER_BINS, ALDER_BLOCKS);
  assert.deepEqual(once, twice, "placement is not reproducible");

  // Reversing the street order must not move a single prop: the hash is keyed
  // to where the pose is, not to the order the streets were authored in.
  const reversed = kerbPoses([...ALDER_STREETS].reverse(), ALDER_BINS, ALDER_BLOCKS);
  const key = (p: { x: number; z: number }) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`;
  assert.deepEqual(new Set(reversed.map(key)), new Set(once.map(key)),
    "re-authoring one street moved props on another");

  // Thinning against thinning only. `once` also drops poses for clearance, so
  // measuring it against a dense baseline would report the wrong density.
  const thinned = kerbPoses(ALDER_STREETS, { ...ALDER_BINS, radius: 0 });
  const dense = kerbPoses(ALDER_STREETS, { ...ALDER_BINS, density: 1, radius: 0 });
  const ratio = thinned.length / dense.length;
  assert.ok(ratio > 0.35 && ratio < 0.7, `thinning kept ${(ratio * 100).toFixed(0)}%, expected about 55%`);
});

test("clearance drops the poses that would stand inside a solid", () => {
  const spec: KerbSpec = { ...ALDER_LAMPS, radius: 1.1 };
  const open = kerbPoses(ALDER_STREETS, spec);
  // A wall dropped over the first pose, big enough to swallow it whole.
  const first = open[0]!;
  const wall: BuildingBlock = {
    x: first.x, z: first.z, width: 12, depth: 12, height: 8, base: 0, rotation: 0,
  };
  const blocked = kerbPoses(ALDER_STREETS, spec, [wall]);
  assert.equal(blocked.length, open.length - countInside(open, wall, spec.radius!));
  assert.ok(!blocked.some(pose => pointFootprintDistance(wall, pose.x, pose.z) < spec.radius!),
    "a pose was left standing inside the wall");
  // Without a radius the same solids are ignored, which is what keeps the
  // lamps identical to the inline rule that never checked them.
  assert.equal(kerbPoses(ALDER_STREETS, ALDER_LAMPS, [wall]).length, open.length);
});

function countInside(poses: readonly { x: number; z: number }[], block: BuildingBlock, radius: number): number {
  return poses.filter(pose => pointFootprintDistance(block, pose.x, pose.z) < radius).length;
}

// Measured before this existed: 0.7% of bins and 0.6% of lamps stood inside a
// carriageway, because a prop can sit correctly on its own kerb and still be in
// a wider street's roadway near a junction. Checked here against every segment
// by brute force, independently of the spatial index the anchor uses.
test("road clearance keeps props out of every carriageway, not just their own", () => {
  const segments = ALDER_STREETS.flatMap(street =>
    street.points.slice(1).map((b, i) => ({ a: street.points[i]!, b })));
  const inCarriageway = (poses: readonly { x: number; z: number }[]) => poses.filter(pose =>
    segments.some(({ a, b }) => {
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1,
        ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
      return Math.hypot(pose.x - a.x - t * dx, pose.z - a.z - t * dz) < Math.max(a.width, b.width) / 2;
    })).length;

  assert.equal(inCarriageway(kerbPoses(ALDER_STREETS, ALDER_BINS, ALDER_BLOCKS)), 0,
    "a bin stands in the road");

  // Off by default, and the lamps are why: they have always had a few in the
  // road at junctions, and reproducing them exactly means keeping those. If
  // this ever reads zero, the default changed and the lamps moved.
  assert.ok(inCarriageway(kerbPoses(ALDER_STREETS, ALDER_LAMPS)) > 0,
    "lamps are unexpectedly clear of the road — is roadClearance on by default?");
});
