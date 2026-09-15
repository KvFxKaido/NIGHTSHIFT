import { isPlayerCarId, type PlayerCarId } from "../customization/cars.ts";
import { decodeStart } from "../sim/race-start.ts";
import { generatedRaceId, parseGeneratedRaceId } from "../sim/race-id.ts";
import { raceBuildFor, sameRaceBuild, type RaceBuild, type RaceBuildFor } from "./race-build.ts";
import { BLACKLIST, blacklistName, stagePayout, type BlacklistName } from "./blacklist.ts";

export { sameRaceBuild, type RaceBuild };

export const PROGRESS_KEY = "nightshift.progress";
export const PROGRESS_VERSION = 4;
export const BULWARK_PRICE = 1500;
/** The turf Moth's stages draw toward (`alder-turf.ts`). Stages accepted before turfs drew plain races and keep them. */
export const MOTH_TURF = "moth";
/** Moth's stages as the store has always named them; the Blacklist (blacklist.ts) holds every name's. */
export const MOTH_STAGES = [
  { name: "First meeting", kind: "sprint", payout: 750 },
  { name: "Rematch", kind: "circuit", payout: 750 },
  { name: "Pink slip", kind: "unordered", payout: 1500 },
] as const;
export interface RaceKey { raceId: string; start: string | null }
/** A generated stage's accepted course: kept for retries after a loss, and for the race list once won. */
export interface MothRace extends RaceKey { build: RaceBuild | null }
export type StageRace = MothRace;
export interface NameProgress {
  /** Stages won, 0-3; three is beaten. */
  wins: number;
  /** A generated name's won courses, then its pending one if drawn. Always empty for drag and drift names. */
  races: StageRace[];
}
export interface CareerProgress {
  /** Every Blacklist name's record, by id. */
  names: Record<string, NameProgress>;
  cash: number;
  bulwarkOwned: boolean;
  /** Moth's record, as the store offered it before every name had one. */
  mothBeaten: boolean;
  mothWins: number;
  mothRaces: StageRace[];
}
type Disk = Pick<Storage, "getItem" | "setItem">;
export interface CareerResult extends MothRace {
  finished: boolean;
  disqualified: boolean;
  position: number;
}

const blankNames = (): Record<string, NameProgress> => Object.fromEntries(BLACKLIST.map(name => [name.id, { wins: 0, races: [] }]));
function career(names: Record<string, NameProgress>, cash: number, bulwarkOwned: boolean): CareerProgress {
  const moth = names.moth!;
  return { names, cash, bulwarkOwned, mothBeaten: moth.wins === 3, mothWins: moth.wins, mothRaces: moth.races };
}
const freshProgress = (bulwarkOwned = false): CareerProgress => career(blankNames(), 0, bulwarkOwned);
const sameRace = (a: RaceKey, b: RaceKey) => a.raceId === b.raceId && a.start === b.start;

/** The name the career is on: the lowest not yet beaten. Null once Tally is. */
export function currentName(progress: Pick<CareerProgress, "names">): BlacklistName | null {
  return BLACKLIST.find(name => (progress.names[name.id]?.wins ?? 0) < 3) ?? null;
}

