import { isPlayerCarId, type PlayerCarId } from "../customization/cars.ts";
import { decodeStart } from "../sim/race-start.ts";

export const PROGRESS_KEY = "nightshift.progress";
export const BULWARK_PRICE = 1500;
export const MOTH_STAGES = [
  { name: "First meeting", kind: "sprint", payout: 750 },
  { name: "Rematch", kind: "circuit", payout: 750 },
  { name: "Pink slip", kind: "unordered", payout: 1500 },
] as const;
export interface RaceBuild { generator: string; world: string }
export interface RaceKey { raceId: string; start: string | null }
export interface MothRace extends RaceKey { build: RaceBuild | null }
export interface CareerProgress {
  mothBeaten: boolean;
  mothWins: number;
  /** Completed stages, followed by the current challenge if drawn. */
  mothRaces: MothRace[];
  cash: number;
  bulwarkOwned: boolean;
}
type Disk = Pick<Storage, "getItem" | "setItem">;
export interface CareerResult extends MothRace {
  finished: boolean;
  disqualified: boolean;
  position: number;
}
const freshProgress = (bulwarkOwned = false): CareerProgress => ({ mothBeaten: false, mothWins: 0, mothRaces: [], cash: 0, bulwarkOwned });
const sameRace = (a: RaceKey, b: RaceKey) => a.raceId === b.raceId && a.start === b.start;
export const sameRaceBuild = (a: RaceBuild | null, b: RaceBuild) => a !== null && a.generator === b.generator && a.world === b.world;

export function decodeProgress(raw: string | null, legacyBulwark = false): CareerProgress {
  if (raw === null) return freshProgress(legacyBulwark);
  const data = JSON.parse(raw);
  // Preserve cars earned/available in the earlier one-win prototype.
  if (data?.version === 1 && typeof data.mothBeaten === "boolean") {
    return { ...freshProgress(true), mothBeaten: data.mothBeaten, mothWins: data.mothBeaten ? 3 : 0 };
  }
  if (![2, 3].includes(data?.version) || !Number.isInteger(data.mothWins) || data.mothWins < 0 || data.mothWins > 3
    || !Number.isSafeInteger(data.cash) || data.cash < 0 || typeof data.bulwarkOwned !== "boolean"
    || !Array.isArray(data.mothRaces) || data.mothRaces.length > Math.min(3, data.mothWins + 1)
    || (data.mothRaces.length < data.mothWins && !(data.mothWins === 3 && data.mothRaces.length === 0))) throw Error("Unreadable progress");
  const mothRaces: MothRace[] = data.mothRaces.map((race: MothRace, index: number) => {
    const suffix = ["", "-circuit", "-unordered"][index];
    if (!race || typeof race.raceId !== "string" || !new RegExp(`^gen-\\d{1,9}${suffix}$`).test(race.raceId)
      || (race.start !== null && (typeof race.start !== "string" || !decodeStart(race.start)))) throw Error("Unreadable race");
    // Unversioned prototype races have unknown provenance, never today's build.
    const build = data.version === 2 ? null : race.build;
    if (build !== null && (!build || typeof build.generator !== "string" || !build.generator
      || typeof build.world !== "string" || !build.world)) throw Error("Unreadable race build");
    return { raceId: race.raceId, start: race.start, build: build === null ? null : { ...build } };
  });
  return { mothBeaten: data.mothWins === 3, mothWins: data.mothWins, mothRaces, cash: data.cash, bulwarkOwned: data.bulwarkOwned };
}

export function ownsCar(progress: Pick<CareerProgress, "mothBeaten"> & Partial<Pick<CareerProgress, "bulwarkOwned">>, car: unknown): car is PlayerCarId {
  return isPlayerCarId(car) && (car !== "kestrel" || progress.mothBeaten) && (car !== "bulwark" || !!progress.bulwarkOwned);
}

