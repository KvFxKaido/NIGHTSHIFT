// Experimental only: imported solely by raceability-experiment-loader.mjs.
// Occupancy of a committed turn, not a promise of arrival time. Every pose uses world coordinates.
import { forecastTrafficPath, TRAFFIC_KINDS } from "../src/sim/traffic.ts";
import type { RivalDefinition, RivalDriver, sampleDrivingPath } from "../src/sim/rival.ts";
import { handlingFor, type VehicleState } from "../src/sim/sim.ts";
import type { PassingContext } from "../src/sim/traffic-pass.ts";

type WorldBox = { x: number; z: number; heading: number; halfLength: number; halfWidth: number };
function overlaps(a: WorldBox, b: WorldBox): boolean {
  const axes = (box: WorldBox) => [{ x: -Math.sin(box.heading), z: -Math.cos(box.heading) }, { x: -Math.cos(box.heading), z: Math.sin(box.heading) }];
  const aa = axes(a), bb = axes(b), dx = b.x - a.x, dz = b.z - a.z;
  const dot = (u: typeof aa[number], v: typeof aa[number]) => u.x * v.x + u.z * v.z;
  return [...aa, ...bb].every(axis => Math.abs(dx * axis.x + dz * axis.z) <=
    a.halfLength * Math.abs(dot(axis, aa[0]!)) + a.halfWidth * Math.abs(dot(axis, aa[1]!)) +
    b.halfLength * Math.abs(dot(axis, bb[0]!)) + b.halfWidth * Math.abs(dot(axis, bb[1]!)));
}

export function footprintStopSpeed(route: RivalDefinition, driver: RivalDriver, car: VehicleState, id: number | undefined,
  context: PassingContext, sample: typeof sampleDrivingPath): number | null {
  const vehicle = context.vehicles.find(v => v.id === id);
  // Scope the experiment to already-reserved turns, with no changes to passes or line taking.
  if (!vehicle || vehicle.wreck || !vehicle.holds.length || driver.trafficPass || (driver.lineBlend ?? 0) > .05) return null;
  const spec = TRAFFIC_KINDS[vehicle.kind];
  const path = forecastTrafficPath(context.network, vehicle, 4, .1);
  const reach = Math.min(80, 15 + Math.max(0, car.speed) * 1.6);
  const here = sample(route, driver.along);
  const errorX = car.x - (here.x - here.uz * driver.avoidance);
  const errorZ = car.z - (here.z + here.ux * driver.avoidance);
  const headingError = car.heading - Math.atan2(-here.ux, -here.uz);
  // A stopping car cannot be assumed to converge back to the ideal lane pose.
  // Carry its current position/heading error through the candidate stop corridor.
  // Admission uses this car's existing full service-brake capability. The
  // two-metre stand-off and reaction allowance remain experimental margins.
  const speed = Math.max(0, car.speed);
  const braking = handlingFor(route).brakeDeceleration;
  const stoppingDistance = speed * .1 + speed * speed / (2 * braking);
  for (let distance = 0; distance <= reach; distance += 1) {
    const p = sample(route, driver.along + distance);
    const own: WorldBox = { x: p.x - p.uz * driver.avoidance + errorX, z: p.z + p.ux * driver.avoidance + errorZ,
      heading: Math.atan2(-p.ux, -p.uz) + headingError, halfLength: 2.1, halfWidth: .95 };
    if (path.some(pose => overlaps(own, { ...pose, halfLength: spec.length / 2, halfWidth: spec.width / 2 }))) {
      const clearance = distance - 2;
      // Never introduce a new stop inside the sweep, or one we cannot reach.
      // This does not override existing braking or command acceleration to escape.
      if (clearance < stoppingDistance) return null;
      return Math.min(clearance * .65, Math.sqrt(2 * braking * clearance));
    }
  }
  return null;
}
