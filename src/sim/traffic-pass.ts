import { projectOntoPath } from "./street-path.ts";
import { RIVAL_CORNERING, routeHeightAt, sampleDrivingPath, type RivalDefinition, type RivalDriver } from "./rival.ts";
import { laneRest } from "./street-line.ts";
import { handlingFor, maxCorneringSpeed, type VehicleState } from "./sim.ts";
import { forecastTrafficPath, TRAFFIC_KINDS, type TrafficNetwork, type TrafficVehicleState } from "./traffic.ts";

export interface PassingContext {
  network: TrafficNetwork;
  vehicles: readonly TrafficVehicleState[];
  tick: number;
  /** True outside pavement, matching RoadWorld.ground. */
  ground?: (x: number, z: number) => boolean;
  opponent?: Pick<VehicleState, "x" | "y" | "z" | "heading" | "speed">;
}
export interface TrafficPass {
  target: number;
  from: number;
  out: number;
  back: number;
  to: number;
  initial: number;
  offset: number;
  nextRead: number;
  speed: number;
  started?: number;
  returning?: boolean;
}
export interface PassingDecision {
  pass: TrafficPass;
}
export const TRAFFIC_PASS = {
  every: 12, horizon: 6, settle: 2, spacing: 4, margin: .55, rejoinGap: 10,
  acceleration: 4, braking: 8, clearance: 2.5,
  /** The footprint forecast assumes close tracking; leave larger bends to the corner driver. */
  bendLimit: .15,
  /** Metres further a pass is held out, tried in turn, when all that blocks its return is the car it is passing. */
  holdOut: [20, 40, 60, 80, 110, 140],
} as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** How long a pull-out or a rejoin is at `speed`, metres: 1.4 s of it, and no less than 25 m. */
const swingLength = (speed: number) => Math.max(25, speed * 1.4);
const ease = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };

/** A complete pull-out / alongside / rejoin path, expressed in the road's frame. */
export function passingOffset(route: RivalDefinition, pass: TrafficPass, at: number): number {
  if (at < pass.out) return pass.initial + (pass.offset - pass.initial) * ease((at - pass.from) / (pass.out - pass.from));
  if (at <= pass.back) return pass.offset;
  const rest = laneRest(sampleDrivingPath(route, at).width);
  return pass.offset + (rest - pass.offset) * ease((at - pass.back) / (pass.to - pass.back));
}
export function passingPoint(route: RivalDefinition, pass: TrafficPass, at: number) {
  const p = sampleDrivingPath(route, at), offset = passingOffset(route, pass, at);
  return { ...p, x: p.x - p.uz * offset, z: p.z + p.ux * offset };
}

/** SAT on the two oriented car footprints, with tracking room around the rival. */
export function passingOverlap(x: number, z: number, ux: number, uz: number,
  at: { x: number; z: number; heading: number }, kind: TrafficVehicleState["kind"]): boolean {
  const spec = TRAFFIC_KINDS[kind], vx = -Math.sin(at.heading), vz = -Math.cos(at.heading);
  const dx = at.x - x, dz = at.z - z, halfLength = 2.4 + TRAFFIC_PASS.margin, halfWidth = 1 + TRAFFIC_PASS.margin;
  for (const [ax, az] of [[ux, uz], [-uz, ux], [vx, vz], [-vz, vx]]) {
    const own = halfLength * Math.abs(ux * ax! + uz * az!) + halfWidth * Math.abs(-uz * ax! + ux * az!);
    const other = spec.length / 2 * Math.abs(vx * ax! + vz * az!) + spec.width / 2 * Math.abs(-vz * ax! + vx * az!);
    if (Math.abs(dx * ax! + dz * az!) >= own + other) return false;
  }
  return true;
}

