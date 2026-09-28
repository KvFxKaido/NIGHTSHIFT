// The rival gate's set-up, as one scenario (scenario.ts): a race id's race and its rival's route as drawn, the shipped
// line stripped and the batch's own put on under the knobs it reads from the environment, in the Cinder, in traffic
// under one seed, with the player parked where the world starts, across town. street-line-batch.ts and
// rival-scene.ts had it twice, verbatim, and a scene must count what the gate counted, so it is one function.
//
// PLAN, REACH, BEND, BENDTANGENT and WORTH are the line's own knobs (withStreetLine's `tune`); SLIP, FOLLOW and FRAME
// are the driver's, set once on its tables by `applyDriverKnobs`. The game draws every line on STREET_LINE's numbers.
import { createAlderWorld } from "../src/sim/alder.ts";
import { alderCourseDraws, drawAlderCourse } from "../src/sim/alder-course.ts";
import { circuitEvent } from "../src/sim/circuits.ts";
import type { RaceDefinition } from "../src/sim/race.ts";
import { RIVAL_RACING, RIVAL_STEERING, RIVAL_STREET_LINE, RIVAL_TRAFFIC_FRAME, type RivalDefinition } from "../src/sim/rival.ts";
import type { Scenario } from "../src/sim/scenario.ts";
import { carHandling } from "../src/sim/sim.ts";
import { STREET_CIRCUIT_LINE } from "../src/sim/street-circuit.ts";
import { withStreetLine } from "../src/sim/street-line.ts";

/** The driver's knobs from the environment, applied once to its tables: what the batch and the scene both read. */
export function applyDriverKnobs(env: NodeJS.ProcessEnv = process.env): void {
  // SLIP=0 is the steering feedforward without the tyres' slip, as it was to full-line-v31.
  if (env.SLIP) (RIVAL_STEERING as { slip: number }).slip = Number(env.SLIP);
  // FOLLOW=0 judges a slower car ahead against where the rival means to be alone, as it was to driver-v1.
  if (env.FOLLOW === "0") (RIVAL_RACING as { followWhereItIs: boolean }).followWhereItIs = false;
  // FRAME=0 reads every car from the aim point's frame, as it was to full-line-v31.
  if (env.FRAME === "0") (RIVAL_TRAFFIC_FRAME as { on: boolean }).on = false;
}

/**
 * The race the gate drives for an id: `street-uptown`, or a generated race, or null for one that draws no race.
 * With `line` the rival carries the batch's street line, drawn under the environment's knobs; without it, its bare
 * route. `seed` is the traffic it meets (createTraffic): the rival alone across traffic layouts.
 */
export function batchRace(id: string, { line = true, seed = 0, env = process.env }: { line?: boolean; seed?: number; env?: NodeJS.ProcessEnv } = {}): Scenario | null {
  let route: RivalDefinition, race: RaceDefinition;
  if (id.startsWith("street-")) { const event = circuitEvent(id, 3)!; route = event.rival!; race = event.race; }
  else { if (!alderCourseDraws(id, null)) return null; const course = drawAlderCourse(id, null); route = { ...course.rival }; race = course.race; }
  const { line: _shipped, ...bare } = route as RivalDefinition & { line?: unknown };
  const rival = line ? withStreetLine(bare, STREET_CIRCUIT_LINE, Number(env.PLAN ?? RIVAL_STREET_LINE.speedFactor),
    { ...(env.REACH ? { reach: Number(env.REACH) } : {}), ...(env.BEND ? { bendFrom: Number(env.BEND) } : {}),
      ...(env.BENDTANGENT ? { bendTangent: Number(env.BENDTANGENT) } : {}), ...(env.WORTH ? { worth: Number(env.WORTH) } : {}) }) : bare;
  return { name: id, handling: carHandling("cinder", "rwd"), world: createAlderWorld(true), options: { race, rival, traffic: true, trafficSeed: seed } };
}
