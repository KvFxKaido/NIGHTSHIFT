/**
 * Street circuits (2026-09-13): a lapped race on the city's own streets, in
 * traffic or not, recorded lap by lap the way Ridge Circuit is, so the street
 * rival can be measured against laps the player actually drove
 * (design/PORT_ALDER.md, "Uptown Circuit").
 *
 * Authored and pinned, not generated. A generated race is only as stable as the
 * generator: the flow rule (2026-09-11) changed the race every seed draws, which
 * would have orphaned every recording made on one. This loop is a list of
 * streets in the order they are driven, and `tests/street-circuit.test.ts` pins
 * its length, so a moved street shows up as a failure and a revision here, not
 * as recordings that quietly stop comparing.
 *
 * The loop was chosen from every 1.8-3 km loop in the city (101,597 of them) for
 * variety: open and square turns and one hairpin, streets from 12 m to 20 m wide,
 * a 520 m climbing straight and a descent.
 *
 * Every turn is a gate. Between turns the city offers other ways round (Thomas
 * Street runs straight from Uptown Link to 23rd Avenue), and a lap that takes one
 * is not a lap of this circuit. Only the next gate is ever shown, with the arrow
 * for where the loop goes from it.
 */
import { ALDER_SHOULDER, ALDER_STREETS, alderDrivable, alderHeight } from "./alder.ts";
import { laneOffset } from "./lanes.ts";
import type { Checkpoint, RaceDefinition } from "./race.ts";
import { STREET_RACING_LINE, withRacingLine } from "./racing-line.ts";
import { RIVAL_STREET_LINE, withExits, type RivalDefinition } from "./rival.ts";
import { withStreetLine } from "./street-line.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";
import type { LapTrack } from "./lap-recorder.ts";

export const STREET_CIRCUIT_LAPS = 3;

export const UPTOWN = {
  id: "uptown",
  /** Working name. */
  name: "Uptown Circuit",
  /** Bump when the loop, its line or its gates change: recordings name it and replay refuses another. */
  revision: 1,
  /** The loop, street by street, in the direction it is driven. */
  drives: [
    { street: "sea-east-27", reversed: false }, // Uptown Link, climbing east
    { street: "sea-east-41", reversed: true },  // Broadway
    { street: "sea-east-99", reversed: false }, // Market Arcade
    { street: "sea-east-100", reversed: false }, // Market Arcade
    { street: "sea-east-49", reversed: false }, // 12th Avenue
    { street: "sea-east-104", reversed: true }, // Thomas Street
    { street: "sea-east-135", reversed: true }, // 23rd Avenue
    { street: "sea-east-134", reversed: true }, // 23rd Avenue
    { street: "sea-east-191", reversed: true }, // Harrison Terrace
    { street: "sea-east-43", reversed: true },  // Broadway
    { street: "sea-east-13", reversed: true },  // Highland Drive, descending
    { street: "sea-east-30", reversed: true },  // Dexter Way, into the hairpin
  ],
  /** Metres along Uptown Link from the hairpin's exit to the start line. */
  line: 120,
} as const;
export const STREET_CIRCUIT_IDENTITY = `${UPTOWN.id}-v${UPTOWN.revision}`;

/** A turn this sharp at a junction is a gate; the loop's straight-ons through junctions are 7 and 8 degrees. */
const TURN_GATE_DEGREES = 30;
/** As generated races: a gate this wide takes any line through a junction. */
export const STREET_GATE_RADIUS = 20;
const COUNTDOWN_TICKS = 180;
const RUN_OFF = 150;
/** Grid slots in the lanes going the circuit's way: the player behind in the kerb lane, the rival ahead in the inner one. */
const GRID = { player: { back: 12, lane: 1 }, rival: { back: 5, lane: 0 } } as const;

export interface StreetCircuitLap {
  /** The lap from the line round to the line, closed: the last point repeats the first. */
  readonly points: readonly CoursePoint[];
  readonly along: readonly number[];
  readonly length: number;
  /** In lap order, the line last, each at a point of the lap. */
  readonly gates: readonly { readonly name: string; readonly x: number; readonly z: number; readonly along: number; readonly turn: number }[];
}

const streetsById = new Map(ALDER_STREETS.map(street => [street.id, street]));
const heading = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.z - a.z, b.x - a.x);

