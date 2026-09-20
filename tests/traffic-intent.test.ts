import assert from "node:assert/strict";
import test from "node:test";
import { createAlderWorld } from "../src/sim/alder.ts";
import { DT } from "../src/sim/sim.ts";
import { createTraffic, forecastTraffic, RACER_IN_LANE, SIGNAL_RANGE, stepTraffic, TRAFFIC_KINDS, trafficCornering, trafficSignal, type TrafficVehicleState } from "../src/sim/traffic.ts";
import { RIVET } from "../src/sim/drag-event.ts";
import { SABLE } from "../src/sim/drift-yard.ts";

// Traffic's plan (2026-09-13): which way each car turns is decided when it enters
// a lane, so where it is going is a fact the sim holds. The rival reads it as a
// forecast and the player reads it as indicators; both have to be true.
const network = createAlderWorld(true).traffic!;

test("a forecast is where a car that keeps its speed actually goes, turns and junction lines included", () => {
  const traffic = createTraffic(network);
  for (let tick = 0; tick < 60 * 30; tick++) stepTraffic(network, traffic, DT);
  const seconds = 2, ticks = Math.round(seconds / DT);
  let steady = 0, turned = 0, worst = 0;
  // Several windows, not one: traffic slows for its corners (2026-09-20), so few
  // vehicles hold one speed across a junction in any two seconds. The ones that do
  // drive the same curve at the same rate, which is what this holds the forecast to.
  // One that slowed only for a corner matches as closely; one that slowed for a
  // queue does not, and from outside the two look the same, so neither is counted.
  for (let window = 0; window < 8; window++) {
    const forecasts = traffic.vehicles.map(vehicle => forecastTraffic(network, vehicle, seconds));
    const startLane = traffic.vehicles.map(v => v.lane);
    // A car granted a junction during the window changed its plan; the forecast says so and cannot know it.
    const noClaim = traffic.vehicles.map(v => !v.holds.length);
    const speeds = traffic.vehicles.map(v => ({ min: v.speed, max: v.speed }));
    for (let tick = 0; tick < ticks; tick++) {
      stepTraffic(network, traffic, DT);
      traffic.vehicles.forEach((v, i) => { speeds[i]!.min = Math.min(speeds[i]!.min, v.speed); speeds[i]!.max = Math.max(speeds[i]!.max, v.speed); });
    }
    traffic.vehicles.forEach((vehicle, i) => {
      if (speeds[i]!.max - speeds[i]!.min > 1e-6) return;
      if (noClaim[i] && vehicle.lane !== startLane[i]) return;
      if (noClaim[i] && vehicle.holds.length) return;
      const error = Math.hypot(forecasts[i]!.x - vehicle.x, forecasts[i]!.z - vehicle.z);
      worst = Math.max(worst, error);
      steady++;
      if (vehicle.lane !== startLane[i]) turned++;
    });
  }
  assert.ok(steady > 100, `only ${steady} vehicles kept their speed; the test proves little`);
  assert.ok(turned > 5, `only ${turned} steady vehicles crossed a junction; the test does not reach a turn`);
  assert.ok(worst < 0.25, `a steady vehicle ended ${worst.toFixed(2)} m from its forecast`);
  // A car with no claim on the junction ahead stops at its entry line, whatever its speed.
  const approaching = traffic.vehicles.find(v => !v.holds.length && !trafficCornering(network, v) && network.lanes[v.lane]!.length - network.lanes[v.lane]!.entry > 60)!;
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
      if (!seen && vehicle.holds.length === 0 && !trafficCornering(network, vehicle) && toLine(vehicle) <= SIGNAL_RANGE && toLine(vehicle) > SIGNAL_RANGE - 5) {
        watching.set(vehicle.id, { movement: vehicle.movement, signal: trafficSignal(network, vehicle), heading: vehicle.heading, x: vehicle.x, z: vehicle.z });
      } else if (seen) {
        const movement = network.movements[seen.movement]!;
        if (vehicle.lane !== movement.from && vehicle.lane !== movement.to) { watching.delete(vehicle.id); continue; }
        // On the leaving lane, clear of the junction and off the handoff slide: the turn it made.
        if (vehicle.lane !== movement.to || vehicle.distance < movement.clear || trafficCornering(network, vehicle)) continue;
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
    return v.speed > 10 && !v.holds.length && !trafficCornering(network, v) && lane.length - lane.entry - v.distance > clearAhead
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

function junctionRun(withRacer: boolean, arriveTick = 0, pick = 0, speed = 20) {
    const traffic = createTraffic(network);
    for (let tick = 0; tick < 60 * 20; tick++) stepTraffic(network, traffic, DT);
    const vehicle = traffic.vehicles.filter(v => {
      const lane = network.lanes[v.lane]!, toLine = lane.length - lane.entry - v.distance;
      return !v.holds.length && v.movement >= 0 && v.speed > 8 && toLine > 45 && toLine < 60 && !trafficCornering(network, v);
    })[pick]!;
    const movement = network.movements[vehicle.movement]!, lane = network.lanes[movement.from]!;
    const point = network.pose(movement.from, lane.length);
    // A racer crossing the junction square to the approach, timed to reach it
    // `arriveTick` ticks after the run starts.
    const left = { x: -Math.cos(point.heading), z: Math.sin(point.heading) };
    const out = speed * arriveTick * DT;
    const racer = { x: point.x + left.x * out, z: point.z + left.z * out, heading: Math.atan2(left.x, left.z), speed };
    let claimedAt = -1, passedAt = -1;
    // Run on past the claim, so a claim made too early still sees when the racer crossed.
    for (let tick = 0; tick < 60 * 12 && (claimedAt < 0 || passedAt < 0); tick++) {
      if (withRacer) { racer.x -= left.x * speed * DT; racer.z -= left.z * speed * DT; }
      const beyond = -((racer.x - point.x) * left.x + (racer.z - point.z) * left.z);
      if (passedAt < 0 && beyond > 0) passedAt = tick;
      stepTraffic(network, traffic, DT, withRacer ? [racer] : []);
      if (claimedAt < 0 && vehicle.holds.includes(movement.id)) claimedAt = tick;
    }
    return { claimedAt, passedAt, found: !!vehicle };
}
/** The first approaching car that, with nobody crossing, claims its junction within four seconds. */
function unhindered() {
  let pick = 0, clear = junctionRun(false, 0, pick);
  while (!(clear.claimedAt >= 0 && clear.claimedAt < 4 * 60) && pick < 10) clear = junctionRun(false, 0, ++pick);
  assert.ok(clear.claimedAt >= 0 && clear.claimedAt < 4 * 60, `no approaching car claimed its junction within four seconds with nobody crossing; the test proves nothing`);
  return { pick, clear };
}

test("traffic does not claim a junction a racer is driving through, and claims it once the racer is past", () => {
  // "Past" is the racer through the crossing point; the rule lets a claim go once it is clear of the path.
  const { pick, clear } = unhindered();
  const crossed = junctionRun(true, clear.claimedAt + 20, pick);
  assert.ok(crossed.passedAt > clear.claimedAt, "the racer was past before the junction would have been claimed anyway; the test proves nothing");
  assert.ok(crossed.claimedAt >= crossed.passedAt, `it claimed the junction at tick ${crossed.claimedAt}, before the racer crossing it got there at ${crossed.passedAt}`);
  assert.ok(crossed.claimedAt >= 0, "it never claimed the junction after the racer had gone");
});

// A flat four-second look along a racer's course is 217 m at 122 mph. On seed 5 a
// car claimed its junction with the rival about 250 m out, turned across it, and
// the rival hit it at 113 mph. A junction is held for a racer that could not stop.
test("traffic does not claim a junction a racer at 123 mph could not stop short of", () => {
  const { pick, clear } = unhindered();
  const arrive = clear.claimedAt + Math.round(4.5 / DT);
  const crossed = junctionRun(true, arrive, pick, 55);
  assert.ok(crossed.passedAt > clear.claimedAt, "the racer was through before the junction would have been claimed; the test proves nothing");
  assert.ok(crossed.claimedAt < 0 || crossed.claimedAt >= crossed.passedAt, `it claimed the junction at tick ${crossed.claimedAt}, with a racer at 55 m/s arriving at ${crossed.passedAt}`);
});

// How traffic gets round a corner (2026-09-20). It used to drive to the end of
// its lane, be put on the next one, and have the step between the two and the
// change of heading interpolated away on separate schedules: over five minutes
// 9,892 ticks turned it more than 4 degrees (704 places), its body pointed a
// median 140 degrees from the way it was moving in a right turn, and it took
// every corner at cruise. Now a corner, and a bend in a lane's own polyline, is
// a curve tangent to the lane at both ends, driven along its own length.
//
// Every tick of every vehicle, not every tenth: a one-tick discontinuity is
// exactly what this guards, and sampling cannot see one.
test("traffic rounds its corners: it points where it is going, covers the ground at its speed, and slows", () => {
  const traffic = createTraffic(network);
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const before = traffic.vehicles.map(v => ({ x: v.x, z: v.z, heading: v.heading, speed: v.speed, cornering: false }));
  const fastest = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.cruise));
  let ticks = 0, snapped = 0, offSpeed = 0, worstStep = 0, worstSlip = 0, cornered = 0;
  const sideways: number[] = [];
  for (let tick = 0; tick < 60 * 60; tick++) {
    stepTraffic(network, traffic, DT);
    traffic.vehicles.forEach((v, i) => {
      const was = before[i]!, dx = v.x - was.x, dz = v.z - was.z, moved = Math.hypot(dx, dz);
      const turned = Math.abs(wrap(v.heading - was.heading)), cornering = trafficCornering(network, v);
      ticks++;
      worstStep = Math.max(worstStep, moved);
      if (turned > 4 * Math.PI / 180) snapped++;
      // The step lies between what the speed before and the speed after would cover.
      const least = Math.min(v.speed, was.speed) * DT, most = Math.max(v.speed, was.speed) * DT;
      if (moved < least - 0.01 || moved > most + 0.01) offSpeed++;
      if (cornering && was.cornering) {
        cornered++;
        if (moved > 0.02) worstSlip = Math.max(worstSlip, Math.abs(wrap(v.heading - Math.atan2(-dx, -dz))));
        sideways.push(v.speed * turned / DT);
      }
      Object.assign(was, { x: v.x, z: v.z, heading: v.heading, speed: v.speed, cornering });
    });
  }
  assert.ok(cornered > 50_000, `only ${cornered} vehicle-ticks were on a curve; the test proves little`);
  // No vehicle is ever moved further in a tick than the fastest one drives in one, give or take the curve table's
  // own grain (a curve is 32 straight pieces). A lane change used to be worth 15 m.
  assert.ok(worstStep <= fastest * DT * 1.05, `a vehicle moved ${worstStep.toFixed(4)} m in one tick, against ${(fastest * DT).toFixed(4)} m at cruise`);
  // What is left is a few vertices too close to a junction to round, and one street whose polyline doubles back on itself.
  assert.ok(snapped / ticks < 1e-4, `${snapped} of ${ticks} ticks turned a vehicle more than 4 degrees (it was 1 in 475)`);
  assert.ok(offSpeed / ticks < 1e-4, `${offSpeed} of ${ticks} steps were over 1 cm off the vehicle's speed (it was 1 in 41)`);
  assert.ok(worstSlip < 5 * Math.PI / 180, `on a curve a body pointed ${(worstSlip * 180 / Math.PI).toFixed(1)} degrees from the way it was moving`);
  // Slowed for: all but a hundredth of the time on a curve is within what it is meant to be taken at (6 m/s²).
  sideways.sort((a, b) => a - b);
  const p99 = sideways[Math.floor(sideways.length * 0.99)]!;
  assert.ok(p99 < 7.5, `a corner was taken at ${p99.toFixed(1)} m/s² sideways, 99th percentile (at cruise it was over 50)`);
});

// A parked rival is a racer traffic yields to, and one that never moves
// (2026-09-20). Rivet stood 0.41 m off the line of Harbor Way's outer lane,
// facing up it: four vehicles stopped behind her inside a minute and stayed.
test("no parked rival stands in a lane, so traffic never queues behind one", () => {
  const widest = Math.max(...Object.values(TRAFFIC_KINDS).map(kind => kind.width));
  for (const parked of [RIVET, SABLE]) {
    for (const lane of network.lanes) {
      // The nearest point of the lane, coarsely and then to 10 cm.
      let at = 0, nearest = Infinity;
      const look = (from: number, to: number, step: number) => {
        for (let d = from; d <= to; d += step) {
          const pose = network.pose(lane.id, d), away = Math.hypot(pose.x - parked.start.x, pose.z - parked.start.z);
          if (away < nearest) { nearest = away; at = d; }
        }
      };
      look(0, lane.length, 4);
      if (nearest > 20) continue;
      look(Math.max(0, at - 4), Math.min(lane.length, at + 4), 0.1);
      // Beside the lane rather than off one of its ends, where distance to a point is not distance to the line.
      if (at <= 0.1 || at >= lane.length - 0.1) continue;
      const pose = network.pose(lane.id, at);
      const beside = Math.abs((parked.start.x - pose.x) * -Math.cos(pose.heading) + (parked.start.z - pose.z) * Math.sin(pose.heading));
      // Out of what traffic calls its lane whichever way she faces, which is also clear of the widest body that drives it.
      assert.ok(beside >= RACER_IN_LANE, `${parked.name} stands ${beside.toFixed(2)} m from the line of lane ${lane.id}; traffic follows anything within ${RACER_IN_LANE} m`);
      assert.ok(beside > (widest + 2) / 2);
    }
  }
  // And driven: two minutes beside both of them, and nothing waits in the road behind Rivet. It took 45 s to form.
  const traffic = createTraffic(network);
  const racers = [RIVET, SABLE].map(parked => ({ x: parked.start.x, z: parked.start.z, heading: parked.start.heading, speed: 0 }));
  const stopped = new Map<number, number>();
  let longest = 0;
  for (let tick = 0; tick < 60 * 120; tick++) {
    stepTraffic(network, traffic, DT, racers);
    for (const v of traffic.vehicles) {
      const behind = Math.abs(v.x - RIVET.start.x) < 12 && v.z > RIVET.start.z && v.z < RIVET.start.z + 120;
      const run = behind && v.speed < 0.5 ? (stopped.get(v.id) ?? 0) + 1 : 0;
      stopped.set(v.id, run);
      longest = Math.max(longest, run);
    }
  }
  assert.ok(longest < 60 * 20, `a vehicle stood ${(longest / 60).toFixed(0)} s in the road behind Rivet`);
});
