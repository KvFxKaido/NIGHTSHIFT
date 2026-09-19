import type { Drivetrain } from "../sim/sim.ts";
import { CAR_TUNES, drivetrainFor } from "../sim/car-handling.ts";
/** Garage-capable bodies; progress.ts gates which ones a profile owns: Cinder
 *  always, Bulwark by purchase, and each Blacklist name's car once that name is
 *  beaten (settings/blacklist.ts). Each body drives its own tune of one shared
 *  handling model (src/sim/car-handling.ts).
 *  The NS-01 left the garage when it became the car Sable drives; a save that
 *  still names it as "blender" is migrated by RETIRED_CARS in settings.ts, so the
 *  NS-01 won back from Sable is "ns01", the same body under a new id. */
export const PLAYER_CAR_IDS = ["cinder", "bulwark", "kestrel", "latch", "hammer", "breakwater", "wager", "ns01", "meridian", "skim", "reign", "vesper"] as const;
export type PlayerCarId = typeof PLAYER_CAR_IDS[number];
export function isPlayerCarId(value: unknown): value is PlayerCarId {
  return (PLAYER_CAR_IDS as readonly unknown[]).includes(value);
}

/**
 * The base driving profile belongs to the body, not to a menu: its drivetrain
 * and, since 2026-09-19, its own handling (`src/sim/car-handling.ts`, GDD 8.5).
 * Drivetrain is still a developer control for handling comparisons via
 * ?drivetrain= and __ns.drivetrain(), but it is no longer a player choice and is
 * no longer persisted. This view is derived from the tunes, which import sim.ts
 * for its types only, so reading a car id never pulls Rapier in.
 */
export const CAR_DRIVETRAIN: Readonly<Record<string, Drivetrain>> = Object.fromEntries(
  Object.entries(CAR_TUNES).map(([car, tune]) => [car, tune.drivetrain]));

export { drivetrainFor };
