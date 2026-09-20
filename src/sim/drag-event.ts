import { ALDER_STREETS, alderHeight } from "./alder.ts";
import type { RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";

const harbor = ALDER_STREETS.find(s => s.id === "sea-0")!;
const south = harbor.points[1]!;
/** 90 m north of Harbor Way's southern bend, with 200 m of braking road. */
const start = { x: south.x, z: south.z - 90 };
/**
 * Beside her strip, up on the pavement. Until 2026-09-20 she stood in the road,
 * 0.41 m off the line of Harbor Way's outer northbound lane and facing up it, and
 * traffic follows a racer in its lane: four vehicles stopped behind her inside
 * the first minute and stayed for good. No spot inside the carriageway clears.
 * That lane's line is 3.41 m from its kerb, a metre of that is her own car, and
 * traffic counts anything within 2.6 m of its line as in its lane
 * (`RACER_IN_LANE`). So she is 4.7 m off it, on the strip beside the kerb.
 */
const parked = { x: start.x + 13.3, z: start.z + 20 };
/**
 * Where her turf is centred: where she used to stand. Apart from her car, so that
 * moving the car redrew nobody's seeds. A turf's centre is part of what a seed draws.
 */
export const RIVET_TURF = { x: start.x + 9, z: start.z + 20 } as const;
export const RIVET = {
  id: "rivet", name: "Rivet", carName: "Hammer", car: "hammer",
  eventId: "rivet-quarter-mile",
  start: { ...parked, y: alderHeight(parked.x, parked.z), heading: 0, pitch: 0 },
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