/** Profile-wide transactions: save cash, stage and ownership together.
 * Failed writes grant nothing and can be retried. Rebase every action on disk
 * so sequential actions from another tab cannot double-pay a completed stage.
 * An accepted Moth course is the reward entitlement, including after reopening
 * its link. A matching driver or a generated race alone grants no entitlement.
 */
export function createProgressStore(storage: () => Disk, build: RaceBuild, legacyBulwark = false) {
  let progress = freshProgress(legacyBulwark);
  let unavailable = false;
  let legacyOwnershipPending = legacyBulwark;
  const read = () => decodeProgress(storage().getItem(PROGRESS_KEY), legacyBulwark);
  function write(next: CareerProgress): void {
    const raw = JSON.stringify({ version: 3, ...next });
    const checked = decodeProgress(raw);
    storage().setItem(PROGRESS_KEY, raw);
    progress = checked;
    unavailable = false;
    legacyOwnershipPending = false;
  }
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
  // Persist the legacy grant at boot so changing the selected car cannot lose it.
  if (legacyBulwark) preserveLegacyOwnership();
  else { try { progress = read(); } catch { unavailable = true; } }
  return {
    preserveLegacyOwnership,
    get: (): CareerProgress => structuredClone(progress),
    unavailable: () => unavailable,
    outdatedChallenge: () => {
      const race = progress.mothRaces[progress.mothWins];
      return !!race && !sameRaceBuild(race.build, build);
    },
    isOutdatedRace: (key: RaceKey) => progress.mothRaces.some(race => sameRace(race, key) && !sameRaceBuild(race.build, build)),
    /** Explicit user choice: discard only the incompatible unfinished stage. */
    discardOutdatedChallenge(): boolean {
      try {
        progress = read();
        const race = progress.mothRaces[progress.mothWins];
        if (!race || sameRaceBuild(race.build, build)) return false;
        write({ ...progress, mothRaces: progress.mothRaces.slice(0, progress.mothWins) });
        return true;
      } catch { unavailable = true; return false; }
    },
    /** Draw once per stage. Subsequent flashes retry the same course and start. */
    challenge(seed: number, start: string | null): MothRace | null {
      try {
        progress = read();
        unavailable = false;
        if (progress.mothBeaten) return null;
        const existing = progress.mothRaces[progress.mothWins];
        if (existing) return sameRaceBuild(existing.build, build) ? structuredClone(existing) : null;
        const kind = MOTH_STAGES[progress.mothWins]!.kind;
        const race = { raceId: `gen-${seed}${kind === "sprint" ? "" : `-${kind}`}`, start, build: { ...build } };
        write({ ...progress, mothRaces: [...progress.mothRaces, race] });
        return structuredClone(race);
      } catch { unavailable = true; return null; }
    },
    complete(result: CareerResult): "none" | "advanced" | "awarded" | "recorded" | "incompatible" | "unavailable" {
      if (!result.finished || result.disqualified || result.position !== 1) return "none";
      try {
        progress = read();
        unavailable = false;
        const index = progress.mothRaces.findIndex(race => sameRace(race, result));
        if (index < 0) return "none";
        if (!sameRaceBuild(result.build, build) || !sameRaceBuild(progress.mothRaces[index]!.build, build)) return "incompatible";
        if (index < progress.mothWins) return "recorded";
        const mothWins = progress.mothWins + 1;
        write({ ...progress, mothWins, mothBeaten: mothWins === 3, cash: progress.cash + MOTH_STAGES[index]!.payout });
        return mothWins === 3 ? "awarded" : "advanced";
      } catch { unavailable = true; return "unavailable"; }
    },
    buyBulwark(): "purchased" | "owned" | "insufficient" | "unavailable" {
      try {
        progress = read();
        unavailable = false;
        if (progress.bulwarkOwned) return "owned";
        if (progress.cash < BULWARK_PRICE) return "insufficient";
        write({ ...progress, cash: progress.cash - BULWARK_PRICE, bulwarkOwned: true });
        return "purchased";
      } catch { unavailable = true; return "unavailable"; }
    },
  };
}
