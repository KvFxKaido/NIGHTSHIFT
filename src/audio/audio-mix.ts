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
 * A presentation-only gearbox. Outside drag races the simulation has no gears — HANDLING carries a
 * single speed/acceleration curve and the HUD reads R/N/D — but a flat drone
 * tells a driver nothing. A note that climbs, breaks and climbs again is how
 * acceleration is heard, so the ratios exist purely to shape that.
 *
 * It is three authored facts: where each upshift comes, as a share of top speed
 * so that retuning a governor carries over; the revs it comes at; and the revs
 * flat out holds. Within a gear the revs are proportional to road speed, as in
 * any gearbox, so an upshift lands where the next gear's ratio puts it (3,100,
 * 4,400, 4,800 and 4,200 rpm) and climbs from there.
 *
 * Until 2026-09-20 each gear was a band of speed stretched from idle to the
 * redline, which is not a gearbox: every upshift fell to 930 rpm, and 100 mph at
 * full throttle was 2,500 rpm, lugging. Top gear's band ended at top speed, on
 * the redline and the limiter's ignition cut, 1,100 rpm past every shift the
 * driver had heard, so flat out sounded like a missed gear. The car is held at
 * its top speed with revs in hand instead, under the shift point.
 *
 * Known, and left (2026-09-20):
 * - `SHIFT_RPM` and `FLAT_OUT_RPM` were set by an assistant that cannot hear them.
 *   If 6,650 held just under the shift point still reads as "about to shift",
 *   lower it; if it sounds lazy, raise it. Nobody has judged either by ear yet.
 * - This gearbox always holds the lowest gear it can, like a race box, so
 *   cruising is busy: coasting at 45 mph is 5,200 rpm (it was 2,700 under the
 *   bands) and a little louder off the throttle. Shifting early at light throttle
 *   is the fix and needs hysteresis, or the gear hunts on a half-held trigger;
 *   `engineTone` is pure and has no state to hold one in.
 * - The 1-2 shift is the biggest drop (to 3,150) because first gear ends at
 *   17 mph. Shifting at about 22 would soften it and change the launch's rhythm.
 */
export const GEAR_SHIFTS: readonly number[] = [.12, .27, .43, .63];
export const SHIFT_RPM = 7000;
export const FLAT_OUT_RPM = 6650;
export const IDLE_RPM = 900;
export const REDLINE_RPM = 8200;
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
  /** 0..1 intake roar level (driven by throttle and manifold airflow). */
  intake: number;
  /** 0..1 waveshaper drive/rasp (exhaust pressure and load). */
  exhaustDrive: number;
  /** 0..1 high-RPM crossover / screamer intensity (high-cam profile). */
  screamer: number;
  /** 0..1 overrun intensity (deceleration / off-throttle at high revs). */
  overrun: number;
  /** 0..1 transmission whine intensity (gear mesh at speed). */
  whine: number;
  /** Whether the rev limiter is currently cutting. */
  limiter: boolean;
}

function clamp(value: number, low = 0, high = 1): number {
  return value < low ? low : value > high ? high : value;
}

/** Hermite ease between two thresholds; 0 below `edge0`, 1 above `edge1`. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** `topSpeed` is the car's own governor: its gears are spread over its own range, so every car tops out on the same note. */
export function engineTone(vehicle: VehicleState, input: Input, topSpeed: number = HANDLING.topSpeed): EngineTone {
  const reversing = vehicle.forwardSpeed < -.5;
  const speed = Math.abs(vehicle.forwardSpeed);
  const reference = reversing ? HANDLING.reverseSpeed : topSpeed;
  let gear = 0;
  let through = 0;
  if (reversing) {
    through = clamp(speed / Math.max(reference, 1));
  } else {
    // The highest gear whose shift has been passed. Revs follow road speed at
    // that gear's ratio, so the note drops on each upshift to where the next
    // gear picks up, instead of sliding from idle to the redline or back to it.
    const share = speed / Math.max(reference, 1e-6);
    gear = 1;
    while (gear <= GEAR_SHIFTS.length && share >= GEAR_SHIFTS[gear - 1]!) gear++;
    const shift = GEAR_SHIFTS[gear - 1];
    const roadRpm = shift === undefined ? FLAT_OUT_RPM * share : SHIFT_RPM * share / shift;
    // Below idle the clutch is slipping; first gear pulls away from there.
    through = clamp((roadRpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM));
  }
  // Standing revs: with no wheel speed to climb, the throttle still has to be
  // audible or the car sounds dead on the grid. This is a FLOOR under the revs,
  // not an addition to them — adding the two made the note fall as the car
  // pulled away, because the standing term decayed faster than road speed rose.
  const stationary = 1 - clamp(speed / 3);
  const revved = vehicle.transmission ? clamp((vehicle.transmission.rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM)) : clamp(Math.max(through, input.throttle * stationary * .75));
  const rpm = vehicle.transmission?.rpm ?? IDLE_RPM + revved * (REDLINE_RPM - IDLE_RPM);
  const load = clamp(input.throttle * .8 + revved * .4);

  // High-revving N/A acoustics:
  // 1. Throttle snaps the intake butterfly open -> deep resonant induction bark.
  const intake = clamp(input.throttle * (0.35 + 0.65 * (rpm / REDLINE_RPM)));
  // 2. Exhaust rasp and metallic saturation scale with cylinder pressure (load) and gas velocity (RPM).
  const exhaustDrive = clamp(0.25 + input.throttle * 0.55 + (rpm / REDLINE_RPM) * 0.45);
  // 3. High-cam crossover: above 5200 RPM, the valve profile hardens and screams up to 8200.
  const screamer = smoothstep(5200, 7800, rpm) * clamp(0.35 + 0.65 * input.throttle);
  // 4. Overrun: lifting off the throttle at high RPM cuts the intake and triggers exhaust decel crackle.
  // The window is the upper part of a gear, about 60% of it by road speed. It sat
  // at 2,600 to 6,200 while every gear fell to idle; with revs living between
  // 3,100 and 7,000 that window was every lift above 20 mph.
  const overrun = clamp(1 - input.throttle / 0.15) * smoothstep(4600, 7000, rpm);
  // 5. Straight-cut transmission whine: tracks speed, clearest on overrun when engine roar drops.
  const whine = clamp(speed / reference) * (0.3 + 0.7 * (1 - input.throttle));
  // 6. Rev limiter: only a real gearbox has one to hit. These gears shift at
  // SHIFT_RPM and the governor holds top gear under it, so none reaches the redline.
  const limiter = vehicle.transmission?.limiter ?? false;

  return {
    gear: vehicle.transmission?.gear ?? (reversing ? 0 : gear),
    rpm,
    frequency: rpm / 60 * FIRINGS_PER_REV,
    brightness: clamp(.22 + load * .62 + revved * .2),
    gain: clamp(.18 + input.throttle * .5 + revved * .34),
    intake,
    exhaustDrive,
    screamer,
    overrun,
    whine,
    limiter,
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
 * force would just restore the constant tone this replaced. Under an `?assist=`
 * preview the sim does have a per-tyre slip (`WheelState.slip`), and the WebAudio
 * half plays that, from the sim's figure and not one made up here.
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
