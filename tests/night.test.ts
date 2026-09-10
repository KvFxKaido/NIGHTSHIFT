import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addDistrict } from "../src/render/district.ts";
import { hash01 } from "../src/render/night.ts";
import { DISTRICT_BLOCKS, DISTRICT_STREETS, projectOntoPath, carriagewayWidth, projectOntoDistrict } from "../src/sim/district.ts";
import { COURSE_POINTS } from "../src/sim/track.ts";

function build(dressing: "night" | "blockout"): THREE.Scene {
  const scene = new THREE.Scene();
  addDistrict(scene, null, undefined, dressing);
  return scene;
}

function dispose(scene: THREE.Scene): void {
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
}

function vertices(scene: THREE.Scene, name: string): THREE.Vector3[] {
  const mesh = scene.getObjectByName(name);
  assert.ok(mesh instanceof THREE.Mesh, `${name} is missing from the dressed district`);
  const position = mesh.geometry.getAttribute("position");
  return Array.from({ length: position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, i));
}

const DRESSING = ["district-sky", "district-facades", "district-roofs", "district-signage",
  "district-signage-glow", "district-shop-spill", "district-centre-line", "district-lane-lines",
  "district-lamp-posts", "district-lamp-arms", "district-lamp-heads", "district-lamp-pools"] as const;

test("the night district dresses itself and keeps every mesh named", () => {
  const scene = build("night");
  for (const name of DRESSING) assert.ok(scene.getObjectByName(name), `missing ${name}`);
  // Names are an API — __ns.find and ?scene= links both assume kebab-case.
  const offenders: string[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.name) offenders.push("(unnamed)");
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(object.name)) offenders.push(object.name);
  });
  assert.deepEqual(offenders, []);
  dispose(scene);
});

// Presentation is allowed to be random-looking; it is not allowed to be random.
// A city that re-rolls its windows every reload cannot be screenshot twice, and
// the debug harness stages the same pose expecting the same image.
test("the dressing is deterministic across builds", () => {
  assert.equal(hash01(7), hash01(7));
  const checksum = (scene: THREE.Scene) => DRESSING.map(name => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh;
    const position = mesh.geometry.getAttribute("position");
    let sum = 0;
    for (let i = 0; i < position.count; i++) sum += position.getX(i) * 3 + position.getY(i) * 5 + position.getZ(i) * 7;
    return `${name}:${position.count}:${sum.toFixed(3)}`;
  }).join("|");
  const first = build("night"), second = build("night");
  assert.equal(checksum(first), checksum(second));
  dispose(first);
  dispose(second);
});

test("road paint stays on the road", () => {
  const scene = build("night");
  for (const name of ["district-centre-line", "district-lane-lines"]) {
    let worst = 0;
    for (const vertex of vertices(scene, name)) {
      const road = projectOntoDistrict(vertex.x, vertex.z);
      // Against the NEAREST street, not the street the paint belongs to. Where
      // an arterial meets an alley the nearest centreline is the alley's, whose
      // half-width is 4 m, and the arterial's own edge line 8.8 m out reads as
      // an overhang while sitting on junction asphalt. An edge marking is
      // laid at w/2 - SHOULDER of its own carriageway and so cannot leave it;
      // the question is whether ANY street covers the vertex.
      const covered = Math.min(...DISTRICT_STREETS.map(street => {
        const on = projectOntoPath(street.points, vertex.x, vertex.z);
        return on.distance - carriagewayWidth(street.points) / 2;
      }));
      worst = Math.max(worst, covered);
      // Paint sits proud of the surface by millimetres, never floating over it.
      assert.ok(vertex.y - road.height > 0 && vertex.y - road.height < 0.2,
        `${name} is ${(vertex.y - road.height).toFixed(2)} m off the surface at ${vertex.x},${vertex.z}`);
    }
    assert.ok(worst <= 0.05, `${name} overhangs the road edge by ${worst.toFixed(2)} m`);
  }
  dispose(scene);
});

// A lamp pool is a decal on the road, and the district falls up to 5.1 m across
// half of one. Placed as a flat plane at its centre's height it is buried under
// the asphalt on one side and floating clear of it on the other.
test("lamp pools lie on the road surface across their whole width", () => {
  const scene = build("night");
  let worst = 0, worstAt = "";
  for (const vertex of vertices(scene, "district-lamp-pools")) {
    const above = vertex.y - projectOntoDistrict(vertex.x, vertex.z).height;
    if (Math.abs(above - 0.07) > worst) { worst = Math.abs(above - 0.07); worstAt = `${vertex.x.toFixed(0)},${vertex.z.toFixed(0)}`; }
  }
  assert.ok(worst < 0.05, `a lamp pool sits ${worst.toFixed(2)} m off the surface at ${worstAt}`);
  dispose(scene);
});

