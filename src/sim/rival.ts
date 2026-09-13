import { HANDLING, maxCorneringSpeed, steeringAngleFor, type Input, type RivalState } from "./sim.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";
import type { RaceDefinition } from "./race.ts";

export interface RivalDefinition {
  readonly drivetrain?: "fwd" | "awd" | "rwd";
  readonly id: string;
  readonly start: RoadWorld["start"];
  readonly points: readonly CoursePoint[];
  readonly along: readonly number[];
  readonly gates: readonly number[];
  readonly loop?: boolean;
  readonly speedLimit?: number;
  /** Each point's offset from the road's centre, positive to the right, when the
   *  route is a racing line (`racing-line.ts`). Absent means the points are the centre. */
  readonly lateral?: readonly number[];
}
export interface RivalDriver {
  along: number;
  progressMark: number;
  noProgressTicks: number;
  resetCheckIn: number;
  resets: number;
  stuckTicks: number;
  reverseTicks: number;
  recoveries: number;
  recoverySide: number;
  bypassUntil: number;
  avoidance: number;
  targetSpeed: number;
}
export function createRivalDriver(): RivalDriver {
  return { along: 0, progressMark: 0, noProgressTicks: 0, resetCheckIn: 0, resets: 0, stuckTicks: 0, reverseTicks: 0, recoveries: 0, recoverySide: 0, bypassUntil: 0, avoidance: 0, targetSpeed: 0 };
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
/** The segment a distance falls in: the first whose end is at or past it, as a
 *  linear scan from the start would find, by binary search so a densely sampled
 *  racing line costs the same as a street's few points. */
function segmentAt(along: readonly number[], distance: number): number {
  let low = 0, high = along.length - 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (along[mid + 1]! < distance) low = mid + 1; else high = mid;
  }
  return low;
}
export function sampleRivalPath(route: RivalDefinition, distance: number) {
  distance = clamp(distance, 0, route.along.at(-1)!);
  const i = segmentAt(route.along, distance);
  const a = route.points[i]!, b = route.points[i + 1]!;
  const length = route.along[i + 1]! - route.along[i]!;
  const t = length ? (distance - route.along[i]!) / length : 0;
  const lateral = route.lateral ? route.lateral[i]! + (route.lateral[i + 1]! - route.lateral[i]!) * t : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    ux: (b.x - a.x) / length, uz: (b.z - a.z) / length, width: Math.min(a.width,b.width), lateral, index: i };
}

/** Metres past a gate the exit direction is read at: past any kerb mitre, well short of the next junction. */
export const EXIT_LOOKAHEAD = 6;
/** The direction the line leaves each gate in — the marker's arrow — read
 *  from the line itself. The finish has none: no arrow is how you know it is
 *  the finish. */
export function gateExits(route: RivalDefinition): ({ x: number; z: number } | null)[] {
  return route.gates.map((along, i) => {
    if (i === route.gates.length - 1) return null;
    const at = sampleRivalPath(route, along), ahead = sampleRivalPath(route, along + EXIT_LOOKAHEAD);
    const run = Math.hypot(ahead.x - at.x, ahead.z - at.z);
    if (run < 1e-6) throw new RangeError(`${route.id} has no road past gate ${i}`);
    return { x: (ahead.x - at.x) / run, z: (ahead.z - at.z) / run };
  });
}
/** The race with each gate's exit taken from its rival's line: the reference
 *  route is the line, so the arrow is read from it rather than kept twice. */