/** One name's record as stored, checked against its stages. `legacy` allows Moth's forms from before schema 3. */
function decodeName(name: BlacklistName, record: unknown, version: number): NameProgress {
  const r = record as { wins?: unknown; races?: unknown } | null;
  if (!r || !Number.isInteger(r.wins) || (r.wins as number) < 0 || (r.wins as number) > 3 || !Array.isArray(r.races)) throw Error(`Unreadable ${name.id}`);
  const wins = r.wins as number, races = r.races as unknown[];
  const generated = !name.stages[0].event;
  if (!generated && races.length) throw Error(`${name.id} races an event, not a course`);
  if (generated) {
    if (races.length > Math.min(3, wins + 1)) throw Error(`Too many ${name.id} courses`);
    // A one-win prototype profile migrated to three wins with no course history (Moth only).
    if (races.length < wins && !(name.id === "moth" && wins === 3 && races.length === 0)) throw Error(`Missing ${name.id} courses`);
  }
  return {
    wins,
    races: races.map((race, index) => {
      const course = race as MothRace | null;
      const id = course && typeof course.raceId === "string" ? parseGeneratedRaceId(course.raceId) : null;
      // Each stage's variant is fixed. Moth's draws lean toward her turf (gen-moth-15) or, drawn before turfs, none (gen-15);
      // every other name's are named for that name.
      const rival = name.id === "moth" ? id?.rival === null || id?.rival === MOTH_TURF : id?.rival === name.id;
      if (!id || id.kind !== name.stages[index]!.kind || !rival
        || (course!.start !== null && (typeof course!.start !== "string" || !decodeStart(course!.start)))) throw Error("Unreadable race");
      // Unversioned prototype races have unknown provenance, never today's build.
      const build = version === 2 ? null : course!.build;
      if (build !== null && (!build || typeof build.generator !== "string" || !build.generator
        || typeof build.world !== "string" || !build.world)) throw Error("Unreadable race build");
      return { raceId: course!.raceId, start: course!.start, build: build === null ? null : { ...build } };
    }),
  };
}

export function decodeProgress(raw: string | null, legacyBulwark = false): CareerProgress {
  if (raw === null) return freshProgress(legacyBulwark);
  const data = JSON.parse(raw);
  // Preserve cars earned/available in the earlier one-win prototype.
  if (data?.version === 1 && typeof data.mothBeaten === "boolean") {
    return career({ ...blankNames(), moth: { wins: data.mothBeaten ? 3 : 0, races: [] } }, 0, true);
  }
  if (!Number.isSafeInteger(data?.cash) || data.cash < 0 || typeof data.bulwarkOwned !== "boolean") throw Error("Unreadable progress");
  const names = blankNames();
  if (data.version === 2 || data.version === 3) {
    // Before every name had a record: Moth's alone.
    names.moth = decodeName(BLACKLIST[0]!, { wins: data.mothWins, races: data.mothRaces }, data.version);
  } else if (data.version === PROGRESS_VERSION) {
    if (!data.names || typeof data.names !== "object" || Array.isArray(data.names)) throw Error("Unreadable progress");
    for (const id of Object.keys(data.names)) if (!blacklistName(id)) throw Error(`Unknown name ${id}`);
    for (const name of BLACKLIST) if (data.names[name.id] !== undefined) names[name.id] = decodeName(name, data.names[name.id], data.version);
  } else throw Error("Unsupported progress");
  // One name at a time: nobody above a name that is not beaten has a win or a course.
  BLACKLIST.forEach((name, i) => {
    const record = names[name.id]!;
    if (i > 0 && (record.wins > 0 || record.races.length > 0) && names[BLACKLIST[i - 1]!.id]!.wins < 3) throw Error(`${name.id} is ahead of the list`);
  });
  return career(names, data.cash, data.bulwarkOwned);
}

type OwnershipView = Partial<Pick<CareerProgress, "names" | "mothBeaten" | "bulwarkOwned">>;
/** Cinder always; Bulwark once bought; each Blacklist name's car once that name is beaten. */
export function ownsCar(progress: OwnershipView, car: unknown): car is PlayerCarId {
  if (!isPlayerCarId(car)) return false;
  if (car === "cinder") return true;
  if (car === "bulwark") return !!progress.bulwarkOwned;
  const owner = BLACKLIST.find(name => name.car === car);
  if (!owner) return false;
  return progress.names ? progress.names[owner.id]?.wins === 3 : owner.id === "moth" && !!progress.mothBeaten;
}

export type FlashOutcome =
  | { race: MothRace }
  /** A drag or drift stage: the authored event to run for stage `stage` (0-2). */
  | { event: string; stage: number }
  | { none: "retired" | "not-yet" | "outdated" | "undrawable" | "unavailable" };

