import { ALDER_STREETS, alderHeight } from "./alder.ts";
import type { RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";

const harbor = ALDER_STREETS.find(s => s.id === "sea-0")!;
const south = harbor.points[1]!;
/** 90 m north of Harbor Way's southern bend, with 200 m of braking road. */
const start = { x: south.x, z: south.z - 90 };
export const RIVET = {
  id: "rivet", name: "Rivet", carName: "Hammer", car: "hammer",
  eventId: "rivet-quarter-mile",
  start: { x: start.x + 9, z: start.z + 20, y: alderHeight(start.x + 9, start.z + 20), heading: 0, pitch: 0 },
} as const;

export const HARBOR_DRAG: RaceDefinition = {
  id: RIVET.eventId, name: "Rivet / Harbor Quarter", kind: "drag", countdownTicks: 180,
  drag: { start, forward: { x: 0, z: -1 }, length: 402.336, laneOffset: 3, laneTolerance: 2 },
  checkpoints: [{ id: "harbor-drag-finish", name: "Quarter-mile finish", x: start.x,
    z: start.z - 402.336, radius: 6 }],
};
export const DRAG_START: RoadWorld["start"] = {
  x: start.x - 3, z: start.z, y: alderHeight(start.x - 3, start.z), heading: 0, pitch: 0,
};
const rivalStart = { ...DRAG_START, x: start.x + 3 };
const points = [0, 402.336, 580].map(distance => ({
  x: rivalStart.x, z: start.z - distance, y: alderHeight(rivalStart.x, start.z - distance), width: 6, zone: "waterfront" as const,
}));
export const RIVET_DRAG_DRIVER: RivalDefinition = {
  id: "rivet-drag-driver", start: rivalStart, car: "hammer",
  points, along: [0, 402.336, 580], gates: [402.336],
};