export function withExits(race: RaceDefinition, route: RivalDefinition): RaceDefinition {
  if (route.gates.length !== race.checkpoints.length) {
    throw new RangeError(`${route.id} has ${route.gates.length} gates for ${race.checkpoints.length} checkpoints`);
  }
  if (race.kind === "unordered") return race;
  const exits = gateExits(route);
  return { ...race, checkpoints: race.checkpoints.map((gate, i) => exits[i] ? { ...gate, exit: exits[i]! } : gate) };
}
interface Obstacle { x: number; y: number; z: number; speed: number; heading: number; length?: number }
/** A fixed-tick driver: plans input, never moves the car or disables contact. */
/**
 * How a rival races the player (2026-09-13). Before this the player was passed
 * in with traffic, so the rival moved about 3.8 m away and braked beside them,
 * and braked behind a player it had no room to dodge: it let the player past.
 * With room it did pass, by dodging them as traffic. A racing rival now wants to
 * win: it goes for the pass instead of queueing, holds its line alongside,
 * covers the player's side when they close from behind, and does not lift for
 * contact. Traffic is still a hazard it slows for, and a player stopped in the
 * road still is too. Nothing here reads race position, and nothing changes
 * grip, mass or top speed: the same car, driven like it means it.
 */
/**
 * Which rival driver a recording was raced against. A recording with a rival
 * replays only against the same driver, so any change to how the rival drives
 * bumps this. "racing-line-v1" (2026-09-13): cornering tuned to recorded laps and a
 * smoothed line on Ridge Circuit. "full-line-v1": braking while turning, steering
 * feedforward and the full racing line. "full-line-v2": on a racing line the
 * lost-car speed cap means off the road, not off the line.
 */
export const RIVAL_REVISION = "full-line-v2";

export const RIVAL_RACING = {
  /** Metres ahead, plus this much per m/s of closing speed, that it starts a pass. */
  passReach: 15,
  passReachPerClosing: 1.6,
  /** A player slower than this is parked in the road, not racing: slow for them. */
  racingSpeed: 4,
  /** How far behind, in metres, a closing player gets blocked. */
  blockReach: 25,
  /** Share of the room available that a block uses, and its lateral rate in metres per tick. */
  blockShare: 0.8,
  blockRate: 0.03,
} as const;

/**
 * How hard the rival plans corners: its target speed is `speedFactor` of the
 * line's grip-limited speed, never below `minimumSpeed`, braked for at
 * `planningDeceleration` from `brakingMargin` metres before the corner.
 *
 * Tuned 2026-09-13 against Shawn's recorded laps of Ridge Circuit (Full, RWD
 * Cinder). At the apexes he used 74-82% of the car's lateral grip and braked at
 * 7-10 m/s² into the big stops; the rival, at 0.62, 5 and 12, used 19-43% and
 * braked at 3-5, lifting 320 m before T1. Braking was safe to match in full.
 * Corner speed was not: the rival follows the centreline with a lagging
 * steering controller, and at 0.82 it overshot the reverse bend after the
 * south junction onto the grass and ran 19.8 m wide on Sound to Sky. 0.74,
 * 0.76 and 0.78 were all clean, so 0.76 keeps a margin.
 *
 * Braking while turning (2026-09-13). The braking plan used to assume a
 * straight: from any corner back to the car, `planningDeceleration` the whole
 * way. It is now a speed profile worked back from the far end of the preview,
 * and at each sample the braking available is what cornering at that speed
 * leaves of `frictionShare` of the grip (a friction ellipse), so it brakes
 * before a curve rather than in it. On the full racing line it is what kept a
 * line 2.2 m from the edges clean on East; at the shipped 2.6 m the laps were
 * clean without it and 0.3 s faster, so it widens the margin rather than being
 * the fix. The fix was steering (RIVAL_STEERING; design/PORT_ALDER.md, "Braking
 * while turning").
 */
export const RIVAL_CORNERING = {
  speedFactor: 0.76,
  minimumSpeed: 7,
  planningDeceleration: 10,
  brakingMargin: 6,
  /** Share of lateral grip at which cornering leaves the braking plan nothing. */
  frictionShare: 0.9,
} as const;

