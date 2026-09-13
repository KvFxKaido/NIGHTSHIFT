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

type Primitive =
  | { kind: "line"; ax: number; az: number; bx: number; bz: number; length: number }
  | { kind: "arc"; cx: number; cz: number; radius: number; start: number; sweep: number; length: number };

export interface ArenaCorner {
  readonly id: ArenaCornerId;
  readonly radius: number;
  /** Signed turn in radians: positive turns toward +x of a car heading -z (right). */
  readonly turn: number;
  /** Distance round the lap, from the line, where the corner's arc begins and ends. */
  readonly from: number;
  readonly to: number;
}

export interface ArenaLap {
  readonly layout: ArenaLayout;
  /** Plan-view samples from the line round to just before it; the lap closes back to points[0]. */
  readonly points: readonly { readonly x: number; readonly z: number }[];
  /** Distance round the lap of each sample. */
  readonly along: readonly number[];
  readonly length: number;
  /** Distance round the lap of each gate, the finish (= length) last. */
  readonly gates: readonly { readonly name: string; readonly along: number; readonly x: number; readonly z: number }[];
  readonly corners: readonly ArenaCorner[];
}

function primitives(layout: ArenaLayout): { parts: Primitive[]; corners: { id: ArenaCornerId; radius: number; turn: number; arc: number }[] } {
  const n = layout.corners.length;
  const tangent: { a: { x: number; z: number }; b: { x: number; z: number }; arc: Primitive | null; turn: number }[] = [];
  for (let k = 0; k < n; k++) {
    const [id, radius] = layout.corners[k]!;
    const p = ARENA_CORNERS[layout.corners[(k + n - 1) % n]![0]], c = ARENA_CORNERS[id], q = ARENA_CORNERS[layout.corners[(k + 1) % n]![0]];
    const l1 = Math.hypot(c.x - p.x, c.z - p.z), l2 = Math.hypot(q.x - c.x, q.z - c.z);
    const d1 = { x: (c.x - p.x) / l1, z: (c.z - p.z) / l1 }, d2 = { x: (q.x - c.x) / l2, z: (q.z - c.z) / l2 };
    const cross = d1.x * d2.z - d1.z * d2.x;
    const theta = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z)));
    // In x-east, z-south plan coordinates a positive cross product is a right turn.
    const side = cross >= 0 ? 1 : -1;
    if (radius <= 0 || theta < 1e-9) { tangent.push({ a: c, b: c, arc: null, turn: side * theta }); continue; }
    const t = radius * Math.tan(theta / 2);
    const a = { x: c.x - d1.x * t, z: c.z - d1.z * t }, b = { x: c.x + d2.x * t, z: c.z + d2.z * t };
    const cx = a.x - d1.z * side * radius, cz = a.z + d1.x * side * radius;
    tangent.push({ a, b, turn: side * theta,
      arc: { kind: "arc", cx, cz, radius, start: Math.atan2(a.z - cz, a.x - cx), sweep: side * theta, length: radius * theta } });
  }
  const parts: Primitive[] = [];
  const corners: { id: ArenaCornerId; radius: number; turn: number; arc: number }[] = [];
  for (let k = 0; k < n; k++) {
    const here = tangent[k]!, next = tangent[(k + 1) % n]!;
    if (here.arc) { corners.push({ id: layout.corners[k]![0], radius: layout.corners[k]![1], turn: here.turn, arc: parts.length }); parts.push(here.arc); }
    const length = Math.hypot(next.a.x - here.b.x, next.a.z - here.b.z);
    // Two corners whose tangents overlap would draw a straight that runs backwards.
    const forward = (next.a.x - here.b.x) * (ARENA_CORNERS[layout.corners[(k + 1) % n]![0]].x - ARENA_CORNERS[layout.corners[k]![0]].x)
      + (next.a.z - here.b.z) * (ARENA_CORNERS[layout.corners[(k + 1) % n]![0]].z - ARENA_CORNERS[layout.corners[k]![0]].z);
    if (forward < -1e-6) throw new RangeError(`${layout.id}: corners ${layout.corners[k]![0]} and ${layout.corners[(k + 1) % n]![0]} overlap`);
    if (length > 1e-6) parts.push({ kind: "line", ax: here.b.x, az: here.b.z, bx: next.a.x, bz: next.a.z, length });
  }
  return { parts, corners };
}

