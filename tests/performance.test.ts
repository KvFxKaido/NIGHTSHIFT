import test from "node:test";
import assert from "node:assert/strict";
import { createFrameMetrics } from "../src/debug/performance.ts";

test("frame metrics measure cadence and average per-frame CPU work", () => {
  const metrics = createFrameMetrics();
  metrics.record(0, 100, 100);
  assert.equal(metrics.read(), null);
  for (let i = 1; i <= 120; i++) metrics.record(i * 1000 / 60, 2, 4);
  const values = metrics.read()!;
  assert.ok(Math.abs(values.fps - 60) < .001);
  assert.ok(Math.abs(values.frameMs - 1000 / 60) < .001);
  assert.equal(values.simMs, 2);
  assert.equal(values.renderMs, 4);
});

test("frame metrics retain stalls and calculate the nearest-rank p95", () => {
  const metrics = createFrameMetrics();
  metrics.record(0, 0, 0);
  for (let i = 1; i <= 18; i++) metrics.record(i * 10, 0, 0);
  metrics.record(480, 0, 0);
  metrics.record(880, 0, 0);
  assert.equal(metrics.read()!.p95Ms, 300);
  assert.equal(metrics.read()!.frameMs, 44);
  metrics.reset();
  metrics.record(0, 0, 0);
  metrics.record(3000, 0, 0);
  assert.equal(metrics.read()!.frameMs, 3000);
});

test("old frames age out and reset excludes time spent in background or menus", () => {
  const metrics = createFrameMetrics();
  metrics.record(0, 0, 0);
  metrics.record(3000, 10, 20);
  for (let time = 3020; time <= 5000; time += 20) metrics.record(time, 1, 2);
  assert.equal(metrics.read()!.fps, 50);
  assert.equal(metrics.read()!.simMs, 1);
  metrics.reset();
  metrics.record(100000, 0, 0);
  assert.equal(metrics.read(), null);
  metrics.record(100020, 1, 2);
  assert.equal(metrics.read()!.frameMs, 20);
});
