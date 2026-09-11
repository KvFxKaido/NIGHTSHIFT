import type { VehicleState } from "./sim.ts";

/** Waiting in the inner northbound lane of 1st Avenue S, beside Wharf Garage. */
export const ALDER_ENCOUNTER = { x: -6, y: 2, z: 875, heading: 0, pitch: 0 };

/** Challenge from nearby at cruising speed; vertical separation prevents bridge triggers. */
export function canChallenge(player: Pick<VehicleState, "x" | "y" | "z" | "speed">,
  opponent: Pick<VehicleState, "x" | "y" | "z"> | null | undefined, inRace: boolean): boolean {
  return !inRace && !!opponent && player.speed < 12 &&
    Math.abs(player.y - opponent.y) < 3 && Math.hypot(player.x - opponent.x, player.z - opponent.z) <= 32;
}
