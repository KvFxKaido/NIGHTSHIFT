import assert from "node:assert/strict";
import { createSim, step, DEFAULT_DRIVETRAIN, type Drivetrain, type Input, type Sim } from "../../src/sim/sim.ts";
import { projectOntoCourse } from "../../src/sim/track.ts";

export const NEUTRAL: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
export const FLAT_START = { x: -80, y: 0.5, z: -210 };
export const FLAT_HEADING = -Math.PI / 2;

export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// No obstacles for isolated tyre measurements. Collision tests explicitly add
// their own barriers; the reference-lap test retains the complete real course.
export function flatSim(speed = 0, sideways = 0, drivetrain: Drivetrain = DEFAULT_DRIVETRAIN): Sim {
  const sim = createSim(drivetrain);
  sim.body.setTranslation(FLAT_START, true);
  sim.body.setRotation({ x: 0, y: Math.sin(FLAT_HEADING / 2), z: 0, w: Math.cos(FLAT_HEADING / 2) }, true);
  sim.body.setLinvel({ x: speed, y: 0, z: sideways }, true);
  sim.body.collider(0).setCollisionGroups(0);
  return sim;
}

export function flatStep(sim: Sim, input: Partial<Input> = {}): void {
  step(sim, { ...NEUTRAL, ...input });
  const car = sim.state.vehicle;
  assert.ok(Math.abs(projectOntoCourse(car.x, car.z).pitch) < 1e-6,
    "isolated tyre measurement must remain on a flat road projection");
}

export function hasContact(sim: Sim): boolean {
  let touching = false;
  const chassis = sim.body.collider(0);
  sim.world.contactPairsWith(chassis, other => {
    sim.world.contactPair(chassis, other, manifold => {
      if (manifold.numSolverContacts() > 0) touching = true;
    });
  });
  return touching;
}
