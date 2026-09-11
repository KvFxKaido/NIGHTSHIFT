import type { RaceState } from "./race.ts";

export interface DragStrip {
  readonly start: { readonly x: number; readonly z: number };
  readonly forward: { readonly x: number; readonly z: number };
  readonly length: number;
  readonly laneOffset: number;
  /** Allowed displacement of the car centre from its lane centre. */
  readonly laneTolerance: number;
}

export function onDragStrip(strip: DragStrip, car: { x: number; z: number }) {
  const x = car.x - strip.start.x, z = car.z - strip.start.z;
  return { along: x * strip.forward.x + z * strip.forward.z,
    across: -x * strip.forward.z + z * strip.forward.x };
}

/** The countdown stages both cars. Once released, stay in the assigned lane
 * and cross the finish plane forwards; a radius cannot finish a drag early. */
export function stepDrag(strip: DragStrip, state: RaceState, car: { x: number; z: number }): void {
  const at = onDragStrip(strip, car);
  state.dragLane ??= at.across < 0 ? -strip.laneOffset : strip.laneOffset;
  const previous = state.dragProgress ?? 0;
  state.dragProgress = at.along;
  if (Math.abs(at.across - state.dragLane) > strip.laneTolerance || at.along < -6) {
    state.disqualified = true;
    state.finished = true;
    state.next = null;
    return;
  }
  if (previous < strip.length && at.along >= strip.length) {
    state.checkpoint = 1;
    state.collected = [0];
    state.targetIndex = 1;
    state.splits.push(state.ticks);
    state.finished = true;
    state.next = null;
  }
}
