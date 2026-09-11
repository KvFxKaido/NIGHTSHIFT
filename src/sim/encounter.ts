import type { VehicleState } from "./sim.ts";
import { ALDER_STREETS } from "./alder.ts";
import type { RivalDefinition } from "./rival.ts";
import type { CoursePoint } from "./track.ts";

/** Starts northbound beside Wharf Garage, then cruises the surrounding freight block. */
export const ALDER_ENCOUNTER = { x: -6, y: 2, z: 875, heading: 0, pitch: 0 };

function localCruise(): RivalDefinition {
  const first = ALDER_STREETS.find(s => s.id === "sea-29")!.points[0]!;
  const center: CoursePoint[] = [{ ...first, z: ALDER_ENCOUNTER.z }, { ...first }];
  for (const [id, reverse] of [["sea-27", true], ["sea-26", false], ["sea-51", false], ["sea-29", true]] as const) {
    const street = ALDER_STREETS.find(s => s.id === id)!;
    const ordered = reverse ? [...street.points].reverse() : street.points;
    if (Math.hypot(center.at(-1)!.x - ordered[0]!.x, center.at(-1)!.z - ordered[0]!.z) > .1) {
      throw new Error(`Disconnected cruise street: ${id}`);
    }
    center.push(...ordered.slice(1));
  }
  // Close mid-straight beside the garage, rather than doubling back to the junction.
  center[center.length - 1] = center[0]!;
  const points = center.map((p, i): CoursePoint => {
    const before = center[i === 0 ? center.length - 2 : i - 1]!;
    const after = center[i === center.length - 1 ? 1 : i + 1]!;
    const a = Math.hypot(p.x - before.x, p.z - before.z);
    const b = Math.hypot(after.x - p.x, after.z - p.z);
    const nx = -(p.z - before.z) / a, nz = (p.x - before.x) / a;
    const mx = nx - (after.z - p.z) / b, mz = nz + (after.x - p.x) / b;
    const scale = 3 / (mx * nx + mz * nz);
    return { ...p, x: p.x + mx * scale, z: p.z + mz * scale };
  });
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along.at(-1)! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  return { id: "wharf-cruise", start: ALDER_ENCOUNTER, points, along, gates: [], loop: true, speedLimit: 10 };
}
export const ALDER_CRUISE = localCruise();

/** Challenge from nearby at cruising speed; vertical separation prevents bridge triggers. */
export function canChallenge(player: Pick<VehicleState, "x" | "y" | "z" | "speed">,
  opponent: Pick<VehicleState, "x" | "y" | "z"> | null | undefined, inRace: boolean): boolean {
  return !inRace && !!opponent && player.speed < 12 &&
    Math.abs(player.y - opponent.y) < 3 && Math.hypot(player.x - opponent.x, player.z - opponent.z) <= 32;
}

/** Resolve the nearby rival when the flash begins, so driving past another
 * opponent during the lamp animation cannot change the accepted challenge. */
export function nearbyChallenge(player: Pick<VehicleState, "x" | "y" | "z" | "speed">,
  cruise: VehicleState | null | undefined,
  parked: readonly { id: string; vehicle: VehicleState }[], inRace: boolean): string | null {
  const candidates = [...(cruise ? [{ id: "cruiser", vehicle: cruise }] : []), ...parked]
    .filter(rival => canChallenge(player, rival.vehicle, inRace))
    .sort((a, b) => Math.hypot(player.x - a.vehicle.x, player.z - a.vehicle.z)
      - Math.hypot(player.x - b.vehicle.x, player.z - b.vehicle.z));
  return candidates[0]?.id ?? null;
}
