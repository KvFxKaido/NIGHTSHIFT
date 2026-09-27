/**
 * The arithmetic behind the HUD, kept apart from the DOM so it can be tested
 * without a browser. Nothing here reads the simulation or writes to it: the
 * cluster is a readout, and a readout that could change the run would be a
 * renderer making a decision.
 */
import { LAUNCH, type LaunchState } from "../sim/launch.ts";

/** Past this fraction of top speed the reading counts as redline. */
export const GAUGE_REDLINE = 0.86;

const METRES_PER_SECOND_TO_MPH = 2.237;

export interface GaugeReading {
  /** Whole miles per hour, which is what the plate prints. */
  mph: number;
  /** 0..1 of the car's top speed, clamped. */
  ratio: number;
  gear: string;
  redline: boolean;
}

/**
 * The cluster since 2026-09-26 is Midnight Club: Los Angeles's (Shawn's mockup): a tachometer inside the nitrous arc,
 * speed printed in seven segments beside it. The tachometer sweeps 230 degrees from its lower left, clockwise from
 * three o'clock as SVG turns.
 */
export const TACH_START_DEGREES = 140;
export const TACH_SWEEP_DEGREES = 230;

/** Clockwise from three o'clock, where a 0..1 reading sits on the tachometer. */
export function tachAngle(ratio: number): number {
  return TACH_START_DEGREES + Math.max(0, Math.min(1, ratio)) * TACH_SWEEP_DEGREES;
}

/**
 * The nitrous arc is one meter drawn in two pieces, up the curve round the tachometer and along the bar over the
 * plate: the curve is 145 degrees of a 90-unit radius, the bar 282 units. A 0..1 charge fills the curve first.
 */
export const ARC_CURVE_LENGTH = 90 * 145 * Math.PI / 180;
export const ARC_BAR_LENGTH = 282;
export function nitrousArc(charge: number): { curve: number; bar: number } {
  const share = ARC_CURVE_LENGTH / (ARC_CURVE_LENGTH + ARC_BAR_LENGTH), c = Math.max(0, Math.min(1, charge));
  return { curve: Math.min(1, c / share), bar: Math.max(0, (c - share) / (1 - share)) };
}

/** The speed plate prints three digits, as MCLA's does. */
export const SPEED_DIGITS = 3;
const SEGMENT_LIT: Readonly<Record<string, string>> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
};
/** Seven-segment polygons for one digit 28 units wide and 46 high, segment by segment a to g. */
export const SEGMENT_SHAPES: Readonly<Record<string, string>> = (() => {
  const W = 28, H = 46, t = 6;
  const across = (x1: number, x2: number, y: number) => [[x1, y + t / 2], [x1 + t / 2, y], [x2 - t / 2, y], [x2, y + t / 2], [x2 - t / 2, y + t], [x1 + t / 2, y + t]];
  const down = (x: number, y1: number, y2: number) => [[x + t / 2, y1], [x + t, y1 + t / 2], [x + t, y2 - t / 2], [x + t / 2, y2], [x, y2 - t / 2], [x, y1 + t / 2]];
  const shapes = { a: across(2, W - 2, 0), b: down(W - t, 2, H / 2 - 1), c: down(W - t, H / 2 + 1, H - 2), d: across(2, W - 2, H - t),
    e: down(0, H / 2 + 1, H - 2), f: down(0, 2, H / 2 - 1), g: across(2, W - 2, H / 2 - t / 2) };
  return Object.fromEntries(Object.entries(shapes).map(([segment, points]) => [segment, points.map(([x, y]) => `${x},${y}`).join(" ")]));
})();
/**
 * Which segments each digit lights, leading zeros unlit: MCLA ghosts them, so standing still reads as a dim 88 and a
 * lit 0. Speeds past 999 print their last three digits; nothing in the game gets near.
 */
export function speedDigits(mph: number): string[] {
  const text = String(Math.max(0, Math.round(mph)) % 1000).padStart(SPEED_DIGITS, "0");
  const first = text.search(/[1-9]/);
  return [...text].map((digit, i) => i >= (first < 0 ? SPEED_DIGITS - 1 : first) ? SEGMENT_LIT[digit]! : "");
}

