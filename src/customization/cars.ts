/** Garage choices. Both bodies currently share the same handling model. */
export type PlayerCarId = "blender" | "bulwark";
export function isPlayerCarId(value: unknown): value is PlayerCarId {
  return value === "blender" || value === "bulwark";
}
