import { decodeStart } from "../sim/race-start.ts";
import { sameRaceBuild, type RaceBuild } from "./race-build.ts";
import { parseGeneratedRaceId } from "../sim/race-id.ts";

/**
 * The playlist: generated races the player chose to keep (design/PROCEDURAL_RACES.md,
 * step 4). A flash draws a race once; this is how one comes back.
 *
 * An entry is a course, not a recording: the race id (seed and variant), the
 * start as the URL carries it, and the generator and world it was drawn on,
 * since the same seed draws a different race on either of those changing
 * (GENERATOR_REVISION, ALDER_VERSION). An entry from another build stays in the
 * list, marked unplayable, until the player removes it; it is never redrawn
 * under its old name and never dropped without being asked.
 *
 * Its own key, beside `nightshift.saves`: the list grows, and an unreadable one
 * must not take the Options settings with it. Unreadable or future data is
 * reported and never overwritten. Every write rebases on disk, so two tabs
 * keeping different races both keep them.
 */
export const PLAYLIST_KEY = "nightshift.playlist";
export const PLAYLIST_VERSION = 1;

export interface Course { raceId: string; start: string | null }
export interface KeptRace extends Course {
  build: RaceBuild;
  /** The race's name when it was kept ("Jackson to Holgate"), so the list need not redraw every entry to show it. */
  name: string;
  /** Wall clock when kept. Display order only; nothing replays from it. */
  keptAt: number;
}
export interface PlaylistEntry { race: KeptRace; playable: boolean }
type Disk = Pick<Storage, "getItem" | "setItem">;

const sameCourse = (a: KeptRace, b: Course & { build: RaceBuild }) =>
  a.raceId === b.raceId && a.start === b.start && sameRaceBuild(a.build, b.build);

function decodeRace(race: unknown): KeptRace {
  const r = race as KeptRace | null;
  if (!r || typeof r.raceId !== "string" || !parseGeneratedRaceId(r.raceId)) throw Error("Invalid race id");
  if (r.start !== null && (typeof r.start !== "string" || !decodeStart(r.start))) throw Error("Invalid start");
  const b = r.build;
  if (!b || typeof b.generator !== "string" || !b.generator || typeof b.world !== "string" || !b.world) throw Error("Invalid build");
  if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 80) throw Error("Invalid name");
  if (!Number.isFinite(r.keptAt) || r.keptAt < 0) throw Error("Invalid time");
  return { raceId: r.raceId, start: r.start, build: { generator: b.generator, world: b.world }, name: r.name.trim(), keptAt: r.keptAt };
}

/** Throws on anything it cannot vouch for, so a caller never writes over it. */
export function decodePlaylist(raw: string | null): KeptRace[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data?.version !== PLAYLIST_VERSION || !Array.isArray(data.races)) throw Error("Unsupported playlist");
  const races: KeptRace[] = [];
  for (const entry of data.races) {
    const race = decodeRace(entry);
    if (races.some(r => sameCourse(r, race))) throw Error("Duplicate race");
    races.push(race);
  }
  return races;
}

export function createPlaylistStore(storage: () => Disk, build: RaceBuild) {
  const read = () => decodePlaylist(storage().getItem(PLAYLIST_KEY));
  const write = (races: KeptRace[]) => {
    const raw = JSON.stringify({ version: PLAYLIST_VERSION, races });
    decodePlaylist(raw);
    storage().setItem(PLAYLIST_KEY, raw);
  };
  return {
    /** Every kept race in the order it was kept, each marked playable on this build or not; null when the stored list cannot be read. */
    list(): PlaylistEntry[] | null {
      try { return read().map(race => ({ race, playable: sameRaceBuild(race.build, build) })); } catch { return null; }
    },
    /** Keep a race drawn on this build. Keeping it again changes nothing. */
    keep(course: Course, name: string, now: number): "kept" | "already" | "unavailable" {
      try {
        const races = read();
        const race = decodeRace({ ...course, build, name, keptAt: now });
        if (races.some(r => sameCourse(r, race))) return "already";
        write([...races, race]);
        return "kept";
      } catch { return "unavailable"; }
    },
    /** Whether this build's draw of a course is in the list, for a Keep button's state. */
    has(course: Course): boolean {
      try { return read().some(r => sameCourse(r, { ...course, build })); } catch { return false; }
    },
    /** Remove one entry, playable or not, by its full identity. */
    remove(race: Course & { build: RaceBuild }): "removed" | "missing" | "unavailable" {
      try {
        const races = read();
        const kept = races.filter(r => !sameCourse(r, race));
        if (kept.length === races.length) return "missing";
        write(kept);
        return "removed";
      } catch { return "unavailable"; }
    },
  };
}
