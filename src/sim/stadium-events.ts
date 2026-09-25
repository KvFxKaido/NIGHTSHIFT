/**
 * The stadium's circuit races (2026-09-25): three laps of a layout in the venue, a gate at every turn, the rival on
 * a racing line, every lap recorded. Ridge Circuit's races are the model (`arena-events.ts`); these run in the stadium
 * world, which a race says by its `venue`, so the game, the replay check and the tools build that world for it.
 */
import { STADIUM } from "./stadium.ts";
import { STADIUM_CIRCUIT, STADIUM_CIRCUIT_IDENTITY, STADIUM_LAYOUT_IDS, stadiumLap, type StadiumLayoutId } from "./stadium-circuits.ts";
import type { Checkpoint, RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";
import type { LapTrack } from "./lap-recorder.ts";
import { withRacingLine } from "./racing-line.ts";

export const STADIUM_LAPS = 3;
/** Three seconds at the fixed tick. */
const COUNTDOWN_TICKS = 180;
/** Track the rival keeps driving past the flag, so it has somewhere to stop. */
const RUN_OFF = 150;
/** Grid slots: the player a little behind on the right, the rival ahead on the left, a lane each on 12 m. */
const GRID = { player: { back: 12, right: 3 }, rival: { back: 5, right: -3 } } as const;

export interface StadiumEvent {
  readonly layout: StadiumLayoutId;
  /** `STADIUM_CIRCUIT_IDENTITY`, which a recording names. */
  readonly identity: string;
  /** The world it runs in: the stadium, not the city. */
  readonly venue: "stadium";
  readonly traffic: false;
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

/** `stadium-<layout>`, or `stadium-<layout>-solo` for the same race with no rival. */
export const stadiumRaceId = (layout: StadiumLayoutId, solo = false) => `stadium-${layout}${solo ? "-solo" : ""}`;
export function stadiumRaceFor(raceId: string): { layout: StadiumLayoutId; solo: boolean } | null {
  for (const layout of STADIUM_LAYOUT_IDS) for (const solo of [false, true]) {
    if (stadiumRaceId(layout, solo) === raceId) return { layout, solo };
  }
  return null;
}

const point = (x: number, z: number): CoursePoint => ({ x, z, y: STADIUM.base, width: STADIUM_CIRCUIT.width, zone: "boulevard" });

/** A layout's line takes a few hundred milliseconds to draw and never changes, so each (layout, laps) is drawn once. */
const lines = new Map<string, RivalDefinition>();

export function stadiumEvent(layout: StadiumLayoutId, laps = STADIUM_LAPS, solo = false): StadiumEvent {
  if (!Number.isInteger(laps) || laps < 1) throw new RangeError(`A stadium race needs whole laps, not ${laps}`);
  const lap = stadiumLap(layout);
  const line = lap.points[0]!, next = lap.points[1]!;
  const run = Math.hypot(next.x - line.x, next.z - line.z);
  const ux = (next.x - line.x) / run, uz = (next.z - line.z) / run;
  const heading = Math.atan2(-ux, -uz);
  const slot = ({ back, right }: { back: number; right: number }) =>
    ({ x: line.x - ux * back - uz * right, z: line.z - uz * back + ux * right, y: STADIUM.base, heading, pitch: 0 });
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
  const id = stadiumRaceId(layout, solo);
  const checkpoints: Checkpoint[] = Array.from({ length: laps }, () => lap.gates.map(gate => ({
    id: `${id}-${gate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: gate.name, x: gate.x, z: gate.z, radius: STADIUM_CIRCUIT.gateRadius,
  }))).flat();
  const closed = [...lap.points, lap.points[0]!].map(p => point(p.x, p.z));
  const key = `${layout}:${laps}`;
  let rival = lines.get(key) ?? null;
  // Moth's Kestrel, as on Ridge Circuit, driving a racing line: there is no traffic here to keep it in a lane.
  if (!solo && !rival) lines.set(key, rival = withRacingLine({ id: `${stadiumRaceId(layout)}-driver`, car: "kestrel", start: rivalStart, points, along, gates }));
  return {
    layout, identity: STADIUM_CIRCUIT_IDENTITY, venue: "stadium", traffic: false, solo, start,
    track: { points: closed, gatesPerLap: lap.gates.length },
    race: { id, name: `${STADIUM.name} / ${lap.layout.name}${solo ? " / Solo" : ""}`, kind: "circuit", laps, gatesPerLap: lap.gates.length,
      countdownTicks: COUNTDOWN_TICKS, checkpoints },
    rival: solo ? null : rival,
  };
}