// The spill is the light a shopfront throws on the pavement, so it has to be on
// the pavement the shopfront is on. Anchored to the nearest road height instead,
// a block beside the bridge crown put its glow 24 m up with nothing casting it.
//
// Measured against the spill's OWN building's base, which the renderer stamps
// on every spill vertex. Three references were wrong first: datum (only true
// while every building stood at zero), the nearest road (flips to the Rivergate
// deck 24 m up beside the quay), the drawn ground (steps 11 m beside the old
// loop's embankment), and the nearest building (pairs a spill with a building
// on the other level, 9-22 m away). The rule that places a spill is that the
// road in front stands within SHOPFRONT_MAX_LIFT of the base, so that is the
// claim, plus the plane's own 6 cm.
test("a shop spill stays on the ground its own storefront stands on", () => {
  const scene = build("night");
  const mesh = scene.getObjectByName("district-shop-spill") as THREE.Mesh;
  const position = mesh.geometry.getAttribute("position"), base = mesh.geometry.getAttribute("base");
  assert.ok(base, "spills carry the base of the building that casts them");
  let worst = 0, worstAt = "";
  for (let i = 0; i < position.count; i++) {
    const off = Math.abs(position.getY(i) - base.getX(i));
    if (off > worst) { worst = off; worstAt = `${position.getX(i).toFixed(0)},${position.getZ(i).toFixed(0)}`; }
  }
  assert.ok(worst < 3.5, `a shop spill floats ${worst.toFixed(1)} m from its own building's base at ${worstAt}`);
  dispose(scene);
});

// A lamp post is street furniture, not a chicane. The sim has no collider for
// one, so the only thing keeping it out of the driving line is where it is put.
// Its arm is a separate mesh precisely so it can overhang the carriageway at
// eight metres while the post itself may not touch it.
test("lamp posts stand clear of every driven surface", () => {
  const scene = build("night");
  let worst = Infinity;
  for (const vertex of vertices(scene, "district-lamp-posts")) {
    const road = projectOntoDistrict(vertex.x, vertex.z);
    worst = Math.min(worst, road.distance - road.width / 2);
  }
  assert.ok(worst > 0.5, `a lamp post reaches ${worst.toFixed(2)} m inside the road edge`);
  dispose(scene);
});

// The blockout exists so junctions and grades can be judged without darkness or
// neon hiding a surface error. Dressing it defeats the point, so ?lighting=
// blockout has to stay a genuine blockout rather than a dimmer night.
test("the blockout keeps its work view and its massing", () => {
  const scene = build("blockout");
  for (const name of DRESSING) assert.equal(scene.getObjectByName(name), undefined, `${name} leaked into the blockout`);
  assert.ok(scene.getObjectByName("district-massing-0"), "the blockout lost its massing boxes");
  assert.ok(scene.getObjectByName("district-boundaries"), "the blockout lost its barriers");

  // Both views must draw the same roads: the dressing is paint on the geometry,
  // never a second version of it.
  const night = build("night");
  const road = (from: THREE.Scene) => {
    const mesh = from.getObjectByName("district-road-ring-boulevard") as THREE.Mesh;
    return mesh.geometry.getAttribute("position").array.join(",");
  };
  assert.equal(road(scene), road(night));
  dispose(scene);
  dispose(night);
});

// The building you see must be the building that is there. Every piece of
// night dressing used to be placed axis-aligned, site.x +/- width/2, with the
// footprint's rotation never applied — while the footprint, the collider, the
// blockout and every clearance test rotate. 218 of 272 buildings were drawn
// more than a metre out of their own footprint: corners in the road, through
// the rails, and five metres into the tunnel bore, which is what a lit
// building standing in the tunnel was.
test("every drawn facade stands inside a real footprint", () => {
  const scene = build("night");
  const contains = (block: typeof DISTRICT_BLOCKS[number], x: number, z: number) => {
    const cos = Math.cos(-block.rotation), sin = Math.sin(-block.rotation);
    const dx = x - block.x, dz = z - block.z;
    return Math.abs(dx * cos - dz * sin) <= block.width / 2 + 0.35
      && Math.abs(dx * sin + dz * cos) <= block.depth / 2 + 0.35;
  };
  let outside = 0, checked = 0, worstAt = "";
  for (const vertex of vertices(scene, "district-facades")) {
    checked++;
    if (DISTRICT_BLOCKS.some(block => Math.hypot(block.x - vertex.x, block.z - vertex.z) < 60
      && contains(block, vertex.x, vertex.z))) continue;
    outside++;
    if (!worstAt) worstAt = `${vertex.x.toFixed(1)},${vertex.z.toFixed(1)}`;
  }
  assert.ok(checked > 1000, `only ${checked} facade vertices`);
  assert.equal(outside, 0, `${outside} facade vertices stand outside every footprint, first at ${worstAt}`);
  dispose(scene);
});

// And nothing of the district's own furniture stands in the tunnel: it lights
// itself, and eight sodium posts used to stand inside the bore.
test("no lamp post stands inside the tunnel bore", () => {
  const scene = build("night");
  const bore = COURSE_POINTS.filter(point => point.zone === "tunnel");
  let inside = 0;
  for (const vertex of vertices(scene, "district-lamp-posts")) {
    const on = projectOntoPath(bore, vertex.x, vertex.z);
    if (on.distance <= 10.5 && vertex.y > on.height - 1 && vertex.y < on.height + 8) inside++;
  }
  assert.equal(inside, 0, `${inside} lamp post vertices stand inside the tunnel`);
  dispose(scene);
});
