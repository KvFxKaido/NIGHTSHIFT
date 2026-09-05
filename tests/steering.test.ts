import assert from "node:assert/strict";
import test from "node:test";
import { DT, HANDLING, steeringAngleFor, steeringControlFor } from "../src/sim/sim.ts";

const near = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("ordinary turn-in keeps its existing response and speed envelope", () => {
  for (const speed of [0, 15, 30, 60]) for (const side of [-1, 1]) {
    let current = 0;
    for (let tick = 1; tick <= 15; tick++) {
      const result = steeringControlFor(current, side, speed);
      near(result.steering, side * Math.min(1, tick * HANDLING.steeringResponse * DT));
      near(result.steeringAngle, steeringAngleFor(speed, result.steering));
      current = result.steering;
    }
    const intoSlide = steeringControlFor(side, side, speed, -side * 10, -side * 0.5);
    near(intoSlide.steeringAngle, steeringAngleFor(speed, side));
  }
});

test("deliberate countersteer crosses centre in 50 ms and reaches full reverse input in 84 ms", () => {
  let current = 1;
  let firstOpposite = 0;
  let fullOpposite = 0;
  for (let tick = 1; tick <= 10; tick++) {
    const result = steeringControlFor(current, -1, 40, -10, -0.5);
    current = result.steering;
    if (current < 0 && !firstOpposite) firstOpposite = tick;
    if (current === -1 && !fullOpposite) fullOpposite = tick;
    assert.equal(Math.sign(result.steeringAngle), Math.sign(current));
  }
  assert.equal(firstOpposite, 3);
  assert.equal(fullOpposite, 5);
});

test("manual catch range is proportional to stick input, not an automatic angle", () => {
  const full = steeringControlFor(-1, -1, 40, -10, -0.5).steeringAngle;
  assert.ok(Math.abs(full) > steeringAngleFor(40) * 3);
  assert.ok(Math.abs(full) <= HANDLING.maxSteeringAngle);
  for (const amount of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    near(steeringControlFor(-amount, -amount, 40, -10, -0.5).steeringAngle, full * amount);
    near(steeringControlFor(amount, amount, 40, 10, 0.5).steeringAngle, -full * amount);
  }
});

test("neutral input cannot manufacture countersteer at any slip or yaw rate", () => {
  for (const speed of [-20, 0, 3, 15, 60]) for (const lateral of [-100, -10, 0, 10, 100]) {
    for (const yaw of [-5, 0, 5]) {
      assert.deepEqual(steeringControlFor(0, 0, speed, lateral, yaw), { steering: 0, steeringAngle: 0 });
      for (const side of [-1, 1]) {
        let current = side;
        for (let tick = 0; tick < 5; tick++) {
          const result = steeringControlFor(current, 0, speed, lateral, yaw);
          assert.ok(side * result.steering >= 0 && Math.abs(result.steering) <= Math.abs(current));
          near(result.steeringAngle, steeringAngleFor(speed, result.steering));
          current = result.steering;
        }
        assert.equal(current, 0);
      }
    }
  }
});

test("normal yaw, tiny slip and reverse never unlock countersteering range", () => {
  for (const [speed, lateral, yaw] of [[40, 0.1, -1], [40, 4, 5], [-20, 10, 0], [3, 10, 0]]) {
    const result = steeringControlFor(0, 1, speed, lateral, yaw);
    near(result.steering, HANDLING.steeringResponse * DT);
    near(result.steeringAngle, steeringAngleFor(speed, result.steering));
  }
  const start = HANDLING.countersteerSlipStart;
  const low = steeringControlFor(1, 1, 40, 40 * Math.tan(start - 1e-7)).steeringAngle;
  const high = steeringControlFor(1, 1, 40, 40 * Math.tan(start + 1e-7)).steeringAngle;
  near(low, high, 1e-8);
});
