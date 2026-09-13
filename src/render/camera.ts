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

/** The change-camera control steps through the table in order and wraps: near, standard, far. */
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
