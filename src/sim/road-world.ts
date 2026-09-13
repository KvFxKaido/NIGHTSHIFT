import { COURSE, COURSE_WALLS, projectOntoCourse, type CourseProjection, type CourseWall } from "./track.ts";
import type { TrafficNetwork } from "./traffic.ts";

/** An axis-aligned solid volume: building massing, not a race barrier. Kept
 *  apart from `walls` because a wall is 1.3 m of guard rail and is rendered as
 *  one; a block is a building and has to be as tall as it looks. */
export interface RoadSolid {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Yaw, so massing can stand square to the street it fronts. */
  readonly rotation?: number;
  /** Height of the base above datum. Absent on a flat world. A district with
   *  20 m of hill stood every building at zero for two days: 227 of 321 had
   *  their base more than a metre underground, 32 past half their height, and
   *  a road on an embankment ran through a building's upper floors. */
  readonly base?: number;
}

/** Geometry dependency of the simulation. No renderer or browser state. */
export interface RoadWorld {
  readonly id: string;
  readonly start: { x: number; y: number; z: number; heading: number; pitch: number };
  readonly walls: readonly CourseWall[];
  readonly solids?: readonly RoadSolid[];
  /** The lane graph traffic drives, when the world has one. Blackglass does
   *  not: its lanes were never modelled, so it simply has no traffic. */
  readonly traffic?: TrafficNetwork;
  project(x: number, z: number): CourseProjection;
  /** The surface the car actually rides: the road across the carriageway, the
   *  ground beyond it, chamfered at the kerb. Absent on a world with nowhere
   *  to go but the road — the sim rides `project` there. A district with its
   *  rails removed needs this, or the first gap a car drives through leaves it
   *  floating on the nearest road's height. */
  surface?(x: number, z: number): CourseProjection;
  /** True where a tyre is off the paved surface: past the road and its
   *  pavement, on grass or bare ground. The sim charges some grip and pace
   *  there (`HANDLING.ground*`). Absent on a world with no ground to leave
   *  onto, which then drives exactly as it did before ground existed. */
  ground?(x: number, z: number): boolean;
}

export const BLACKGLASS_WORLD: RoadWorld = {
  id: "blackglass-v1", start: COURSE.start, walls: COURSE_WALLS, project: projectOntoCourse,
};
