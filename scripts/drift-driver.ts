import { carHandling, createSim, step, type Input, type VehicleState } from "../src/sim/sim.ts";
import { createAlderWorld } from "../src/sim/alder.ts";
import { SABLE_DRIFT } from "../src/sim/drift-event.ts";
import { DRIFT_YARD, SABLE, YARD_LINE } from "../src/sim/drift-yard.ts";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** One driver for every tune: follow the yard line, flick into a bend, then
 * counter-flick on exit and catch excess slip with countersteer.
 * No car identity or handling knobs. */
function createDriftDriver(): (car: VehicleState) => Input {
  let index = 1, flick = 0, cooldown = 0, held = 0, transition = 0, side = 0;
  return car => {
    if (Math.hypot(car.x - YARD_LINE[index]!.x, car.z - YARD_LINE[index]!.z) < 16) {
      index = (index + 1) % (YARD_LINE.length - 1);
    }
    const target = YARD_LINE[index]!;
    let error = wrap(Math.atan2(car.x - target.x, car.z - target.z) - car.heading);
    // Once a slide is held and the next waypoint is nearly ahead, ask for the
    // opposite side before the chain banks. Commit for 55 ticks: a slow swap
    // can miss the link. The 45-tick pull still releases at the slip ceiling;
    // the two-second cooldown leaves time to return to the yard line.
    held = Math.abs(car.slipAngle) >= .18 ? held + 1 : 0;
    if (!transition && held >= 18 && Math.abs(error) < .25 && cooldown === 0) {
      side = -Math.sign(car.slipAngle);
      transition = 55;
      flick = 45;
      cooldown = 120;
    }
    if (transition > 0) { error = side * .45; transition--; }
    // Ask for up to 26 degrees into the bend, tapering to zero on its exit.
    // Positive slip needs positive steer to catch it in the sim's convention.
    const targetSlip = Math.sign(error) * Math.min(.45, Math.abs(error));
    cooldown = Math.max(0, cooldown - 1);
    if (!cooldown && Math.abs(error) > .2 && car.speed > 12 && Math.abs(car.slipAngle) < .18) {
      flick = 22; cooldown = 60;
    }
    if (Math.abs(car.slipAngle) >= .45) flick = 0;
    const handbrake = flick > 0 ? 1 : 0;
    flick = Math.max(0, flick - 1);
    return {
      steer: clamp(-error * 2.8 + car.yawRate * .8 + (car.slipAngle - targetSlip) * 1.2, -1, 1),
      throttle: clamp((23 - car.speed) * .3 + .3 - Math.max(0, Math.abs(car.slipAngle) - .45), 0, 1),
      brake: car.speed > 27 ? .3 : 0, handbrake,
    };
  };
}

export function measureDrift(car: string) {
  const sim = createSim(carHandling(car), createAlderWorld(true, DRIFT_YARD.start),
    { race: SABLE_DRIFT, traffic: false, parkedRivals: [SABLE] });
  const driver = createDriftDriver();
  let driftingTicks = 0, angleSum = 0, bestAngle = 0, spins = 0, contacts = 0, leftBounds = false;
  let wasSpin = false, wasContact = false;
  try {
    const limit = SABLE_DRIFT.countdownTicks + SABLE_DRIFT.drift!.durationTicks;
    for (let tick = 0; !sim.state.race!.finished && tick < limit; tick++) {
      step(sim, sim.state.race!.countdown ? { throttle: 0, brake: 0, steer: 0, handbrake: 0 } : driver(sim.state.vehicle));
      if (!sim.state.race!.ticks) continue;
      const drift = sim.state.race!.drift!, vehicle = sim.state.vehicle;
      if (drift.drifting) { driftingTicks++; angleSum += drift.angle; bestAngle = Math.max(bestAngle, drift.angle); }
      // Read the same post-step manifolds as sim.ts. Feedback persists after an
      // incident, so counting its text would merge separate contacts.
      let contact = false;
      const collider = sim.body.collider(0);
      sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, manifold => {
        if (manifold.numSolverContacts() > 0) contact = true;
      }));
      const spin = drift.angle > 80 || vehicle.forwardSpeed < -1;
      if (spin && !wasSpin) spins++;
      if (contact && !wasContact) contacts++;
      wasSpin = spin; wasContact = contact;
      const b = SABLE_DRIFT.drift!.bounds;
      leftBounds ||= vehicle.x < b.minX || vehicle.x > b.maxX || vehicle.z < b.minZ || vehicle.z > b.maxZ;
    }
    if (!sim.state.race!.finished) throw new Error(`Drift event did not finish for '${car}'`);
    const drift = sim.state.race!.drift!;
    return { score: drift.score, targetScore: SABLE_DRIFT.drift!.targetScore, won: drift.won,
      meanAngle: driftingTicks ? angleSum / driftingTicks : 0, bestAngle,
      driftingTicks, ticks: sim.state.race!.ticks, driftingShare: driftingTicks / sim.state.race!.ticks,
      transitions: drift.transitions, clips: drift.clips, spins, contacts, leftBounds };
  } finally { sim.world.free(); }
}
