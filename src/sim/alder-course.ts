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
import { cruiserFor } from "./alder-cruisers.ts";
import { BLACKLIST_LAUNCH, RIVAL_LAUNCH_SKILL } from "./launch.ts";
import { parseGeneratedRaceId } from "./race-id.ts";
import { decodeStart, snapToLane } from "./race-start.ts";
import { RIVAL_STREET_LINE, type RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";
import { STREET_CIRCUIT_LINE } from "./street-circuit.ts";
import { withStreetLine } from "./street-line.ts";

export type AlderCourse = ReturnType<typeof alderGeneratedRace> & { start: RoadWorld["start"] | null };

/** Draw a generated course, or throw saying why it cannot be drawn. A null start is the grid. */
export function drawAlderCourse(raceId: string, start: string | null): AlderCourse {
  const id = parseGeneratedRaceId(raceId);
  if (!id) throw new Error(`'${raceId}' is not a generated race`);
  // The id names the rival whose race it is. Its turf leans the draw; Tally's is the
  // whole city, which is no pull, so hers draws as a plain race of the same seed.
  const turf = id.rival ? turfFor(id.rival) : null;
  const cruiser = cruiserFor(id.rival);
  if (id.rival && !turf && !cruiser) throw new Error(`Unknown turf '${id.rival}' in race '${raceId}'`);
  let pose: RoadWorld["start"] | null = null;
  if (start !== null) {
    const flashed = decodeStart(start);
    if (!flashed) throw new Error(`Unknown start '${start}'`);
    pose = snapToLane(ALDER_STREETS, flashed, alderHeight);
    if (!pose) throw new Error(`No street to start on at ${start}`);
  }
  const drawn = alderGeneratedRace(id.seed, pose ?? undefined, id.kind, turf);
  // The race keeps the id it was asked for: a turfless rival's draw is named for no
  // turf by the generator, but the id is how a load knows whose car to field.
  const race = drawn.race.id === raceId ? drawn.race : { ...drawn.race, id: raceId };
  const generated = drawn.generated.definition.id === raceId ? drawn.generated : { ...drawn.generated, definition: race };
  // Raced in the rival's own car and its handling, not the Kestrel every generated race used to field.
  const rival = { ...drawn.rival, id: `${raceId}-driver`, car: cruiser?.car ?? drawn.rival.car,
    // Higher up the list, a cleaner start (`launch.ts`).
    launch: (id.rival ? BLACKLIST_LAUNCH[id.rival] : undefined) ?? RIVAL_LAUNCH_SKILL };
  return { race, generated, rival, start: pose };
}

/**
 * A course's rival as a race fields it: carrying the street line it may take one corner at a time when traffic allows
 * (street-line.ts). Not part of `drawAlderCourse`, which is asked whether a course draws far more often than one is
 * raced, and a line takes a fifth of a second to draw.
 */
export function fieldAlderRival(rival: RivalDefinition): RivalDefinition {
  return rival.line || rival.lateral ? rival : withStreetLine(rival, STREET_CIRCUIT_LINE, RIVAL_STREET_LINE.speedFactor);
}

export function alderCourseDraws(raceId: string, start: string | null): boolean {
  try { drawAlderCourse(raceId, start); return true; } catch { return false; }
}
