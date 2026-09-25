import { ALDER_RACE } from "../sim/alder.ts";
import { arenaRaceId } from "../sim/arena-events.ts";
import { streetCircuitRaceId } from "../sim/street-circuit.ts";
import { stadiumRaceId } from "../sim/stadium-events.ts";
import { STADIUM } from "../sim/stadium.ts";
import { authoredSprintFor, AUTHORED_SPRINT_IDS } from "../sim/authored-sprints.ts";
import type { CareerProgress } from "../settings/progress.ts";
import { BLACKLIST } from "../settings/blacklist.ts";
import { raceBuildFor, sameRaceBuild, type RaceBuild, type RaceBuildFor } from "../settings/race-build.ts";
import type { KeptRace, PlaylistEntry } from "../settings/playlist.ts";
import { parseGeneratedRaceId } from "../sim/race-id.ts";

/**
 * The race list (design/PROCEDURAL_RACES.md, step 4), as data: what the menu
 * shows and what each button starts. No DOM here, so the rules are testable.
 *
 * Three groups, in this order: the authored races, always listed; the Blacklist
 * stages won on generated courses, straight from the career, since a beaten name
 * leaves the street and this is their home; and the races the player kept. A kept
 * race the Blacklist group already shows is not listed twice. Anything drawn on another build is
 * listed, marked, and cannot be started.
 */

/** What a Race or Solo button loads. Circuits carry solo in their race id; the rest take `solo=1`. */
export interface RaceLaunch { raceId: string; start: string | null; solo: boolean }
export interface RaceListItem {
  key: string;
  group: "authored" | "blacklist" | "kept";
  title: string;
  detail: string;
  /** Null when the course cannot be raced on this build. */
  race: RaceLaunch | null;
  solo: RaceLaunch | null;
  /** A kept entry the player may take out of the list. */
  removable: KeptRace | null;
}

const authored = (key: string, title: string, detail: string, race: RaceLaunch, solo: RaceLaunch): RaceListItem =>
  ({ key, group: "authored", title, detail, race, solo, removable: null });
const id = (raceId: string, solo = false): RaceLaunch => ({ raceId, start: null, solo });

export const AUTHORED_RACES: readonly RaceListItem[] = [
  authored("sound-to-sky", "Sound to Sky", "Sprint · Jackson to Pike", id(ALDER_RACE.id), id(ALDER_RACE.id, true)),
  authored("arena-full", "Ridge Circuit / Full", "Circuit · 3 laps", id(arenaRaceId("full")), id(arenaRaceId("full", true))),
  authored("arena-east", "Ridge Circuit / East", "Circuit · 3 laps", id(arenaRaceId("east")), id(arenaRaceId("east", true))),
  authored("arena-ridge", "Ridge Circuit / Ridge", "Circuit · 3 laps", id(arenaRaceId("ridge")), id(arenaRaceId("ridge", true))),
  // The stadium venue's circuits (design/VENUES.md): the race loads the venue.
  authored("stadium-full", `${STADIUM.name} / Full`, "Stadium circuit · 3 laps", id(stadiumRaceId("full")), id(stadiumRaceId("full", true))),
  authored("stadium-short", `${STADIUM.name} / Short`, "Stadium circuit · 3 laps", id(stadiumRaceId("short")), id(stadiumRaceId("short", true))),
  authored("street-uptown", "Uptown Circuit", "Street circuit · 3 laps · traffic",
    id(streetCircuitRaceId(true, false)), id(streetCircuitRaceId(true, true))),
  authored("street-uptown-clear", "Uptown Circuit / Clear", "Street circuit · 3 laps · clear streets",
    id(streetCircuitRaceId(false, false)), id(streetCircuitRaceId(false, true))),
  // Generated courses pinned as data (authored-sprints.ts).
  ...AUTHORED_SPRINT_IDS.map(raceId => { const sprint = authoredSprintFor(raceId)!;
    return authored(raceId, sprint.name, `Sprint · ${sprint.race.checkpoints.length} gates · traffic`, id(raceId), id(raceId, true)); }),
];

/** "gen-12-circuit" -> "Circuit". */
export function generatedKind(raceId: string): string {
  const kind = parseGeneratedRaceId(raceId)?.kind ?? "sprint";
  return kind === "circuit" ? "Circuit" : kind === "unordered" ? "Unordered" : "Sprint";
}

const OLDER = "Drawn on an older version of the city or generator · cannot be raced";

/** Every generated stage won on the Blacklist, in list order, with the name and stage it was. */
export function wonStages(career: Pick<CareerProgress, "names">) {
  return BLACKLIST.flatMap(name => {
    const record = career.names[name.id];
    return record ? record.races.slice(0, record.wins).map((race, index) => ({ name, stage: name.stages[index]!, index, race })) : [];
  });
}

export function raceListItems(career: Pick<CareerProgress, "names">, kept: readonly PlaylistEntry[], buildOf: RaceBuild | RaceBuildFor): RaceListItem[] {
  const build = raceBuildFor(buildOf);
  const won = wonStages(career);
  const blacklist = won.map(({ name, stage, index, race }): RaceListItem => {
    const playable = sameRaceBuild(race.build, build(race.raceId));
    const launch = (solo: boolean): RaceLaunch => ({ raceId: race.raceId, start: race.start, solo });
    return { key: `${name.id}-${index}`, group: "blacklist", title: `${name.name} / ${stage.name}`,
      detail: playable ? `${generatedKind(race.raceId)} · won` : OLDER,
      race: playable ? launch(false) : null, solo: playable ? launch(true) : null, removable: null };
  });
  const shownByBlacklist = (race: KeptRace) => won
    .some(stage => stage.race.raceId === race.raceId && stage.race.start === race.start && sameRaceBuild(stage.race.build, race.build));
  const keptItems = kept.filter(entry => !shownByBlacklist(entry.race)).map(({ race, playable }): RaceListItem => {
    const launch = (solo: boolean): RaceLaunch => ({ raceId: race.raceId, start: race.start, solo });
    return { key: `kept-${race.raceId}-${race.start ?? "grid"}-${race.build.generator}-${race.build.world}`, group: "kept",
      title: race.name, detail: playable ? `${generatedKind(race.raceId)} · kept` : OLDER,
      race: playable ? launch(false) : null, solo: playable ? launch(true) : null, removable: race };
  });
  return [...AUTHORED_RACES, ...blacklist, ...keptItems];
}