function pointOn(part: Primitive, s: number): { x: number; z: number } {
  if (part.kind === "line") {
    const t = s / part.length;
    return { x: part.ax + (part.bx - part.ax) * t, z: part.az + (part.bz - part.az) * t };
  }
  const angle = part.start + part.sweep * (s / part.length);
  return { x: part.cx + Math.cos(angle) * part.radius, z: part.cz + Math.sin(angle) * part.radius };
}

/** Spacing of samples: arcs are sampled finely, straights coarsely enough to follow the terrain. */
const ARC_STEP = 3, LINE_STEP = 5;

const laps = new Map<ArenaLayoutId, ArenaLap>();
/** A layout's lap, sampled from its start/finish line. */
export function arenaLap(id: ArenaLayoutId): ArenaLap {
  const cached = laps.get(id);
  if (cached) return cached;
  const layout = ARENA_LAYOUTS[id];
  const { parts, corners } = primitives(layout);
  const offsets = [0];
  for (const part of parts) offsets.push(offsets.at(-1)! + part.length);
  const total = offsets.at(-1)!;
  // Where a point lands round the unrotated loop: the nearest point on any primitive.
  const locate = (x: number, z: number) => {
    let best = { distance: Infinity, s: 0 };
    parts.forEach((part, i) => {
      let s: number;
      if (part.kind === "line") {
        const dx = part.bx - part.ax, dz = part.bz - part.az;
        s = Math.max(0, Math.min(part.length, ((x - part.ax) * dx + (z - part.az) * dz) / part.length));
      } else {
        let angle = Math.atan2(z - part.cz, x - part.cx) - part.start;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        s = Math.max(0, Math.min(part.length, angle / part.sweep * part.length));
      }
      const p = pointOn(part, s), distance = Math.hypot(p.x - x, p.z - z);
      if (distance < best.distance) best = { distance, s: offsets[i]! + s };
    });
    if (best.distance > 1) throw new RangeError(`${id}: (${x}, ${z}) is ${best.distance.toFixed(1)} m off the centreline`);
    return best.s;
  };
  const origin = locate(layout.line.x, layout.line.z);
  const lapOf = (s: number) => ((s - origin) % total + total) % total;
  const gateAlong = layout.gates.map(gate => ({ ...gate, along: lapOf(locate(gate.x, gate.z)) }));
  for (let i = 1; i < gateAlong.length; i++) {
    if (gateAlong[i]!.along <= gateAlong[i - 1]!.along) throw new RangeError(`${id}: gate ${gateAlong[i]!.name} is out of order`);
  }
  // Sample distances in loop terms: every primitive's ends and subdivisions, and the gates exactly.
  const exact = [0, ...gateAlong.map(gate => gate.along)];
  const stops = [...exact];
  parts.forEach((part, i) => {
    const count = Math.max(1, Math.ceil(part.length / (part.kind === "arc" ? ARC_STEP : LINE_STEP)));
    for (let k = 0; k < count; k++) {
      const s = lapOf(offsets[i]! + part.length * k / count);
      // A subdivision this close to the line or a gate would only be a sliver segment.
      if (exact.every(e => Math.abs(s - e) > 0.5 && Math.abs(s - e - total) > 0.5)) stops.push(s);
    }
  });
  const along = stops.sort((a, b) => a - b);
  const at = (lap: number) => {
    let s = (lap + origin) % total;
    let i = 0;
    while (i < parts.length - 1 && offsets[i + 1]! <= s) i++;
    s -= offsets[i]!;
    return pointOn(parts[i]!, Math.min(parts[i]!.length, s));
  };
  const points = along.map(at);
  const gates = [...gateAlong.map(gate => ({ name: gate.name, along: gate.along, ...at(gate.along) })),
    { name: "Finish", along: total, x: points[0]!.x, z: points[0]!.z }];
  const lapCorners = corners.map(corner => {
    const from = lapOf(offsets[corner.arc]!);
    return { id: corner.id, radius: corner.radius, turn: corner.turn, from, to: from + parts[corner.arc]!.length };
  });
  const lap: ArenaLap = { layout, points, along, length: total, gates, corners: lapCorners };
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