export interface TachReading {
  /** 0..1 of the printed range, clamped. */
  ratio: number;
  /** Printed range in thousands of rpm: 0 to this. */
  maxThousands: number;
  /** Where the red zone begins, 0..1 of the printed range. */
  redlineRatio: number;
  redline: boolean;
}

/**
 * The tachometer prints whole thousands to the first mark past the redline, so
 * the red zone is always a visible band rather than a line at the end stop.
 * The rpm it is given is presentation (the engine you hear, or the drag gearbox);
 * the simulation outside drag races has no gears.
 */
export function tachReading(rpm: number, redlineRpm: number): TachReading {
  const maxThousands = Math.floor(redlineRpm / 1000) + 1;
  const max = maxThousands * 1000;
  return {
    ratio: Math.max(0, Math.min(1, rpm / max)),
    maxThousands,
    redlineRatio: redlineRpm / max,
    redline: rpm >= redlineRpm,
  };
}

export function gaugeReading(speed: number, forwardSpeed: number, topSpeed: number): GaugeReading {
  const ratio = Math.max(0, Math.min(1, speed / topSpeed));
  return {
    mph: Math.round(speed * METRES_PER_SECOND_TO_MPH),
    ratio,
    // The prototype has no gearbox, so the dial reports the transmission state
    // the driver can actually observe rather than inventing ratios.
    gear: forwardSpeed < -0.5 ? "R" : speed < 0.5 ? "N" : "D",
    redline: ratio >= GAUGE_REDLINE,
  };
}

export interface MinimapCamera {
  x: number;
  z: number;
  /** Vehicle heading in radians; the map rotates so this points up. */
  heading: number;
  /** How many metres the map's radius covers. */
  range: number;
  /** Radius of the drawn disc, in pixels. */
  radius: number;
}

export interface MinimapPixel { x: number; y: number }

/**
 * World metres to pixels offset from the middle of the disc, heading up. The
 * car's forward vector is (-sin h, -cos h) and its right is (cos h, -sin h);
 * screen y grows downward, so forward becomes negative y.
 */
export function minimapPixel(camera: MinimapCamera, x: number, z: number): MinimapPixel {
  const dx = x - camera.x, dz = z - camera.z;
  const forward = dx * -Math.sin(camera.heading) + dz * -Math.cos(camera.heading);
  const right = dx * Math.cos(camera.heading) + dz * -Math.sin(camera.heading);
  const scale = camera.radius / camera.range;
  return { x: right * scale, y: -forward * scale };
}

/** True when a world position is inside the drawn disc. */
export function withinMinimap(camera: MinimapCamera, x: number, z: number, margin = 1): boolean {
  return Math.hypot(x - camera.x, z - camera.z) <= camera.range * margin;
}

/**
 * True when any part of a street segment falls inside the disc.
 *
 * Testing the endpoints instead is wrong in two ways that both hide road: a
 * segment reaching in from outside is drawn only from its first inside vertex,
 * so the road stops short of the rim, and a segment long enough to span the
 * disc with both ends outside vanishes entirely. Neither shows up today —
 * the district's longest authored segment is 47 m against a 235 m radius — but
 * that is an accident of the current authoring, not something the map enforces,
 * and a single long straight would break it silently.
 */
export function segmentWithinMinimap(camera: MinimapCamera,
  ax: number, az: number, bx: number, bz: number, margin = 1): boolean {
  const dx = bx - ax, dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const along = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((camera.x - ax) * dx + (camera.z - az) * dz) / lengthSquared))
    : 0;
  return Math.hypot(ax + dx * along - camera.x, az + dz * along - camera.z) <= camera.range * margin;
}

/**
 * The nitrous arc until Surge exists (it was MC3's right-hand boost bar to 2026-09-26): the launch charge while it
 * is held, at the line or in a burnout (sim/launch.ts), then what is left of the boost once it is let go. Null when
 * there is neither, and the arc reads empty.
 */
export function launchMeter(launch: Pick<LaunchState, "heldTicks" | "charge" | "burnout" | "resolved" | "boostTicks" | "quality"> | undefined): number | null {
  if (!launch) return null;
  if (launch.heldTicks > 0 && (launch.burnout || !launch.resolved)) return launch.charge;
  if (launch.boostTicks > 0) return launch.quality * launch.boostTicks / LAUNCH.boostTicks;
  return null;
}
