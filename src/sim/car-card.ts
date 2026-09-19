/**
 * A car's measured card (design/HANDLING.md, "Cars"): what its numbers do, driven,
 * on an unlimited flat world with nothing to hit, so the card is the car and
 * nothing else. The tuning instrument for `car-handling.ts`, and what a garage
 * stat would be read from: measured, never authored.
 *
 * Every figure is a scripted drive through the real `step`, not arithmetic on the
 * tune; placing the car at speed before the first tick is the only shortcut.
 */
import type { RoadWorld } from "./road-world.ts";
import { createSim, step, TICK_HZ, type CarHandling, type Input, type Sim } from "./sim.ts";

export interface CarCard {
  readonly car: string | null;
  readonly drivetrain: CarHandling["drivetrain"];
  readonly mass: number;
  /** Seconds from rest to 60 mph at full throttle. */
  readonly zeroToSixty: number;
  /** Seconds from 60 to 100 mph at full throttle: the top end. */
  readonly sixtyToHundred: number;
  /** mph after a minute at full throttle. */
  readonly topSpeed: number;
  /** Metres from 100 km/h to rest (below 0.5 m/s) on a full pedal. */
  readonly stoppingDistance: number;
  /** Peak lateral m/s²: 6 s at full steer and 35% throttle from 22 m/s. */
  readonly peakLateral: number;
  /** Seconds for yaw rate to reach 90% of its peak in the first second of full
   *  steer from 22 m/s, coasting, so power oversteer cannot read as a slow wheel. */
  readonly turnIn: number;
  /** Peak body slip in degrees: a half-second handbrake pull at 30 m/s with 70% steer,
   *  half a second of half countersteer, then the stick centred. */
  readonly handbrakeSlip: number;
}

const MPH = 0.44704;
const FLAT = { along: 0, segmentIndex: 0, distance: 0, height: 0, pitch: 0, ux: 0, uz: -1, width: 10000 };
const WORLD: RoadWorld = { id: "car-card", start: { x: 0, y: 0.5, z: 0, heading: 0, pitch: 0 }, walls: [], project: () => FLAT };
const NEUTRAL: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

/** A fresh car on the flat world, rolling straight ahead (-z) at `speed`. */
function rolling(handling: CarHandling, speed = 0): Sim {
  const sim = createSim(handling, WORLD);
  if (speed) sim.body.setLinvel({ x: 0, y: 0, z: -speed }, true);
  return sim;
}

function drive(sim: Sim, seconds: number, input: (tick: number) => Partial<Input>, each?: (tick: number) => boolean | void): number {
  const ticks = Math.round(seconds * TICK_HZ);
  for (let tick = 0; tick < ticks; tick++) {
    step(sim, { ...NEUTRAL, ...input(tick) });
    if (each?.(tick)) return (tick + 1) / TICK_HZ;
  }
  return seconds;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

export function measureCar(handling: CarHandling): CarCard {
  const full = () => ({ throttle: 1 });
  const measured = <T>(sim: Sim, read: (sim: Sim) => T): T => { try { return read(sim); } finally { sim.world.free(); } };

  const zeroToSixty = measured(rolling(handling), sim =>
    drive(sim, 30, full, () => sim.state.vehicle.forwardSpeed >= 60 * MPH));
  const sixtyToHundred = measured(rolling(handling, 60 * MPH), sim =>
    drive(sim, 60, full, () => sim.state.vehicle.forwardSpeed >= 100 * MPH));
  const topSpeed = measured(rolling(handling), sim => { drive(sim, 60, full); return sim.state.vehicle.speed / MPH; });
  const stoppingDistance = measured(rolling(handling, 100 / 3.6), sim => {
    const from = { ...sim.body.translation() };
    drive(sim, 10, () => ({ brake: 1 }), () => sim.state.vehicle.speed < 0.5);
    const to = sim.body.translation();
    return Math.hypot(to.x - from.x, to.z - from.z);
  });
  const peakLateral = measured(rolling(handling, 22), sim => {
    let peak = 0;
    drive(sim, 6, () => ({ steer: 1, throttle: 0.35 }), () => { peak = Math.max(peak, Math.abs(sim.state.vehicle.lateralAcceleration)); });
    return peak;
  });
  const turnIn = measured(rolling(handling, 22), sim => {
    const yaw: number[] = [];
    drive(sim, 1, () => ({ steer: 1 }), () => { yaw.push(Math.abs(sim.state.vehicle.yawRate)); });
    const peak = Math.max(...yaw);
    return (yaw.findIndex(rate => rate >= 0.9 * peak) + 1) / TICK_HZ;
  });
  const handbrakeSlip = measured(rolling(handling, 30), sim => {
    let peak = 0;
    const half = TICK_HZ / 2;
    drive(sim, 3, tick => tick < half ? { steer: 0.7, handbrake: 1 } : tick < 2 * half ? { steer: -0.5 } : {},
      () => { const car = sim.state.vehicle; peak = Math.max(peak, Math.abs(Math.atan2(car.lateralSpeed, Math.abs(car.forwardSpeed)))); });
    return peak * 180 / Math.PI;
  });
  return {
    car: handling.car, drivetrain: handling.drivetrain, mass: handling.mass,
    zeroToSixty: round(zeroToSixty, 2), sixtyToHundred: round(sixtyToHundred, 2), topSpeed: round(topSpeed, 1),
    stoppingDistance: round(stoppingDistance, 1), peakLateral: round(peakLateral, 2), turnIn: round(turnIn, 2),
    handbrakeSlip: round(handbrakeSlip, 1),
  };
}
