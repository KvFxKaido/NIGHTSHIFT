import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_ORBIT,
  CHASE_CAMERAS,
  createCameraOrbitState,
  createChaseFollowState,
  DEFAULT_CHASE_CAMERA,
  isChaseCameraId,
  nextChaseCamera,
  resetCameraOrbit,
  trackChaseFollow,
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

test("changing camera steps near, standard, standard B, far and wraps", () => {
  // Standard B sits beside Standard so one press compares the two.
  assert.equal(nextChaseCamera("standard"), "standardB");
  assert.equal(nextChaseCamera("standardB"), "far");
  assert.equal(nextChaseCamera("far"), "near");
  assert.equal(nextChaseCamera("near"), "standard");
});

test("standard B is Standard's framing with a follow, and only it has one", () => {
  // The comparison is about how the camera keeps up. A digit of framing moved
  // here and the two differ for a second reason nobody chose.
  const { label: _a, ...standard } = CHASE_CAMERAS.standard;
  const { label: _b, follow, ...standardB } = CHASE_CAMERAS.standardB;
  assert.deepEqual(standardB, standard);
  assert.equal(follow.carried, 1);
  for (const [id, camera] of Object.entries(CHASE_CAMERAS)) {
    assert.equal("follow" in camera, id === "standardB", id);
  }
});

test("a carried camera holds its distance at a steady speed where an eased one trails", () => {
  // The follow in one dimension: the camera's place is `gap` behind a car at a
  // steady 62.6 m/s (140 mph), eased toward at scene.ts's 6.8 a second.
  const follow = CHASE_CAMERAS.standardB.follow;
  const speed = 62.6, gap = 9.9, dt = 1 / 60, blend = 1 - Math.exp(-6.8 * dt);
  const trailing = (carry: boolean) => {
    const state = createChaseFollowState();
    let car = 0, camera = -gap;
    for (let frame = 0; frame < 600; frame++) {
      car += speed * dt;
      if (carry) camera += trackChaseFollow(state, follow, { x: car, z: 0, speed }, dt).dx;
      camera += (car - gap - camera) * blend;
    }
    return car - camera - gap;
  };
  assert.ok(Math.abs(trailing(false) - 8.7) < 0.05, `eased alone trails ${trailing(false)} m`);
  assert.ok(Math.abs(trailing(true)) < 1e-6, `carried trails ${trailing(true)} m`);
});

test("a carried camera carries nothing across a teleport or on its first frame", () => {
  const follow = CHASE_CAMERAS.standardB.follow;
  const state = createChaseFollowState();
  assert.deepEqual(trackChaseFollow(state, follow, { x: 500, z: -200, speed: 30 }, 1 / 60), { dx: 0, dz: 0, distance: 0 });
  const moved = trackChaseFollow(state, follow, { x: 500.4, z: -200.3, speed: 30 }, 1 / 60);
  assert.ok(Math.abs(moved.dx - 0.4) < 1e-9 && Math.abs(moved.dz + 0.3) < 1e-9);
  for (let frame = 0; frame < 60; frame++) trackChaseFollow(state, follow, { x: 500.4, z: -200.3, speed: 30 + frame * .15 }, 1 / 60);
  assert.ok(state.acceleration > 5);
  // A reset or a scripted jump: the camera eases over, and the speed it lost on
  // the way is not braking.
  assert.deepEqual(trackChaseFollow(state, follow, { x: 900, z: 40, speed: 0 }, 1 / 60), { dx: 0, dz: 0, distance: 0 });
  assert.equal(state.acceleration, 0);
});

test("gaining speed pulls a carried camera back and losing it brings it in, within limits", () => {
  const follow = CHASE_CAMERAS.standardB.follow;
  const run = (acceleration: number) => {
    const state = createChaseFollowState();
    let speed = 30, distance = 0;
    for (let frame = 0; frame < 120; frame++) {
      speed += acceleration / 60;
      distance = trackChaseFollow(state, follow, { x: 0, z: 0, speed }, 1 / 60).distance;
    }
    return distance;
  };
  assert.ok(Math.abs(run(7) - 7 * follow.pullback) < 0.01);
  assert.ok(Math.abs(run(-10) + 10 * follow.compression) < 0.01);
  assert.equal(run(0), 0);
  // A hit is 2,000 m/s² for a tick; it may not throw the camera.
  const state = createChaseFollowState();
  trackChaseFollow(state, follow, { x: 0, z: 0, speed: 40 }, 1 / 60);
  const hit = trackChaseFollow(state, follow, { x: 0, z: 0, speed: 0 }, 1 / 60).distance;
  assert.ok(hit < 0 && hit > -0.2, `${hit}`);
  assert.ok(run(40) <= follow.maxPullback && run(-40) >= -follow.maxCompression);
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
