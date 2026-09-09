/**
 * The arithmetic behind the HUD, kept apart from the DOM so it can be tested
 * without a browser. Nothing here reads the simulation or writes to it: the
 * cluster is a readout, and a readout that could change the run would be a
 * renderer making a decision.
 */

/** Where the gauge arc starts, measured clockwise from three o'clock. */
export const GAUGE_START_DEGREES = 130;
/** How far it sweeps, leaving the gap at the bottom of the dial. */
export const GAUGE_SWEEP_DEGREES = 280;
export const GAUGE_RADIUS = 78;
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
/** Past this fraction of top speed the sweep turns red. */
export const GAUGE_REDLINE = 0.86;

const METRES_PER_SECOND_TO_MPH = 2.237;

export interface GaugeReading {
  /** Whole miles per hour, which is what the dial actually prints. */
  mph: number;
  /** 0..1 along the arc, clamped so an overspeed cannot wrap the sweep. */
  ratio: number;
  gear: string;
  redline: boolean;
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

/** True when a world position is inside the drawn disc, with a margin so a
 *  street entering the circle is not clipped one frame late. */
export function withinMinimap(camera: MinimapCamera, x: number, z: number, margin = 1.35): boolean {
  return Math.hypot(x - camera.x, z - camera.z) <= camera.range * margin;
}
