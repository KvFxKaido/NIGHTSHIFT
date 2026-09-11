import { createDrift, stepDrift, type DriftState, type DriftDefinition } from "./drift-rules.ts";
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
import { stepDrag, type DragStrip } from "./drag-rules.ts";
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

export type RaceKind = "sprint" | "circuit" | "unordered" | "drag" | "drift";

export interface RaceDefinition {
  readonly kind?: RaceKind;
  readonly drag?: DragStrip;
  readonly drift?: DriftDefinition;
  /** Circuit gates are expanded per lap so rivals and replays share one sequence. */
  readonly laps?: number;
  readonly gatesPerLap?: number;
  readonly id: string;
  readonly name: string;
  readonly checkpoints: readonly Checkpoint[];
  /** Ticks of countdown before the flag drops. Driving input is ignored until
   *  then, which is a sim rule rather than presentation so a replay honours it. */
  readonly countdownTicks: number;
}

export interface RaceState {
  /** Gates passed; also the next index for ordered events. */
  checkpoint: number;
  drift?: DriftState;
  dragLane?: number;
  dragSteerHeld?: number;
  dragProgress?: number;
  disqualified?: boolean;
  /** Gate indices already collected, in visit order. */
  collected: number[];
  /** First unvisited gate in the reference line, used by the rival. */
  targetIndex: number;
  targets?: { x: number; z: number; exit: null }[];
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
  if (definition.kind === "circuit" && (!Number.isInteger(definition.laps) || definition.laps! < 1
    || !Number.isInteger(definition.gatesPerLap) || definition.gatesPerLap! < 2
    || definition.laps! * definition.gatesPerLap! !== definition.checkpoints.length)) {
    throw new RangeError(`Race '${definition.id}' has invalid circuit laps`);
  }
  if (definition.kind === "drag" && (!definition.drag || definition.checkpoints.length !== 1)) {
    throw new RangeError("A drag requires a strip and one finish line");
  }
  if (definition.kind === "drift" && (!definition.drift || !definition.drift.zones.length || definition.drift.durationTicks <= 0 || definition.drift.targetScore <= 0)) throw new RangeError("A drift event requires a timed arena and clipping zones");
  if (!first) throw new RangeError(`Race '${definition.id}' has no checkpoints`);
  return {
    checkpoint: 0, collected: [], targetIndex: 0,
    ...(definition.kind === "drift" ? { drift: createDrift() } : {}),
    ...(definition.kind === "unordered" ? { targets: definition.checkpoints.map(g => ({ x: g.x, z: g.z, exit: null })) } : {}), countdown: definition.countdownTicks, ticks: 0, splits: [], finished: false,
    next: definition.kind === "drift" ? null : { x: first.x, z: first.z, exit: definition.kind === "unordered" ? null : first.exit ?? null },
  };
}

/** Is the car inside checkpoint `index` right now? */
export function atCheckpoint(definition: RaceDefinition, index: number, vehicle: { x: number; z: number }): boolean {
  const gate = definition.checkpoints[index];
  if (!gate) return false;
  return Math.hypot(vehicle.x - gate.x, vehicle.z - gate.z) <= gate.radius;
}

/** Advance deterministic ordered gates, or collect any remaining unordered gate. */
export function stepRace(definition: RaceDefinition, state: RaceState, vehicle: VehicleState, contact = false): void {
  if (state.finished) return;
  if (state.countdown > 0) { state.countdown--; return; }
  state.ticks++;
  if (definition.kind === "drag") { stepDrag(definition.drag!, state, vehicle); return; }
  if (definition.kind === "drift") { stepDrift(definition.drift!, state, vehicle, contact); return; }
  const unordered = definition.kind === "unordered";
  const index = unordered
    ? definition.checkpoints.findIndex((_, i) => !state.collected.includes(i) && atCheckpoint(definition, i, vehicle))
    : state.checkpoint;
  if (index >= 0 && atCheckpoint(definition, index, vehicle)) {
    state.splits.push(state.ticks);
    state.collected.push(index);
    state.checkpoint++;
  }
  state.targetIndex = unordered
    ? definition.checkpoints.findIndex((_, i) => !state.collected.includes(i)) : state.checkpoint;
  state.finished = state.checkpoint === definition.checkpoints.length;
  if (unordered) {
    state.targets = definition.checkpoints.filter((_, i) => !state.collected.includes(i))
      .map(g => ({ x: g.x, z: g.z, exit: null }));
    state.next = [...state.targets].sort((a, b) =>
      Math.hypot(a.x - vehicle.x, a.z - vehicle.z) - Math.hypot(b.x - vehicle.x, b.z - vehicle.z))[0] ?? null;
  } else {
    const upcoming = definition.checkpoints[state.targetIndex];
    state.next = upcoming ? { x: upcoming.x, z: upcoming.z, exit: upcoming.exit ?? null } : null;
  }
}

export function raceProgressLabel(definition: RaceDefinition, state: RaceState): string {
  if (definition.kind === "drift") return `${Math.floor(state.drift!.score)} / ${definition.drift!.targetScore} PTS`;
  if (definition.kind === "drag") return state.disqualified ? "DQ · LEFT THE STRIP"
    : state.finished ? "DRAG · FINISH" : `DRAG · ${Math.max(0, Math.round(definition.drag!.length - (state.dragProgress ?? 0)))} M · LANE ${state.dragLane === undefined || state.dragLane < 0 ? "1" : "2"}/2`;
  if (definition.kind === "unordered") return `GATES ${state.checkpoint}/${definition.checkpoints.length} · ANY ORDER`;
  if (definition.kind === "circuit") {
    const gates = definition.gatesPerLap!;
    const lap = Math.min(Math.floor(state.checkpoint / gates) + 1, definition.laps!);
    const gate = state.finished ? gates : state.checkpoint % gates + 1;
    return `LAP ${lap}/${definition.laps} · GATE ${gate}/${gates}`;
  }
  return `GATE ${Math.min(state.checkpoint + 1, definition.checkpoints.length)}/${definition.checkpoints.length}`;
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
  if (!!me.race.disqualified !== !!rival.race.disqualified) return me.race.disqualified ? 2 : 1;
  if (me.race.finished && rival.race.finished) {
    return (me.race.splits.at(-1) ?? Infinity) <= (rival.race.splits.at(-1) ?? Infinity) ? 1 : 2;
  }
  if (definition.kind === "drag" && !me.race.finished && !rival.race.finished) {
    return (me.race.dragProgress ?? 0) >= (rival.race.dragProgress ?? 0) ? 1 : 2;
  }
  if (me.race.checkpoint !== rival.race.checkpoint) return me.race.checkpoint > rival.race.checkpoint ? 1 : 2;
  if (definition.kind === "unordered") {
    const distance = (car: typeof me) => Math.min(...definition.checkpoints
      .filter((_, i) => !car.race.collected.includes(i)).map(g => Math.hypot(car.x - g.x, car.z - g.z)));
    return distance(me) <= distance(rival) ? 1 : 2;
  }
  const gate = definition.checkpoints[me.race.checkpoint];
  if (!gate) return 1;
  return Math.hypot(me.x - gate.x, me.z - gate.z) <= Math.hypot(rival.x - gate.x, rival.z - gate.z) ? 1 : 2;
}

/** m:ss.t from ticks, for a HUD. */
export function formatRaceTime(ticks: number, tickHz: number, decimals = 1): string {
  const total = ticks / tickHz;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(decimals).padStart(3 + decimals, "0")}`;
}
