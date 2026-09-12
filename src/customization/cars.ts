/** Garage choices. All bodies currently share the same handling model. */
export type PlayerCarId = "blender" | "bulwark" | "cinder";
export function isPlayerCarId(value: unknown): value is PlayerCarId {
  return value === "blender" || value === "bulwark" || value === "cinder";
}
