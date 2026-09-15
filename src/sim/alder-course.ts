/**
 * A generated course as a page load draws it: the id parsed, its turf found, the
 * start decoded and snapped to its lane again, and the race drawn. Every caller
 * that asks "can this course be raced?" asks here, so the answer is the load's.
 *
 * Not every course can be. A flash at a lane whose junction ahead leads nowhere
 * useful (heading south on Moth's loop toward the map's southern edge, 2026-09-15)
 * draws no race for any seed, and some circuits cannot close. Before this, a Moth
 * stage was accepted from such a flash, every later flash returned it, and loading
 * it threw: a stage that could neither be raced nor replaced.
 */
import { ALDER_STREETS, alderGeneratedRace, alderHeight } from "./alder.ts";
import { turfFor } from "./alder-turf.ts";
import { parseGeneratedRaceId } from "./race-id.ts";
import { decodeStart, snapToLane } from "./race-start.ts";
import type { RoadWorld } from "./road-world.ts";

export type AlderCourse = ReturnType<typeof alderGeneratedRace> & { start: RoadWorld["start"] | null };

/** Draw a generated course, or throw saying why it cannot be drawn. A null start is the grid. */
export function drawAlderCourse(raceId: string, start: string | null): AlderCourse {
  const id = parseGeneratedRaceId(raceId);
  if (!id) throw new Error(`'${raceId}' is not a generated race`);
  const turf = id.rival ? turfFor(id.rival) : null;
  if (id.rival && !turf) throw new Error(`Unknown turf '${id.rival}' in race '${raceId}'`);
  let pose: RoadWorld["start"] | null = null;
  if (start !== null) {
    const flashed = decodeStart(start);
    if (!flashed) throw new Error(`Unknown start '${start}'`);
    pose = snapToLane(ALDER_STREETS, flashed, alderHeight);
    if (!pose) throw new Error(`No street to start on at ${start}`);
  }
  return { ...alderGeneratedRace(id.seed, pose ?? undefined, id.kind, turf), start: pose };
}

export function alderCourseDraws(raceId: string, start: string | null): boolean {
  try { drawAlderCourse(raceId, start); return true; } catch { return false; }
}