type Forecast = { vehicle: Pick<TrafficVehicleState, "id" | "kind">; path: ReturnType<typeof forecastTrafficPath> };
/** Evaluate a candidate's curvature, arrival times, sampled footprint and exit together. */
export function evaluatePass(route: RivalDefinition, pass: TrafficPass, car: VehicleState, along: number,
  forecasts: readonly Forecast[], ground?: PassingContext["ground"]): { clear: boolean; time: number; speed: number; collision: number; reason?: "geometry" | "horizon" | "occupied" | "unfinished" } {
  const handling = handlingFor(route), points: { x: number; z: number; ux: number; uz: number; limit: number; distance: number; station: number }[] = [];
  let distance = 0;
  const end = Math.min(route.along.at(-1)!, pass.to + Math.min(120, car.speed * TRAFFIC_PASS.settle));
  for (let at = along; at <= end + TRAFFIC_PASS.spacing; at += TRAFFIC_PASS.spacing) {
    const p = passingPoint(route, pass, Math.min(at, end));
    // Never through road already driven (pass-v5, 2026-09-25): three points on a path give its circle at any spacing, so
    // the point behind stops at the car. Committed just out of a corner, the first sample read the arc it had left, 27 m,
    // and capped the plan at 35 mph from 46 while every re-read from 4 m on allowed 78 and more (gen-81, seed 0).
    const a = passingPoint(route, pass, Math.max(along, at - 6)), b = passingPoint(route, pass, at + 6);
    const chord = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / chord, uz = (b.z - a.z) / chord;
    const ab = Math.hypot(p.x - a.x, p.z - a.z), bc = Math.hypot(b.x - p.x, b.z - p.z);
    const cross = Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x));
    const radius = cross < .001 ? Infinity : ab * bc * chord / (2 * cross);
    if (radius < 9) return { clear: false, time: Infinity, speed: 0, collision: distance, reason: "geometry" };
    const limit = Math.min(handling.topSpeed, Math.max(7, maxCorneringSpeed(radius, handling) * RIVAL_CORNERING.speedFactor));
    const previous = points.at(-1);
    if (previous) distance += Math.hypot(p.x - previous.x, p.z - previous.z);
    // Keep the complete footprint on the paved road, including the outside of a bent passing path.
    if (Math.abs(passingOffset(route, pass, at)) > p.width / 2 + (route.shoulder ?? 0) - TRAFFIC_PASS.clearance) return { clear: false, time: Infinity, speed: 0, collision: distance, reason: "geometry" };
    if (ground) for (const side of [-1, 1]) for (const end of [-1, 1]) {
      if (ground(p.x + ux * end * 2.4 - uz * side * 1.2, p.z + uz * end * 2.4 + ux * side * 1.2))
        return { clear: false, time: Infinity, speed: 0, collision: distance, reason: "geometry" };
    }
    points.push({ x: p.x, z: p.z, ux, uz, limit, distance, station: at });
    if (at >= end) break;
  }
  const speeds = points.map(p => p.limit);
  for (let i = speeds.length - 2; i >= 0; i--) speeds[i] = Math.min(speeds[i]!, Math.sqrt(speeds[i + 1]! ** 2 + 2 * TRAFFIC_PASS.braking * (points[i + 1]!.distance - points[i]!.distance)));
  const firstSpeed = speeds[0] ?? handling.topSpeed;
  if (speeds.length) speeds[0] = Math.max(1, car.speed);
  for (let i = 1; i < speeds.length; i++) speeds[i] = Math.min(speeds[i]!, Math.sqrt(speeds[i - 1]! ** 2 + 2 * TRAFFIC_PASS.acceleration * (points[i]!.distance - points[i - 1]!.distance)));
  let time = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i) time += 2 * (p.distance - points[i - 1]!.distance) / Math.max(2, speeds[i]! + speeds[i - 1]!);
    if (time > TRAFFIC_PASS.horizon + (p.station > pass.to ? TRAFFIC_PASS.settle : 0)) return { clear: false, time, speed: firstSpeed, collision: p.distance, reason: "horizon" };
    for (const forecast of forecasts) for (const slack of [-.25, 0, .25]) {
      const at = forecast.path[clamp(Math.round((time + slack) / .25), 0, forecast.path.length - 1)]!;
      if (passingOverlap(p.x, p.z, p.ux, p.uz, at, forecast.vehicle.kind))
        return { clear: false, time, speed: firstSpeed, collision: p.distance, reason: "occupied" };
    }
    if (!pass.returning && p.station >= pass.to && (!i || points[i - 1]!.station < pass.to)) {
      for (const lead of forecasts.filter(forecast => forecast.vehicle.id === pass.target)) {
        const at = lead.path[clamp(Math.round(time / .25), 0, lead.path.length - 1)]!;
        if ((p.x - at.x) * p.ux + (p.z - at.z) * p.uz < TRAFFIC_PASS.rejoinGap)
          return { clear: false, time, speed: firstSpeed, collision: p.distance, reason: "unfinished" };
      }
    }
  }
  return { clear: true, time, speed: firstSpeed, collision: Infinity };
}

