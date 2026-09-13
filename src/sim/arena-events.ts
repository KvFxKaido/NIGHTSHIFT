/**
 * Ridge Circuit races: one per layout, laps of ordered gates, the rival on the
 * centreline. The centreline is not a racing line and is not meant to be one:
 * it is the baseline the rival starts from, and laps recorded here are what
 * teach it better (design/PORT_ALDER.md, "Ridge Circuit").
 */
import { ARENA_ROADS, alderHeight } from "./alder.ts";
import { ARENA, ARENA_LAYOUT_IDS, arenaLap, type ArenaLayoutId } from "./arena.ts";
import type { Checkpoint, RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";
import type { LapTrack } from "./lap-recorder.ts";
import { withRacingLine } from "./racing-line.ts";

export const ARENA_LAPS = 3;
/** Gates are on the track: the racing width is 14 m, so a gate this wide is missed only by leaving it. */
export const ARENA_GATE_RADIUS = 12;
/** Three seconds at the fixed tick. */
const COUNTDOWN_TICKS = 180;
/** Road the rival keeps driving past the flag, so it has somewhere to stop. */
const RUN_OFF = 150;
/** Grid slots: the player a little behind on the right, the rival ahead on the left. */
const GRID = { player: { back: 12, right: 3.5 }, rival: { back: 5, right: -3.5 } } as const;

export interface ArenaEvent {
  readonly layout: ArenaLayoutId;
  /** Solo runs the same race with nobody else on the circuit, so a recorded lap is the player's alone. */
  readonly solo: boolean;
  readonly race: RaceDefinition;
  /** Null when solo. */
  readonly rival: RivalDefinition | null;
  /** What a lap recorder measures laps against: the layout's closed centreline. */
  readonly track: LapTrack;
  /** The player's grid slot. */
  readonly start: RoadWorld["start"];
}

/** `arena-<layout>`, or `arena-<layout>-solo` for the same race with no rival. */
export const arenaRaceId = (layout: ArenaLayoutId, solo = false) => `arena-${layout}${solo ? "-solo" : ""}`;
export function arenaRaceFor(raceId: string): { layout: ArenaLayoutId; solo: boolean } | null {
  for (const layout of ARENA_LAYOUT_IDS) for (const solo of [false, true]) {
    if (arenaRaceId(layout, solo) === raceId) return { layout, solo };
  }
  return null;
}
export const arenaLayoutForRace = (raceId: string): ArenaLayoutId | null => arenaRaceFor(raceId)?.layout ?? null;

const point = (x: number, z: number): CoursePoint => ({ x, z, y: alderHeight(x, z), width: ARENA.width, zone: "boulevard" });

export function arenaEvent(layout: ArenaLayoutId, laps = ARENA_LAPS, solo = false): ArenaEvent {
  if (!Number.isInteger(laps) || laps < 1) throw new RangeError(`An arena race needs whole laps, not ${laps}`);
  const lap = arenaLap(layout);
  const line = lap.points[0]!, next = lap.points[1]!;
  const run = Math.hypot(next.x - line.x, next.z - line.z);
  const ux = (next.x - line.x) / run, uz = (next.z - line.z) / run;
  const heading = Math.atan2(-ux, -uz);
  const pitch = Math.atan((alderHeight(line.x + ux, line.z + uz) - alderHeight(line.x - ux, line.z - uz)) / 2);
  const slot = ({ back, right }: { back: number; right: number }) => {
    const x = line.x - ux * back - uz * right, z = line.z - uz * back + ux * right;
    return { x, z, y: alderHeight(x, z), heading, pitch };
  };
  const start = slot(GRID.player), rivalStart = slot(GRID.rival);

  // The grid slot, every lap's samples, the flag, then the run-off: the next lap's opening metres.
  const plan = [rivalStart, ...Array.from({ length: laps }, () => lap.points).flat(),
    ...lap.points.filter((_, i) => i === 0 || lap.along[i]! <= RUN_OFF)];
  const points = plan.map(p => point(p.x, p.z));
  // Along the polyline as drawn, chord by chord, the way every rival route measures it.
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  // Every gate is a sample of the lap, so each lap's gate is an index into the line; the finish is the next lap's first sample.
  const n = lap.points.length;
  const gates = Array.from({ length: laps }, (_, l) => lap.gates.map(gate => {
    const i = gate.along === lap.length ? n : lap.points.findIndex(p => p.x === gate.x && p.z === gate.z);
    return along[1 + l * n + i]!;
  })).flat();
  const checkpoints: Checkpoint[] = Array.from({ length: laps }, () => lap.gates.map(gate => ({
    id: `${arenaRaceId(layout, solo)}-${gate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: gate.name, x: gate.x, z: gate.z, radius: ARENA_GATE_RADIUS,
  }))).flat();
  const id = arenaRaceId(layout, solo);
  const road = ARENA_ROADS.find(candidate => candidate.id === `arena-${layout}`)!;
  return {
    layout, solo, start, track: { points: road.points, gatesPerLap: lap.gates.length },
    race: { id, name: `${ARENA.name} / ${lap.layout.name}${solo ? " / Solo" : ""}`, kind: "circuit", laps, gatesPerLap: lap.gates.length,
      countdownTicks: COUNTDOWN_TICKS, checkpoints },
    // Every road race fields Moth's Kestrel (raceOpponentCar in main.ts), so the
    // line is driven all-wheel, as the generated races declare it. On the circuit,
    // with no traffic, it drives a racing line rather than the centreline.
    rival: solo ? null : withRacingLine({ id: `${id}-driver`, drivetrain: "awd", start: rivalStart, points, along, gates }),
  };
}
