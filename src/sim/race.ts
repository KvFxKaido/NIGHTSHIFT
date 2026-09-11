/**
 * Open-checkpoint racing (GDD §7.3): pass through a sequence of checkpoints, in
 * order, by any route you like. The Midnight Club format — the city is the
 * track, and which streets you take between two checkpoints is the skill.
 *
 * Sim, not renderer. A race is rules about where the car has been, decided per
 * fixed tick from the vehicle state the tick left behind, with no clock and no
 * randomness, so (start state + input log) reproduces the splits exactly. The
 * renderer draws the next checkpoint where this says it is; it never decides
 * whether one was passed.
 */
import type { VehicleState } from "./sim.ts";

export interface Checkpoint {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  /** Metres from the centre that count as through it. A junction is ~24 m
   *  across, so a gate you can miss by taking the wrong side of it. */
  readonly radius: number;
  /** Unit direction the reference route leaves this gate in — the marker's
   *  arrow. Absolute, along the exit street, because the sim cannot know which
   *  way the player arrives; a hint in open racing, never a rule. Absent at
   *  the finish, and until the race is paired with its rival's line
   *  (`withExits` in rival.ts), which is where the reference route lives. */
  readonly exit?: { readonly x: number; readonly z: number };
}

export interface RaceDefinition {
  readonly id: string;
  readonly name: string;
  readonly checkpoints: readonly Checkpoint[];
  /** Ticks of countdown before the flag drops. Driving input is ignored until
   *  then, which is a sim rule rather than presentation so a replay honours it. */
  readonly countdownTicks: number;
}

export interface RaceState {
  /** Index of the next checkpoint to take; equals `checkpoints.length` once
   *  the last one — the finish — has been passed. */
  checkpoint: number;
  /** Countdown ticks remaining. Zero once the race is live. */
  countdown: number;
  /** Ticks since the flag dropped; frozen at the finish. */
  ticks: number;
  /** `ticks` at which each checkpoint was passed, in order. */
  splits: number[];
  finished: boolean;
  /** Where the next gate is and which way the route leaves it (null at the
   *  finish, or unknown), for whoever draws it. Null once finished. */
  next: { x: number; z: number; exit: { x: number; z: number } | null } | null;
}

export function createRace(definition: RaceDefinition): RaceState {
  const first = definition.checkpoints[0];
  if (!first) throw new RangeError(`Race '${definition.id}' has no checkpoints`);
  return {
    checkpoint: 0, countdown: definition.countdownTicks, ticks: 0, splits: [], finished: false,
    next: { x: first.x, z: first.z, exit: first.exit ?? null },
  };
}

/** Is the car inside checkpoint `index` right now? */
export function atCheckpoint(definition: RaceDefinition, index: number, vehicle: { x: number; z: number }): boolean {
  const gate = definition.checkpoints[index];
  if (!gate) return false;
  return Math.hypot(vehicle.x - gate.x, vehicle.z - gate.z) <= gate.radius;
}

/**
 * Advance one fixed tick. Ordered: only the NEXT checkpoint counts. Driving
 * through a later one early does nothing, and driving through an earlier one
 * again does nothing — a race that let either count would be a different race.
 */
export function stepRace(definition: RaceDefinition, state: RaceState, vehicle: VehicleState): void {
  if (state.finished) return;
  if (state.countdown > 0) { state.countdown--; return; }
  state.ticks++;
  if (!atCheckpoint(definition, state.checkpoint, vehicle)) return;
  state.splits.push(state.ticks);
  state.checkpoint++;
  const upcoming = definition.checkpoints[state.checkpoint];
  if (upcoming) {
    state.next = { x: upcoming.x, z: upcoming.z, exit: upcoming.exit ?? null };
  } else {
    state.finished = true;
    state.next = null;
  }
}

/** True while the flag has not dropped: the sim ignores driving input. */
export function raceHolding(state: RaceState | null): boolean {
  return state !== null && state.countdown > 0;
}

/**
 * Who is ahead, 1 or 2. Higher checkpoint wins; on the same checkpoint, whoever
 * is nearer the next gate; at the finish, the earlier finish. Pure, so the HUD
 * and a future results screen agree.
 */
export function racePosition(definition: RaceDefinition,
  me: { race: RaceState; x: number; z: number },
  rival: { race: RaceState; x: number; z: number }): 1 | 2 {
  if (me.race.finished && rival.race.finished) {
    return (me.race.splits.at(-1) ?? Infinity) <= (rival.race.splits.at(-1) ?? Infinity) ? 1 : 2;
  }
  if (me.race.checkpoint !== rival.race.checkpoint) return me.race.checkpoint > rival.race.checkpoint ? 1 : 2;
  const gate = definition.checkpoints[me.race.checkpoint];
  if (!gate) return 1;
  return Math.hypot(me.x - gate.x, me.z - gate.z) <= Math.hypot(rival.x - gate.x, rival.z - gate.z) ? 1 : 2;
}

/** m:ss.t from ticks, for a HUD. */
export function formatRaceTime(ticks: number, tickHz: number): string {
  const total = ticks / tickHz;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
