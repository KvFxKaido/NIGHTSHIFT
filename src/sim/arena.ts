/**
 * Ridge Circuit (working name): an official circuit on the open ground east of
 * Ridge Scenic Way, reached by Pine East. It exists to be driven the same way
 * many times, so a lap can be recorded and the rival tuned against it, and it
 * becomes events and progression afterwards (2026-09-13).
 *
 * One facility, three layouts. Every layout is a closed polygon of named
 * corners, each rounded to a radius, so a layout closes by construction and a
 * corner shared by two layouts is the same asphalt in both. The link road down
 * the middle splits the site into a flat east half and a hillside west half.
 *
 * The edges are open (the product direction: no unnecessary barriers). Grass
 * costs a 2WD car grip and pace like anywhere in Port Alder, and the race gates
 * are placed so the infield is not a shortcut worth taking.
 *
 * Plan geometry only; nothing here knows the terrain. `alder.ts` gives the
 * paths their height, which keeps this module free of the map it sits on.
 */

import { circuitLap, type CircuitCorner, type CircuitLap } from "./circuit-plan.ts";

export const ARENA = {
  id: "ridge-circuit",
  name: "Ridge Circuit",
  /**
   * The layout's revision. Anything that moves the asphalt bumps it, and a lap
   * recording names the revision it was driven on, so an old recording is
   * refused instead of compared against a circuit it never saw. 2 (2026-09-13):
   * the esses became a chicane, because the first ones were flat for the player.
   */
  revision: 2,
  /** Racing width: the edge lines are this far apart. */
  width: 14,
  /** Paved shoulder past each edge line, where the kerbs sit. Beyond it is ground. */
  shoulder: 1.5,
} as const;

/** The circuit as a recording names it: which layout revision a lap was driven on. */
export const ARENA_IDENTITY = `${ARENA.id}-v${ARENA.revision}`;

/** Corner positions in world metres (x east, z south). */
export const ARENA_CORNERS = {
  "main-straight": { x: 3290, z: -850 },
  "t1-entry": { x: 3290, z: -1450 },
  "t1-exit": { x: 3240, z: -1450 },
  t2: { x: 3240, z: -1300 },
  // A chicane, 40 m across in 60 m, with 150 m of straight from T2 to brake in.
  // The first esses (18 m across in 60 m, right after T2) were taken flat on
  // the recorded laps while the rival braked to 30 mph for them.
  "esses-in": { x: 3070, z: -1300 },
  "esses-mid": { x: 3040, z: -1340 },
  "esses-out": { x: 3010, z: -1300 },
  "north-junction": { x: 2950, z: -1300 },
  t5: { x: 2620, z: -1300 },
  "jog-in": { x: 2620, z: -1130 },
  "jog-out": { x: 2680, z: -1130 },
  drop: { x: 2680, z: -760 },
  kink: { x: 2840, z: -760 },
  "south-junction": { x: 2950, z: -790 },
  t9: { x: 3180, z: -790 },
} as const;
export type ArenaCornerId = keyof typeof ARENA_CORNERS;
export type ArenaLayoutId = "full" | "east" | "ridge";

export interface ArenaLayout {
  readonly id: ArenaLayoutId;
  readonly name: string;
  /** Corners in driving order with the radius each is rounded to; 0 is a straight-through vertex. */
  readonly corners: readonly (readonly [ArenaCornerId, number])[];
  /** A point on a straight: the start/finish line. Laps run from it, in corner order. */
  readonly line: { readonly x: number; readonly z: number };
  /** Race gates, in order, as points the centreline is snapped to. The finish line is added after them. */
  readonly gates: readonly { readonly name: string; readonly x: number; readonly z: number }[];
}