let lapCache: StreetCircuitLap | null = null;
export function uptownLap(): StreetCircuitLap {
  if (lapCache) return lapCache;
  const loop: CoursePoint[] = [];
  const joins: { index: number; from: string; to: string }[] = [];
  UPTOWN.drives.forEach((drive, i) => {
    const street = streetsById.get(drive.street);
    if (!street) throw new Error(`${UPTOWN.name}: street ${drive.street} is not in the city`);
    const points = drive.reversed ? [...street.points].reverse() : [...street.points];
    const last = loop.at(-1);
    if (last && Math.hypot(last.x - points[0]!.x, last.z - points[0]!.z) > 0.1) throw new Error(`${UPTOWN.name}: ${street.name} does not start where the previous street ends`);
    if (last) joins.push({ index: loop.length - 1, from: streetsById.get(UPTOWN.drives[i - 1]!.street)!.name, to: street.name });
    loop.push(...(last ? points.slice(1) : points));
  });
  if (Math.hypot(loop[0]!.x - loop.at(-1)!.x, loop[0]!.z - loop.at(-1)!.z) > 0.1) throw new Error(`${UPTOWN.name} does not close`);
  joins.push({ index: loop.length - 1, from: streetsById.get(UPTOWN.drives.at(-1)!.street)!.name, to: streetsById.get(UPTOWN.drives[0]!.street)!.name });
  const loopAlong = [0];
  for (let i = 1; i < loop.length; i++) loopAlong.push(loopAlong[i - 1]! + Math.hypot(loop[i]!.x - loop[i - 1]!.x, loop[i]!.z - loop[i - 1]!.z));
  const loopLength = loopAlong.at(-1)!;
  // The turn at a join: the heading 12 m before it against 12 m after it, round the loop.
  const pointAt = (distance: number) => {
    const d = ((distance % loopLength) + loopLength) % loopLength;
    let i = 1; while (i < loop.length - 1 && loopAlong[i]! < d) i++;
    const a = loop[i - 1]!, b = loop[i]!, t = (d - loopAlong[i - 1]!) / Math.max(1e-9, loopAlong[i]! - loopAlong[i - 1]!);
    return { ...a, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, width: a.width + (b.width - a.width) * t };
  };
  const turnAt = (distance: number) => {
    const before = heading(pointAt(distance - 12), pointAt(distance)), after = heading(pointAt(distance), pointAt(distance + 12));
    return Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before))) * 180 / Math.PI;
  };
  // Rotate the loop to start at the line, splitting the segment it falls in.
  const line = pointAt(UPTOWN.line);
  let split = 1; while (loopAlong[split]! <= UPTOWN.line) split++;
  const points = [line, ...loop.slice(split, -1), ...loop.slice(0, split), line];
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const length = along.at(-1)!;
  const lapDistance = (loopDistance: number) => ((loopDistance - UPTOWN.line) % loopLength + loopLength) % loopLength;
  const gates = joins.map(join => ({ join, turn: turnAt(loopAlong[join.index]!) }))
    .filter(({ turn }) => turn > TURN_GATE_DEGREES)
    .map(({ join, turn }) => {
      const at = loop[join.index]!;
      const index = points.findIndex(p => p.x === at.x && p.z === at.z);
      return { name: `${join.from} & ${join.to}`, x: at.x, z: at.z, along: along[index]!, turn, at: lapDistance(loopAlong[join.index]!) };
    })
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...gate }) => gate);
  const first = streetsById.get(UPTOWN.drives[0]!.street)!.name;
  lapCache = { points, along, length, gates: [...gates, { name: first, x: line.x, z: line.z, along: length, turn: 0 }] };
  return lapCache;
}

const trafficLines = new Map<number, RivalDefinition>();
function trafficLine(route: RivalDefinition, laps: number): RivalDefinition {
  let line = trafficLines.get(laps);
  if (!line) trafficLines.set(laps, line = withStreetLine({ ...route, shoulder: ALDER_SHOULDER }, STREET_CIRCUIT_LINE, RIVAL_STREET_LINE.speedFactor));
  return line;
}
function clearLine(route: RivalDefinition, laps: number): RivalDefinition {
  let line = clearLines.get(laps);
  if (!line) clearLines.set(laps, line = { ...withRacingLine(route, STREET_CIRCUIT_LINE), cornering: RIVAL_STREET_LINE.speedFactor });
  return line;
}

export interface StreetCircuitEvent {
  readonly layout: typeof UPTOWN.id;
  /** The circuit's revision, which a recording names. */
  readonly identity: string;
  readonly solo: boolean;
  /** City traffic on the streets, or clear streets. */
  readonly traffic: boolean;
  readonly race: RaceDefinition;
  readonly rival: RivalDefinition | null;
  readonly track: LapTrack;
  readonly start: RoadWorld["start"];
}

