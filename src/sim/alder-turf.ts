/**
 * The Blacklist's turfs on Port Alder (design/BLACKLIST.md, "The ten"): where
 * each name's generated races lean (design/PROCEDURAL_RACES.md, step 2).
 *
 * A turf is a centre and a radius, and the draw's pull toward it is soft
 * (`GENERATOR.turf`): a leg scores higher the more of its route lies inside, so
 * a race leans home and can still leave. Geography only; street taste (Stray's
 * alleys, Crest's climbs) is a separate proposal.
 *
 * Every centre comes from the map, never a typed coordinate, so an edit that
 * moves a street or a yard moves the turf with it: Moth's cruise loop, Rivet's
 * strip, Sable's yard, the Broadcast Tower, named streets, and the map's own
 * neighbourhood labels. Tally's turf is the whole city, which is no pull at all,
 * so her draws are plain `gen-<seed>` races and she has no entry here.
 *
 * Only Moth's stages draw with a turf today. The rest are data until each name
 * has a challenge; `pnpm alder:turf` measures what they would draw.
 */
import landmarks from "./alder-landmarks.json" with { type: "json" };
import { ALDER_DATA, ALDER_STREETS } from "./alder.ts";
import { RIVET } from "./drag-event.ts";
import { DRIFT_YARD } from "./drift-yard.ts";
import { ALDER_CRUISE } from "./encounter.ts";
import type { Turf } from "./race-generator.ts";

export interface RivalTurf extends Turf {
  /** The Blacklist name the turf belongs to. */
  readonly name: string;
  /** The turf as BLACKLIST.md names it. */
  readonly place: string;
  /** What the centre is taken from. */
  readonly anchor: string;
}

/** Metres. A race is about 3.2 km of legs 400-1,400 m long, so a turf this size holds a leg or two of one. */
export const TURF_RADIUS = 800;

type Point = { x: number; z: number };
const centroid = (points: readonly Point[], what: string): Point => {
  if (!points.length) throw new Error(`Turf anchor ${what} has no points on this map`);
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length };
};
const streets = (...names: string[]) => centroid(ALDER_STREETS.filter(s => names.includes(s.name)).flatMap(s => s.points), names.join(", "));
const label = (name: string) => centroid(ALDER_DATA.neighborhoods.filter(n => n.name === name).map(n => ({ x: n.x, z: n.z })), name);
const turf = (id: string, name: string, place: string, anchor: string, centre: Point): RivalTurf =>
  ({ id, name, place, anchor, centre: { x: Math.round(centre.x), z: Math.round(centre.z) }, radius: TURF_RADIUS });

export const ALDER_TURFS: readonly RivalTurf[] = [
  turf("moth", "Moth", "SoDo freight block", "her cruise loop", centroid(ALDER_CRUISE.points, "Moth's cruise")),
  turf("stray", "Stray", "Alder Center alleys", "Pike St, Union St, 2nd Ave and 4th Ave", streets("Pike St", "Union St", "2Nd Ave", "4Th Ave")),
  turf("rivet", "Rivet", "Harbor Quarter", "her quarter-mile", RIVET.start),
  turf("bollard", "Bollard", "Elliott Avenue waterfront", "Elliott Ave", streets("Elliott Ave")),
  turf("deuce", "Deuce", "Belltown, Broadcast Tower loop", "the Broadcast Tower", landmarks.broadcastTower),
  turf("sable", "Sable", "South Wharf drift yard", "the drift yard", DRIFT_YARD.start),
  turf("plumb", "Plumb", "Madrona Ridge", "the MADRONA RIDGE map label", label("MADRONA RIDGE")),
  turf("crest", "Crest", "Queen Anne climb", "Queen Anne Climb", streets("Queen Anne Climb")),
  turf("wake", "Wake", "Capitol Hill", "the CAPITOL HILL map label", label("CAPITOL HILL")),
];

export function turfFor(id: string): RivalTurf | null {
  return ALDER_TURFS.find(t => t.id === id) ?? null;
}
