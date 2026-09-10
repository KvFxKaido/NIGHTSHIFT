import { maxCorneringSpeed, type Input, type RivalState } from "./sim.ts";
import type { RoadWorld } from "./road-world.ts";
import type { CoursePoint } from "./track.ts";

export interface RivalDefinition {
  readonly id: string;
  readonly start: RoadWorld["start"];
  readonly points: readonly CoursePoint[];
  readonly along: readonly number[];
  readonly gates: readonly number[];
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
export function sampleRivalPath(route: RivalDefinition, distance: number) {
  distance = clamp(distance, 0, route.along.at(-1)!);
  let i = 0;
  while (i < route.points.length - 2 && route.along[i + 1]! < distance) i++;
  const a = route.points[i]!, b = route.points[i + 1]!;
  const length = route.along[i + 1]! - route.along[i]!;
  const t = length ? (distance - route.along[i]!) / length : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    ux: (b.x - a.x) / length, uz: (b.z - a.z) / length, width: Math.min(a.width,b.width), index: i };
}
interface Obstacle { x: number; y: number; z: number; speed: number; heading: number; length?: number }
/** A fixed-tick driver: plans input, never moves the car or disables contact. */
export function rivalInput(route: RivalDefinition, state: RivalState, obstacles: readonly Obstacle[]): Input {
  const car = state.vehicle, driver = state.driver;
  if (state.race.countdown > 0 || state.race.finished) return { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  const gate = route.gates[state.race.checkpoint]!;
  let nearest = Infinity, along = driver.along;
  // Local progress prevents jumping between the outward and return legs.
  for (let i = 0; i < route.points.length - 1; i++) {
    if (route.along[i + 1]! < driver.along - 65 || route.along[i]! > Math.min(gate + 8, driver.along + 100)) continue;
    const a = route.points[i]!, b = route.points[i + 1]!;
    const dx = b.x-a.x, dz=b.z-a.z, length = Math.hypot(dx,dz);
    const t = clamp(((car.x-a.x)*dx+(car.z-a.z)*dz)/(length*length),0,1);
    const distance = Math.hypot(car.x-a.x-dx*t,car.z-a.z-dz*t);
    if (distance < nearest) { nearest=distance; along=route.along[i]!+t*length; }
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
  let desiredSpeed = 34;
  for (let d = 0; d <= 100; d += 4) {
    const at = driver.along + d;
    const a=sampleRivalPath(route,at-8), b=sampleRivalPath(route,at), c=sampleRivalPath(route,at+8);
    const ab=Math.hypot(b.x-a.x,b.z-a.z), bc=Math.hypot(c.x-b.x,c.z-b.z), ac=Math.hypot(c.x-a.x,c.z-a.z);
    const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
    const radius=cross<.001?Infinity:ab*bc*ac/(2*cross);
    const cornerSpeed=Math.max(7, maxCorneringSpeed(radius)*.62);
    desiredSpeed=Math.min(desiredSpeed,Math.sqrt(cornerSpeed**2+2*5*Math.max(0,d-12)));
  }
  // Stay on the road while making room for a slower car. Crossing traffic is
  // handled by braking too; it remains a solid kinematic hazard.
  let offset = driver.along < driver.bypassUntil ? driver.recoverySide * Math.min(5, target.width / 2 - 2.2) : 0;
  for (const obstacle of obstacles) {
    if (Math.abs(obstacle.y-car.y)>3) continue;
    const dx=obstacle.x-car.x, dz=obstacle.z-car.z;
    const ahead=dx*target.ux+dz*target.uz, side=dx*-target.uz+dz*target.ux;
    const length=(obstacle.length??4.2)/2+2.1;
    if (ahead < -length || ahead > 15+car.speed*1.6 || Math.abs(side)>5) continue;
    const clearance=Math.min(3.8,target.width/2-2.2);
    const candidate=side>=0?-clearance:clearance;
    const blocked=obstacles.some(other=>other!==obstacle && Math.hypot(other.x-(car.x-target.uz*candidate),other.z-(car.z+target.ux*candidate))<7);
    if (!blocked) offset=candidate;
    const projectedSpeed=obstacle.speed*(-Math.sin(obstacle.heading)*target.ux-Math.cos(obstacle.heading)*target.uz);
    if (Math.abs(side-driver.avoidance)<2.8 && ahead>0) {
      desiredSpeed=Math.min(desiredSpeed,Math.max(0,projectedSpeed)+Math.max(0,ahead-length-5)*.65);
    }
  }
  driver.avoidance += clamp(offset-driver.avoidance,-.07,.07);
  const tx=target.x-target.uz*driver.avoidance, tz=target.z+target.ux*driver.avoidance;
  const error=angle(Math.atan2(car.x-tx,car.z-tz)-car.heading);
  if (Math.abs(error)>1) desiredSpeed=Math.min(desiredSpeed,6);
  if (nearest>5) desiredSpeed=Math.min(desiredSpeed,10);
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
  const steer=clamp(-error*3.5 + car.lateralSpeed*.025,-1,1);
  return {throttle:car.speed>desiredSpeed+.5?0:clamp((desiredSpeed-car.speed)/5+.16,0,1),
    brake:car.speed>desiredSpeed+.5?clamp((car.speed-desiredSpeed)/5,0,1):0,
    steer,handbrake:desiredSpeed<.5&&car.speed<.7?1:0};
}
