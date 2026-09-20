import type { CameraLook } from "../input/input.ts";

export interface CameraOrbitState {
  yawOffset: number;
  pitchOffset: number;
}

export const CAMERA_ORBIT = {
  yawSpeed: 2.65,
  pitchSpeed: 1.35,
  minPitch: -0.22,
  maxPitch: 0.48,
  drivingRecenterSpeed: 3.2,
  stationaryThreshold: 1.5,
} as const;

/**
 * A chase camera is a framing, not a physics setting: it decides where the
 * renderer stands, never what the car does. Distances are metres behind the
 * car, heights metres above its origin (the ground under it), and every
 * "atSpeed" term is added in full at top speed. Standard is the camera the
 * game has always had; near and far are fitted to Midnight Club 3's close
 * and zoomed-out chase cameras (2026-09-12, frames read by eye).
 */
export interface ChaseCamera {
  label: string;
  distance: number;
  distanceAtSpeed: number;
  height: number;
  heightAtSpeed: number;
  lookHeight: number;
  lookAhead: number;
  lookAheadAtSpeed: number;
  fov: number;
  fovAtSpeed: number;
  follow?: ChaseFollow;
}

/**
 * How a chase camera keeps up with the car. Without one the camera only eases
 * toward its place behind the car, and an eased camera trails a moving target by
 * about speed / ease rate: on Standard that is 8.7 m at 140 mph on top of the
 * table's 9.9 m, and 6.1 m off the table's 7.4 m of look-ahead, so the car is
 * drawn 18.6 m away with 1.3 m of road ahead of it (measured 2026-09-20).
 *
 * With one, the camera is first carried by the car's own drawn movement over the
 * ground and eases only what is left: the framing turning, the distance and the
 * height changing. The table's distances are then the ones on screen. What the
 * trailing used to say about a change of speed is authored instead, in metres
 * back per m/s² gained and metres in per m/s² lost. Height is never carried, so
 * bumps and crests stay as soft as they were.
 */
export interface ChaseFollow {
  /** Share of the car's movement the camera is carried by: 1 leaves no trailing at a steady speed, 0 is the eased camera. */
  carried: number;
  pullback: number;
  compression: number;
  maxPullback: number;
  maxCompression: number;
  /** How quickly the acceleration reading settles, per second. */
  response: number;
}

