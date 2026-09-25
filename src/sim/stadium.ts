/**
 * The stadium (working name Wharf Arena, 2026-09-25): the Wharf arena as a venue of its own. It is a world, not a
 * place in Port Alder: entered only by a rival's challenge or by stopping at a marker at one of its gates, and left
 * the same way (Shawn: "treating it like its own enclosed area"). What it holds is the arena's inside, at the same
 * coordinates it has on the map, so Sable's yard, her line and zones carry over without a translation.
 *
 * - The shell is baked before the city's two entrance cuts (`STADIUM_SHELL_MESH`): its original continuous
 *   wall profile is restored, and the visible triangles are the collision. The city is not on the other side.
 * - The floor is dirt, except Sable's apron (`DRIFT_YARD.bounds`) and the circuits' asphalt (`stadium-circuits.ts`).
 *   Since physics v6 dirt costs a 2WD car grip and pace and spares AWD, which is the point of it here
 *   (design/CHAOS.md, "Three grounds").
 * - No streets, no traffic, and nothing of the city's data: a test holds this module's import closure to that, so
 *   the venue can one day load without the 24 MB city.
 *
 * design/VENUES.md has the plan this is the first stage of.
 */
import { STADIUM_SHELL_MESH } from "./stadium-shell.ts";
import { DRIFT_YARD, YARD_STRUCTURES } from "./drift-yard.ts";
import { STADIUM_CIRCUIT, STADIUM_LAYOUT_IDS, onStadiumCircuit, stadiumLap } from "./stadium-circuits.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CourseProjection } from "./track.ts";

type Point = { readonly x: number; readonly z: number };
type Pose = { readonly x: number; readonly y: number; readonly z: number; readonly heading: number; readonly pitch: number };

export const STADIUM = {
  id: "stadium",
  name: "Wharf Arena",
  /** Anything that moves what a car drives on or into here bumps it: the shell, the floor, the solids. */
  revision: 3,
  base: DRIFT_YARD.base,
} as const;

/** The pose that faces along (dx, dz): the sim's forward is (-sin heading, -cos heading). */
const facing = (x: number, z: number, dx: number, dz: number): Pose =>
  ({ x, y: STADIUM.base, z, heading: Math.atan2(-dx, -dz), pitch: 0 });

/** Sable's apron: the venue's paved yard. The circuits are its other asphalt (`onStadiumCircuit`). */
export const STADIUM_PAD = DRIFT_YARD.bounds;

export function onStadiumPad(x: number, z: number): boolean {
  return x >= STADIUM_PAD.minX && x <= STADIUM_PAD.maxX && z >= STADIUM_PAD.minZ && z <= STADIUM_PAD.maxZ;
}

/**
 * The gates, both ways. On the city side a marker at the gate loads the venue, arriving at `venue.arrive`; on the
 * venue side a marker inside the restored wall loads the city, arriving at `city.leave`. Each arrival stands clear of
 * the marker it would otherwise trigger and faces away from it.
 */
export const STADIUM_GATES = [
  { id: "east", name: "East gate",
    city: { marker: { x: -40, z: 910 }, leave: facing(-26, 910, 1, 0) },
    venue: { marker: { x: -113, z: 955 }, arrive: facing(-126, 974, -.569, .822) } },
  { id: "north", name: "North gate",
    city: { marker: { x: -560, z: 842 }, leave: facing(-560, 815, 0, -1) },
    venue: { marker: { x: -560, z: 868 }, arrive: facing(-560, 895, 0, 1) } },
] as const;
export type StadiumGate = (typeof STADIUM_GATES)[number];
export type StadiumGateId = StadiumGate["id"];

/** How close to a gate's marker, and how slow, a car must be for it to offer the other side: stop at it, as at the garage shutter. */
export const STADIUM_MARKER = { radius: 7, speed: 2 } as const;

/** The gate whose marker on `side` this car is stopped at, if any. Never during a race. */
export function stadiumGateAt(side: "city" | "venue", car: { x: number; z: number; speed: number }, raceActive: boolean): StadiumGate | null {
  if (raceActive || Math.abs(car.speed) >= STADIUM_MARKER.speed) return null;
  return STADIUM_GATES.find(gate => Math.hypot(car.x - gate[side].marker.x, car.z - gate[side].marker.z) <= STADIUM_MARKER.radius) ?? null;
}

export function stadiumGate(id: string | null): StadiumGate | null {
  return STADIUM_GATES.find(gate => gate.id === id) ?? null;
}

/**
 * The arena's inner wall at car height: its mesh sliced 1 m above the floor and chained into polylines, longest
 * first. The longest closed loop is the inside of the bowl; the smaller loop is the tall structural feature.
 * Used for the floor, minimap and enclosure tests, never physics, which takes the mesh itself.
 */
