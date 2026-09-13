import assert from "node:assert/strict";
import test from "node:test";
import { createAlderWorld } from "../src/sim/alder.ts";
import { DT } from "../src/sim/sim.ts";
import { createTraffic, forecastTraffic, SIGNAL_RANGE, stepTraffic, TRAFFIC_KINDS, trafficSignal, type TrafficVehicleState } from "../src/sim/traffic.ts";

// Traffic's plan (2026-09-13): which way each car turns is decided when it enters
// a lane, so where it is going is a fact the sim holds. The rival reads it as a
// forecast and the player reads it as indicators; both have to be true.
const network = createAlderWorld(true).traffic!;

test("a forecast is where a car that keeps its speed actually goes, turns and junction lines included", () => {
  const traffic = createTraffic(network);
  for (let tick = 0; tick < 60 * 30; tick++) stepTraffic(network, traffic, DT);
  const seconds = 2, ticks = Math.round(seconds / DT);
  const forecasts = traffic.vehicles.map(vehicle => forecastTraffic(network, vehicle, seconds));
  const startLane = traffic.vehicles.map(v => v.lane);
  // A car granted a junction during the window changed its plan; the forecast says so and cannot know it.
  const noClaim = traffic.vehicles.map(v => !v.holds.length);
  const speeds = traffic.vehicles.map(v => ({ min: v.speed, max: v.speed }));
  for (let tick = 0; tick < ticks; tick++) {
    stepTraffic(network, traffic, DT);
    traffic.vehicles.forEach((v, i) => { speeds[i]!.min = Math.min(speeds[i]!.min, v.speed); speeds[i]!.max = Math.max(speeds[i]!.max, v.speed); });
  }
  let steady = 0, turned = 0, worst = 0;
  traffic.vehicles.forEach((vehicle, i) => {
    if (speeds[i]!.max - speeds[i]!.min > 1e-6) return;
    if (noClaim[i] && vehicle.lane !== startLane[i]) return;
    if (noClaim[i] && vehicle.holds.length) return;
    const error = Math.hypot(forecasts[i]!.x - vehicle.x, forecasts[i]!.z - vehicle.z);
    worst = Math.max(worst, error);
    steady++;
    if (vehicle.lane !== startLane[i]) turned++;
  });
  assert.ok(steady > 100, `only ${steady} vehicles kept their speed; the test proves little`);
  assert.ok(turned > 5, `only ${turned} steady vehicles crossed a junction; the test does not reach a turn`);
  assert.ok(worst < 0.25, `a steady vehicle ended ${worst.toFixed(2)} m from its forecast`);
  // A car with no claim on the junction ahead stops at its entry line, whatever its speed.
  const approaching = traffic.vehicles.find(v => !v.holds.length && v.blendLeft <= 0 && network.lanes[v.lane]!.length - network.lanes[v.lane]!.entry > 60)!;
  const lane = network.lanes[approaching.lane]!, line = lane.length - lane.entry;
  const unclaimed = { ...approaching, distance: line - 20, speed: 10, holds: [] };
  const at = network.pose(unclaimed.lane, unclaimed.distance);
  const stopped = forecastTraffic(network, { ...unclaimed, x: at.x, z: at.z, heading: at.heading }, 5);
  const atLine = network.pose(unclaimed.lane, line);
  assert.ok(Math.hypot(stopped.x - atLine.x, stopped.z - atLine.z) < 0.05, `a car with no claim was forecast ${Math.hypot(stopped.x - atLine.x, stopped.z - atLine.z).toFixed(1)} m from its entry line`);
});

