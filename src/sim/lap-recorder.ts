/**
 * Lap recording (2026-09-13): what the player did on a circuit, lap by lap, so
 * their driving can teach the rival corner speeds, braking points and lines.
 *
 * Two records in one session. The input log is every tick's input from the
 * sim's first tick, unrounded, which with the race, world and physics identity
 * reproduces the whole run (law 2; `lap-replay.ts` proves it for a file). The
 * telemetry is per lap and rounded, for reading without a simulator: where the
 * car was, how fast, what the pedals and wheel were doing, how far round the
 * lap and how far off the centreline.
 *
 * This observes the sim and never changes it. It is fed the state a tick left
 * behind and the input that tick was given, and it decides nothing the race
 * does not already decide: laps end where the race's gates say they end.
 */
import { projectOntoPath } from "./street-path.ts";
import type { Input, VehicleState } from "./sim.ts";
import type { RaceState } from "./race.ts";
import type { CoursePoint } from "./track.ts";

export const LAP_RECORDING_FORMAT = "nightshift-laps-v1";

/**
 * When a lap stops being evidence. Any tick with all four tyres past the paved
 * shoulder, more than a second in total with any tyre there, or running
 * backwards more than 20 m (a spin or a reverse) makes the lap invalid. It is
 * still recorded, with its reasons; whoever reads the file decides what to skip.
 */
export const TRACK_LIMITS = { offTrackTicks: 60, fullyOffTicks: 0, backwardsMetres: 20 } as const;

/** Telemetry channels, in the order each lap stores them. */
export const LAP_CHANNELS = ["tick", "x", "z", "heading", "speed", "lateral", "yaw", "throttle", "brake", "steer", "handbrake", "ground", "distance", "offset"] as const;
export type LapChannel = (typeof LAP_CHANNELS)[number];

export interface RecordedLap {
  /** 1-based. Lap 1 starts from the grid, behind the line. */
  lap: number;
  standingStart: boolean;
  /** Race ticks (from the flag) at which the lap began and its finish gate was passed. */
  startTick: number;
  endTick: number;
  seconds: number;
  valid: boolean;
  reasons: string[];
  offTrackTicks: number;
  fullyOffTicks: number;
  topSpeed: number;
  /** Race ticks at which each gate of this lap was passed, the finish last. */
  gateTicks: number[];
  /** One array per channel in `LAP_CHANNELS`, one entry per tick of the lap. */
  samples: Record<LapChannel, number[]>;
}

export interface LapTrack {
  /** The lap's centreline as a closed polyline: the last point repeats the first. */
  readonly points: readonly CoursePoint[];
  readonly gatesPerLap: number;
}

export interface LapRecorder {
  readonly track: LapTrack;
  readonly length: number;
  /** Every tick's input since the sim's first tick, unrounded. */
  readonly inputs: { throttle: number[]; brake: number[]; steer: number[]; handbrake: number[] };
  readonly laps: RecordedLap[];
  current: RecordedLap | null;
  /** Distance round the centreline since the flag, carried across the line so it never jumps. */
  travelled: number | null;
  furthest: number;
  lastRaceTick: number;
}

const round = (value: number, places: number) => { const f = 10 ** places; return Math.round(value * f) / f; };
const emptySamples = () => Object.fromEntries(LAP_CHANNELS.map(channel => [channel, []])) as unknown as Record<LapChannel, number[]>;

export function createLapRecorder(track: LapTrack): LapRecorder {
  let length = 0;
  for (let i = 1; i < track.points.length; i++) length += Math.hypot(track.points[i]!.x - track.points[i - 1]!.x, track.points[i]!.z - track.points[i - 1]!.z);
  return { track, length, inputs: { throttle: [], brake: [], steer: [], handbrake: [] }, laps: [], current: null, travelled: null, furthest: -Infinity, lastRaceTick: 0 };
}

function startLap(recorder: LapRecorder, startTick: number): RecordedLap {
  const lap: RecordedLap = { lap: recorder.laps.length + 1, standingStart: recorder.laps.length === 0, startTick, endTick: startTick, seconds: 0,
    valid: true, reasons: [], offTrackTicks: 0, fullyOffTicks: 0, topSpeed: 0, gateTicks: [], samples: emptySamples() };
  recorder.furthest = -Infinity;
  return lap;
}

/**
 * Record one tick: call after `step`, with the input that step was given. Returns
 * the lap this tick completed, if it completed one.
 */
