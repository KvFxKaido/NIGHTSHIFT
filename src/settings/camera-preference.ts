import { DEFAULT_CHASE_CAMERA, isChaseCameraId, type ChaseCameraId } from "../render/camera.ts";

/**
 * The chase camera the player last chose. It saves under its own key, the way
 * controls do, rather than in `nightshift.settings`: it is a way of watching
 * the car, not part of a build, so a save slot never carries it and the
 * settings decoder that save slots depend on is untouched. It stores a preset
 * id, never a camera pose.
 */
export const CAMERA_KEY = "nightshift.camera";
type Disk = Pick<Storage, "getItem" | "setItem">;

/** Anything unreadable falls back to the default rather than blocking boot. */
export function decodeCameraPreference(raw: string | null): ChaseCameraId {
  if (raw === null) return DEFAULT_CHASE_CAMERA;
  try {
    const data = JSON.parse(raw);
    return data?.version === 1 && isChaseCameraId(data.camera) ? data.camera : DEFAULT_CHASE_CAMERA;
  } catch {
    return DEFAULT_CHASE_CAMERA;
  }
}

export function loadCameraPreference(storage: () => Disk): ChaseCameraId {
  try {
    return decodeCameraPreference(storage().getItem(CAMERA_KEY));
  } catch {
    return DEFAULT_CHASE_CAMERA;
  }
}

/** False when storage is blocked; the choice still holds for the session. */
export function saveCameraPreference(storage: () => Disk, camera: ChaseCameraId): boolean {
  if (!isChaseCameraId(camera)) throw new RangeError(`Unknown camera: ${camera}`);
  try {
    storage().setItem(CAMERA_KEY, JSON.stringify({ version: 1, camera }));
    return true;
  } catch {
    return false;
  }
}
