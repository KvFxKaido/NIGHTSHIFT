import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_ORBIT,
  CHASE_CAMERAS,
  createCameraOrbitState,
  DEFAULT_CHASE_CAMERA,
  isChaseCameraId,
  nextChaseCamera,
  resetCameraOrbit,
  updateCameraOrbit,
} from "../src/render/camera.ts";
import { CAMERA_KEY, decodeCameraPreference, loadCameraPreference, saveCameraPreference } from "../src/settings/camera-preference.ts";

test("camera orbit responds to both right-stick axes", () => {
  const orbit = createCameraOrbitState();
  updateCameraOrbit(orbit, { x: 0.8, y: -0.7 }, 20, 0.25);
  assert.ok(orbit.yawOffset < 0);
  assert.ok(orbit.pitchOffset > 0);
});

test("camera pitch remains inside the inspection range", () => {
  const orbit = createCameraOrbitState();
  for (let frame = 0; frame < 120; frame++) {
    updateCameraOrbit(orbit, { x: 0, y: -1 }, 0, 1 / 60);
  }
  assert.equal(orbit.pitchOffset, CAMERA_ORBIT.maxPitch);
});

test("a stopped inspection camera holds while a moving camera recenters", () => {
  const orbit = { yawOffset: 1.1, pitchOffset: 0.3 };
  updateCameraOrbit(orbit, { x: 0, y: 0 }, 0, 0.5);
  assert.deepEqual(orbit, { yawOffset: 1.1, pitchOffset: 0.3 });

  updateCameraOrbit(orbit, { x: 0, y: 0 }, 20, 0.5);
  assert.ok(Math.abs(orbit.yawOffset) < 1.1);
  assert.ok(Math.abs(orbit.pitchOffset) < 0.3);
});

test("the standard chase camera keeps the framing the game shipped with", () => {
  // Near and far were added beside it (2026-09-12); the default must not move.
  assert.equal(DEFAULT_CHASE_CAMERA, "standard");
  const { label: _label, ...standard } = CHASE_CAMERAS.standard;
  assert.deepEqual(standard, {
    distance: 7.2, distanceAtSpeed: 2.7, height: 3.15, heightAtSpeed: 1.05,
    lookHeight: 0.82, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  });
  assert.equal(isChaseCameraId("far"), true);
  assert.equal(isChaseCameraId("toString"), false);
});

test("changing camera steps near, standard, far and wraps", () => {
  assert.equal(nextChaseCamera("standard"), "far");
  assert.equal(nextChaseCamera("far"), "near");
  assert.equal(nextChaseCamera("near"), "standard");
});

test("the camera choice round-trips on its own key and unreadable saves fall back", () => {
  const data = new Map<string, string>();
  const disk = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.equal(loadCameraPreference(() => disk), "standard", "a fresh browser starts on the shipped camera");
  assert.equal(saveCameraPreference(() => disk, "far"), true);
  assert.deepEqual([...data.keys()], [CAMERA_KEY]);
  assert.equal(loadCameraPreference(() => disk), "far");
  for (const raw of ["{", "null", JSON.stringify({ version: 2, camera: "far" }), JSON.stringify({ version: 1, camera: "toString" })]) {
    assert.equal(decodeCameraPreference(raw), "standard", raw);
  }
  const blocked = () => { throw new Error("Storage disabled"); };
  assert.equal(loadCameraPreference(blocked), "standard");
  assert.equal(saveCameraPreference(blocked, "near"), false);
  assert.throws(() => saveCameraPreference(() => disk, "closest" as "near"), RangeError);
});

test("camera reset restores the chase view", () => {
  const orbit = { yawOffset: -2.2, pitchOffset: 0.4 };
  resetCameraOrbit(orbit);
  assert.deepEqual(orbit, createCameraOrbitState());
});
