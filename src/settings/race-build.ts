/**
 * The build a generated course was drawn on. The same seed and start draw a
 * different race when either moves (`GENERATOR_REVISIONS` for its kind's
 * arithmetic, `ALDER_VERSION` for the map), so anything that stores a course
 * stores this beside it: Moth's accepted stages (`progress.ts`) and the playlist
 * (`playlist.ts`). Null is a course from before builds were recorded.
 */
export interface RaceBuild { generator: string; world: string }
/** This build's identity for a course, which depends on the course's kind. */
export type RaceBuildFor = (raceId: string) => RaceBuild;

export const sameRaceBuild = (a: RaceBuild | null, b: RaceBuild): boolean =>
  a !== null && a.generator === b.generator && a.world === b.world;

/** A fixed build (tests, one-kind callers) or a per-kind one, as a function. */
export const raceBuildFor = (build: RaceBuild | RaceBuildFor): RaceBuildFor =>
  typeof build === "function" ? build : () => build;
