import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { addRaceBeacon, updateRaceBeacon, ARROW_TIP, ARROW_LIFT, signAngle } from "../src/render/race.ts";
import type { RaceState } from "../src/sim/race.ts";

// The beacon's arrow is a sign: it faces the camera and points the sim's exit
// the way the camera sees it — up for away, right for the camera's right —
// so the tip must land on the world side that projection names.

const live = (next: RaceState["next"]): RaceState =>
  ({ checkpoint: 0, collected: [], targetIndex: 0, countdown: 0, ticks: 0, splits: [], finished: false, next });
const ROAD = 3;
const height = (_x: number, _z: number) => ROAD;
const GATE = { x: 100, z: -50 };

/** A level camera at the sign's height, `from` (x, z), looking at the gate. */
function cameraAt(from: { x: number; z: number }): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 650);
  camera.position.set(from.x, ROAD + ARROW_LIFT, from.z);
  camera.lookAt(GATE.x, ROAD + ARROW_LIFT, GATE.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/** The beacon after an update: the sign's centre, its tip and its normal, in the world. */
function placed(next: RaceState["next"], camera: THREE.Object3D) {
  const scene = new THREE.Scene();
  const view = addRaceBeacon(scene, 20);
  updateRaceBeacon(view, live(next), height, camera);
  scene.updateMatrixWorld(true);
  const centre = view.arrow.getWorldPosition(new THREE.Vector3());
  const tip = view.arrow.localToWorld(new THREE.Vector3(ARROW_TIP, 0, 0));
  const normal = view.arrow.localToWorld(new THREE.Vector3(0, 0, 1)).sub(centre);
  return { view, centre, tip, normal };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("seen from the south, north points up, east points right, west points left and south points down", () => {
  const camera = cameraAt({ x: 100, z: 0 });
  const cases: [{ x: number; z: number }, string, (c: THREE.Vector3, t: THREE.Vector3) => boolean][] = [
    [{ x: 0, z: -1 }, "up", (c, t) => near(t.y, c.y + ARROW_TIP) && near(t.x, c.x) && near(t.z, c.z)],
    [{ x: 1, z: 0 }, "right", (c, t) => near(t.x, c.x + ARROW_TIP) && near(t.y, c.y) && near(t.z, c.z)],
    [{ x: -1, z: 0 }, "left", (c, t) => near(t.x, c.x - ARROW_TIP) && near(t.y, c.y) && near(t.z, c.z)],
    [{ x: 0, z: 1 }, "down", (c, t) => near(t.y, c.y - ARROW_TIP) && near(t.x, c.x) && near(t.z, c.z)],
  ];
  for (const [exit, name, holds] of cases) {
    const { centre, tip } = placed({ ...GATE, exit }, camera);
    assert.ok(holds(centre, tip), `exit (${exit.x}, ${exit.z}) should point ${name}; tip (${tip.x.toFixed(2)}, ${tip.y.toFixed(2)}, ${tip.z.toFixed(2)}) from centre (${centre.x.toFixed(2)}, ${centre.y.toFixed(2)}, ${centre.z.toFixed(2)})`);
  }
});

test("seen from the east, north is the camera's right, and the sign floats ARROW_LIFT over the road facing the camera", () => {
  const camera = cameraAt({ x: 150, z: -50 });
  const { centre, tip, normal } = placed({ ...GATE, exit: { x: 0, z: -1 } }, camera);
  assert.ok(near(tip.z, centre.z - ARROW_TIP) && near(tip.y, centre.y) && near(tip.x, centre.x),
    `north from the east should point along -z; tip (${tip.x.toFixed(2)}, ${tip.y.toFixed(2)}, ${tip.z.toFixed(2)})`);
  assert.ok(near(centre.y, ROAD + ARROW_LIFT) && near(centre.x, GATE.x) && near(centre.z, GATE.z), `sign centre at (${centre.x}, ${centre.y}, ${centre.z})`);
  const toCamera = camera.position.clone().sub(centre).normalize();
  assert.ok(normal.normalize().dot(toCamera) > 0.999, `sign faces ${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)}, camera is at ${toCamera.x.toFixed(2)}, ${toCamera.y.toFixed(2)}, ${toCamera.z.toFixed(2)}`);
});

test("signAngle: away is π/2, the camera's right is 0, whichever way the camera looks", () => {
  assert.ok(near(signAngle({ x: 0, z: -1 }, cameraAt({ x: 100, z: 0 })), Math.PI / 2));
  assert.ok(near(signAngle({ x: 1, z: 0 }, cameraAt({ x: 100, z: 0 })), 0));
  assert.ok(near(signAngle({ x: -1, z: 0 }, cameraAt({ x: 150, z: -50 })), Math.PI / 2));
  assert.ok(near(signAngle({ x: 0, z: 1 }, cameraAt({ x: 50, z: -50 })), 0));
});

test("no exit, no sign: the finish is the gate without one, and a finished race hides the beacon", () => {
  const camera = cameraAt({ x: 100, z: 0 });
  const scene = new THREE.Scene();
  const view = addRaceBeacon(scene, 20);
  updateRaceBeacon(view, live({ ...GATE, exit: { x: 1, z: 0 } }), height, camera);
  assert.equal(view.group.visible, true);
  assert.equal(view.arrow.visible, true);
  updateRaceBeacon(view, live({ ...GATE, exit: null }), height, camera);
  assert.equal(view.group.visible, true);
  assert.equal(view.arrow.visible, false);
  updateRaceBeacon(view, live(null), height, camera);
  assert.equal(view.group.visible, false);
});

test("unordered beacons show every remaining gate and disappear after collection", () => {
  const camera = cameraAt({ x: 100, z: 0 });
  const scene = new THREE.Scene();
  const view = addRaceBeacon(scene, 20);
  const gates = [{ x: 100, z: 50, exit: null }, { x: 200, z: 150, exit: null }, { x: -80, z: 0, exit: null }];
  updateRaceBeacon(view, { ...live(gates[0]!), targets: gates }, height, camera);
  assert.equal(scene.children.filter(child => child.visible).length, 3);
  assert.ok(view.extras!.every(extra => !extra.arrow.visible));
  updateRaceBeacon(view, { ...live(gates[1]!), targets: gates.slice(1) }, height, camera);
  assert.equal(scene.children.filter(child => child.visible).length, 2);
  updateRaceBeacon(view, { ...live(null), targets: [] }, height, camera);
  assert.equal(scene.children.filter(child => child.visible).length, 0);
});
