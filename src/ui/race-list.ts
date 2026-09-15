import { ALDER_RACE } from "../sim/alder.ts";
import { arenaRaceId } from "../sim/arena-events.ts";
import { streetCircuitRaceId } from "../sim/street-circuit.ts";
import { MOTH_STAGES, type CareerProgress } from "../settings/progress.ts";
import { sameRaceBuild, type RaceBuild } from "../settings/race-build.ts";
import type { KeptRace, PlaylistEntry } from "../settings/playlist.ts";
import { parseGeneratedRaceId } from "../sim/race-id.ts";

/**
 * The race list (design/PROCEDURAL_RACES.md, step 4), as data: what the menu
 * shows and what each button starts. No DOM here, so the rules are testable.
 *
 * Three groups, in this order: the authored races, always listed; Moth's won
 * stages, straight from her career, since retiring her from the street is what
 * makes this their home; and the races the player kept. A kept race Moth's
 * group already shows is not listed twice. Anything drawn on another build is
 * listed, marked, and cannot be started.
 */

/** What a Race or Solo button loads. Circuits carry solo in their race id; the rest take `solo=1`. */
export interface RaceLaunch { raceId: string; start: string | null; solo: boolean }
export interface RaceListItem {
  key: string;
  group: "authored" | "moth" | "kept";
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
  authored("street-uptown", "Uptown Circuit", "Street circuit · 3 laps · traffic",
    id(streetCircuitRaceId(true, false)), id(streetCircuitRaceId(true, true))),
  authored("street-uptown-clear", "Uptown Circuit / Clear", "Street circuit · 3 laps · clear streets",
    id(streetCircuitRaceId(false, false)), id(streetCircuitRaceId(false, true))),
];

/** "gen-12-circuit" -> "Circuit". */
export function generatedKind(raceId: string): string {
  const kind = parseGeneratedRaceId(raceId)?.kind ?? "sprint";
  return kind === "circuit" ? "Circuit" : kind === "unordered" ? "Unordered" : "Sprint";
}

const OLDER = "Drawn on an older version of the city or generator · cannot be raced";

export function raceListItems(career: CareerProgress, kept: readonly PlaylistEntry[], build: RaceBuild): RaceListItem[] {
  const moth = career.mothRaces.slice(0, career.mothWins).map((stage, index): RaceListItem => {
    const playable = sameRaceBuild(stage.build, build);
    const launch = (solo: boolean): RaceLaunch => ({ raceId: stage.raceId, start: stage.start, solo });
    return { key: `moth-${index}`, group: "moth", title: `Moth / ${MOTH_STAGES[index]!.name}`,
      detail: playable ? `${generatedKind(stage.raceId)} · won` : OLDER,
      race: playable ? launch(false) : null, solo: playable ? launch(true) : null, removable: null };
  });
  const shownByMoth = (race: KeptRace) => career.mothRaces.slice(0, career.mothWins)
    .some(stage => stage.raceId === race.raceId && stage.start === race.start && sameRaceBuild(stage.build, race.build));
  const keptItems = kept.filter(entry => !shownByMoth(entry.race)).map(({ race, playable }): RaceListItem => {
    const launch = (solo: boolean): RaceLaunch => ({ raceId: race.raceId, start: race.start, solo });
    return { key: `kept-${race.raceId}-${race.start ?? "grid"}-${race.build.generator}-${race.build.world}`, group: "kept",
      title: race.name, detail: playable ? `${generatedKind(race.raceId)} · kept` : OLDER,
      race: playable ? launch(false) : null, solo: playable ? launch(true) : null, removable: race };
  });
  return [...AUTHORED_RACES, ...moth, ...keptItems];
}
