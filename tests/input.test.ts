import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCameraGamepad,
  mapGamepad,
  mapMenuHorizontal,
  mapMenuVertical,
} from "../src/input/input.ts";

function gamepad(axes: number[] = [0], values: Record<number, number> = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: (values[index] ?? 0) > 0.5,
    touched: (values[index] ?? 0) > 0,
    value: values[index] ?? 0,
  }));
  return { axes, buttons } as Gamepad;
}

test("standard triggers map to analog throttle and brake", () => {
  const input = mapGamepad(gamepad([0], { 6: 0.35, 7: 0.8 }));
  assert.equal(input.throttle, 0.8);
  assert.equal(input.brake, 0.35);
});

test("left stick steering applies a deadzone", () => {
  assert.equal(mapGamepad(gamepad([0.1])).steer, 0);
  assert.ok(mapGamepad(gamepad([-0.65])).steer < -0.5);
});

test("D-pad steering works when the stick is centered", () => {
  assert.equal(mapGamepad(gamepad([0], { 14: 1 })).steer, -1);
  assert.equal(mapGamepad(gamepad([0], { 15: 1 })).steer, 1);
});

test("A maps to the handbrake", () => {
  assert.equal(mapGamepad(gamepad([0], { 0: 1 })).handbrake, 1);
});

test("right stick maps to camera look with its own deadzone", () => {
  assert.deepEqual(mapCameraGamepad(gamepad([0, 0, 0.12, -0.1])), { x: 0, y: 0 });
  const look = mapCameraGamepad(gamepad([0, 0, 0.65, -0.72]));
  assert.ok(look.x > 0.5);
  assert.ok(look.y < -0.6);
});

test("left stick and D-pad map to vertical menu navigation", () => {
  assert.equal(mapMenuVertical(gamepad([0, -0.8])), -1);
  assert.equal(mapMenuVertical(gamepad([0, 0.8])), 1);
  assert.equal(mapMenuVertical(gamepad([0, 0], { 12: 1 })), -1);
  assert.equal(mapMenuVertical(gamepad([0, 0], { 13: 1 })), 1);
});

test("left stick and D-pad map to horizontal menu navigation", () => {
  assert.equal(mapMenuHorizontal(gamepad([-0.8, 0])), -1);
  assert.equal(mapMenuHorizontal(gamepad([0.8, 0])), 1);
  assert.equal(mapMenuHorizontal(gamepad([0, 0], { 14: 1 })), -1);
  assert.equal(mapMenuHorizontal(gamepad([0, 0], { 15: 1 })), 1);
});