const T1_EXIT = { name: "T1 hairpin", x: 3240, z: -1380 };
const ESSES_EXIT = { name: "Esses", x: 2985, z: -1300 };
const T5_EXIT = { name: "Ridge 90", x: 2620, z: -1200 };
const JOG_EXIT = { name: "The Jog", x: 2680, z: -1060 };
const DROP_EXIT = { name: "The Drop", x: 2803, z: -760 };
const SOUTH_STRAIGHT = { name: "South straight", x: 3060, z: -790 };

export const ARENA_LAYOUTS: Readonly<Record<ArenaLayoutId, ArenaLayout>> = {
  full: {
    id: "full", name: "Full",
    corners: [["main-straight", 40], ["t1-entry", 22], ["t1-exit", 22], ["t2", 26], ["esses-in", 20], ["esses-mid", 18],
      ["esses-out", 20], ["north-junction", 0], ["t5", 55], ["jog-in", 16], ["jog-out", 16], ["drop", 120], ["kink", 250],
      ["south-junction", 250], ["t9", 150]],
    line: { x: 3290, z: -1000 },
    gates: [T1_EXIT, ESSES_EXIT, T5_EXIT, JOG_EXIT, DROP_EXIT, SOUTH_STRAIGHT],
  },
  east: {
    id: "east", name: "East",
    corners: [["main-straight", 40], ["t1-entry", 22], ["t1-exit", 22], ["t2", 26], ["esses-in", 20], ["esses-mid", 18],
      ["esses-out", 20], ["north-junction", 20], ["south-junction", 20], ["t9", 150]],
    line: { x: 3290, z: -1000 },
    gates: [T1_EXIT, ESSES_EXIT, { name: "Link road", x: 2950, z: -1050 }, SOUTH_STRAIGHT],
  },
  ridge: {
    id: "ridge", name: "Ridge",
    corners: [["north-junction", 20], ["t5", 55], ["jog-in", 16], ["jog-out", 16], ["drop", 120], ["kink", 250], ["south-junction", 20]],
    line: { x: 2950, z: -1000 },
    gates: [{ name: "Climb", x: 2780, z: -1300 }, T5_EXIT, JOG_EXIT, DROP_EXIT],
  },
};

/** Pine East continued past Ridge Scenic Way's carriageway to the circuit's west side. */
export const ARENA_ACCESS = { from: { x: 2470, z: -1000 }, to: { x: 2680, z: -1000 }, width: 12 } as const;

/** A corner of a lap: its arc's place round the lap from the line. */
export type ArenaCorner = CircuitCorner<ArenaCornerId>;
export type ArenaLap = CircuitLap<ArenaCornerId, ArenaLayout>;

const laps = new Map<ArenaLayoutId, ArenaLap>();
/** A layout's lap, sampled from its start/finish line (circuit-plan.ts, which this construction became). */
export function arenaLap(id: ArenaLayoutId): ArenaLap {
  const cached = laps.get(id);
  if (cached) return cached;
  const lap = circuitLap(ARENA_CORNERS, ARENA_LAYOUTS[id]);
  laps.set(id, lap);
  return lap;
}

export const ARENA_LAYOUT_IDS = Object.keys(ARENA_LAYOUTS) as ArenaLayoutId[];

/** Plan bounds of every layout and the access road, before width. */
export const ARENA_BOUNDS = (() => {
  const xs: number[] = [ARENA_ACCESS.from.x, ARENA_ACCESS.to.x], zs: number[] = [ARENA_ACCESS.from.z, ARENA_ACCESS.to.z];
  for (const id of ARENA_LAYOUT_IDS) for (const p of arenaLap(id).points) { xs.push(p.x); zs.push(p.z); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
})();

/** Is (x, z) within `margin` of the arena's plan bounds? A cheap first test before any path is asked. */
export function nearArena(x: number, z: number, margin: number): boolean {
  return x >= ARENA_BOUNDS.minX - margin && x <= ARENA_BOUNDS.maxX + margin
    && z >= ARENA_BOUNDS.minZ - margin && z <= ARENA_BOUNDS.maxZ + margin;
}
