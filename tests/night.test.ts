import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addDistrict } from "../src/render/district.ts";
import { hash01 } from "../src/render/night.ts";
import { projectOntoDistrict } from "../src/sim/district.ts";

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
  "district-signage-glow", "district-centre-line", "district-lane-lines", "district-lamp-posts",
  "district-lamp-arms", "district-lamp-heads", "district-lamp-pools"] as const;

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
      worst = Math.max(worst, road.distance - road.width / 2);
      // Paint sits proud of the surface by millimetres, never floating over it.
      assert.ok(vertex.y - road.height > 0 && vertex.y - road.height < 0.2,
        `${name} is ${(vertex.y - road.height).toFixed(2)} m off the surface at ${vertex.x},${vertex.z}`);
    }
    assert.ok(worst <= 0.05, `${name} overhangs the road edge by ${worst.toFixed(2)} m`);
  }
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
