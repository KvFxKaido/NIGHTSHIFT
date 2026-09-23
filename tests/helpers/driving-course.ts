import courses from "../fixtures/driving-courses.json" with { type: "json" };
import { drawAlderCourse, type AlderCourse } from "../../src/sim/alder-course.ts";

/** Fixed paths for measured driving regressions. A seed alone is not a fixture:
 * changed parcel clearance changes route prices and therefore the course drawn.
 * These four paths were captured against the pre-clearance building baseline;
 * they still drive through the current world, traffic and collision geometry. */
export function drivingCourse(id:string):Pick<AlderCourse,"race"|"rival"|"start"> {
  const saved=(courses as unknown as Record<string,Pick<AlderCourse,"race"|"rival"|"start">>)[id];
  return saved?structuredClone(saved):drawAlderCourse(id,null);
}
