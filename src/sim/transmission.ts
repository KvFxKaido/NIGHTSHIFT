import type { Input } from "./sim.ts";

/** Drag powertrain. Ratios, torque and clutch interruptions all affect wheel force. */
export const TRANSMISSION = {
  ratios: [3.4, 2.35, 1.72, 1.34, 1.10] as readonly number[],
  finalDrive: 4.4, wheelRadius: .36, efficiency: .9,
  idle: 900, redline: 8200, shiftMin: 7400, shiftMax: 7900,
  launchMin: 3800, launchMax: 5500, shiftTicks: 12,
} as const;

export interface TransmissionState {
  gear: number;
  rpm: number;
  shiftTicks: number;
  shiftHeld: number;
  limiter: boolean;
  launched: boolean;
  launchRpm: number;
  launchPenaltyTicks: number;
  reactionTicks: number | null;
  feedback: string;
  feedbackTicks: number;
}

export function createTransmission(): TransmissionState {
  return { gear: 1, rpm: TRANSMISSION.idle, shiftTicks: 0, shiftHeld: 0, limiter: false,
    launched: false, launchRpm: TRANSMISSION.idle, launchPenaltyTicks: 0,
    reactionTicks: null, feedback: "BUILD LAUNCH REVS", feedbackTicks: 0 };
}

export function coupledRpm(speed: number, gear: number): number {
  return Math.max(0, speed) * 60 / (Math.PI * 2 * TRANSMISSION.wheelRadius)
    * TRANSMISSION.ratios[gear - 1]! * TRANSMISSION.finalDrive;
}

export function engineTorque(rpm: number): number {
  const points = [[900, 260], [3500, 480], [5500, 520], [7000, 480], [7800, 370], [8600, 260]] as const;
  for (let i = 1; i < points.length; i++) {
    const [lo, a] = points[i - 1]!, [hi, b] = points[i]!;
    if (rpm <= hi) return a + (b - a) * Math.max(0, (rpm - lo) / (hi - lo));
  }
  return 260;
}

/** One fixed tick; returns propulsion acceleration for the existing tyre solver.
 * Auto clutch permits grid revving. Shifts require a fresh press and cut drive;
 * downshifts that would mechanically over-rev are rejected. */
export function stepTransmission(state: TransmissionState, input: Input, speed: number,
  countdown: number, raceTicks: number, mass: number, dt: number): number {
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const shift = Number(!!input.shiftUp) - Number(!!input.shiftDown);
  const pressed = shift !== 0 && shift !== state.shiftHeld;
  state.shiftHeld = shift;
  state.feedbackTicks = Math.max(0, state.feedbackTicks - 1);
  if (countdown > 0 || !state.launched) {
    const target = TRANSMISSION.idle + throttle * (TRANSMISSION.redline - TRANSMISSION.idle);
    state.rpm += Math.max(-7500 * dt, Math.min(6500 * dt, target - state.rpm));
    state.limiter = state.rpm >= TRANSMISSION.redline;
    if (countdown > 0) return 0;
    if (throttle <= .1 || input.handbrake > .05 || input.brake > .1) return 0;
    state.launched = true;
    state.reactionTicks = raceTicks;
    state.launchRpm = state.rpm;
    const clean = state.rpm >= TRANSMISSION.launchMin && state.rpm <= TRANSMISSION.launchMax;
    state.launchPenaltyTicks = clean ? 0 : 75;
    state.feedback = clean ? "CLEAN LAUNCH" : state.rpm < TRANSMISSION.launchMin ? "BOGGED LAUNCH" : "WHEELSPIN";
    state.feedbackTicks = 90;
  }
  if (pressed && state.shiftTicks === 0) {
    const next = state.gear + shift;
    if (next >= 1 && next <= TRANSMISSION.ratios.length) {
      if (shift < 0 && coupledRpm(speed, next) > TRANSMISSION.redline) {
        state.feedback = "DOWNSHIFT BLOCKED";
      } else {
        state.feedback = shift < 0 ? "DOWNSHIFT" : state.rpm < TRANSMISSION.shiftMin ? "EARLY SHIFT"
          : state.rpm <= TRANSMISSION.shiftMax ? "PERFECT SHIFT" : "LATE SHIFT";
        state.gear = next;
        state.shiftTicks = TRANSMISSION.shiftTicks;
      }
      state.feedbackTicks = 60;
    }
  }
  const roadRpm = coupledRpm(speed, state.gear);
  // Clutch slip blends launch RPM into coupled RPM over the first 12 m/s.
  const clutchRpm = TRANSMISSION.idle + (state.launchRpm - TRANSMISSION.idle) * Math.max(0, 1 - speed / 12);
  state.rpm = Math.min(TRANSMISSION.redline + 400, Math.max(TRANSMISSION.idle, roadRpm, clutchRpm));
  state.limiter = roadRpm >= TRANSMISSION.redline;
  if (state.shiftTicks > 0) { state.shiftTicks--; return 0; }
  const launchScale = state.launchPenaltyTicks > 0 ? .65 : 1;
  state.launchPenaltyTicks = Math.max(0, state.launchPenaltyTicks - 1);
  if (state.limiter || input.handbrake > .05) return 0;
  return engineTorque(state.rpm) * TRANSMISSION.ratios[state.gear - 1]! * TRANSMISSION.finalDrive
    * TRANSMISSION.efficiency / TRANSMISSION.wheelRadius / mass * throttle * (1 - Math.min(1, input.brake)) * launchScale;
}