export function recordTick(recorder: LapRecorder, input: Input, vehicle: VehicleState, race: RaceState | null, tickHz: number): RecordedLap | null {
  recorder.inputs.throttle.push(input.throttle);
  recorder.inputs.brake.push(input.brake);
  recorder.inputs.steer.push(input.steer);
  recorder.inputs.handbrake.push(input.handbrake);
  // Only live racing ticks are laps: not the countdown, not after the flag.
  if (!race || race.ticks === recorder.lastRaceTick) return null;
  recorder.lastRaceTick = race.ticks;

  const on = projectOntoPath(recorder.track.points, vehicle.x, vehicle.z);
  const half = recorder.length / 2;
  if (recorder.travelled === null) {
    // The grid is behind the line: start negative rather than a lap ahead.
    recorder.travelled = on.along > half ? on.along - recorder.length : on.along;
  } else {
    const wrapped = ((recorder.travelled % recorder.length) + recorder.length) % recorder.length;
    let delta = on.along - wrapped;
    if (delta < -half) delta += recorder.length;
    if (delta > half) delta -= recorder.length;
    recorder.travelled += delta;
  }
  const lap = recorder.current ??= startLap(recorder, race.ticks - 1);
  const distance = recorder.travelled - (lap.lap - 1) * recorder.length;
  // Signed: positive to the right of the direction of travel.
  const a = recorder.track.points[on.segmentIndex]!;
  const offset = (vehicle.x - a.x) * -on.uz + (vehicle.z - a.z) * on.ux;

  const s = lap.samples;
  s.tick.push(race.ticks); s.x.push(round(vehicle.x, 2)); s.z.push(round(vehicle.z, 2));
  s.heading.push(round(vehicle.heading, 4)); s.speed.push(round(vehicle.speed, 2)); s.lateral.push(round(vehicle.lateralSpeed, 2));
  s.yaw.push(round(vehicle.yawRate, 3)); s.throttle.push(round(input.throttle, 3)); s.brake.push(round(input.brake, 3));
  s.steer.push(round(input.steer, 3)); s.handbrake.push(round(input.handbrake, 3)); s.ground.push(round(vehicle.groundContact, 2));
  s.distance.push(round(distance, 2)); s.offset.push(round(offset, 2));
  lap.topSpeed = Math.max(lap.topSpeed, round(vehicle.speed, 2));
  if (vehicle.groundContact > 0) lap.offTrackTicks++;
  if (vehicle.groundContact >= 1) lap.fullyOffTicks++;
  recorder.furthest = Math.max(recorder.furthest, distance);
  const backwards = recorder.furthest - distance;

  const addReason = (reason: string) => { if (!lap.reasons.includes(reason)) lap.reasons.push(reason); };
  if (lap.fullyOffTicks > TRACK_LIMITS.fullyOffTicks) addReason("left the track");
  if (lap.offTrackTicks > TRACK_LIMITS.offTrackTicks) addReason("off the track too long");
  if (backwards > TRACK_LIMITS.backwardsMetres) addReason("went backwards");
  lap.valid = lap.reasons.length === 0;

  const gates = recorder.track.gatesPerLap, lapIndex = lap.lap - 1;
  lap.gateTicks = race.splits.slice(lapIndex * gates, (lapIndex + 1) * gates);
  if (race.checkpoint < (lapIndex + 1) * gates) return null;
  lap.endTick = race.splits[(lapIndex + 1) * gates - 1]!;
  lap.seconds = (lap.endTick - lap.startTick) / tickHz;
  recorder.laps.push(lap);
  recorder.current = race.finished ? null : startLap(recorder, lap.endTick);
  return lap;
}

export interface LapSession {
  format: typeof LAP_RECORDING_FORMAT;
  id: string;
  /** Wall-clock time the session began, from the browser. Metadata only; nothing replays from it. */
  recordedAt: string;
  world: string;
  /** `ARENA_IDENTITY`: the circuit's layout revision. The world id does not change when only the circuit does. */
  arena: string;
  /** `RIVAL_REVISION`: the rival driver raced. Only a session with a rival depends on it. */
  rival: string;
  physics: string;
  tickHz: number;
  race: string;
  layout: string;
  solo: boolean;
  laps: number;
  car: string;
  drivetrain: string;
  start: { x: number; y: number; z: number; heading: number; pitch: number };
  trackLimits: typeof TRACK_LIMITS;
  channels: readonly LapChannel[];
  inputs: LapRecorder["inputs"];
  recorded: RecordedLap[];
}

export type LapSessionMeta = Omit<LapSession, "format" | "trackLimits" | "channels" | "inputs" | "recorded">;

/** The session as a file: identity, the whole input log so far, and every completed lap. */
export function lapSession(recorder: LapRecorder, meta: LapSessionMeta): LapSession {
  return { format: LAP_RECORDING_FORMAT, ...meta, trackLimits: TRACK_LIMITS, channels: LAP_CHANNELS,
    inputs: recorder.inputs, recorded: recorder.laps };
}

/** Best valid lap, or null. */
export function bestLap(laps: readonly RecordedLap[]): RecordedLap | null {
  return laps.filter(lap => lap.valid).sort((a, b) => a.seconds - b.seconds)[0] ?? null;
}
