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
  /** Seconds the car spends in a held slide, summed over the nine entries of
   *  `SLIDE_ENTRIES`. How much sideways the car offers, where `handbrakeSlip`
   *  is only the peak of a poke. */
  readonly slideSeconds: number;
  /** Mean body slip in degrees over those seconds: how far out it sits. */
  readonly slideAngle: number;
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
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const slipDegrees = (sim: Sim) => {
  const car = sim.state.vehicle;
  return Math.atan2(car.lateralSpeed, Math.abs(car.forwardSpeed)) * 180 / Math.PI;
};

/** Nine ways into a slide: three steering angles by three flick lengths, in
 *  ticks. A car that only slides on one of them is harder to get sideways than
 *  one that slides on all nine, and the sweep is what says so. */
const SLIDE_ENTRIES = [0.5, 0.7, 0.9].flatMap(steer => [20, 30, 40].map(flick => ({ steer, flick })));
/** The slide the bench counts: body slip between `low` and `high` degrees, still
 *  moving forwards at `floor` m/s or more. Under `low` the car has straightened,
 *  over `high` it has spun, and both end the run once it has been out of the
 *  window for `lapse` ticks. `target` is the angle the hold law aims at. */
const SLIDE = { speed: 25, target: 25, hold: 6, low: 12, high: 55, floor: 8, lapse: 15 } as const;

/**
 * One entry, held by ONE control law for every car: keep steering into the
 * corner and countersteer on whatever slip exceeds the target, with throttle
 * holding the entry speed. Slip runs opposite in sign to the steer that made
 * it, so adding sign(slip) x excess bleeds the lock off and past it into
 * opposite lock. No car identity is in the law, which is the point: what
 * differs between cars is the car.
 *
 * The measure is deliberately peaked in the handbrake rather than rising with
 * it (measured 2026-09-19 on the NS-01: 0.6 never breaks traction and every
 * entry straightens, 1.25 holds eight of nine, 1.6 spins five of nine). A car
 * that snaps past `high` is not a drift car; it is a car that spins.
 */
function slide(handling: CarHandling, steer: number, flick: number): { ticks: number; angle: number } {
  const sim = rolling(handling, SLIDE.speed);
  try {
    drive(sim, flick / TICK_HZ, () => ({ steer, throttle: 0.3, handbrake: 1 }));
    let ticks = 0, angle = 0, lapsed = 0, started = false;
    drive(sim, SLIDE.hold, () => {
      const slip = slipDegrees(sim);
      return {
        steer: clamp(steer + Math.sign(slip) * clamp((Math.abs(slip) - SLIDE.target) / 15, 0, 1.6), -1, 1),
        throttle: clamp(0.5 + (SLIDE.speed - sim.state.vehicle.speed) * 0.15, 0, 1),
      };
    }, tick => {
      const car = sim.state.vehicle, size = Math.abs(slipDegrees(sim));
      if (size >= SLIDE.low && size <= SLIDE.high && car.speed >= SLIDE.floor && car.forwardSpeed > 2) {
        started = true; ticks++; angle += size; lapsed = 0;
        return false;
      }
      return started ? ++lapsed >= SLIDE.lapse : tick > TICK_HZ;
    });
    return { ticks, angle };
  } finally { sim.world.free(); }
}

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
  const slides = SLIDE_ENTRIES.map(entry => slide(handling, entry.steer, entry.flick));
  const slideTicks = slides.reduce((sum, run) => sum + run.ticks, 0);
  const slideAngle = slideTicks ? slides.reduce((sum, run) => sum + run.angle, 0) / slideTicks : 0;
  return {
    car: handling.car, drivetrain: handling.drivetrain, mass: handling.mass,
    zeroToSixty: round(zeroToSixty, 2), sixtyToHundred: round(sixtyToHundred, 2), topSpeed: round(topSpeed, 1),
    stoppingDistance: round(stoppingDistance, 1), peakLateral: round(peakLateral, 2), turnIn: round(turnIn, 2),
    handbrakeSlip: round(handbrakeSlip, 1),
    slideSeconds: round(slideTicks / TICK_HZ, 2), slideAngle: round(slideAngle, 1),
  };
}
