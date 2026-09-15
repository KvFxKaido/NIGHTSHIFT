import type { PlayerCarId } from "../customization/cars.ts";
import type { GeneratedKind } from "../sim/race-id.ts";

/**
 * The Blacklist as a career (design/BLACKLIST.md, GDD §5; phase 2, 2026-09-15):
 * ten names climbed from #10 to #1, one at a time. Shawn's calls: the next name
 * opens as soon as the one below is beaten; every name has three stages, two
 * wins and a pink slip, all in its signature race; stage wins pay $750 at #10
 * and $250 more per place up, pink slips double; beating a name hands over its
 * car and takes it off the map.
 *
 * Moth keeps the stages she already had (sprint, circuit rematch, unordered pink
 * slip), since saves already hold them. Rivet's stages are three drags, and
 * Sable's three drifts whose score target rises; neither is a generated race, so
 * neither stores a course. Blacklist challenges with no race type of their own
 * yet use the nearest that exists, as their cruising races do (alder-cruisers.ts).
 *
 * Data only: no sim import, so the career store and its tests stay light. The ids
 * of the drag and drift events are the sim's, and a test holds them to it.
 */
export type StageKind = GeneratedKind | "drag" | "drift";
export interface Stage {
  readonly name: string;
  readonly kind: StageKind;
  /** The authored race a drag or drift stage runs; generated stages draw theirs. */
  readonly event?: string;
}
export interface BlacklistName {
  readonly id: string;
  /** 10 is the bottom of the list, where the career starts; 1 is Tally. */
  readonly rank: number;
  readonly name: string;
  /** The car handed over when this name is beaten, and its display name. */
  readonly car: PlayerCarId;
  readonly carName: string;
  readonly stages: readonly [Stage, Stage, Stage];
}

const signature = (kind: GeneratedKind): readonly [Stage, Stage, Stage] =>
  [{ name: "First win", kind }, { name: "Second win", kind }, { name: "Pink slip", kind }];

export const SABLE_DRIFT_TARGETS = [3000, 3600, 4200] as const;
/** Sable's stage event ids: her yard at a rising score target. The first is the drift the yard has always run. */
export const sableDriftId = (stage: number) => stage === 0 ? "sable-yard-drift" : `sable-yard-drift-${stage + 1}`;

/** In list order, #10 first. */
export const BLACKLIST: readonly BlacklistName[] = [
  { id: "moth", rank: 10, name: "Moth", car: "kestrel", carName: "Kestrel",
    stages: [{ name: "First meeting", kind: "sprint" }, { name: "Rematch", kind: "circuit" }, { name: "Pink slip", kind: "unordered" }] },
  { id: "stray", rank: 9, name: "Stray", car: "latch", carName: "Latch", stages: signature("unordered") },
  { id: "rivet", rank: 8, name: "Rivet", car: "hammer", carName: "Hammer",
    stages: [{ name: "First win", kind: "drag", event: "rivet-quarter-mile" }, { name: "Second win", kind: "drag", event: "rivet-quarter-mile" },
      { name: "Pink slip", kind: "drag", event: "rivet-quarter-mile" }] },
  { id: "bollard", rank: 7, name: "Bollard", car: "breakwater", carName: "Breakwater", stages: signature("sprint") },
  { id: "deuce", rank: 6, name: "Deuce", car: "wager", carName: "Wager", stages: signature("sprint") },
  { id: "sable", rank: 5, name: "Sable", car: "ns01", carName: "NS-01",
    stages: [{ name: "First win", kind: "drift", event: sableDriftId(0) }, { name: "Second win", kind: "drift", event: sableDriftId(1) },
      { name: "Pink slip", kind: "drift", event: sableDriftId(2) }] },
  { id: "plumb", rank: 4, name: "Plumb", car: "meridian", carName: "Meridian", stages: signature("circuit") },
  { id: "crest", rank: 3, name: "Crest", car: "skim", carName: "Skim", stages: signature("sprint") },
  { id: "wake", rank: 2, name: "Wake", car: "reign", carName: "Reign", stages: signature("sprint") },
  { id: "tally", rank: 1, name: "Tally", car: "vesper", carName: "Vesper", stages: signature("unordered") },
];

export function blacklistName(id: string | null | undefined): BlacklistName | null {
  return BLACKLIST.find(name => name.id === id) ?? null;
}

/** A stage win at this rank: $750 at #10, $250 more per place up; the pink slip (stage 3) pays double. */
export function stagePayout(rank: number, stage: number): number {
  const win = 750 + 250 * (10 - rank);
  return stage === 2 ? win * 2 : win;
}
