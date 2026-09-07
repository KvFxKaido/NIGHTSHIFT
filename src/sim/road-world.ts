import { COURSE, COURSE_WALLS, projectOntoCourse, type CourseProjection, type CourseWall } from "./track.ts";

/** An axis-aligned solid volume: building massing, not a race barrier. Kept
 *  apart from `walls` because a wall is 1.3 m of guard rail and is rendered as
 *  one; a block is a building and has to be as tall as it looks. */
export interface RoadSolid {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Geometry dependency of the simulation. No renderer or browser state. */
export interface RoadWorld {
  readonly id: string;
  readonly start: { x: number; y: number; z: number; heading: number; pitch: number };
  readonly walls: readonly CourseWall[];
  readonly solids?: readonly RoadSolid[];
  project(x: number, z: number): CourseProjection;
}

export const BLACKGLASS_WORLD: RoadWorld = {
  id: "blackglass-v1", start: COURSE.start, walls: COURSE_WALLS, project: projectOntoCourse,
};
