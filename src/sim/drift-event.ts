import { DRIFT_YARD, DRIFT_ZONES, SABLE } from "./drift-yard.ts";
import type { RaceDefinition } from "./race.ts";

/** Sable's yard at a score target. The Blacklist runs her three stages at rising targets (`settings/blacklist.ts`). */
const sableDrift = (id: string, name: string, targetScore: number): RaceDefinition => ({
  id, name, kind: "drift", countdownTicks: 180,
  checkpoints: DRIFT_ZONES,
  drift: { durationTicks: 60 * 90, targetScore, bounds: DRIFT_YARD.bounds, zones: DRIFT_ZONES },
});

export const SABLE_DRIFT: RaceDefinition = sableDrift(SABLE.eventId, "Sable / South Wharf Drift", 3000);
/** Her yard, harder: the second stage and the pink slip. Same zones, clock and bounds; only the target rises. */
export const SABLE_DRIFTS: readonly RaceDefinition[] = [
  SABLE_DRIFT,
  sableDrift(`${SABLE.eventId}-2`, "Sable / South Wharf Drift · Second win", 3600),
  sableDrift(`${SABLE.eventId}-3`, "Sable / South Wharf Drift · Pink slip", 4200),
];
export const sableDriftFor = (id: string | null | undefined) => SABLE_DRIFTS.find(drift => drift.id === id) ?? null;
