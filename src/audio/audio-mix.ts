import { HANDLING, type Input, type VehicleState, type WheelId } from "../sim/sim.ts";

/**
 * Sound is presentation: this module reads simulation state and decides nothing.
 * Nothing here is imported by src/sim, and no value produced here is fed back
 * into a tick, so audio cannot influence a run or its replay.
 *
 * The mapping lives apart from the WebAudio graph on purpose. A test can assert
 * that the note climbs, that a locked tyre scrubs and a gripping one does not,
 * without a browser audio context existing.
 */

const WHEELS: readonly WheelId[] = ["front-left", "front-right", "rear-left", "rear-right"];

/**
 * A presentation-only gearbox. The simulation has no gears — HANDLING carries a
 * single speed/acceleration curve and the HUD reads R/N/D — but a flat drone
 * tells a driver nothing. A note that climbs, breaks and climbs again is how
 * acceleration is heard, so the ratios exist purely to shape that.
 * Bands are fractions of top speed, so retuning HANDLING.topSpeed carries over.
 */
export const GEAR_BANDS: readonly (readonly [number, number])[] = [
  [0, .14], [.12, .30], [.27, .47], [.43, .68], [.63, 1],
] as const;
export const IDLE_RPM = 900;
export const REDLINE_RPM = 7200;
/** Four-stroke four: two firing events per revolution. */
const FIRINGS_PER_REV = 2;

export interface EngineTone {
  /** 1-indexed forward gear, or 0 for reverse. Presentation only. */
  gear: number;
  rpm: number;
  /** Firing fundamental in Hz, what the oscillator bank is tuned to. */
  frequency: number;
  /** 0..1 filter openness. Load makes an engine brighter, not just louder. */
  brightness: number;
  gain: number;
}

function clamp(value: number, low = 0, high = 1): number {
  return value < low ? low : value > high ? high : value;
}

/** Hermite ease between two thresholds; 0 below `edge0`, 1 above `edge1`. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function engineTone(vehicle: VehicleState, input: Input): EngineTone {
  const reversing = vehicle.forwardSpeed < -.5;
  const speed = Math.abs(vehicle.forwardSpeed);
  const reference = reversing ? HANDLING.reverseSpeed : HANDLING.topSpeed;
  let gear = 0;
  let through = 0;
  if (reversing) {
    through = clamp(speed / Math.max(reference, 1));
  } else {
    // Highest gear whose band has been entered, so the note drops on each
    // upshift instead of sliding continuously from idle to redline.
    for (let index = 0; index < GEAR_BANDS.length; index++) {
      const [low, high] = GEAR_BANDS[index]!;
      const lowSpeed = low * reference;
      if (index === 0 || speed >= lowSpeed) {
        gear = index + 1;
        through = clamp((speed - lowSpeed) / Math.max((high - low) * reference, 1e-6));
      }
    }
  }
  // Standing revs: with no wheel speed to climb, the throttle still has to be
  // audible or the car sounds dead on the grid. This is a FLOOR under the revs,
  // not an addition to them — adding the two made the note fall as the car
  // pulled away, because the standing term decayed faster than road speed rose.
  const stationary = 1 - clamp(speed / 3);
  const revved = clamp(Math.max(through, input.throttle * stationary * .6));
  const rpm = IDLE_RPM + revved * (REDLINE_RPM - IDLE_RPM);
  const load = clamp(input.throttle * .8 + revved * .4);
  return {
    gear: reversing ? 0 : gear,
    rpm,
    frequency: rpm / 60 * FIRINGS_PER_REV,
    brightness: clamp(.22 + load * .62 + revved * .2),
    gain: clamp(.18 + input.throttle * .5 + revved * .34),
  };
}

/** Below this share of a tyre's budget spent sideways, nothing is audible. */
export const SCRUB_ONSET = .62;
/** At and above this, the squeal is at full level. */
export const SCRUB_FULL = .95;

/**
 * How hard the tyres are scrubbing sideways, 0..1.
 *
 * This is the point of the whole exercise: the handling model already computes
 * a per-tyre grip budget and the force being spent against it, and the player
 * has had no way to perceive either.
 *
 * Measured, not guessed. The obvious signal — combined force over grip limit —
 * turns out to be useless, because the tyre model clamps force AT the limit, so
 * it reads exactly 1.000 for a full-lock slide, a straight-line emergency stop
 * AND flat-out acceleration at any speed. It cannot distinguish them.
 *
 * The lateral share separates them cleanly: 0.00 accelerating or braking in a
 * straight line, 0.27 through a gentle curve, 0.72 in a hard corner, 0.92 in a
 * slide, 1.00 in a handbrake turn. So squeal means *cornering* at the limit,
 * which is the thing a driver actually needs told about.
 *
 * Wheelspin is deliberately not in here. It would need per-wheel lockup and
 * inertia the simulation does not model yet, and faking it off longitudinal
 * force would just restore the constant tone this replaced.
 */
export function tyreScrub(vehicle: VehicleState): number {
  let worst = 0;
  for (const id of WHEELS) {
    const wheel = vehicle.wheels[id];
    worst = Math.max(worst, Math.abs(wheel.lateralForce) / Math.max(wheel.gripLimit, 1e-6));
  }
  return smoothstep(SCRUB_ONSET, SCRUB_FULL, worst) * clamp(vehicle.speed / 3);
}

/** Road and wind roar. Cheap, and most of what sells speed without a camera trick. */
export function windLevel(vehicle: VehicleState): number {
  return clamp(vehicle.speed / HANDLING.topSpeed) ** 1.5;
}

export interface AudioLevels {
  master: number;
  engine: number;
  music: number;
}

export const DEFAULT_LEVELS: AudioLevels = { master: .7, engine: .8, music: .5 };

export function isLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
