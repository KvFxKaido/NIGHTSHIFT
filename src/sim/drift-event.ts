import { DRIFT_YARD, DRIFT_ZONES, SABLE } from "./drift-yard.ts";
import type { RaceDefinition } from "./race.ts";

export const SABLE_DRIFT: RaceDefinition = {
  id: SABLE.eventId, name: "Sable / South Wharf Drift", kind: "drift", countdownTicks: 180,
  checkpoints: DRIFT_ZONES,
  drift: { durationTicks: 60 * 90, targetScore: 3000, bounds: DRIFT_YARD.bounds, zones: DRIFT_ZONES },
};