test("a car signals the way it then turns, and signals nothing going straight on", () => {
  const traffic = createTraffic(network);
  for (let tick = 0; tick < 60 * 10; tick++) stepTraffic(network, traffic, DT);
  // Per vehicle: the signal, heading and position when it first came within range
  // of a line off any earlier slide, and the movement it was about to make.
  const watching = new Map<number, { movement: number; signal: ReturnType<typeof trafficSignal>; heading: number; x: number; z: number }>();
  const outcomes: { signal: ReturnType<typeof trafficSignal>; turn: number }[] = [];
  const toLine = (v: TrafficVehicleState) => { const lane = network.lanes[v.lane]!; return lane.length - lane.entry - v.distance; };
  for (let tick = 0; tick < 60 * 120; tick++) {
    stepTraffic(network, traffic, DT);
    for (const vehicle of traffic.vehicles) {
      const seen = watching.get(vehicle.id);
      if (!seen && vehicle.holds.length === 0 && vehicle.blendLeft <= 0 && toLine(vehicle) <= SIGNAL_RANGE && toLine(vehicle) > SIGNAL_RANGE - 5) {
        watching.set(vehicle.id, { movement: vehicle.movement, signal: trafficSignal(network, vehicle), heading: vehicle.heading, x: vehicle.x, z: vehicle.z });
      } else if (seen) {
        const movement = network.movements[seen.movement]!;
        if (vehicle.lane !== movement.from && vehicle.lane !== movement.to) { watching.delete(vehicle.id); continue; }
        // On the leaving lane, clear of the junction and off the handoff slide: the turn it made.
        if (vehicle.lane !== movement.to || vehicle.distance < movement.clear || vehicle.blendLeft > 0) continue;
        const turn = Math.atan2(Math.sin(vehicle.heading - seen.heading), Math.cos(vehicle.heading - seen.heading)) * 180 / Math.PI;
        const leftward = (vehicle.x - seen.x) * -Math.cos(seen.heading) + (vehicle.z - seen.z) * Math.sin(seen.heading);
        outcomes.push({ signal: seen.signal, turn: Math.abs(turn) < 10 ? turn : Math.abs(turn) * Math.sign(leftward) });
        watching.delete(vehicle.id);
      }
    }
  }
  const lefts = outcomes.filter(o => o.turn > 60), rights = outcomes.filter(o => o.turn < -60), straights = outcomes.filter(o => Math.abs(o.turn) < 10);
  assert.ok(lefts.length > 10 && rights.length > 10 && straights.length > 10, `too few junctions seen: ${lefts.length} left, ${rights.length} right, ${straights.length} straight`);
  assert.deepEqual(lefts.filter(o => o.signal !== "left").map(o => [o.signal, Math.round(o.turn)]), [], "a car turned left without signalling left");
  assert.deepEqual(rights.filter(o => o.signal !== "right").map(o => [o.signal, Math.round(o.turn)]), [], "a car turned right without signalling right");
  assert.deepEqual(straights.filter(o => o.signal !== null).map(o => [o.signal, Math.round(o.turn)]), [], "a car going straight on signalled");
});

// Traffic yields to racers (2026-09-13): the cars it does not drive. Blind, it
// shoved a slowed rival down a one-lane street for ten seconds and turned a truck
// across a rival passing it at 100 mph.
function cruising(traffic: ReturnType<typeof createTraffic>, clearAhead: number) {
  return traffic.vehicles.find(v => {
    const lane = network.lanes[v.lane]!;
    return v.speed > 10 && !v.holds.length && v.blendLeft <= 0 && lane.length - lane.entry - v.distance > clearAhead
      && !traffic.vehicles.some(o => o !== v && o.lane === v.lane && o.distance > v.distance && o.distance - v.distance < clearAhead);
  })!;
}

