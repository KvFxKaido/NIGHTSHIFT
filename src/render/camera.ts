import type { CameraLook } from "../input/input.ts";

export interface CameraOrbitState {
  yawOffset: number;
  pitchOffset: number;
}

export const CAMERA_ORBIT = {
  yawSpeed: 2.65,
  pitchSpeed: 1.35,
  minPitch: -0.22,
  maxPitch: 0.48,
  drivingRecenterSpeed: 3.2,
  stationaryThreshold: 1.5,
} as const;

/**
 * A chase camera is a framing, not a physics setting: it decides where the
 * renderer stands, never what the car does. Distances are metres behind the
 * car, heights metres above its origin (the ground under it), and every
 * "atSpeed" term is added in full at top speed. Standard is the camera the
 * game has always had; near and far are fitted to Midnight Club 3's close
 * and zoomed-out chase cameras (2026-09-12, frames read by eye).
 */
export interface ChaseCamera {
  label: string;
  distance: number;
  distanceAtSpeed: number;
  height: number;
  heightAtSpeed: number;
  lookHeight: number;
  lookAhead: number;
  lookAheadAtSpeed: number;
  fov: number;
  fovAtSpeed: number;
  follow?: ChaseFollow;
}

/**
 * How a chase camera keeps up with the car. Without one the camera only eases
 * toward its place behind the car, and an eased camera trails a moving target by
 * about speed / ease rate: on Standard that is 8.7 m at 140 mph on top of the
 * table's 9.9 m, and 6.1 m off the table's 7.4 m of look-ahead, so the car is
 * drawn 18.6 m away with 1.3 m of road ahead of it (measured 2026-09-20).
 *
 * With one, the camera is first carried by the car's own drawn movement over the
 * ground and eases only what is left: the framing turning, the distance and the
 * height changing. The table's distances are then the ones on screen. What the
 * trailing used to say about a change of speed is authored instead, in metres
 * back per m/s² gained and metres in per m/s² lost. Height is never carried, so
 * bumps and crests stay as soft as they were.
 */
export interface ChaseFollow {
  /** Share of the car's movement the camera is carried by: 1 leaves no trailing at a steady speed, 0 is the eased camera. */
  carried: number;
  pullback: number;
  compression: number;
  maxPullback: number;
  maxCompression: number;
  /** How quickly the acceleration reading settles, per second. */
  response: number;
}