/** Plan only for race rivals. A chosen side persists through the pass; uncertainty costs speed, not a side switch. */
export function planTrafficPass(route: RivalDefinition, driver: RivalDriver, car: VehicleState, context: PassingContext): PassingDecision | undefined {
  if (driver.reverseTicks > 0 || driver.along < driver.bypassUntil) {
    delete driver.trafficPass;
    return undefined;
  }
  let pass = driver.trafficPass;
  const here = sampleDrivingPath(route, driver.along);
  const relative = (v: TrafficVehicleState) => {
    const ahead = (v.x - car.x) * here.ux + (v.z - car.z) * here.uz;
    const road = sampleDrivingPath(route, driver.along + ahead);
    return { ahead, side: (v.x - road.x) * -road.uz + (v.z - road.z) * road.ux,
      speed: v.speed * (-Math.sin(v.heading) * here.ux - Math.cos(v.heading) * here.uz) };
  };
  const sameRoad = (v: { x: number; y: number; z: number }) => {
    const ahead = (v.x - car.x) * here.ux + (v.z - car.z) * here.uz;
    return Math.abs(v.y - routeHeightAt(route, driver.along + ahead) - (car.y - routeHeightAt(route, driver.along))) < 3;
  };
  const nearby = context.vehicles.filter(v => Math.hypot(v.x - car.x, v.z - car.z) < 280 && sameRoad(v));
  const target = pass ? nearby.find(v => v.id === pass!.target) : undefined;
  if (pass && !pass.returning && driver.along >= pass.back - Math.max(8, car.speed * .5) && target && relative(target).ahead > -TRAFFIC_PASS.rejoinGap) {
    // The lead slowed/accelerated differently from its forecast. Stay alongside until genuinely clear.
    const extra = Math.max(12, car.speed * .5);
    pass.back += extra; pass.to += extra;
  }
  if (pass && !pass.returning && target && driver.along > pass.out && relative(target).ahead < -TRAFFIC_PASS.rejoinGap && driver.along < pass.back) {
    // Past its lead early, it comes back in from here, over as long a rejoin as the speed it is doing now asks for
    // (pass-v4, 2026-09-25). It kept the length chosen when the pass began: planned at 41 mph over 25 m and pulled in at
    // 64, the tighter curve capped it to 53 (gen-81, seed 0, 1.2 s). Never shorter than it was.
    const returnLength = Math.max(pass.to - pass.back, swingLength(car.speed));
    pass.back = driver.along; pass.to = pass.back + returnLength;
  }
  if (pass && driver.along > pass.to) { delete driver.trafficPass; pass = undefined; }
  if (pass && context.tick < pass.nextRead) return { pass };
  // Leave an already committed cut line alone. Pass planning takes ownership from the lane, before pulling out.
  if (!pass && (driver.lineBlend ?? 0) > .05) return undefined;
  const lead = nearby.map(vehicle => ({ vehicle, ...relative(vehicle) }))
    .filter(v => v.ahead > 2 && v.ahead < Math.min(95, 18 + car.speed * 2.5) && v.speed > 1 &&
      Math.cos(v.vehicle.heading - car.heading) > .8 && Math.abs(v.side - driver.avoidance) < 3 )
    .sort((a, b) => a.ahead - b.ahead)[0];
  if (!pass && !lead) return undefined;
  if (!pass && context.tick % TRAFFIC_PASS.every) return undefined;
  // Test both holding speed and accelerating out of a turn. Otherwise a slow
  // merging car is forecast behind the rival but accelerates alongside it.
  const forecasts: Forecast[] = nearby.flatMap(vehicle => [false, true].map(accelerate => ({ vehicle,
    path: forecastTrafficPath(context.network, vehicle, TRAFFIC_PASS.horizon + TRAFFIC_PASS.settle + .25, .25, accelerate) })));
  const opponent = context.opponent;
  // The player is in a pass's way only while they are ahead of this car (2026-09-23). Behind or alongside they are the
  // one closing, and this car races them as it does everywhere else (RIVAL_RACING: blocks a player catching it, holds
  // its line alongside, never brakes for them). Their forecast is a straight line at their speed, so a player catching
  // this car ran through it in the forecast and the pass capped its speed to stop short of where they would hit it:
  // Wake braked from 98 mph to 45 pulling out round a sedan with Shawn coming up behind her at 120, and he went by
  // (gen-wake-42). Judged now, not at the forecast's overlap: a sample's quarter-second of slack puts a player closing
  // at 118 mph 13 m further on, ahead of her where they meet, and she braked from 104 to 83 as he drew level.
  if (opponent && sameRoad(opponent) && Math.hypot(opponent.x - car.x, opponent.z - car.z) < 280
    && (opponent.x - car.x) * here.ux + (opponent.z - car.z) * here.uz > 0) {
    forecasts.push({ vehicle: { id: -1, kind: "sedan" }, path: Array.from({ length: 34 }, (_, k) => ({
      x: opponent.x - Math.sin(opponent.heading) * opponent.speed * k * .25,
      z: opponent.z - Math.cos(opponent.heading) * opponent.speed * k * .25,
      heading: opponent.heading, speed: opponent.speed,
    })) });
  }
  if (pass) {
    // If the lead accelerated or the pass lost its advantage, return BEHIND it
    // when there is room. Never keep extending an unsuccessful pass into oncoming traffic.
    if (!pass.returning && target && context.tick - (pass.started ?? context.tick) > 180 && relative(target).ahead > 12) {
      const returning = { ...pass, from: driver.along, out: driver.along, back: driver.along,
        to: driver.along + Math.max(25, car.speed * 1.2), initial: driver.avoidance,
        offset: driver.avoidance, returning: true };
      if (evaluatePass(route, returning, car, driver.along, forecasts, context.ground).clear) {
        pass = returning; driver.trafficPass = pass;
      }
    }
    let evaluated = evaluatePass(route, pass, car, driver.along, forecasts, context.ground);
    // Not past the lead yet is not a reason to brake (2026-09-20). Where the only thing in the way is the car being
    // passed, at the point the path comes back in, an unclear plan used to cap the speed at a braking speed, which
    // works out at about the lead's own: Wake sat beside a sedan at 44 mph for five seconds of gen-wake-42, never
    // getting ahead because she was held to its speed, held to its speed because she was not ahead. Stay out
    // further instead, as far as clears it, and drive the corridor at the speed the corridor allows. Anything else
    // in the way (an oncoming car in the corridor, the player) still slows it, and a pass that cannot be held out
    // falls through to the brake as before.
    if (!evaluated.clear && !pass.returning && evaluated.reason !== "geometry" && driver.along + evaluated.collision >= pass.back - TRAFFIC_PASS.spacing) {
      const others = forecasts.filter(forecast => forecast.vehicle.id !== pass!.target);
      if (evaluatePass(route, pass, car, driver.along, others, context.ground).clear) {
        const length = pass.to - pass.back;
        for (const further of TRAFFIC_PASS.holdOut) {
          const held = { ...pass, back: Math.max(pass.back, driver.along) + further, to: Math.max(pass.back, driver.along) + further + length };
          if (held.to > route.along.at(-1)!) break;
          // Still only straights and gentle bends: the forecast's footprint assumes close tracking.
          let bends = false;
          for (let at = driver.along; at <= held.to && !bends; at += TRAFFIC_PASS.spacing) { const road = sampleDrivingPath(route, at); bends = road.ux * here.ux + road.uz * here.uz < Math.cos(TRAFFIC_PASS.bendLimit); }
          if (bends) break;
          const again = evaluatePass(route, held, car, driver.along, forecasts, context.ground);
          if (!again.clear) continue;
          pass.back = held.back; pass.to = held.to; evaluated = again;
          break;
        }
      }
    }
    pass.nextRead = context.tick + TRAFFIC_PASS.every;
    pass.speed = evaluated.clear ? evaluated.speed : Math.min(evaluated.speed, Math.sqrt(2 * TRAFFIC_PASS.braking * Math.max(0, evaluated.collision - 8)));
    return { pass };
  }

  const from = driver.along, outLength = swingLength(car.speed);
  const closing = car.speed - Math.max(lead!.speed, TRAFFIC_KINDS[lead!.vehicle.kind].cruise);
  if (closing < 4) return undefined;
  const alongside = Math.max(outLength + 8, car.speed * (lead!.ahead + TRAFFIC_PASS.rejoinGap) / closing);
  const back = from + alongside, to = back + outLength;
  if (to > route.along.at(-1)!) return undefined;
  // The lane is itself a candidate. A nearby car that will turn away or be
  // clear before arrival does not justify a detour and an abandoned corner line.
  const lane: TrafficPass = { target: -1, from, out: from + outLength, back: to, to,
    initial: driver.avoidance, offset: laneRest(here.width), nextRead: 0, speed: car.speed, returning: true };
  if (evaluatePass(route, lane, car, from, forecasts, context.ground).reason !== "occupied") return undefined;
  const gap = TRAFFIC_KINDS[lead!.vehicle.kind].width / 2 + 1 + TRAFFIC_PASS.margin + .35;
  // Choose the side beside where the lead WILL be. A merging car can move several
  // metres across the road while we pull out; its current lateral offset is not its lane.
  const leadPaths = forecasts.filter(f => f.vehicle.id === lead!.vehicle.id).map(f => f.path);
  const meeting = Math.min(4, lead!.ahead / Math.max(4, car.speed - lead!.speed));
  const laterals = leadPaths.flatMap(leadPath => [meeting, meeting + .5, meeting + 1].map(seconds => {
    const future = leadPath[Math.min(leadPath.length - 1, Math.round(seconds / .25))]!;
    const projection = projectOntoPath(route.points, future.x, future.z);
    const road = sampleDrivingPath(route, projection.along);
    return (future.x - road.x) * -road.uz + (future.z - road.z) * road.ux;
  }));
  const candidates = [-1, 1].map(side => ({ target: lead!.vehicle.id, from, out: from + outLength, back, to,
    initial: driver.avoidance, offset: (side < 0 ? Math.min(...laterals) : Math.max(...laterals)) + side * gap, nextRead: context.tick + TRAFFIC_PASS.every, speed: car.speed, started: context.tick }));
  const choices = candidates.map(candidate => ({ candidate, evaluation: evaluatePass(route, candidate, car, from, forecasts, context.ground) }))
    .filter(choice => choice.evaluation.clear)
    .sort((a, b) => a.evaluation.time - b.evaluation.time || Math.abs(a.candidate.offset - driver.avoidance) - Math.abs(b.candidate.offset - driver.avoidance));
  const choice = choices[0];
  if (!choice) return undefined;
  // At a bend the real car can track metres outside a perfectly clear geometric
  // path. This first passing planner owns straights and gentle bends only.
  for (let at = from; at <= to; at += TRAFFIC_PASS.spacing) {
    const road = sampleDrivingPath(route, at);
    if (road.ux * here.ux + road.uz * here.uz < Math.cos(TRAFFIC_PASS.bendLimit)) return undefined;
  }
  // If the reactive driver is already taking this corridor, replacing its
  // return with a new maneuver only changes timing and can delay the rejoin.
  if (Math.abs(choice.candidate.offset - driver.avoidance) < .5) return undefined;
  pass = choice.candidate; pass.speed = choice.evaluation.speed; driver.trafficPass = pass;
  return { pass };
}