export const CHASE_CAMERAS = {
  near: {
    label: "Near", distance: 4.4, distanceAtSpeed: 1.6, height: 1.6, heightAtSpeed: 0.4,
    lookHeight: 1.7, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
  standard: {
    label: "Standard", distance: 7.2, distanceAtSpeed: 2.7, height: 3.15, heightAtSpeed: 1.05,
    lookHeight: 0.82, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
  // An experiment (2026-09-20), beside Standard so one press compares them: the
  // same framing to the digit, so the follow is the only difference. It is here
  // to be promoted into Standard or deleted; a saved choice of it falls back to
  // Standard when it goes (camera-preference.ts).
  standardB: {
    label: "Standard B", distance: 7.2, distanceAtSpeed: 2.7, height: 3.15, heightAtSpeed: 1.05,
    lookHeight: 0.82, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
    // Full braking is about 20 m/s², where compression reaches its limit and not
    // before; a launch is about 9, a metre and a half of pullback.
    follow: { carried: 1, pullback: 0.16, compression: 0.075, maxPullback: 2, maxCompression: 1.5, response: 3.5 },
  },
  far: {
    label: "Far", distance: 6.8, distanceAtSpeed: 2.7, height: 3.35, heightAtSpeed: 1.05,
    lookHeight: 2.3, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
} as const satisfies Record<string, ChaseCamera>;

export type ChaseCameraId = keyof typeof CHASE_CAMERAS;
export const DEFAULT_CHASE_CAMERA: ChaseCameraId = "standard";

export function isChaseCameraId(value: unknown): value is ChaseCameraId {
  return typeof value === "string" && Object.hasOwn(CHASE_CAMERAS, value);
}

/** Where the car was last drawn and how hard it was gaining speed, for a camera with a `follow`. */
export interface ChaseFollowState {
  x: number;
  z: number;
  speed: number;
  acceleration: number;
  known: boolean;
}

export function createChaseFollowState(): ChaseFollowState {
  return { x: 0, z: 0, speed: 0, acceleration: 0, known: false };
}

/** Further than any car is drawn moving in a frame: a reset, a placement or a scripted jump, as in interpolate.ts. */
const FOLLOW_TELEPORT = 8;
/** A hit stops a car in a tick. It should read as the hardest braking there is, not as 2,000 m/s². */
const FOLLOW_ACCELERATION_LIMIT = 20;

/**
 * One drawn frame of a carried camera: how far to carry it over the ground and
 * how much distance the change of speed adds (negative under braking). Across a
 * teleport, or on the first frame, it carries nothing and the camera eases over
 * as an uncarried one would.
 */
export function trackChaseFollow(
  state: ChaseFollowState,
  follow: ChaseFollow,
  car: { x: number; z: number; speed: number },
  frameDelta: number,
): { dx: number; dz: number; distance: number } {
  const movedX = car.x - state.x, movedZ = car.z - state.z;
  const continuous = state.known && Math.hypot(movedX, movedZ) <= FOLLOW_TELEPORT;
  if (!continuous) state.acceleration = 0;
  else if (frameDelta > 0) {
    const measured = clamp((car.speed - state.speed) / frameDelta, -FOLLOW_ACCELERATION_LIMIT, FOLLOW_ACCELERATION_LIMIT);
    state.acceleration += (measured - state.acceleration) * (1 - Math.exp(-follow.response * frameDelta));
  }
  state.x = car.x;
  state.z = car.z;
  state.speed = car.speed;
  state.known = true;
  const distance = state.acceleration >= 0
    ? Math.min(follow.maxPullback, state.acceleration * follow.pullback)
    : -Math.min(follow.maxCompression, -state.acceleration * follow.compression);
  return continuous
    ? { dx: movedX * follow.carried, dz: movedZ * follow.carried, distance }
    : { dx: 0, dz: 0, distance };
}

/** The change-camera control steps through the table in order and wraps: near, standard, standard B, far. */
export function nextChaseCamera(current: ChaseCameraId): ChaseCameraId {
  const ids = Object.keys(CHASE_CAMERAS) as ChaseCameraId[];
  return ids[(ids.indexOf(current) + 1) % ids.length]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createCameraOrbitState(): CameraOrbitState {
  return { yawOffset: 0, pitchOffset: 0 };
}

export function resetCameraOrbit(state: CameraOrbitState): void {
  state.yawOffset = 0;
  state.pitchOffset = 0;
}

export function updateCameraOrbit(
  state: CameraOrbitState,
  look: CameraLook,
  vehicleSpeed: number,
  frameDelta: number,
): void {
  const active = Math.abs(look.x) > 0.001 || Math.abs(look.y) > 0.001;
  if (active) {
    // Moving the camera left makes the view look right, matching conventional
    // third-person right-stick behavior.
    state.yawOffset = wrapAngle(
      state.yawOffset - look.x * CAMERA_ORBIT.yawSpeed * frameDelta,
    );
    state.pitchOffset = clamp(
      state.pitchOffset - look.y * CAMERA_ORBIT.pitchSpeed * frameDelta,
      CAMERA_ORBIT.minPitch,
      CAMERA_ORBIT.maxPitch,
    );
    return;
  }

  // A stopped car doubles as the current inspection mode. Preserve its orbit
  // until the player resets it or starts driving again.
  if (vehicleSpeed <= CAMERA_ORBIT.stationaryThreshold) return;
  const recenterBlend = 1 - Math.exp(-CAMERA_ORBIT.drivingRecenterSpeed * frameDelta);
  state.yawOffset = wrapAngle(state.yawOffset * (1 - recenterBlend));
  state.pitchOffset *= 1 - recenterBlend;
}
