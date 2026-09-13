import type { Drivetrain } from "../sim/sim.ts";
/** Garage choices. All bodies currently share the same handling model.
 *  The NS-01 left the garage when it became the car Sable drives; a save that
 *  still names it is migrated by RETIRED_CARS in settings.ts. */
export type PlayerCarId = "bulwark" | "cinder";
export function isPlayerCarId(value: unknown): value is PlayerCarId {
  return value === "bulwark" || value === "cinder";
}

/**
 * The base driving profile belongs to the body, not to a menu. Rivals already
 * worked this way -- the Hammer is declared rwd in drag-event.ts -- and further
 * adjustments to these bases are what will make each car a personality
 * (GDD 8.5). Drivetrain is still a developer control for handling comparisons
 * via ?drivetrain= and __ns.drivetrain(), but it is no longer a player choice
 * and is no longer persisted.
 *
 * Type-only import on purpose: a value import would pull sim.ts, and therefore
 * Rapier, into every module that reads a car id.
 */
export const CAR_DRIVETRAIN: Record<string, Drivetrain> = {
  cinder: "rwd",   // the hero sedan the player starts in
  bulwark: "awd",  // heavy, planted
  blender: "rwd",  // the NS-01 Sable slides around his own yard
  kestrel: "awd",  // Moth runs a rally hatch
  vesper: "rwd",  // Tally: cab-forward coupe; visual mid-engine layout
  hammer: "rwd",   // Rivet drag races; drag-event.ts already declared this
};

/** Falls back to the sim default, which a test pins to this same value. */
export function drivetrainFor(car: string): Drivetrain {
  return CAR_DRIVETRAIN[car] ?? "fwd";
}