export const CHASE_CAMERAS = {
  near: {
    label: "Near", distance: 4.4, distanceAtSpeed: 1.6, height: 1.6, heightAtSpeed: 0.4,
    lookHeight: 1.7, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
  standard: {
    label: "Standard", distance: 7.2, distanceAtSpeed: 2.7, height: 3.15, heightAtSpeed: 1.05,
    lookHeight: 0.82, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
  // An experiment (2026-09-20), beside Standard so one press compares them: the
  // same framing to the digit, so the follow is the only difference. It is here
  // to be promoted into Standard or deleted; a saved choice of it falls back to
  // Standard when it goes (camera-preference.ts).
  standardB: {
    label: "Standard B", distance: 7.2, distanceAtSpeed: 2.7, height: 3.15, heightAtSpeed: 1.05,
    lookHeight: 0.82, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
    // Full braking is about 20 m/s², where compression reaches its limit and not
    // before; a launch is about 9, a metre and a half of pullback.
    follow: { carried: 1, pullback: 0.16, compression: 0.075, maxPullback: 2, maxCompression: 1.5, response: 3.5 },
  },
  far: {
    label: "Far", distance: 6.8, distanceAtSpeed: 2.7, height: 3.35, heightAtSpeed: 1.05,
    lookHeight: 2.3, lookAhead: 2.6, lookAheadAtSpeed: 4.8, fov: 62, fovAtSpeed: 15,
  },
} as const satisfies Record<string, ChaseCamera>;

export type ChaseCameraId = keyof typeof CHASE_CAMERAS;
export const DEFAULT_CHASE_CAMERA: ChaseCameraId = "standard";

export function isChaseCameraId(value: unknown): value is ChaseCameraId {
  return typeof value === "string" && Object.hasOwn(CHASE_CAMERAS, value);
}

/** Where the car was last drawn and how hard it was gaining speed, for a camera with a `follow`. */
export interface ChaseFollowState {
  x: number;
  z: number;
  speed: number;
  acceleration: number;
  known: boolean;
}

export function createChaseFollowState(): ChaseFollowState {
  return { x: 0, z: 0, speed: 0, acceleration: 0, known: false };
}

/** Further than any car is drawn moving in a frame: a reset, a placement or a scripted jump, as in interpolate.ts. */
const FOLLOW_TELEPORT = 8;
/** A hit stops a car in a tick. It should read as the hardest braking there is, not as 2,000 m/s². */
const FOLLOW_ACCELERATION_LIMIT = 20;

/**
 * One drawn frame of a carried camera: how far to carry it over the ground and
 * how much distance the change of speed adds (negative under braking). Across a
 * teleport, or on the first frame, it carries nothing and the camera eases over
 * as an uncarried one would.
 */
export function trackChaseFollow(
  state: ChaseFollowState,
  follow: ChaseFollow,
  car: { x: number; z: number; speed: number },
  frameDelta: number,
): { dx: number; dz: number; distance: number } {
  const movedX = car.x - state.x, movedZ = car.z - state.z;
  const continuous = state.known && Math.hypot(movedX, movedZ) <= FOLLOW_TELEPORT;
  if (!continuous) state.acceleration = 0;
  else if (frameDelta > 0) {
    const measured = clamp((car.speed - state.speed) / frameDelta, -FOLLOW_ACCELERATION_LIMIT, FOLLOW_ACCELERATION_LIMIT);
    state.acceleration += (measured - state.acceleration) * (1 - Math.exp(-follow.response * frameDelta));
  }
  state.x = car.x;
  state.z = car.z;
  state.speed = car.speed;
  state.known = true;
  const distance = state.acceleration >= 0
    ? Math.min(follow.maxPullback, state.acceleration * follow.pullback)
    : -Math.min(follow.maxCompression, -state.acceleration * follow.compression);
  return continuous
    ? { dx: movedX * follow.carried, dz: movedZ * follow.carried, distance }
    : { dx: 0, dz: 0, distance };
}

/** The change-camera control steps through the table in order and wraps: near, standard, standard B, far. */
export function nextChaseCamera(current: ChaseCameraId): ChaseCameraId {
  const ids = Object.keys(CHASE_CAMERAS) as ChaseCameraId[];
  return ids[(ids.indexOf(current) + 1) % ids.length]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createCameraOrbitState(): CameraOrbitState {
  return { yawOffset: 0, pitchOffset: 0 };
}

export function resetCameraOrbit(state: CameraOrbitState): void {
  state.yawOffset = 0;
  state.pitchOffset = 0;
}

export function updateCameraOrbit(
  state: CameraOrbitState,
  look: CameraLook,
  vehicleSpeed: number,
  frameDelta: number,
): void {
  const active = Math.abs(look.x) > 0.001 || Math.abs(look.y) > 0.001;
  if (active) {
    // Moving the camera left makes the view look right, matching conventional
    // third-person right-stick behavior.
    state.yawOffset = wrapAngle(
      state.yawOffset - look.x * CAMERA_ORBIT.yawSpeed * frameDelta,
    );
    state.pitchOffset = clamp(
      state.pitchOffset - look.y * CAMERA_ORBIT.pitchSpeed * frameDelta,
      CAMERA_ORBIT.minPitch,
      CAMERA_ORBIT.maxPitch,
    );
    return;
  }

  // A stopped car doubles as the current inspection mode. Preserve its orbit
  // until the player resets it or starts driving again.
  if (vehicleSpeed <= CAMERA_ORBIT.stationaryThreshold) return;
  const recenterBlend = 1 - Math.exp(-CAMERA_ORBIT.drivingRecenterSpeed * frameDelta);
  state.yawOffset = wrapAngle(state.yawOffset * (1 - recenterBlend));
  state.pitchOffset *= 1 - recenterBlend;
}

/** A car's place on the ground and the way it faces (the sim's convention: heading 0 faces -z). */
export interface CountdownCar { x: number; y: number; z: number; heading: number }
export interface CountdownShot {
  readonly name: "you" | "rival" | "both";
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

/**
 * The cuts through a race's countdown (design/TRANSITIONS.md, "The flash sequence"). The countdown is the sim's 180
 * ticks and is not lengthened for them: the launch charge and every rival's launch are timed on it. By ticks left:
 * over 120 your car, 60 to 120 the rival's, 30 to 60 both from behind, and the last 30 (half a second) nothing, which
 * hands the frame back to the chase camera so the launch is made seeing the road. With no racing rival (a solo race,
 * the drift yard) your car holds until 75 and both becomes you from behind. Hard cuts, a slow push in each: a
 * countdown is too short to ease between shots. Camera only; nothing here is read back by the sim.
 *
 * A shot stands on the side of its car away from the other one, so it never looks through it, and on the road
 * (`onRoad`); if that side is off the road it takes the other, and if both are it tucks in close to the car.
 */
export const COUNTDOWN_CUTS = { you: 120, rival: 60, both: 30, alone: 75 } as const;
export function countdownShot(ticksLeft: number, you: CountdownCar, rival: CountdownCar | null,
  onRoad: (x: number, z: number) => boolean): CountdownShot | null {
  if (ticksLeft <= COUNTDOWN_CUTS.both) return null;
  const hero = rival ? COUNTDOWN_CUTS.you : COUNTDOWN_CUTS.alone;
  const frame = (car: CountdownCar) => ({ fx: -Math.sin(car.heading), fz: -Math.cos(car.heading), rx: Math.cos(car.heading), rz: -Math.sin(car.heading) });
  // How far into a shot this tick is, 0 to 1, for the push in.
  const through = (from: number, to: number) => Math.min(1, Math.max(0, (from - ticksLeft) / (from - to)));
  const front = (name: "you" | "rival", car: CountdownCar, other: CountdownCar | null, u: number): CountdownShot => {
    const { fx, fz, rx, rz } = frame(car), ahead = 4.8 - .7 * u;
    const away = other ? -Math.sign((other.x - car.x) * rx + (other.z - car.z) * rz) || 1 : 1;
    const at = (side: number) => [car.x + fx * ahead + rx * side, car.y + .55, car.z + fz * ahead + rz * side] as const;
    const position = [2.3 * away, -2.3 * away, 1.2 * away].map(at).find(p => onRoad(p[0], p[2])) ?? at(1.2 * away);
    return { name, position, target: [car.x + fx * .7, car.y + .6, car.z + fz * .7], fov: 42 };
  };
  if (ticksLeft > hero) return front("you", you, rival, through(hero + 60, hero));
  if (rival && ticksLeft > COUNTDOWN_CUTS.rival) return front("rival", rival, you, through(hero, COUNTDOWN_CUTS.rival));
  const u = through(rival ? COUNTDOWN_CUTS.rival : hero, COUNTDOWN_CUTS.both), { fx, fz, rx, rz } = frame(you);
  // Both from behind and above, looking down the road past them; the rival's side of the road leans the frame to it.
  const lean = rival ? ((rival.x - you.x) * rx + (rival.z - you.z) * rz) / 2 : 0;
  const back = 10.5 - 1.2 * u;
  return { name: "both", fov: 50,
    position: [you.x - fx * back + rx * lean, you.y + 3.4, you.z - fz * back + rz * lean],
    target: [you.x + fx * 9 + rx * lean, you.y + .8, you.z + fz * 9 + rz * lean] };
}
