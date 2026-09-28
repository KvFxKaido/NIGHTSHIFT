/**
 * A scenario: what a sim is stood up from, as data. A car, a world and the sim's options, named, so that every
 * instrument that drives a sim on its own (the golden master, the rival gate's batch and its scene, the car cards,
 * the drift driver, the replay check and the lap comparison) opens the same construction the same way and frees
 * it after. To 2026-09-28 nine of them built it by hand, each its own `createSim(carHandling(...),
 * createAlderWorld(true, ...), { ... })`, and the two that had to agree, the replay check and the comparison,
 * agreed by discipline. They agree by construction now.
 *
 * It is a helper, not an engine. Nothing here decides anything: the loop that drives a scenario and what is read
 * from it stay the instrument's own, and a scenario built by hand is a plain object. The two builders reproduce
 * exactly what the game and the replay assemble, and the golden master and `tests/scenario.test.ts` hold them to it.
 */
import { createAlderWorld } from "./alder.ts";
import type { LapSession } from "./lap-recorder.ts";
import type { RecordedEvent } from "./recorded-event.ts";
import type { RivalDefinition } from "./rival.ts";
import type { RoadWorld } from "./road-world.ts";
import { carHandling, createSim, type CarHandling, type Drivetrain, type Sim, type SimOptions } from "./sim.ts";
import { createStadiumWorld } from "./stadium.ts";

export interface Scenario {
  /** What a report calls it: a race id, a recording's name, a run's title. */
  readonly name: string;
  readonly handling: CarHandling;
  readonly world: RoadWorld;
  readonly options: SimOptions;
}

/** The sim a scenario names. The caller frees its world (`sim.world.free()`), or drives it with `runScenario`, which does. */
export function openScenario(scenario: Scenario): Sim {
  return createSim(scenario.handling, scenario.world, scenario.options);
}

/** Open a scenario, drive it in `body`, and free its world after, whatever `body` does. */
export function runScenario<T>(scenario: Scenario, body: (sim: Sim) => T): T {
  const sim = openScenario(scenario);
  try { return body(sim); } finally { sim.world.free(); }
}

/** The world a recorded race runs in, from its grid: Port Alder, or the venue a stadium circuit names. */
export function recordedWorld(event: RecordedEvent): RoadWorld {
  return event.venue === "stadium" ? createStadiumWorld(event.start) : createAlderWorld(true, event.start);
}

/**
 * A race as the game fields it, from what `recordedEvent` says a race id is: its race, its rival with its line, its
 * traffic, on the world it names. `run` is what a recording carries beside the race: which traffic it met and how
 * much the pedals were forgiven, absent being seed 0 and the clamp, as `createSim` has them. `rival` swaps another
 * driver in for the same race (an experiment, the lap comparison's), or `null` fields nobody.
 */
export function raceScenario(event: RecordedEvent, handling: CarHandling,
  run: { readonly trafficSeed?: number; readonly pedalAssist?: number; readonly rival?: RivalDefinition | null } = {}): Scenario {
  const rival = run.rival === undefined ? event.rival : run.rival;
  return { name: event.race.id, handling, world: recordedWorld(event),
    options: { race: event.race, rival: rival ?? undefined, traffic: event.traffic, trafficSeed: run.trafficSeed ?? 0, pedalAssist: run.pedalAssist ?? 1 } };
}

/**
 * A recorded session's race, in the car it was driven in, against the traffic and on the pedals it was driven with
 * (`recordings/README.md`): what its input log is replayed into. `event` is what `recordedEvent` drew for the
 * session, checked by the caller against the session's identity first, as `replayLapSession` does. `rival` swaps
 * another driver in, as `raceScenario` allows.
 */
export function sessionScenario(session: LapSession, event: RecordedEvent, rival?: RivalDefinition | null): Scenario {
  return raceScenario(event, carHandling(session.car, session.drivetrain as Drivetrain),
    { trafficSeed: session.trafficSeed ?? 0, pedalAssist: session.pedalAssist ?? 1, rival });
}
