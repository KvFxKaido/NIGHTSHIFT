import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_ORBIT,
  createCameraOrbitState,
  resetCameraOrbit,
  updateCameraOrbit,
} from "../src/render/camera.ts";

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

test("camera reset restores the chase view", () => {
  const orbit = { yawOffset: -2.2, pitchOffset: 0.4 };
  resetCameraOrbit(orbit);
  assert.deepEqual(orbit, createCameraOrbitState());
});