/** `street-uptown`, `-clear` for no traffic, `-solo` for no rival, in that order. */
export const streetCircuitRaceId = (traffic = true, solo = false) => `street-${UPTOWN.id}${traffic ? "" : "-clear"}${solo ? "-solo" : ""}`;
export function streetCircuitRaceFor(raceId: string): { traffic: boolean; solo: boolean } | null {
  for (const traffic of [true, false]) for (const solo of [false, true]) {
    if (streetCircuitRaceId(traffic, solo) === raceId) return { traffic, solo };
  }
  return null;
}

/** A street circuit's racing line: the street line, cutting the corners this city says a car may cross (`alderDrivable`). */
export const STREET_CIRCUIT_LINE = { ...STREET_RACING_LINE, paved: alderDrivable } as const;
/** The line takes about half a second to draw and never changes, so each number of laps is drawn once. */
const clearLines = new Map<number, RivalDefinition>();

export function streetCircuitEvent(laps = STREET_CIRCUIT_LAPS, traffic = true, solo = false): StreetCircuitEvent {
  if (!Number.isInteger(laps) || laps < 1) throw new RangeError(`A street circuit race needs whole laps, not ${laps}`);
  const lap = uptownLap();
  const line = lap.points[0]!, next = lap.points[1]!;
  const run = Math.hypot(next.x - line.x, next.z - line.z);
  const ux = (next.x - line.x) / run, uz = (next.z - line.z) / run;
  const startHeading = Math.atan2(-ux, -uz);
  const slot = ({ back, lane }: { back: number; lane: number }) => {
    const street = streetsById.get(UPTOWN.drives[0]!.street)!;
    const right = laneOffset(line.width, { direction: 1, index: lane }, street.kind);
    const x = line.x - ux * back - uz * right, z = line.z - uz * back + ux * right;
    const pitch = Math.atan((alderHeight(x + ux, z + uz) - alderHeight(x - ux, z - uz)) / 2);
    return { x, z, y: alderHeight(x, z), heading: startHeading, pitch };
  };
  const start = slot(GRID.player), rivalStart = slot(GRID.rival);
  const id = streetCircuitRaceId(traffic, solo);
  // The rival's route: its grid slot, every lap on the centreline, then the run-off.
  const plan: CoursePoint[] = [{ ...line, ...rivalStart }, ...Array.from({ length: laps }, () => lap.points.slice(0, -1)).flat(),
    ...lap.points.filter((_, i) => i === 0 || lap.along[i]! <= RUN_OFF)];
  const points = plan.map(p => ({ x: p.x, z: p.z, y: alderHeight(p.x, p.z), width: p.width, zone: p.zone }));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const n = lap.points.length - 1;
  const gates = Array.from({ length: laps }, (_, l) => lap.gates.map(gate => {
    const i = gate.along === lap.length ? n : lap.points.findIndex(p => p.x === gate.x && p.z === gate.z);
    return along[1 + l * n + i]!;
  })).flat();
  const checkpoints: Checkpoint[] = Array.from({ length: laps }, () => lap.gates.map((gate, g) => ({
    id: `${streetCircuitRaceId()}-${g + 1}`, name: gate.name, x: gate.x, z: gate.z, radius: STREET_GATE_RADIUS,
  }))).flat();
  // Every road race fields Moth's Kestrel. In traffic the rival drives the centreline, with its lane arcs.
  const route: RivalDefinition = { id: `${streetCircuitRaceId()}-driver`, car: "kestrel", start: rivalStart, points, along, gates };
  const race: RaceDefinition = { id, name: `${UPTOWN.name}${traffic ? "" : " / Clear"}${solo ? " / Solo" : ""}`, kind: "circuit", laps,
    gatesPerLap: lap.gates.length, countdownTicks: COUNTDOWN_TICKS, checkpoints };
  return {
    layout: UPTOWN.id, identity: STREET_CIRCUIT_IDENTITY, solo, traffic, start,
    track: { points: lap.points, gatesPerLap: lap.gates.length },
    // The arrows come from the route even when nobody drives it: on streets a solo lap needs to know where to turn.
    // From the centreline in all four races, so they are the same race whoever is in it.
    race: withExits(race, route),
    // With no traffic there are no lanes to keep to, and the rival drives the whole road (RIVAL_STREET_LINE).
    // In traffic it keeps its lane, and takes the same line a corner at a time when the forecast shows it clear.
    rival: solo ? null : traffic ? trafficLine(route, laps) : clearLine(route, laps),
  };
}
