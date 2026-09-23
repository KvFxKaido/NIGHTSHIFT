/**
 * Authored sprints (2026-09-23): a generated course pinned as data, so a change to the map or the generator cannot
 * redraw it.
 *
 * A generated race is its seed, and the seed is only as stable as everything the draw reads: the shoulders that day
 * changed the world, and gen-wake-42, the race Shawn had been racing against Wake all morning, became another course.
 * He raced the new one, cut it three times, won by 7.8 s and asked for it to be an official race, with the first cut
 * an official shortcut (Spruce Cut, assets/maps/alder/alleys.json). So its race, its rival's route and its start are
 * kept here as they were drawn, the route taken through the alley. The rival's street line is drawn from that route when
 * the race is fielded (`fieldAlderRival`), as a generated race's is, so it follows the city; the course does not.
 *
 * `sprint-<name>` in `?race=`, and in the race list with the authored races. It is recorded and replayed like a
 * generated sprint (`recorded-event.ts`): one lap, the whole race, measured along its rival's route.
 */
import data from "./authored-sprints.json" with { type: "json" };
import type { RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";

export interface AuthoredSprint {
  readonly name: string;
  /** The Blacklist name that races it, for the car the race fields and draws. */
  readonly blacklist?: string;
  /** Where it came from, in words. */
  readonly pinned: string;
  readonly race: RaceDefinition;
  readonly route: RivalDefinition;
  readonly start: RoadWorld["start"] | null;
}

/** Bump for a change to how an authored sprint becomes an event; its course names itself (`recorded-event.ts`). */
export const AUTHORED_SPRINT_REVISION = "authored-sprint-v1";
const SPRINTS = data.sprints as unknown as Readonly<Record<string, AuthoredSprint>>;
export const AUTHORED_SPRINT_IDS: readonly string[] = Object.keys(SPRINTS);

/** The authored sprint a race id names, or null for any other race. */
export function authoredSprintFor(raceId: string): AuthoredSprint | null {
  return Object.hasOwn(SPRINTS, raceId) ? SPRINTS[raceId]! : null;
}
