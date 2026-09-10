/**
 * The district's races. Each one is a checkpoint sequence over the shared
 * streets plus a reference route through it — the route is the start pose and
 * the line an authored rival or an inspection driver follows; the player is
 * bound only by the checkpoints.
 *
 * Checkpoints are placed where route choice exists. Scored before this was
 * authored, leg by leg, the way the layout critique scores journeys: close the
 * key street on the best route and see what the detour costs. Under ~10% the
 * two ways are near-equal; over ~25% there is one way and the leg is a sprint
 * in disguise; between is the Midnight Club sweet spot.
 */
import { DISTRICT_JUNCTIONS, createDistrictWorld, type DistrictRoute } from "./district.ts";
import type { RoadWorld } from "./road-world.ts";
import type { Checkpoint, RaceDefinition } from "./race.ts";

export interface DistrictRace extends RaceDefinition {
  /** The reference line, and where the grid is. Never a constraint on the player. */
  readonly route: DistrictRoute;
  readonly description: string;
}

/** A junction is ~24 m across; a gate you can miss by taking its wrong side. */
export const GATE_RADIUS = 16;
/** Three seconds at the fixed tick. */
const COUNTDOWN_TICKS = 180;

function gate(id: string): Checkpoint {
  const junction = DISTRICT_JUNCTIONS.find(candidate => candidate.id === id);
  if (!junction) throw new RangeError(`Unknown checkpoint junction '${id}'`);
  return { id, name: junction.name, x: junction.point.x, z: junction.point.z, radius: GATE_RADIUS };
}

/**
 * Crane to Crest. Wharf Gate up to Hillcrest, 0.88 km and 20 m of climb, and
 * the two legs with real choice are exactly the two alleys: Crane Alley against
 * the arterial (2% detour if the alley closes — near-equal, the alley barely
 * wins), Cutlers Alley against the long way round (11% — the sweet spot). The
 * last leg is one way and is the finish run.
 */
export const CRANE_TO_CREST: DistrictRace = {
  id: "crane-to-crest",
  name: "Crane to Crest",
  description: "Wharf Gate to Hillcrest through the alleys, or not. Three gates, twenty metres of climb.",
  countdownTicks: COUNTDOWN_TICKS,
  checkpoints: [gate("north-mid"), gate("quarter-north"), gate("hill-north")],
  route: {
    id: "crane-to-crest", name: "Crane to Crest", kind: "sprint", color: "#ffb347",
    description: "Reference line: both alleys, then the steps.",
    legs: [
      { street: "alley-wharf-1" },
      { street: "north-2" },
      { street: "alley-quarter-1" },
      { street: "quarter-hill-n-1", reverse: true },
    ],
  },
};

export const DISTRICT_RACES: readonly DistrictRace[] = [CRANE_TO_CREST];

export function getRace(id: string): DistrictRace {
  const race = DISTRICT_RACES.find(candidate => candidate.id === id);
  if (!race) throw new RangeError(`Unknown race '${id}'`);
  return race;
}

/** The whole district, starting on the race's grid. */
export function createRaceWorld(race: DistrictRace): RoadWorld {
  return createDistrictWorld(race.route);
}