export const STADIUM_WALL_LINES: readonly (readonly Point[])[] = (() => {
  const { vertices: v, indices } = STADIUM_SHELL_MESH, y = STADIUM.base + 1;
  const segments: [number, number, number, number][] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const hits: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const i = indices[t + e]! * 3, j = indices[t + (e + 1) % 3]! * 3;
      const ay = v[i + 1]!, by = v[j + 1]!;
      if ((ay - y) * (by - y) < 0) {
        const f = (y - ay) / (by - ay);
        hits.push([v[i]! + (v[j]! - v[i]!) * f, v[i + 2]! + (v[j + 2]! - v[i + 2]!) * f]);
      }
    }
    if (hits.length === 2) segments.push([hits[0]![0], hits[0]![1], hits[1]![0], hits[1]![1]]);
  }
  const key = (x: number, z: number) => `${x.toFixed(1)},${z.toFixed(1)}`;
  const ends = new Map<string, number[]>();
  segments.forEach((s, i) => { for (const k of [key(s[0], s[1]), key(s[2], s[3])]) ends.set(k, [...(ends.get(k) ?? []), i]); });
  const used = new Set<number>(), lines: Point[][] = [];
  segments.forEach((segment, i) => {
    if (used.has(i)) return;
    used.add(i);
    const line: Point[] = [{ x: segment[0], z: segment[1] }, { x: segment[2], z: segment[3] }];
    for (const forward of [true, false]) for (;;) {
      const tip = forward ? line[line.length - 1]! : line[0]!;
      const next = (ends.get(key(tip.x, tip.z)) ?? []).find(j => !used.has(j));
      if (next === undefined) break;
      used.add(next);
      const s = segments[next]!, far = key(s[0], s[1]) === key(tip.x, tip.z) ? { x: s[2], z: s[3] } : { x: s[0], z: s[1] };
      if (forward) line.push(far); else line.unshift(far);
    }
    lines.push(line);
  });
  const length = (line: readonly Point[]) => line.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - line[i - 1]!.x, p.z - line[i - 1]!.z) : 0, 0);
  return lines.sort((a, b) => length(b) - length(a));
})();

/** The continuous inner perimeter. No straight chords across former entrances. */
export const STADIUM_FLOOR: readonly Point[] = STADIUM_WALL_LINES[0]!;

/** Is (x, z) on the bowl's floor? Even-odd over `STADIUM_FLOOR`. */
export function inStadium(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = STADIUM_FLOOR.length - 1; i < STADIUM_FLOOR.length; j = i++) {
    const p = STADIUM_FLOOR[i]!, q = STADIUM_FLOOR[j]!;
    if ((p.z > z) !== (q.z > z) && x < (q.x - p.x) * (z - p.z) / (q.z - p.z) + p.x) inside = !inside;
  }
  return inside;
}

/** The floor is flat and has no road: every point projects onto it, at the floor's height. */
function projectOntoStadium(_x: number, _z: number): CourseProjection {
  return { along: 0, segmentIndex: 0, distance: 0, height: STADIUM.base, pitch: 0, ux: 1, uz: 0, width: 2000, gradeX: 0, gradeZ: 0 };
}

/**
 * What a car here drives on and into, as a string: the shell, the pad, the circuits, the solids. Hashed, it names the
 * venue for anything that must refuse another one (a recording, a stored course), without a token someone has to
 * remember to bump (design/CHAOS.md: paving had none, and the yard's re-surfacing could not have been caught).
 * Numbers go through `toFixed`, which the language fixes exactly, so a browser and Node name it alike.
 */
function stadiumFingerprint(): string {
  const parts = [
    STADIUM_SHELL_MESH.vertices.map(n => n.toFixed(2)).join(","), STADIUM_SHELL_MESH.indices.join(","),
    JSON.stringify(STADIUM_PAD), JSON.stringify(YARD_STRUCTURES.map(s => [s.x, s.z, s.width, s.depth, s.height, s.base])),
    // The circuits' asphalt: where the floor stops being dirt.
    `${STADIUM_CIRCUIT.width},${STADIUM_CIRCUIT.shoulder}`,
    ...STADIUM_LAYOUT_IDS.map(id => stadiumLap(id).points.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(";")),
  ];
  let hash = 2166136261;
  for (const part of parts) for (let i = 0; i < part.length; i++) hash = Math.imul(hash ^ part.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export const STADIUM_VERSION = `${STADIUM.id}-v${STADIUM.revision}-${stadiumFingerprint()}`;

/** The venue as the sim takes it. `from` is where the car stands: a gate's arrival, or an event's grid. */
export function createStadiumWorld(from: Pose = STADIUM_GATES[0].venue.arrive): RoadWorld {
  return {
    id: STADIUM_VERSION,
    start: from,
    walls: [],
    solids: YARD_STRUCTURES,
    meshes: [STADIUM_SHELL_MESH],
    project: projectOntoStadium,
    ground: (x, z) => !onStadiumPad(x, z) && !onStadiumCircuit(x, z),
    grade: () => ({ gradeX: 0, gradeZ: 0 }),
  };
}