/**
 * Steering feedforward (2026-09-13). The rival steered on heading error alone,
 * and an error-only controller holds a steady curve only by being off the line:
 * the steering a bend needs comes from the error that produces it. At 100 mph
 * round T9 that was 3-6 m outward, enough to put a racing line's outside wheel
 * on the grass. It now steers for the line's own curvature first, the wheel angle
 * `atan(wheelbase × curvature)` as a share of the lock allowed at this speed,
 * read `feedforwardLead` seconds ahead for the steering's lag, and the error only
 * corrects. Swept 0.6 to 0.9 on Ridge Circuit's full line, all clean with the
 * braking plan above; 0.8 is the middle. Racing lines only (routes with
 * `lateral`): a street centreline's curvature at its polyline corners is an
 * artefact of sampling, and steering for it put a generated race's rival 31 m
 * off the street.
 */
export const RIVAL_STEERING = { feedforward: 0.8, feedforwardLead: 0.3 } as const;

/** Metres past the carriageway's edge a rival on a racing line may be before it counts as lost: a paved shoulder's worth. */
export const OFF_ROAD_MARGIN = 1.5;

export function rivalInput(route: RivalDefinition, state: Pick<RivalState, "vehicle" | "driver"> & { race: RivalState["race"] | null }, obstacles: readonly Obstacle[], opponent: Obstacle | null = null): Input {
  const car = state.vehicle, driver = state.driver;
  if (state.race && (state.race.countdown > 0 || state.race.finished)) return { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  const gate = state.race ? route.gates[state.race.targetIndex]! : route.along.at(-1)!;
  if (route.loop && driver.along > gate - 12 && Math.hypot(car.x - route.points[0]!.x, car.z - route.points[0]!.z) < 8) {
    Object.assign(driver, createRivalDriver(), { recoveries: driver.recoveries, resets: driver.resets });
  }
  // `nearestSide` is the car's offset across that nearest segment, positive to the
  // right; `nearestRoad` is where that puts it across the road, and the road's width.
  let nearest = Infinity, nearestSide = 0, nearestRoad = 0, nearestWidth = Infinity, along = driver.along;
  // Local progress prevents jumping between the outward and return legs.
  // The window's segments, in order: the first ending past its start, until one begins past its end.
  const windowEnd = Math.min(gate + 8, driver.along + 100);
  for (let i = segmentAt(route.along, driver.along - 65); i < route.points.length - 1 && route.along[i]! <= windowEnd; i++) {
    if (route.along[i + 1]! < driver.along - 65) continue;
    const a = route.points[i]!, b = route.points[i + 1]!;
    const dx = b.x-a.x, dz=b.z-a.z, length = Math.hypot(dx,dz);
    const t = clamp(((car.x-a.x)*dx+(car.z-a.z)*dz)/(length*length),0,1);
    const distance = Math.hypot(car.x-a.x-dx*t,car.z-a.z-dz*t);
    if (distance < nearest) {
      nearest=distance; nearestSide=((car.x-a.x-dx*t)*-dz+(car.z-a.z-dz*t)*dx)/length; along=route.along[i]!+t*length;
      nearestRoad = nearestSide + (route.lateral ? route.lateral[i]! + (route.lateral[i + 1]! - route.lateral[i]!) * t : 0);
      nearestWidth = a.width + (b.width - a.width) * t;
    }
  }
  driver.along = Math.min(gate + 8, along);
  // A high-water mark prevents reversing or circling over the same few metres
  // from continually postponing the fallback reset. Off-road drift isn't progress.
  if (driver.along > driver.progressMark + 4 && nearest < sampleRivalPath(route, driver.along).width / 2) {
    driver.progressMark = driver.along;
    driver.noProgressTicks = 0;
  } else driver.noProgressTicks++;
  driver.resetCheckIn = Math.max(0, driver.resetCheckIn - 1);
  const lookAhead = 8 + car.speed * .35;
  const target = sampleRivalPath(route, Math.min(gate, driver.along + lookAhead));
  let desiredSpeed = route.speedLimit ?? HANDLING.topSpeed;
  // At highway speed, a 100 m preview cannot see a corner early enough to stop,
  // so the preview looks through the whole braking envelope.
  const { planningDeceleration } = RIVAL_CORNERING;
  const previewDistance = Math.max(100, car.speed ** 2 / (2 * planningDeceleration) + 24);
  const limits: number[] = [], curvatures: number[] = [];
  for (let d = 0; d <= previewDistance; d += 4) {
    const at = driver.along + d;
    const a=sampleRivalPath(route,at-8), b=sampleRivalPath(route,at), c=sampleRivalPath(route,at+8);
    const ab=Math.hypot(b.x-a.x,b.z-a.z), bc=Math.hypot(c.x-b.x,c.z-b.z), ac=Math.hypot(c.x-a.x,c.z-a.z);
    const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
    const radius=cross<.001?Infinity:ab*bc*ac/(2*cross);
    const cornerSpeed=Math.max(RIVAL_CORNERING.minimumSpeed, maxCorneringSpeed(radius)*RIVAL_CORNERING.speedFactor);
    // A straight's limit is infinite; the profile works in finite speeds.
    limits.push(Math.min(cornerSpeed, HANDLING.topSpeed)); curvatures.push(1 / radius);
  }
  // The fastest speed profile the line allows, worked back from the far end:
  // at each sample the braking left is what cornering at that speed does not use.
  const grip = RIVAL_CORNERING.frictionShare * HANDLING.maxLateralAcceleration;
  const profile = new Array<number>(limits.length);
  let v = profile[limits.length - 1] = limits.at(-1)!;
  for (let k = limits.length - 2; k >= 0; k--) {
    const share = v * v * curvatures[k]! / grip;
    v = Math.min(limits[k]!, Math.sqrt(v * v + 2 * planningDeceleration * Math.sqrt(Math.max(0, 1 - share * share)) * 4));
    profile[k] = v;
  }
  // Brake as if every corner were `brakingMargin` metres nearer.
  desiredSpeed = Math.min(desiredSpeed, profile[Math.min(profile.length - 1, Math.round(RIVAL_CORNERING.brakingMargin / 4))]!);
  // Stay on the road while making room for a slower car. Crossing traffic is
  // handled by braking too; it remains a solid kinematic hazard.
  let offset = driver.along < driver.bypassUntil ? driver.recoverySide * Math.min(5, target.width / 2 - 2.2) : 0;
  let blocking = false;
  // A parked or crawling player is in the way, not in the race: that one is
  // avoided and slowed for like any other obstacle. A racing player is raced.
  const hazards = opponent && opponent.speed < RIVAL_RACING.racingSpeed ? [...obstacles, opponent] : obstacles;
  if (opponent && opponent.speed >= RIVAL_RACING.racingSpeed && state.race && driver.along >= driver.bypassUntil
    && Math.abs(opponent.y - car.y) <= 3) {
    const dx = opponent.x - car.x, dz = opponent.z - car.z;
    const ahead = dx * target.ux + dz * target.uz, side = dx * -target.uz + dz * target.ux;
    const room = Math.min(3.8, target.width / 2 - 2.2);
    const opponentAlong = opponent.speed * (-Math.sin(opponent.heading) * target.ux - Math.cos(opponent.heading) * target.uz);
    const closing = car.speed - opponentAlong;
    const reach = RIVAL_RACING.passReach + Math.max(0, closing) * RIVAL_RACING.passReachPerClosing;
    if (ahead > 0 && ahead < reach && Math.abs(side) < 4 && room > 0) {
      // Behind them: take the side they are not covering. It does not queue,
      // so there is no speed match here; if the gap shuts, it is contact.
      offset = side >= 0 ? -room : room;
    } else if (ahead < -2.5 && ahead > -RIVAL_RACING.blockReach && Math.abs(side) < 6 && closing < 1 && room > 0
      // Not while braking for a corner: a block there throws the car wide.
      && desiredSpeed >= car.speed - 2) {
      // Ahead of them and being caught: cover their side of the road.
      offset = clamp(side, -room, room) * RIVAL_RACING.blockShare;
      blocking = true;
    }
    // Alongside (|ahead| small) nothing is added: it holds its line and does
    // not brake for them.
  }
  // Traffic (2026-09-13). It used to slow for anything within 5 m of its line
  // ahead, at that car's speed along the line: a car crossing a junction 80 m
  // on has none, so it braked for cars that would be gone before it arrived,
  // and it queued behind slower cars it could have passed. Now each car is
  // judged by where it will be when the rival gets there.
  const slowFor = (along: number, ahead: number, length: number) => {
    desiredSpeed=Math.min(desiredSpeed,Math.max(0,along)+Math.max(0,ahead-length-5)*.65);
  };
  for (const obstacle of hazards) {
    if (Math.abs(obstacle.y-car.y)>3) continue;
    const dx=obstacle.x-car.x, dz=obstacle.z-car.z;
    const ahead=dx*target.ux+dz*target.uz, side=dx*-target.uz+dz*target.ux;
    const length=(obstacle.length??4.2)/2+2.1;
    if (ahead < -length || ahead > 15+car.speed*1.6) continue;
    const headingX=-Math.sin(obstacle.heading), headingZ=-Math.cos(obstacle.heading);
    const along=obstacle.speed*(headingX*target.ux+headingZ*target.uz);
    const across=obstacle.speed*(headingX*-target.uz+headingZ*target.ux);
    const crossing=Math.abs(across)>2;
    if (!crossing && Math.abs(side)>5) continue;
    // Its offset across the line when this car reaches it, and how wide a
    // corridor that has to miss: a crossing car sweeps its own length.
    const arrival=Math.max(0,ahead-length)/Math.max(1,car.speed-along);
    const sideAtArrival=side+across*arrival;
    const inPath=Math.abs(sideAtArrival-driver.avoidance)<(crossing?length:2.6);
    const clearance=Math.min(3.8,target.width/2-2.2);
    const clear=(candidate: number)=>clearance>0 && !hazards.some(other=>other!==obstacle
      && Math.hypot(other.x-(car.x-target.uz*candidate),other.z-(car.z+target.ux*candidate))<7);
    if (crossing || along < -2) {
      // Crossing, or oncoming: it matters only if it will be across the line
      // when this car gets there, and then it is slowed for rather than
      // swerved round. Swerving round oncoming cars was tried on 2026-09-13
      // and lost time and hit more traffic (187 s, 119 contact ticks, against
      // 182 s and 30): the rival's line runs down the middle of the street, so
      // an oncoming car is often genuinely in its way. That is the line's
      // problem, not this loop's.
      if (inPath && ahead>0) slowFor(along,ahead,length);
      continue;
    }
    // Same direction: pass it on whichever side is clear, the way it passes
    // the player. Only with nowhere to go, or already on its bumper, does it
    // take that car's speed.
    const sides=side>=0?[-clearance,clearance]:[clearance,-clearance];
    const open=sides.find(clear);
    if (open!==undefined) { offset=open; blocking=false; }
    const onBumper=ahead-length<4;
    if (ahead>0 && Math.abs(side-driver.avoidance)<2.8 && (open===undefined || onBumper)) slowFor(along,ahead,length);
  }
  // A block eases across; dodging a hazard or taking a pass does not wait.
  const lateralRate = blocking ? RIVAL_RACING.blockRate : .07;
  driver.avoidance += clamp(offset-driver.avoidance,-lateralRate,lateralRate);
  // However far a pass, block or dodge moves it, the car stays on the road: on a
  // racing line the room each side is measured from where the line already is.
  const edge = Math.max(0, target.width / 2 - 2.2);
  driver.avoidance = clamp(driver.avoidance, -edge - target.lateral, edge - target.lateral);
  const tx=target.x-target.uz*driver.avoidance, tz=target.z+target.ux*driver.avoidance;
  const error=angle(Math.atan2(car.x-tx,car.z-tz)-car.heading);
  if (Math.abs(error)>1) desiredSpeed=Math.min(desiredSpeed,6);
  // Lost: held to 10 m/s until it is back. On a street centreline that is more
  // than 5 m from it. On a racing line it is off the road: the line and any pass
  // already use most of the width, and in a recorded race (2026-09-13) the rival
  // abandoning a re-pass at 95 mph drifted 6.5 m from its line, still 4 m inside
  // the edge, read as lost, and braked to 59 mph in the kink after the Drop.
  const lost = route.lateral ? Math.abs(nearestRoad) > nearestWidth / 2 + OFF_ROAD_MARGIN : nearest > 5;
  if (lost) desiredSpeed=Math.min(desiredSpeed,10);
  if (driver.along < driver.bypassUntil) desiredSpeed=Math.min(desiredSpeed,8);
  driver.targetSpeed=desiredSpeed;
  if (car.speed<1.2) driver.stuckTicks++; else driver.stuckTicks=0;
  if (driver.stuckTicks>100 && driver.reverseTicks===0) {
    driver.reverseTicks=110; driver.stuckTicks=0; driver.recoveries++;
    driver.recoverySide=Math.abs(error)>.1 ? -Math.sign(error) : driver.recoveries%2 ? 1 : -1;
    driver.bypassUntil=driver.along+20;
  }
  if (driver.reverseTicks>0) {
    driver.reverseTicks--;
    return {throttle:0,brake:car.forwardSpeed < -4 ? 0 : .65,steer:-driver.recoverySide*.8,handbrake:0};
  }
  // Heading feedback plus lateral-slip correction. The same steering envelope
  // and tyre forces that constrain the player constrain this request.
  // Feedforward: the wheel angle the line's curvature needs, as a share of the
  // lock the car allows at this speed, read a little ahead for the steering's lag.
  const ahead = Math.min(gate, driver.along + car.speed * RIVAL_STEERING.feedforwardLead);
  const p = sampleRivalPath(route, ahead - 8), q = sampleRivalPath(route, ahead), r = sampleRivalPath(route, ahead + 8);
  const pq = Math.hypot(q.x - p.x, q.z - p.z), qr = Math.hypot(r.x - q.x, r.z - q.z), pr = Math.hypot(r.x - p.x, r.z - p.z);
  // Signed, positive for a right-hand bend, which positive steer turns into.
  const lineCurvature = pq * qr * pr > 1e-6 ? 2 * ((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x)) / (pq * qr * pr) : 0;
  const wheelbase = HANDLING.frontAxleDistance + HANDLING.rearAxleDistance;
  // Only on a racing line: a street centreline turns at its polyline's corners, where
  // this curvature is an artefact of the sampling, and steering for it put the rival
  // 31 m off the street in a generated race.
  const feedforward = route.lateral ? RIVAL_STEERING.feedforward * Math.atan(wheelbase * lineCurvature) / Math.max(1e-6, steeringAngleFor(car.forwardSpeed)) : 0;
  const steer=clamp(-error*3.5 + car.lateralSpeed*.025 + feedforward,-1,1);
  // A clear racing straight needs full engine demand to overcome high-speed drag.
  // Feather only when the route, traffic or recovery asks for a lower speed.
  const throttle = desiredSpeed >= HANDLING.topSpeed ? 1 : clamp((desiredSpeed-car.speed)/5+.16,0,1);
  return {throttle:car.speed>desiredSpeed+.5?0:throttle,
    brake:car.speed>desiredSpeed+.5?clamp((car.speed-desiredSpeed)/5,0,1):0,
    steer,handbrake:desiredSpeed<.5&&car.speed<.7?1:0};
}
