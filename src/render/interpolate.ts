import type { SimState, VehicleState } from "../sim/sim.ts";

/**
 * Drawing between ticks, the default since 2026-09-18; `?smooth=0` draws the
 * last tick instead, for comparison.
 *
 * The simulation steps at TICK_HZ and the renderer draws whatever the last tick
 * left. On a display faster than that the car moved on some frames and not on
 * others while the chase camera glided, so it shook on screen: at 120 fps half
 * the frames advanced no tick, and the car's screen position jerked about
 * 3.5 px a frame at 25 m/s. Here every vehicle is drawn `alpha` of the way from
 * the tick before the last to the last. Nothing is extrapolated and nothing is
 * drawn that a tick did not decide; the price is showing each tick up to one
 * tick late. Presentation only: the simulation, its replays and its recordings
 * never see this.
 */

interface Pose {
  x: number; y: number; z: number; heading: number; pitch: number; roll: number;
  steering: number; speed: number; forwardSpeed: number; lateralSpeed: number;
  wheels: Record<string, { steeringAngle: number; rollingDistance: number }>;
}

export interface Poses {
  vehicle: Pose;
  opponent: Pose | null;
  cruisers: Map<string, Pose>;
  parked: Map<string, Pose>;
  /** x, y, z, heading per traffic vehicle, in state order. */
  traffic: Float64Array | null;
}

/** Further than any car travels in one tick: a reset or a teleport, drawn where it landed. */
const TELEPORT = 8;

function pose(vehicle: VehicleState): Pose {
  const wheels: Pose["wheels"] = {};
  for (const [id, wheel] of Object.entries(vehicle.wheels)) wheels[id] = { steeringAngle: wheel.steeringAngle, rollingDistance: wheel.rollingDistance };
  return { x: vehicle.x, y: vehicle.y, z: vehicle.z, heading: vehicle.heading, pitch: vehicle.pitch, roll: vehicle.roll, steering: vehicle.steering,
    speed: vehicle.speed, forwardSpeed: vehicle.forwardSpeed, lateralSpeed: vehicle.lateralSpeed, wheels };
}

function opponent(state: SimState): VehicleState | null {
  return state.rival?.vehicle ?? state.encounter ?? null;
}

/** Take before each step: after it, these are the tick before the last. */
export function capturePoses(state: SimState): Poses {
  const traffic = state.traffic ? new Float64Array(state.traffic.vehicles.length * 4) : null;
  state.traffic?.vehicles.forEach((v, i) => traffic!.set([v.x, v.y, v.z, v.heading], i * 4));
  const other = opponent(state);
  return {
    vehicle: pose(state.vehicle),
    opponent: other ? pose(other) : null,
    cruisers: new Map(state.cruisers.map(c => [c.id, pose(c.vehicle)])),
    parked: new Map(state.parkedRivals.map(p => [p.id, pose(p.vehicle)])),
    traffic,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function mix(from: Pose | null | undefined, to: VehicleState, t: number): VehicleState {
  if (!from || Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) > TELEPORT) return to;
  const wheels = { ...to.wheels };
  for (const id of Object.keys(wheels) as (keyof typeof wheels)[]) {
    const a = from.wheels[id];
    if (a) wheels[id] = { ...wheels[id], steeringAngle: lerp(a.steeringAngle, wheels[id].steeringAngle, t),
      rollingDistance: lerp(a.rollingDistance, wheels[id].rollingDistance, t) };
  }
  return { ...to, wheels, x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), z: lerp(from.z, to.z, t),
    heading: lerpAngle(from.heading, to.heading, t), pitch: lerp(from.pitch, to.pitch, t), roll: lerp(from.roll, to.roll, t),
    steering: lerp(from.steering, to.steering, t), speed: lerp(from.speed, to.speed, t),
    forwardSpeed: lerp(from.forwardSpeed, to.forwardSpeed, t), lateralSpeed: lerp(from.lateralSpeed, to.lateralSpeed, t) };
}

/** The state to draw: `alpha` (0..1) of the way from `previous` to `state`. */
export function blendPoses(previous: Poses, state: SimState, alpha: number): SimState {
  const t = Math.max(0, Math.min(1, alpha));
  const other = opponent(state);
  const drawnOpponent = other ? mix(previous.opponent, other, t) : null;
  const traffic = state.traffic && previous.traffic && previous.traffic.length === state.traffic.vehicles.length * 4
    ? { ...state.traffic, vehicles: state.traffic.vehicles.map((v, i) => {
      const p = previous.traffic!;
      const [x, y, z, heading] = [p[i * 4]!, p[i * 4 + 1]!, p[i * 4 + 2]!, p[i * 4 + 3]!];
      if (Math.hypot(v.x - x, v.z - z) > TELEPORT) return v;
      return { ...v, x: lerp(x, v.x, t), y: lerp(y, v.y, t), z: lerp(z, v.z, t), heading: lerpAngle(heading, v.heading, t) };
    }) }
    : state.traffic;
  return {
    ...state,
    vehicle: mix(previous.vehicle, state.vehicle, t),
    rival: state.rival && drawnOpponent ? { ...state.rival, vehicle: drawnOpponent } : state.rival,
    encounter: state.rival ? state.encounter : drawnOpponent ?? state.encounter,
    cruisers: state.cruisers.map(c => ({ ...c, vehicle: mix(previous.cruisers.get(c.id), c.vehicle, t) })),
    parkedRivals: state.parkedRivals.map(p => ({ ...p, vehicle: mix(previous.parked.get(p.id), p.vehicle, t) })),
    traffic,
  };
}
