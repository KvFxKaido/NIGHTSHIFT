/**
 * The build a generated course was drawn on. The same seed and start draw a
 * different race when either moves (`GENERATOR_REVISION` for the arithmetic,
 * `ALDER_VERSION` for the map), so anything that stores a course stores this
 * beside it: Moth's accepted stages (`progress.ts`) and the playlist
 * (`playlist.ts`). Null is a course from before builds were recorded.
 */
export interface RaceBuild { generator: string; world: string }

export const sameRaceBuild = (a: RaceBuild | null, b: RaceBuild): boolean =>
  a !== null && a.generator === b.generator && a.world === b.world;
