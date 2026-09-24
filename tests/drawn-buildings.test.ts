import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ALDER_BLOCKS } from "../src/sim/alder.ts";
import { blockCorners, type BuildingBlock } from "../src/sim/building-footprint.ts";
import { CEL_INK, CEL_UNIFORMS, celMaterial, LOOKS, setLook, buildingsDrawn } from "../src/render/cel.ts";
import { BUILDING_CEL_UNIFORMS, BUILDING_INK, buildingInk, drawnBuilding } from "../src/render/drawn-buildings.ts";
import { CHUNKED_SCENERY } from "../src/render/city-chunks.ts";

// cel-city is the default look (2026-09-24); every other look leaves the city as it was. The looks are read from
// LOOKS, so one added later is held to it too.
test("buildings are drawn under cel-city and under no other look", () => {
  for (const look of [null, ...LOOKS]) {
    setLook(look);
    try {
      const drawn = look === "cel-city";
      assert.equal(buildingsDrawn(), drawn, `${look} ${drawn ? "leaves the buildings undrawn" : "draws the buildings"}`);
      assert.equal(drawnBuilding(new THREE.MeshStandardMaterial()).userData.cel, drawn ? BUILDING_CEL_UNIFORMS : undefined);
    } finally { setLook(null); }
  }
});

test("?look=cel-city bands a building to its own levels, keeping the light's hue", () => {
  setLook("cel-city");
  try {
    const wall = drawnBuilding(new THREE.MeshStandardMaterial());
    assert.equal(wall.userData.cel, BUILDING_CEL_UNIFORMS);
    assert.equal(wall.customProgramCacheKey(), "cel-bands-own-hue", "no stripe or cyan rim, own levels, the light's hue");
    // The cars' levels are not the buildings': moving one must not move the other.
    assert.notEqual(BUILDING_CEL_UNIFORMS.celBands, CEL_UNIFORMS.celBands);
    assert.notEqual(BUILDING_CEL_UNIFORMS.celThresholds, CEL_UNIFORMS.celThresholds);
    assert.equal(celMaterial(new THREE.MeshStandardMaterial()).userData.cel, CEL_UNIFORMS, "a car still bands to the cars' levels");
  } finally { setLook(null); }
});

// The hull is built from the footprint, so it is where the blockCorners
// rotation convention bites (CLAUDE.md, Traps): a sign slip here draws a turned
// building's outline mirrored about its centre. Every Port Alder footprint sits
// at a multiple of 90 degrees today (all 1,725), where a mirrored box is the
// same box, so the convention is held on made-up turned, oblong ones as well.
const TURNED: BuildingBlock[] = [.5, -1.2, 2.8].map((rotation, i) => ({
  x: 40 * i, z: -30 * i, width: 30, depth: 10, height: 20 + i, base: 3 - i, rotation }));

test("the building ink is each footprint's box, pushed out along its corners and wound outward", () => {
  const blocks = [...ALDER_BLOCKS, ...TURNED];
  const mesh = buildingInk(blocks);
  assert.equal(mesh.name, "alder-building-ink");
  assert.ok((CHUNKED_SCENERY as readonly string[]).includes(mesh.name), "a city-wide mesh that is not chunked is drawn from everywhere");
  assert.equal(mesh.material, BUILDING_INK);
  assert.notEqual(mesh.material, CEL_INK, "its own dial, so tuning it cannot move the cars' outline");
  assert.equal(mesh.castShadow, false);
  const position = mesh.geometry.getAttribute("position"), normal = mesh.geometry.getAttribute("normal");
  const index = mesh.geometry.index!;
  assert.equal(position.count, blocks.length * 8);
  assert.equal(index.count, blocks.length * 36);
  const at = (i: number) => new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
  blocks.forEach((block, b) => {
    const centre = new THREE.Vector3(block.x, block.base + block.height / 2, block.z);
    // Every footprint corner stands at the top and the foot of the hull.
    const vertices = Array.from({ length: 8 }, (_, k) => at(b * 8 + k));
    for (const corner of blockCorners(block)) {
      for (const y of [block.base + block.height]) {
        assert.ok(vertices.some(v => Math.hypot(v.x - corner.x, v.z - corner.z) < 1e-3 && Math.abs(v.y - y) < 1e-3),
          `block ${b} has no hull corner at ${corner.x.toFixed(2)}, ${corner.z.toFixed(2)} on its roof`);
      }
      assert.ok(vertices.some(v => Math.hypot(v.x - corner.x, v.z - corner.z) < 1e-3 && v.y < block.base),
        `block ${b}'s hull does not reach below its base at ${corner.x.toFixed(2)}, ${corner.z.toFixed(2)}`);
    }
    // Normals are unit corner diagonals pointing away from the building.
    for (let k = 0; k < 8; k++) {
      const i = b * 8 + k, n = new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i));
      assert.ok(Math.abs(n.length() - 1) < 1e-6);
      assert.ok(Math.abs(Math.abs(n.y) - Math.sqrt(1 / 3)) < 1e-6, "a corner normal, not a face normal");
      const out = at(i).sub(centre);
      assert.ok(n.x * out.x + n.z * out.z > 0 && Math.sign(n.y) === Math.sign(out.y), `block ${b} corner ${k} points inward`);
    }
    // Wound outward, or BackSide draws the near faces and the hull covers the building.
    for (let t = b * 12; t < b * 12 + 12; t++) {
      const [p, q, r] = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)].map(at) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      const face = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
      const middle = p.clone().add(q).add(r).divideScalar(3).sub(centre);
      assert.ok(face.dot(middle) > 0, `block ${b} triangle ${t - b * 12} faces inward`);
    }
  });
});
