/**
 * What a recording is a recording OF (2026-09-20): the race, its rival, the path
 * its telemetry is measured along and the identity a session must match to replay.
 *
 * Laps were recorded on circuits only, Ridge and Uptown, because that is where the
 * rival was first tuned against a person. The career is generated races, and every
 * question about whether a Blacklist name can worry the player came back to the
 * same gap: the rival's side could be measured and his could not (Tally's
 * `gen-tally-7` was read off a finished race in a browser tab). So a generated
 * race is recorded too, by the same recorder and replayed by the same check. The
 * game, `lap-replay.ts` and `pnpm laps:compare` all resolve a race here, so a
 * session is replayed against exactly what it was driven against.
 *
 * A generated race is ONE lap to the recorder: the whole race, from the flag to the
 * last gate, measured along its rival's centreline route. That is exact for a
 * sprint. A generated circuit's laps lie over each other and an unordered race is
 * driven in the player's own order, so for those two the input log still replays
 * to the tick but `distance` and `offset` are not to be trusted, and
 * `comparable` is false.
 */
import { drawAlderCourse, fieldAlderRival } from "./alder-course.ts";
import { authoredSprintFor, AUTHORED_SPRINT_REVISION } from "./authored-sprints.ts";
import { layoutFingerprint } from "./building-layout.ts";
import { circuitEvent } from "./circuits.ts";
import type { LapTrack } from "./lap-recorder.ts";
import type { RaceDefinition } from "./race.ts";
import { generatorRevision } from "./race-generator.ts";
import { parseGeneratedRaceId } from "./race-id.ts";
import { withExits, type RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";

export interface RecordedEvent {
  /** What must not have changed for a session to replay: a circuit's revision, or the generator's for this race's kind. */
  readonly identity: string;
  readonly layout: string;
  readonly solo: boolean;
  readonly traffic: boolean;
  readonly race: RaceDefinition;
  readonly rival: RivalDefinition | null;
  readonly track: LapTrack;
  /** Where the world starts the player. Absent is the grid. */
  readonly start: RoadWorld["start"] | undefined;
  /** Whether the player and the rival can be compared gate by gate along `track`: a circuit or a sprint. */
  readonly comparable: boolean;
  /** The venue it runs in (the stadium's circuits); absent is Port Alder. The replay builds that world. */
  readonly venue?: "stadium";
}

export const GENERATED_LAYOUT = "generated";
export const AUTHORED_SPRINT_LAYOUT = "authored-sprint";

/**
 * The event a race id names, or null for one that is not recorded (the drag strip, the drift yard, Sound to Sky). An
 * authored sprint (`authored-sprints.ts`) is recorded as a generated sprint is, against the course it pins.
 * `start` is a generated race's flash, as its draw needs it; `solo` is a generated race's `?solo=1` (a circuit says
 * so in its id). Throws, as `drawAlderCourse` does, for a generated race that cannot be drawn.
 */
export function recordedEvent(raceId: string, laps?: number, generated: { start?: string | null; solo?: boolean } = {}): RecordedEvent | null {
  const circuit = circuitEvent(raceId, laps);
  if (circuit) return { ...circuit, comparable: true };
  const sprint = authoredSprintFor(raceId);
  if (sprint) {
    const solo = generated.solo ?? false, rival = fieldAlderRival(sprint.route);
    return {
      // What it is, pinned: the course names itself, so editing it refuses the sessions driven on the old one.
      identity: `${AUTHORED_SPRINT_REVISION}.${layoutFingerprint([sprint.race, sprint.route, sprint.start])}`,
      layout: AUTHORED_SPRINT_LAYOUT, solo, traffic: true,
      race: solo ? withExits(sprint.race, rival) : sprint.race,
      rival: solo ? null : rival,
      track: { points: sprint.route.points, gatesPerLap: sprint.race.checkpoints.length },
      start: sprint.start ?? undefined,
      comparable: true,
    };
  }
  const id = parseGeneratedRaceId(raceId);
  if (!id) return null;
  const course = drawAlderCourse(raceId, generated.start ?? null), solo = generated.solo ?? false;
  const rival = fieldAlderRival(course.rival);
  return {
    identity: generatorRevision(raceId), layout: GENERATED_LAYOUT, solo, traffic: true,
    // As the game builds it: a solo race keeps its arrows, which come from the rival's route, and fields nobody.
    race: solo ? withExits(course.race, rival) : course.race,
    rival: solo ? null : rival,
    track: { points: course.rival.points, gatesPerLap: course.race.checkpoints.length },
    start: course.start ?? undefined,
    comparable: (id.kind ?? "sprint") === "sprint",
  };
}
