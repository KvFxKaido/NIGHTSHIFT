/**
 * The stadium's circuits (2026-09-25, design/VENUES.md, "The circuits, as drawn"): two layouts over one set of named
 * corners, tight where Ridge Circuit is fast. 12 m wide with 1.5 m shoulders, corners of 18 to 25 m, four runs across
 * the bowl's middle weaving past Sable's warehouse and container. Built with Ridge's construction (circuit-plan.ts).
 *
 * A gate at every turn, as on Uptown Circuit: the runs lie 60 to 95 m apart across dirt that an AWD car does not pay
 * for, and across Sable's asphalt that nobody pays for, so fewer gates would make a cut the quicker lap.
 *
 * Plan geometry only, and flat: the venue's floor is level (stadium.ts).
 */
import { circuitLap, type CircuitLap, type CircuitLayout, type PlanPoint } from "./circuit-plan.ts";

export const STADIUM_CIRCUIT = {
  id: "stadium-circuits",
  /** Anything that moves the asphalt bumps it: a lap recording names it (`STADIUM_CIRCUIT_IDENTITY`). */
  revision: 1,
  /** Racing width: the edge lines are this far apart. */
  width: 12,
  /** Paved shoulder past each edge line. Beyond it is the venue's dirt. */
  shoulder: 1.5,
  /** A gate is missed only by leaving the track at it: 6 m to the edge, 4 m of dirt past it. */
  gateRadius: 10,
} as const;

/** The circuits as a recording names them. */
export const STADIUM_CIRCUIT_IDENTITY = `${STADIUM_CIRCUIT.id}-v${STADIUM_CIRCUIT.revision}`;

/** Corner positions in world metres (x east, z south), and what each is called at its gate. */
export const STADIUM_CORNERS = {
  "race-control": { x: -722, z: 1003 },
  climb: { x: -645, z: 893 },
  "north-yard": { x: -455, z: 890 },
  "yard-drop": { x: -455, z: 985 },
  "east-top": { x: -215, z: 985 },
  "east-foot": { x: -215, z: 1062 },
  container: { x: -440, z: 1062 },
  dock: { x: -440, z: 1115 },
  floods: { x: -665, z: 1115 },
  "back-in": { x: -665, z: 1055 },
  "west-foot": { x: -1020, z: 1055 },
  "west-top": { x: -1020, z: 1003 },
} as const satisfies Record<string, PlanPoint>;
export type StadiumCornerId = keyof typeof STADIUM_CORNERS;
const CORNER_NAMES: Record<StadiumCornerId, string> = {
  "race-control": "Race control", climb: "The climb", "north-yard": "North yard", "yard-drop": "Yard drop",
  "east-top": "East top", "east-foot": "East foot", container: "Container", dock: "Dock", floods: "Floods",
  "back-in": "Back in", "west-foot": "West foot", "west-top": "West top",
};

export type StadiumLayoutId = "full" | "short";
type StadiumLayout = CircuitLayout<StadiumCornerId, StadiumLayoutId>;
export type StadiumLap = CircuitLap<StadiumCornerId, StadiumLayout>;

/** The layouts, gates left to `stadiumLap`, which puts one at every turn. */
const LAYOUTS: Readonly<Record<StadiumLayoutId, Omit<StadiumLayout, "gates">>> = {
  full: {
    id: "full", name: "Full", line: { x: -830, z: 1003 },
    corners: [["race-control", 20], ["climb", 25], ["north-yard", 22], ["yard-drop", 18], ["east-top", 22], ["east-foot", 22],
      ["container", 18], ["dock", 18], ["floods", 20], ["back-in", 18], ["west-foot", 22], ["west-top", 22]],
  },
  short: {
    id: "short", name: "Short", line: { x: -560, z: 891.7 },
    corners: [["climb", 22], ["north-yard", 22], ["yard-drop", 18], ["east-top", 22], ["east-foot", 22], ["container", 18],
      ["dock", 18], ["floods", 20]],
  },
};
export const STADIUM_LAYOUT_IDS = Object.keys(LAYOUTS) as StadiumLayoutId[];

const laps = new Map<StadiumLayoutId, StadiumLap>();
/**
 * A layout's lap, with a gate at the middle of every turn's arc. The arcs are found by laying the lap out once
 * without gates; a gate is then any point on that centreline, which the construction snaps back onto its line.
 */
export function stadiumLap(id: StadiumLayoutId): StadiumLap {
  const cached = laps.get(id);
  if (cached) return cached;
  const layout = LAYOUTS[id];
  const bare = circuitLap(STADIUM_CORNERS, { ...layout, gates: [] });
  const pointAt = (s: number) => {
    let i = 1;
    while (i < bare.along.length - 1 && bare.along[i]! < s) i++;
    const a = bare.points[i - 1]!, b = bare.points[i]!, t = (s - bare.along[i - 1]!) / (bare.along[i]! - bare.along[i - 1]!);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  const gates = [...bare.corners].sort((a, b) => a.from - b.from)
    .map(corner => ({ name: CORNER_NAMES[corner.id], ...pointAt((corner.from + corner.to) / 2) }));
  const lap = circuitLap(STADIUM_CORNERS, { ...layout, gates });
  laps.set(id, lap);
  return lap;
}

/**
 * Is (x, z) on either circuit's asphalt, shoulders included? Both layouts are laid in the venue whichever is raced,
 * so this is the venue's paving beside Sable's apron. A 20 m grid of the laps' segments keeps it to a few distance
 * tests: the sim asks it at every tyre on every tick.
 */
export const onStadiumCircuit = (() => {
  const reach = STADIUM_CIRCUIT.width / 2 + STADIUM_CIRCUIT.shoulder, cell = 20;
  const grid = new Map<string, [number, number, number, number][]>();
  for (const id of STADIUM_LAYOUT_IDS) {
    const points = stadiumLap(id).points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      const cells = new Set<string>();
      for (const p of [a, b]) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        cells.add(`${Math.floor(p.x / cell) + dx},${Math.floor(p.z / cell) + dz}`);
      }
      for (const key of cells) grid.set(key, [...(grid.get(key) ?? []), [a.x, a.z, b.x, b.z]]);
    }
  }
  return (x: number, z: number): boolean => (grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []).some(([ax, az, bx, bz]) => {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(ax + dx * t - x, az + dz * t - z) <= reach;
  });
})();
