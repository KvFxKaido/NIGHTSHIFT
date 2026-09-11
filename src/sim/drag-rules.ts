import type { Input, VehicleState } from "./sim.ts";
import type { RaceState } from "./race.ts";

export interface DragStrip {
  readonly start: { readonly x: number; readonly z: number };
  readonly forward: { readonly x: number; readonly z: number };
  readonly length: number;
  readonly laneOffset: number;
  /** Space beyond the outer lane centre before leaving the strip. */
  readonly laneTolerance: number;
}

export function onDragStrip(strip: DragStrip, car: { x: number; z: number }) {
  const x = car.x - strip.start.x, z = car.z - strip.start.z;
  return { along: x * strip.forward.x + z * strip.forward.z,
    across: -x * strip.forward.z + z * strip.forward.x };
}

/** The countdown stages both cars. Once released, stay on the strip
 * and cross the finish plane forwards; a radius cannot finish a drag early. */
export function stepDrag(strip: DragStrip, state: RaceState, car: { x: number; z: number }): void {
  const at = onDragStrip(strip, car);
  state.dragLane ??= at.across < 0 ? -strip.laneOffset : strip.laneOffset;
  const previous = state.dragProgress ?? 0;
  state.dragProgress = at.along;
  if (Math.abs(at.across) > strip.laneOffset + strip.laneTolerance || at.along < -6) {
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

/** A fresh left/right input requests a lane. Steering assistance applies ordinary
 * tyre forces; collisions remain physical and never teleport or snap the body. */
export function dragLaneInput(strip: DragStrip, state: RaceState, car: VehicleState, input: Input): Input {
  const at = onDragStrip(strip, car);
  state.dragLane ??= at.across < 0 ? -strip.laneOffset : strip.laneOffset;
  const direction = input.steer < -.55 ? -1 : input.steer > .55 ? 1 : 0;
  if (Math.abs(input.steer) < .25) state.dragSteerHeld = 0;
  if (direction && direction !== state.dragSteerHeld) {
    state.dragSteerHeld = direction;
    if (state.countdown === 0 && !state.finished) state.dragLane = direction * strip.laneOffset;
  }
  const velocityX = -Math.sin(car.heading) * car.forwardSpeed + Math.cos(car.heading) * car.lateralSpeed;
  const velocityZ = -Math.cos(car.heading) * car.forwardSpeed - Math.sin(car.heading) * car.lateralSpeed;
  const acrossSpeed = -strip.forward.z * velocityX + strip.forward.x * velocityZ;
  const targetSpeed = Math.max(-3, Math.min(3, (state.dragLane - at.across) * 1.4));
  const steer = Math.max(-.4, Math.min(.4, (targetSpeed - acrossSpeed) * .4 + car.yawRate * .8));
  return { ...input, steer: state.finished ? 0 : steer };
}
