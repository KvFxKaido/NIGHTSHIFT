/** Garage choices. All bodies currently share the same handling model.
 *  The NS-01 left the garage when it became the car Sable drives; a save that
 *  still names it is migrated by RETIRED_CARS in settings.ts. */
export type PlayerCarId = "bulwark" | "cinder";
export function isPlayerCarId(value: unknown): value is PlayerCarId {
  return value === "bulwark" || value === "cinder";
}
