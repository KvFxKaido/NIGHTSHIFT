import { readStreetLine, STREET_LINE } from "../src/sim/street-line.ts";
import { shiftAt, RIVAL_STREET_LINE } from "../src/sim/rival.ts";

export const cooldownAudit: { tick: number; along: number; corner: number; remaining: number; freshGo: boolean; beforeEntry: boolean; joinShift: number }[] = [];
export function auditStreetLine(...args: Parameters<typeof readStreetLine>): void {
  const [route, driver, car, tick, network, vehicles] = args;
  // Exact pre-reader state. The normal reader is still called once, with its original arguments.
  const snapshot = { ...driver };
  readStreetLine(...args);
  if (route.id !== "gen-56-driver" || tick % STREET_LINE.every || tick >= (snapshot.lineRefused ?? 0)) return;
  const corner = route.line?.corners[snapshot.lineCorner ?? -1];
  if (!corner || snapshot.along > corner.to) return;
  const stateBefore = JSON.stringify({ driver, car, vehicles });
  const probe = { ...snapshot, lineRefused: 0 };
  readStreetLine(route, probe, car, tick, network, vehicles);
  if (JSON.stringify({ driver, car, vehicles }) !== stateBefore) throw new Error("Cooldown audit changed live state");
  const shift = shiftAt(route.line!, Math.min(corner.to, snapshot.along + Math.max(0, car.speed) / (60 * RIVAL_STREET_LINE.blendRate)));
  cooldownAudit.push({ tick, along: snapshot.along, corner: snapshot.lineCorner!, remaining: snapshot.lineRefused! - tick,
    freshGo: !!probe.lineGo, beforeEntry: snapshot.along <= corner.from - 1, joinShift: Math.hypot(shift.x, shift.z) });
}