test("traffic stops behind a racer in its lane, braking, and without one drives straight through", () => {
  const run = (withRacer: boolean) => {
    const traffic = createTraffic(network);
    for (let tick = 0; tick < 60 * 20; tick++) stepTraffic(network, traffic, DT);
    const vehicle = cruising(traffic, 140);
    const lane = vehicle.lane, at = vehicle.distance + 50, pose = network.pose(lane, at);
    const racer = { x: pose.x, z: pose.z, heading: pose.heading, speed: 0 };
    let closest = Infinity, brakedWhileSlowing = true;
    for (let tick = 0; tick < 60 * 10; tick++) {
      const before = vehicle.speed;
      stepTraffic(network, traffic, DT, withRacer ? [racer] : []);
      closest = Math.min(closest, vehicle.lane === lane ? at - vehicle.distance : -Infinity);
      // Slowing at more than 1 m/s² shows brake lights; easing off a fraction does not have to.
      if (vehicle.speed < before - DT * 1 && !vehicle.braking) brakedWhileSlowing = false;
    }
    return { closest, vehicle, brakedWhileSlowing };
  };
  const yielding = run(true);
  assert.ok(yielding.closest > (TRAFFIC_KINDS[yielding.vehicle.kind].length + 4.8) / 2 + 2, `it came within ${yielding.closest.toFixed(1)} m (centre to centre) of a racer stopped in its lane`);
  assert.ok(yielding.vehicle.speed < 0.1, `it was still moving at ${yielding.vehicle.speed.toFixed(1)} m/s behind a stopped racer`);
  assert.ok(yielding.vehicle.braking, "held behind a racer, it shows no brake lights");
  assert.ok(yielding.brakedWhileSlowing, "it slowed without its brake lights on");
  assert.ok(run(false).closest < 0, "without a racer it never reached that spot; the test proves nothing");
});

test("traffic does not claim a junction a racer is driving through, and claims it once the racer is past", () => {
  const run = (withRacer: boolean, arriveTick = 0, pick = 0) => {
    const traffic = createTraffic(network);
    for (let tick = 0; tick < 60 * 20; tick++) stepTraffic(network, traffic, DT);
    const vehicle = traffic.vehicles.filter(v => {
      const lane = network.lanes[v.lane]!, toLine = lane.length - lane.entry - v.distance;
      return !v.holds.length && v.movement >= 0 && v.speed > 8 && toLine > 45 && toLine < 60 && v.blendLeft <= 0;
    })[pick]!;
    const movement = network.movements[vehicle.movement]!, lane = network.lanes[movement.from]!;
    const point = network.pose(movement.from, lane.length);
    // A racer crossing the junction square to the approach at 20 m/s, timed to reach
    // it just as the vehicle would claim it with nobody there.
    const left = { x: -Math.cos(point.heading), z: Math.sin(point.heading) };
    const out = 20 * arriveTick * DT;
    const racer = { x: point.x + left.x * out, z: point.z + left.z * out, heading: Math.atan2(left.x, left.z), speed: 20 };
    let claimedAt = -1, passedAt = -1;
    for (let tick = 0; tick < 60 * 12 && claimedAt < 0; tick++) {
      if (withRacer) { racer.x -= left.x * 20 * DT; racer.z -= left.z * 20 * DT; }
      const beyond = -((racer.x - point.x) * left.x + (racer.z - point.z) * left.z);
      if (passedAt < 0 && beyond > 0) passedAt = tick;
      stepTraffic(network, traffic, DT, withRacer ? [racer] : []);
      if (vehicle.holds.includes(movement.id)) claimedAt = tick;
    }
    return { claimedAt, passedAt, found: !!vehicle };
  };
  // "Past" is the racer through the crossing point; the rule lets a claim go once it is clear of the path.
  // The first approaching car that, with nobody crossing, claims its junction within four seconds.
  let pick = 0, clear = run(false, 0, pick);
  while (!(clear.claimedAt >= 0 && clear.claimedAt < 4 * 60) && pick < 10) clear = run(false, 0, ++pick);
  assert.ok(clear.claimedAt >= 0 && clear.claimedAt < 4 * 60, `no approaching car claimed its junction within four seconds with nobody crossing; the test proves nothing`);
  const crossed = run(true, clear.claimedAt + 20, pick);
  assert.ok(crossed.passedAt > clear.claimedAt, "the racer was past before the junction would have been claimed anyway; the test proves nothing");
  assert.ok(crossed.claimedAt >= crossed.passedAt, `it claimed the junction at tick ${crossed.claimedAt}, before the racer crossing it got there at ${crossed.passedAt}`);
  assert.ok(crossed.claimedAt >= 0, "it never claimed the junction after the racer had gone");
});
