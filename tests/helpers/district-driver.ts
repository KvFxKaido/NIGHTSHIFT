import { createSim, maxCorneringSpeed, step, type Sim } from "../../src/sim/sim.ts";
import { createDistrictWorld, pathLength, projectOntoPath, routePoints, type DistrictRoute } from "../../src/sim/district.ts";
import { hasContact } from "./handling.ts";

/** Conservative inspection driver, not racing AI. Never teleports or disables collisions. */
export function driveDistrictRoute(route: DistrictRoute, inspect?: (sim: Sim) => void) {
  const points = routePoints(route), length = pathLength(points), cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative.at(-1)! +
    Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const sample = (distance: number) => {
    const along = route.kind === "circuit" ? (distance % length + length) % length : Math.min(length, Math.max(0, distance));
    let i = 0;
    while (i < points.length - 2 && cumulative[i + 1]! < along) i++;
    const t = (along - cumulative[i]!) / (cumulative[i + 1]! - cumulative[i]!);
    const a = points[i]!, b = points[i + 1]!;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, index: i };
  };
  const radius = (index: number) => {
    const a = sample(cumulative[index]! - 8), b = sample(cumulative[index]!), c = sample(cumulative[index]! + 8);
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    return area < 1e-6 ? Infinity : ab * bc * ac / (2 * area);
  };
  // No traffic. This driver is a geometry check — road surface, grades, corner
  // envelopes and barriers — and it drives a fixed line at the speed the corner
  // allows. Leaving traffic in would make it a test of whether a van happened to
  // be there, and it would fail on any route where one was. Traffic has its own
  // tests in tests/traffic.test.ts.
  const sim = createSim("fwd", createDistrictWorld(route), { traffic: false });
  let previous = 0, contactTicks = 0, maxOffset = 0, maxHeightStep = 0;
  let previousY = sim.state.vehicle.y;
  // The cap exists to catch a driver that is stuck, not to impose a lap time,
  // so it scales with the route. A 3.7 km orbital reached 96% of the way round
  // under the old fixed 160 s and read as a failure.
  const budget = Math.max(60 * 160, Math.ceil(length / 9) * 60);
  try {
    for (let tick = 0; tick < budget; tick++) {
      const car = sim.state.vehicle;
      inspect?.(sim);
      const projection = projectOntoPath(points, car.x, car.z);
      maxOffset = Math.max(maxOffset, projection.distance);
      if (tick > 1) maxHeightStep = Math.max(maxHeightStep, Math.abs(car.y - previousY));
      previousY = car.y;
      if (projection.distance > projection.width / 2 - 1.1) {
        return { completed: false, seconds: tick / 60, contactTicks, maxOffset, maxHeightStep, along: projection.along, reason: "left road" };
      }
      if ((route.kind === "circuit" && previous > length * 0.9 && projection.along < length * 0.1) ||
          (route.kind === "sprint" && projection.along > length - 2)) {
        return { completed: true, seconds: tick / 60, contactTicks, maxOffset, maxHeightStep, along: projection.along };
      }
      previous = projection.along;
      const lookAhead = 8 + car.speed * 0.35;
      const target = sample(projection.along + lookAhead);
      const heading = Math.atan2(car.x - target.x, car.z - target.z);
      const error = Math.atan2(Math.sin(heading - car.heading), Math.cos(heading - car.heading));
      let speed = 26;
      for (let distance = lookAhead; distance < lookAhead + 55; distance += 4) {
        speed = Math.min(speed, maxCorneringSpeed(radius(sample(projection.along + distance).index)) * 0.65);
      }
      const input = { throttle: car.speed > speed + 0.5 ? 0 : Math.max(0, Math.min(1, (speed - car.speed) / 5 + 0.2)),
        brake: car.speed > speed + 0.5 ? Math.min(1, (car.speed - speed) / 7) : 0,
        steer: Math.max(-1, Math.min(1, -error * 3.5)), handbrake: 0 };
      step(sim, input);
      if (hasContact(sim)) contactTicks++;
    }
    return { completed: false, seconds: budget / 60, contactTicks, maxOffset, maxHeightStep, along: previous, reason: "timeout" };
  } finally { sim.world.free(); }
}
