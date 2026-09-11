import type { VehicleState } from "./sim.ts";
import type { RaceState } from "./race.ts";

export interface DriftDefinition {
  readonly durationTicks: number;
  readonly targetScore: number;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly zones: readonly { x: number; z: number; radius: number; name: string }[];
}
export interface DriftState {
  score: number; chain: number; multiplier: number; chainTicks: number;
  idleTicks: number; nextZone: number; clips: number; transitions: number;
  lastSide: number; sideTicks: number; feedback: string; feedbackTicks: number;
  drifting: boolean; angle: number; won: boolean;
}
export const createDrift = (): DriftState => ({ score: 0, chain: 0, multiplier: 1,
  chainTicks: 0, idleTicks: 0, nextZone: 0, clips: 0, transitions: 0,
  lastSide: 0, sideTicks: 0, feedback: "BUILD SPEED / TAP HANDBRAKE", feedbackTicks: 0,
  drifting: false, angle: 0, won: false });

function bank(drift: DriftState): void {
  if (drift.chain > 0) {
    drift.score += Math.floor(drift.chain * drift.multiplier);
    drift.feedback = "CHAIN BANKED"; drift.feedbackTicks = 90;
  }
  clearChain(drift);
}
function clearChain(drift: DriftState): void {
  drift.chain = 0; drift.multiplier = 1; drift.chainTicks = 0;
  drift.lastSide = 0; drift.sideTicks = 0; drift.idleTicks = 0;
}

/** Score actual movement at 60 Hz; yawing in place and reversing earn nothing.
 * Only the next clipping zone pays, preventing repeated bonuses at one corner. */
export function stepDrift(definition: DriftDefinition, state: RaceState, car: VehicleState, contact: boolean): void {
  const d = state.drift!;
  d.feedbackTicks = Math.max(0, d.feedbackTicks - 1);
  d.angle = Math.abs(car.slipAngle) * 180 / Math.PI;
  const b = definition.bounds;
  const outside = car.x < b.minX || car.x > b.maxX || car.z < b.minZ || car.z > b.maxZ;
  const spin = d.angle > 80 || car.forwardSpeed < -1;
  d.drifting = !outside && !contact && !spin && car.speed >= 7 && car.forwardSpeed > 2 && d.angle >= 10;
  if (contact || spin || outside) {
    clearChain(d);
    d.feedback = contact ? "CONTACT / CHAIN LOST" : outside ? "RETURN TO THE YARD" : "SPIN / CHAIN LOST";
    d.feedbackTicks = 60;
  } else if (d.drifting) {
    d.idleTicks = 0; d.chainTicks++;
    d.chain += Math.min(car.speed, 30) * Math.min(d.angle, 60) / 240;
    const side = Math.sign(car.slipAngle);
    if (d.lastSide && side !== d.lastSide && d.sideTicks >= 18) {
      d.transitions++; d.chain += 75; d.feedback = "LINKED TRANSITION"; d.feedbackTicks = 75;
      d.sideTicks = 0;
    }
    if (side !== d.lastSide) d.sideTicks = 0;
    d.lastSide = side; d.sideTicks++;
    d.multiplier = Math.min(4, 1 + Math.floor(d.chainTicks / 120));
    const zone = definition.zones[d.nextZone]!;
    if (Math.hypot(car.x - zone.x, car.z - zone.z) <= zone.radius) {
      d.clips++; d.chain += 200; d.nextZone = (d.nextZone + 1) % definition.zones.length;
      d.feedback = `${zone.name.toUpperCase()} / +200`; d.feedbackTicks = 90;
    }
  } else if (++d.idleTicks >= 60) bank(d);
  if (state.ticks >= definition.durationTicks) {
    bank(d); d.won = d.score >= definition.targetScore;
    state.finished = true; state.next = null;
  }
}
