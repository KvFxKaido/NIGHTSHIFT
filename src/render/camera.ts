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