/** Profile-wide transactions: save cash, stage and ownership together.
 * Failed writes grant nothing and can be retried. Rebase every action on disk
 * so sequential actions from another tab cannot double-pay a completed stage.
 * An accepted course is the reward entitlement, including after reopening its
 * link. A matching driver or a generated race alone grants no entitlement.
 */
export function createProgressStore(storage: () => Disk, buildOf: RaceBuild | RaceBuildFor, legacyBulwark = false) {
  /** This build's identity for a course: per kind, so a circuit revision does not orphan sprints. */
  const build = raceBuildFor(buildOf);
  let progress = freshProgress(legacyBulwark);
  let unavailable = false;
  let legacyOwnershipPending = legacyBulwark;
  const read = () => decodeProgress(storage().getItem(PROGRESS_KEY), legacyBulwark);
  function write(next: CareerProgress): void {
    const raw = JSON.stringify({ version: PROGRESS_VERSION, names: next.names, cash: next.cash, bulwarkOwned: next.bulwarkOwned });
    const checked = decodeProgress(raw);
    storage().setItem(PROGRESS_KEY, raw);
    progress = checked;
    unavailable = false;
    legacyOwnershipPending = false;
  }
  const withName = (id: string, record: NameProgress, cash = progress.cash) =>
    career({ ...progress.names, [id]: record }, cash, progress.bulwarkOwned);
  function preserveLegacyOwnership(): boolean {
    if (!legacyOwnershipPending) return true;
    try {
      const raw = storage().getItem(PROGRESS_KEY);
      if (raw === null) write(freshProgress(true));
      else progress = decodeProgress(raw);
      legacyOwnershipPending = false;
      unavailable = false;
      return true;
    } catch { unavailable = true; return false; }
  }
  /**
   * A flash at a Blacklist name. Only the current name's stages advance: any other
   * name is "not-yet" (still above) or "retired" (beaten). A drag or drift stage
   * hands back its event. A generated stage is only accepted, or handed back, if
   * `draws` says it can be raced on this build (`alderCourseDraws`); a pending stage
   * that no longer draws is replaced, since nothing was won on it. Seeds are tried
   * in order. Losses still retry the same course, which still draws.
   */
  function flashName(id: string, seeds: readonly number[], start: string | null, draws: (race: RaceKey) => boolean): FlashOutcome {
    try {
      progress = read();
      unavailable = false;
      const name = blacklistName(id);
      if (!name || progress.names[name.id]!.wins === 3) return { none: "retired" };
      if (currentName(progress)?.id !== name.id) return { none: "not-yet" };
      const record = progress.names[name.id]!;
      const stage = name.stages[record.wins]!;
      if (stage.event) return { event: stage.event, stage: record.wins };
      const won = record.races.slice(0, record.wins);
      const pending = record.races[record.wins];
      if (pending) {
        if (!sameRaceBuild(pending.build, build(pending.raceId))) return { none: "outdated" };
        if (draws(pending)) return { race: structuredClone(pending) };
      }
      for (const seed of seeds) {
        const raceId = generatedRaceId({ seed, kind: stage.kind as "sprint" | "circuit" | "unordered", rival: name.id });
        const race = { raceId, start, build: { ...build(raceId) } };
        if (!draws(race)) continue;
        write(withName(name.id, { wins: record.wins, races: [...won, race] }));
        return { race: structuredClone(race) };
      }
      // Nothing draws from here. A pending stage that cannot be drawn goes anyway, so the next flash elsewhere draws afresh.
      if (pending) write(withName(name.id, { wins: record.wins, races: won }));
      return { none: "undrawable" };
    } catch { unavailable = true; return { none: "unavailable" }; }
  }
  /** Moth's flash, as the store offered it before every name had stages. */
  function flash(seeds: readonly number[], start: string | null, draws: (race: RaceKey) => boolean):
    { race: MothRace } | { none: "retired" | "outdated" | "undrawable" | "unavailable" } {
    const outcome = flashName("moth", seeds, start, draws);
    if ("race" in outcome) return outcome;
    if ("event" in outcome || outcome.none === "not-yet") return { none: "unavailable" };
    return { none: outcome.none };
  }
  const pendingCourse = () => {
    const name = currentName(progress);
    return name ? progress.names[name.id]!.races[progress.names[name.id]!.wins] : undefined;
  };
  if (legacyBulwark) preserveLegacyOwnership();
  else { try { progress = read(); } catch { unavailable = true; } }
  return {
    preserveLegacyOwnership,
    get: (): CareerProgress => structuredClone(progress),
    unavailable: () => unavailable,
    /** The name the career is on, or null once the list is beaten. */
    current: () => currentName(progress),
    outdatedChallenge: () => {
      const race = pendingCourse();
      return !!race && !sameRaceBuild(race.build, build(race.raceId));
    },
    isOutdatedRace: (key: RaceKey) => Object.values(progress.names)
      .some(record => record.races.some(race => sameRace(race, key) && !sameRaceBuild(race.build, build(race.raceId)))),
    /** Explicit user choice: discard only the current name's incompatible unfinished stage. */
    discardOutdatedChallenge(): boolean {
      try {
        progress = read();
        const name = currentName(progress);
        if (!name) return false;
        const record = progress.names[name.id]!, race = record.races[record.wins];
        if (!race || sameRaceBuild(race.build, build(race.raceId))) return false;
        write(withName(name.id, { wins: record.wins, races: record.races.slice(0, record.wins) }));
        return true;
      } catch { unavailable = true; return false; }
    },
    flashName,
    flash,
    /** Draw once per stage. Subsequent flashes retry the same course and start. Does not ask whether a course draws; a flash does. */
    challenge(seed: number, start: string | null): MothRace | null {
      const outcome = flash([seed], start, () => true);
      return "race" in outcome ? outcome.race : null;
    },
    /**
     * A finished race. A generated stage pays once, for the course that was accepted;
     * a drag or drift stage pays when the current name's stage event is won. The
     * third win is the pink slip: it pays double and hands over the car.
     */
    complete(result: CareerResult): "none" | "advanced" | "awarded" | "recorded" | "incompatible" | "unavailable" {
      if (!result.finished || result.disqualified || result.position !== 1) return "none";
      try {
        progress = read();
        unavailable = false;
        for (const name of BLACKLIST) {
          const record = progress.names[name.id]!;
          const index = record.races.findIndex(race => sameRace(race, result));
          if (index < 0) continue;
          if (!sameRaceBuild(result.build, build(result.raceId)) || !sameRaceBuild(record.races[index]!.build, build(result.raceId))) return "incompatible";
          if (index < record.wins) return "recorded";
          const wins = record.wins + 1;
          write(withName(name.id, { wins, races: record.races }, progress.cash + stagePayout(name.rank, index)));
          return wins === 3 ? "awarded" : "advanced";
        }
        const name = currentName(progress);
        const record = name ? progress.names[name.id]! : null;
        if (!name || !record || name.stages[record.wins]!.event !== result.raceId) return "none";
        const wins = record.wins + 1;
        write(withName(name.id, { wins, races: [] }, progress.cash + stagePayout(name.rank, record.wins)));
        return wins === 3 ? "awarded" : "advanced";
      } catch { unavailable = true; return "unavailable"; }
    },
    buyBulwark(): "purchased" | "owned" | "insufficient" | "unavailable" {
      try {
        progress = read();
        unavailable = false;
        if (progress.bulwarkOwned) return "owned";
        if (progress.cash < BULWARK_PRICE) return "insufficient";
        write(career(progress.names, progress.cash - BULWARK_PRICE, true));
        return "purchased";
      } catch { unavailable = true; return "unavailable"; }
    },
  };
}
