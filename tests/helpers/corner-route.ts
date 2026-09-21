import { ALDER_STREETS, alderHeight } from "../../src/sim/alder.ts";
import { fieldAlderRival } from "../../src/sim/alder-course.ts";
import { sampleDrivingPath, type RivalDefinition } from "../../src/sim/rival.ts";
import type { CornerSite } from "../../src/sim/corner-dressing.ts";
import type { CoursePoint } from "../../src/sim/track.ts";

/** Follow the actual two street arms for 85 m each, including any bends. */
export function cornerRoute(site: CornerSite, reverse = false): RivalDefinition {
  const arms = site.arms.map(id => {
    const street = ALDER_STREETS.find(s => s.id === id)!;
    const points = [...street.points];
    const distance = (p: CoursePoint) => Math.hypot(p.x - site.junction[0], p.z - site.junction[1]);
    if (distance(points[0]!) > distance(points.at(-1)!)) points.reverse();
    const trimmed = [points[0]!]; let remaining = 85;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length >= remaining) {
        const t = remaining / length, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        trimmed.push({ ...b, x, z, y: alderHeight(x, z) }); break;
      }
      trimmed.push(b); remaining -= length;
    }
    return trimmed;
  });
  if (reverse) arms.reverse();
  const points = [...arms[0]!.reverse(), ...arms[1]!.slice(1)];
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const first = points[0]!, next = points[1]!;
  const route: RivalDefinition = { id: `${site.id}-${reverse ? "reverse" : "forward"}`, car: "kestrel", points, along, gates: [along.at(-1)!],
    start: { x: first.x, z: first.z, y: first.y, pitch: 0, heading: Math.atan2(first.x - next.x, first.z - next.z) } };
  const lane = sampleDrivingPath(route, 0);
  return fieldAlderRival({ ...route, start: { ...route.start, x: lane.x, z: lane.z, y: alderHeight(lane.x, lane.z) } });
}
