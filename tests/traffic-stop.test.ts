import assert from "node:assert/strict";
import test from "node:test";
import { ALDER_INTERSECTIONS, createAlderWorld } from "../src/sim/alder.ts";
import { createTraffic, forecastTrafficPath, stepTraffic, STOP_DWELL, type TrafficVehicleState } from "../src/sim/traffic.ts";

// Step 2 of the traffic system (design/INTERSECTIONS.md, traffic-v10): a car on a red-flash or stop-sign approach stops
// with its front at the painted bar and stands there before it may claim the junction, where it used to claim from 34 m
// out on the move, forecasting the racers. Every junction incident parked on 2026-09-23 was that forecast wrong.
const network = createAlderWorld(true).traffic!;
const stopAt = (lane: number) => { const l = network.lanes[lane]!; return Math.min(l.control!.stopAt, l.length - l.entry); };

test("each dressed approach's lanes carry the rule its lights show, and a bar on the lane", () => {
  const controlled = network.lanes.filter(lane => lane.control);
  const stops = controlled.filter(lane => lane.control!.rule === "stop"), priority = controlled.filter(lane => lane.control!.rule === "priority");
  assert.ok(stops.length > 300 && priority.length > 150, `${stops.length} stop lanes, ${priority.length} priority`);
  for (const lane of controlled) assert.ok(lane.control!.stopAt > 0 && lane.control!.stopAt <= lane.length, `lane ${lane.id}'s bar is off it`);
  // Signals flash both colours, so both rules are in use at them.
  const approaches = ALDER_INTERSECTIONS.flatMap(j => j.approaches);
  assert.ok(approaches.some(a => a.control === "signal" && a.flash === "amber") && approaches.some(a => a.control === "signal" && a.flash === "red"));
});

test("a road straight through a junction is its amber axis, so traffic on it does not stop for the side street", () => {
  // The widest single arm used to pick the axis, which at 12 T-junctions was the stem, and stopped the through road.
  const wrong = ALDER_INTERSECTIONS.filter(j => {
    const pairs = j.approaches.flatMap((p, i) => j.approaches.slice(i + 1).filter(q => p.ux * q.ux + p.uz * q.uz < -0.85).map(q => [p, q]));
    return pairs.length > 0 && !pairs.some(([p, q]) => p!.flash === "amber" && q!.flash === "amber");
  });
  assert.deepEqual(wrong.map(j => j.id), []);
});

test("every claim from a stop lane is made standing at the bar after the dwell, and no car passes its bar without one", () => {
  const state = createTraffic(network);
  const held = new Map(state.vehicles.map(v => [v.id, v.holds.length > 0]));
  let claims = 0, rolling = 0, early = 0, passed = 0;
  for (let tick = 0; tick < 90 * 60; tick++) {
    const before = new Map<number, Pick<TrafficVehicleState, "lane" | "distance" | "stood" | "holds">>(
      state.vehicles.map(v => [v.id, { lane: v.lane, distance: v.distance, stood: v.stood, holds: [...v.holds] }]));
    stepTraffic(network, state, 1 / 60, []);
    for (const v of state.vehicles) {
      const was = before.get(v.id)!, lane = network.lanes[was.lane]!;
      const onStop = lane.control?.rule === "stop" && was.distance <= stopAt(was.lane) + 0.5;
      if (!held.get(v.id) && v.holds.length && onStop) { claims++; if ((was.stood ?? 0) < STOP_DWELL - 1e-9) early++; }
      else if (!held.get(v.id) && v.holds.length && lane.control?.rule === "priority") rolling++;
      // Crossing the bar in this tick, on the same lane, is only ever done holding the junction.
      if (onStop && v.lane === was.lane && v.distance > stopAt(was.lane) + 1e-6 && !v.holds.length) passed++;
      held.set(v.id, v.holds.length > 0);
    }
  }
  assert.ok(claims > 300 && rolling > 100, `${claims} claims from stop lanes, ${rolling} from priority ones: the test proves nothing`);
  assert.equal(early, 0, `${early} claims before the dwell`);
  assert.equal(passed, 0, `${passed} cars crossed their bar holding nothing`);
});

test("the forecast a rival reads holds a car at its bar, as the tick does", () => {
  // A car at cruise on a stop lane well short of its bar, holding nothing: forecast ten seconds on, it has not passed it.
  const lane = network.lanes.find(l => l.control?.rule === "stop" && stopAt(l.id) > 80)!;
  const start = network.pose(lane.id, stopAt(lane.id) - 70);
  const car: TrafficVehicleState = { id: 9999, kind: "sedan", lane: lane.id, distance: stopAt(lane.id) - 70, speed: 17.9,
    movement: lane.movements[0]!, holds: [], turns: 0, x: start.x, y: start.y, z: start.z, heading: start.heading, via: -1, braking: false };
  const path = forecastTrafficPath(network, car, 10);
  const bar = network.pose(lane.id, stopAt(lane.id)), end = path.at(-1)!;
  assert.ok(Math.hypot(end.x - bar.x, end.z - bar.z) < 0.5, `forecast ${Math.hypot(end.x - bar.x, end.z - bar.z).toFixed(1)} m from the bar`);
});
