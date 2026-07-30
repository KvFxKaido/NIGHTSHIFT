/* The simulation layer.

   GDD §17.2 is law here: this directory renders nothing and imports
   nothing from three.js. It owns vehicle state, race rules, and
   everything else that must stay testable without a screen. The
   renderer translates this state into a picture; it never decides
   anything.

   Second law, in force from the first commit because it cannot be
   retrofitted: the sim advances on a fixed tick and consults nothing
   but (state, input) — no clock, no Math.random, no platform. Hold
   that line and a run is replayable from its input log alone:
   time-trial ghosts, rival ghosts, and shareable runs all fall out of
   this one discipline. When Rapier joins in Phase 1, it steps inside
   this tick at this DT, never in the render loop.

   The placeholder kinematics below are NOT the handling model — that
   is Phase 1's entire job. They exist to prove the wiring end to end. */

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export interface Input {
  throttle: number;  // 0..1
  brake: number;     // 0..1
  steer: number;     // -1..1, negative = left
}

export interface SimState {
  tick: number;
  x: number;
  z: number;
  heading: number;   // radians; 0 faces -Z
  speed: number;     // m/s along heading
}

export function createSim(): SimState {
  return { tick: 0, x: 0, z: 0, heading: 0, speed: 0 };
}

// Placeholder kinematics — replaced wholesale by the Phase 1 handling
// prototype. Nothing here is tuned; nothing here is precedent.
export function step(s: SimState, input: Input): void {
  const accel = input.throttle * 14 - input.brake * 22 - s.speed * 0.35;
  s.speed = Math.max(0, s.speed + accel * DT);
  const turnAuthority = Math.min(1, s.speed / 8);
  s.heading -= input.steer * 1.9 * turnAuthority * DT;
  s.x -= Math.sin(s.heading) * s.speed * DT;
  s.z -= Math.cos(s.heading) * s.speed * DT;
  s.tick++;
}
