import { pathLength, pathSamples, type StreetClass } from "./lanes.ts";
import { pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import { mix } from "./traffic.ts";
import type { Street } from "./street-path.ts";

/**
 * The kerb anchor: where a prop stands when it belongs to the street rather
 * than to a parcel.
 *
 * Port Alder already had two placement rules and no way to reuse either.
 * `alder-evergreens.ts` scatters trees through authored regions, which is the
 * anchor for anything standing in open ground; the street lamps were the other
 * one, written inline in the renderer — walk each centreline at a fixed
 * spacing, step out past the kerb, skip the ends where the junctions are. That
 * rule is this module, with the constants lifted into a spec so a second prop
 * costs data rather than code.
 *
 * This decides positions only. Nothing here draws, and nothing here collides:
 * poses become geometry in `render/alder.ts`, and a prop that should stop a car
 * has to be added to the sim's solids deliberately, the way an evergreen trunk
 * is. Placement is deterministic and keyed to world position, so re-authoring
 * one street cannot shuffle the props on another.
 */

export interface KerbSpec {
  /** Salts the placement hash; two specs with the same id thin identically. */
  readonly id: string;
  /** Metres between candidate poses, measured along the centreline. */
  readonly spacing: number;
  /** Metres beyond the carriageway edge. The kerb line, not the centre. */
  readonly offset: number;
  /** Metres left clear at each end of a street, which is where junctions are.
   *  Streets only meet at junctions, so their ends are the crossings. */
  readonly clearStart: number;
  readonly clearEnd: number;
  /** 1 is the left kerb walking the points in order, -1 the right. */
  readonly sides: readonly (1 | -1)[];
  /** 0..1. Thins the line deterministically; 1 (the default) keeps every pose. */
  readonly density?: number;
  /** How much room the prop needs; poses closer than this to a solid are
   *  dropped. Needs `solids` to be passed, and defaults to no clearance. */
  readonly radius?: number;
  /** Metres of carriageway to keep out of, measured against every street,
   *  its own included. A prop can sit correctly on its own kerb and still be
   *  in a roadway: inside a bend, where the kerb of one leg is the carriageway
   *  of the other, or in a wider street near a junction. Must be smaller than
   *  `offset`, or a prop rejects itself. Off by default. */
  readonly roadClearance?: number;
  /** Restrict to some road classes. Omitted means every street. */
  readonly kinds?: readonly StreetClass[];
}

export interface KerbPose {
  readonly street: string;
  readonly x: number;
  readonly z: number;
  /** Unit vector from the centreline toward the prop: which way is "out". */
  readonly outX: number;
  readonly outZ: number;
  /** Facing away from the carriageway, in the sim's convention where forward
   *  is (-sin heading, -cos heading). */
  readonly heading: number;
}

/**
 * Keyed to the position rather than to an index, so inserting a street, or
 * re-authoring one, cannot move the props on any other. `mix` is the sim's one
 * integer hash; the renderer's `hash01` is for dressing and differs by engine.
 */
function hashAt(x: number, z: number, salt: string): number {
  let n = Math.imul(Math.round(x * 8), 0x9e3779b1) ^ Math.imul(Math.round(z * 8), 0x85ebca6b);
  for (let i = 0; i < salt.length; i++) n = mix(n ^ salt.charCodeAt(i));
  return mix(n) / 4294967296;
}

export function kerbPoses(streets: readonly Street[], spec: KerbSpec,
  solids: readonly BuildingBlock[] = []): KerbPose[] {
  const radius = spec.radius ?? 0;
  const density = spec.density ?? 1;
  const nearby = radius > 0 && solids.length ? spatialIndex(solids, blockBounds) : null;
  const roadClearance = spec.roadClearance ?? 0;
  const nearRoad = roadClearance > 0 ? spatialIndex(
    streets.flatMap(street => street.points.slice(1).map((b, i) => ({ a: street.points[i]!, b }))),
    ({ a, b }) => {
      const reach = Math.max(a.width, b.width) / 2 + roadClearance;
      return { minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
        minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
    }) : null;
  const poses: KerbPose[] = [];
  for (const street of streets) {
    if (spec.kinds && !spec.kinds.includes(street.kind)) continue;
    const length = pathLength(street.points);
    for (const sample of pathSamples(street.points, spec.spacing)) {
      if (sample.distance < spec.clearStart || sample.distance > length - spec.clearEnd) continue;
      for (const side of spec.sides) {
        // The left normal of the tangent, mirrored for the other kerb. Written
        // this way because the street lamps were, and their poses must not move.
        const outX = -side * sample.dirZ, outZ = side * sample.dirX;
        const reach = sample.width / 2 + spec.offset;
        const x = sample.x + outX * reach, z = sample.z + outZ * reach;
        if (density < 1 && hashAt(x, z, spec.id) >= density) continue;
        if (nearby && nearby(x, z).some(block => pointFootprintDistance(block, x, z) < radius)) continue;
        if (nearRoad && nearRoad(x, z).some(({ a, b }) =>
          segmentDistance(x, z, a, b) < Math.max(a.width, b.width) / 2 + roadClearance)) continue;
        poses.push({ street: street.id, x, z, outX, outZ, heading: Math.atan2(-outX, -outZ) });
      }
    }
  }
  return poses;
}

/** Distance from a point to a segment, the same arithmetic the evergreens use
 *  to keep a trunk out of the road. */
function segmentDistance(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

function blockBounds(block: BuildingBlock) {
  const reach = Math.hypot(block.width, block.depth) / 2 + 4;
  return { minX: block.x - reach, maxX: block.x + reach, minZ: block.z - reach, maxZ: block.z + reach };
}

/** The lamps as the renderer placed them before this module existed, less the
 *  eight that rule stood in a roadway (2026-09-18): one was 8.9 m into Alaskan
 *  Way, on the inside of its bend, drawn in the middle of the road. */
export const ALDER_LAMPS: KerbSpec = {
  id: "lamp", spacing: 55, offset: 1.7, clearStart: 20, clearEnd: 15, sides: [1],
  roadClearance: 0.5,
};

/** The second prop, which is the point: it is only data. Opposite kerb from the
 *  lamps so a street reads as having two sides, thinned so the line is not a
 *  fence, and given room so one never stands inside a wall. */
export const ALDER_BINS: KerbSpec = {
  id: "bin", spacing: 34, offset: 1.35, clearStart: 26, clearEnd: 20, sides: [-1],
  density: 0.55, radius: 1.1, roadClearance: 0.5,
};
