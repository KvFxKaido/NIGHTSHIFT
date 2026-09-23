import { createTransmission, stepTransmission, TRANSMISSION, type TransmissionState } from "./transmission.ts";
import { createLaunch, LAUNCH, RIVAL_LAUNCH_SKILL, rivalLaunchCharge, stepLaunch, type LaunchState } from "./launch.ts";
import { dragLaneInput } from "./drag-rules.ts";
import { createRivalDriver, rivalInput, sampleRivalPath, withExits, type RivalDefinition, type RivalDriver } from "./rival.ts";
import { readStreetLine } from "./street-line.ts";
/* Deterministic planar four-wheel model. Tyres supply four independent forces;
   Rapier integrates motion and contacts. Three.js only draws the result. */
import RAPIER from "@dimforge/rapier3d-compat";
import { BLACKGLASS_WORLD, type RoadWorld } from "./road-world.ts";
import { createTraffic, knockTraffic, restoreTraffic, stepTraffic, TRAFFIC_KINDS, type TrafficNetwork, type TrafficRacer, type TrafficState } from "./traffic.ts";
import { createRace, raceHolding, racePosition, stepRace, type RaceDefinition, type RaceState } from "./race.ts";
import { CAR_TUNES, type CarTune } from "./car-handling.ts";

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const PHYSICS_VERSION = "four-wheel-v6";

export interface Input {
  shiftUp?: boolean;
  shiftDown?: boolean;
  throttle: number;
  brake: number;
  steer: number;
  handbrake: number;
}

export interface AxleState {
  slipAngle: number;
  longitudinalForce: number;
  lateralForce: number;
  /** Lateral axis of the tyre force envelope. */
  gripLimit: number;
  /** Powered 2WD assist may extend this axis without increasing lateral grip. */
  longitudinalGripLimit: number;
}

export type WheelId = "front-left" | "front-right" | "rear-left" | "rear-right";

export interface WheelState extends AxleState {
  steeringAngle: number;
  loadFraction: number;
  normalLoad: number;
  longitudinalSpeed: number;
  lateralSpeed: number;
  rollingDistance: number; // visual free-rolling distance, not simulated wheel inertia
  /**
   * How far this tyre has been overwhelmed by the pedals, -1 to 1: above zero it
   * is spinning, below it is locking (`HANDLING.wheelSpinUp`). Only the player's
   * car under an `?assist=` preview has it. Absent everywhere else, on purpose:
   * the default game's state keeps the shape it had, to the byte.
   */
  slip?: number;
}

export interface VehicleState {
  transmission?: TransmissionState;
  /** The start boost, on every race but a drag, which launches through the gearbox;
   *  and the player's burnout, which is the same hold anywhere else (`launch.ts`). */
  launch?: LaunchState;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  /** Lean across the ground, right side up positive. Drawn only, like pitch:
   *  no force reads either. */
  roll: number;
  speed: number;
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  steering: number;
  steeringAngle: number;
  driveDirection: 1 | -1;
  slipAngle: number;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  frontLoadFraction: number;
  rightLoadFraction: number;
  /** Share of the four tyres (0..1) that were off the paved surface on the last
   *  tick, whatever the drivetrain. AWD reads it but pays nothing for it. */
  groundContact: number;
  wheels: Record<WheelId, WheelState>;
  // Derived diagnostics retained for existing tools, never force generators.
  frontAxle: AxleState;
  rearAxle: AxleState;
}

export interface ParkedRival {
  readonly id: string;
  readonly name: string;
  readonly start: RoadWorld["start"];
  /** The car parked there (`car-handling.ts`). Absent is the shared model on RWD. */
  readonly car?: string;
}
/** A rival who cruises a loop in free roam, as Moth does, and can be flashed from nearby. */
export interface CruiseRival {
  readonly id: string;
  readonly name: string;
  readonly route: RivalDefinition;
}

export interface SimState {
  physicsVersion: typeof PHYSICS_VERSION;
  /** Always `handling.drivetrain`; kept for the many readers that only need the layout. */
  readonly drivetrain: Drivetrain;
  /** The player's car: its numbers, and the revision a recording names. */
  readonly handling: CarHandling;
  tick: number;
  vehicle: VehicleState;
  /** Null where the world has no lane graph, or where traffic is switched off
   *  for a geometry check. Never null in ordinary district play. */
  traffic: TrafficState | null;
  rival: RivalState | null;
  encounter?: VehicleState | null;
  encounterDriver: RivalDriver | null;
  parkedRivals: { id: string; name: string; vehicle: VehicleState }[];
  /** The Blacklist names beside Moth who cruise their turf in free roam (`alder-cruisers.ts`), in option order. */
  cruisers: { id: string; name: string; vehicle: VehicleState; driver: RivalDriver }[];
  /** Null in free roam. Progress through an open-checkpoint race: rules about
   *  where the car has been, decided per tick, so a replay reproduces the
   *  splits. The definition itself is static and lives on `Sim.race`. */
  race: RaceState | null;
}

export interface RivalState {
  readonly drivetrain: Drivetrain;
  /** The car its definition names (`handlingFor`), the same numbers the player gets on winning it. */
  readonly handling: CarHandling;
  vehicle: VehicleState;
  race: RaceState;
  driver: RivalDriver;
  input: Input;
  /** Behind the player and out of their sight, driving the road as if it were empty (`UNSEEN_ROAD`). Absent otherwise,
   *  so a race it never happens in is the state it was. */
  ghost?: true;
}
interface VehicleRig {
  roadWorld: RoadWorld;
  body: RAPIER.RigidBody;
  state: { vehicle: VehicleState; handling: CarHandling; race: RaceState | null };
  /** Only the player's rig, which is the Sim, has these (`SimOptions.pedalAssist`). */
  pedalAssist?: number;
  pedalFeedback?: PedalFeedback;
}

/**
 * How far past the tyres the pedals are, 0 to 1, for sound and rumble: the worst
 * driven tyre, and the worst braked one. Presentation reads it; it is not state,
 * is not hashed, and nothing in a tick reads it back.
 */
export interface PedalFeedback { spin: number; lock: number }

export interface Sim {
  readonly roadWorld: RoadWorld;
  /** `SimOptions.pedalAssist`: 1 unless previewed, and the player's car's alone. */
  pedalAssist: number;
  /** `SimOptions.trafficSeed`: set it before `resetSim` for the next run to meet other traffic. */
  trafficSeed: number;
  pedalFeedback: PedalFeedback;
  state: SimState;
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  rivalBody: RAPIER.RigidBody | null;
  rivalDefinition: RivalDefinition | null;
  encounterStart: RoadWorld["start"] | null;
  encounterRoute: RivalDefinition | null;
  encounterBody: RAPIER.RigidBody | null;
  parkedRivalDefinitions: readonly ParkedRival[];
  parkedRivalBodies: RAPIER.RigidBody[];
  cruiserDefinitions: readonly CruiseRival[];
  /** One per cruiser, in `state.cruisers` order, created after Moth's so a world without them is the world it was. */
  cruiserBodies: RAPIER.RigidBody[];
  /** One kinematic body per traffic vehicle, in `state.traffic.vehicles` order.
   *  Created once and never added to or removed from: a changing collider set
   *  changes the solver's own bookkeeping, and a replay has to reproduce it. */
  trafficBodies: readonly RAPIER.RigidBody[];
  /** The race being run, or null. Static; progress is `state.race`. */
  race: RaceDefinition | null;
}

/** Traffic is part of the world, so it is on by default. A geometry check that
 *  drives a scripted line through the district turns it off, because that test
 *  is about road surface and barriers, not about whether a van was in the way. */
export interface SimOptions {
  /**
   * How much of the pedals' excess the tyres forgive: 1, the default and the
   * game, is all of it. A developer preview for the PLAYER'S car only
   * (`?assist=`, `__ns.assist`, 2026-09-20), like `?drivetrain=`.
   *
   * The tyre model gives cornering first call on a tyre's grip and the pedals
   * what is left, clamped for nothing: perfect traction control and perfect ABS.
   * Measured: from rest the Cinder pushes 7.6 m/s² at 45% throttle and at 100%,
   * 70% and 100% leave a corner identically, and full brake costs no steering at
   * all. So flooring it is never wrong, and is not a choice. Below 1, a tyre asked
   * for more than it has left gives up some sideways grip and some of the push
   * itself, in proportion to the excess (`HANDLING.pedalRearLateralLoss` and beside it).
   *
   * It lives here and not in a car's handling on purpose. The Cinder is the
   * anchor every lap, the rival's cornering and the route-choice pace were fitted
   * to, and no rival has a throttle plan: at 1 every vehicle is bit-identical to
   * before, and below 1 only the car being driven changes.
   */
  readonly pedalAssist?: number;
  readonly traffic?: boolean;
  /** Which traffic this run meets (`createTraffic`): where every vehicle starts and which way it turns. Absent is 0,
   *  the one traffic every run had to 2026-09-22 and what every test, the batch and the golden master keep. The game
   *  draws a fresh one for each attempt at a race and a recording carries it, as it carries the pedal assist. */
  readonly trafficSeed?: number;
  /** Run an open-checkpoint race on this world from its start pose. */
  readonly race?: RaceDefinition;
  readonly rival?: RivalDefinition;
  readonly encounter?: RoadWorld["start"];
  readonly encounterRoute?: RivalDefinition;
  readonly parkedRivals?: readonly ParkedRival[];
  readonly cruisers?: readonly CruiseRival[];
}

// Feel stays centralized. No suspension or wheel inertia yet: the chassis
// follows authored road height, and four virtual tyre patches carry its load.
export const HANDLING = {
  mass: 1_180,
  frontAxleDistance: 1.48,
  rearAxleDistance: 1.48,
  halfTrack: 0.92,
  wheelRadius: 0.36,
  centerOfMassHeight: 0.12, // deliberately mild planar weight transfer
  loadResponse: 4,
  minFrontLoad: 0.32,
  maxFrontLoad: 0.70,
  minSideLoad: 0.30,
  maxSideLoad: 0.70,
  tyreLoadExponent: 0.92, // more load gives more grip, but less grip per kg
  topSpeed: 62.6, // ~140 mph
  reverseSpeed: 11,
  engineAcceleration: 18,
  engineMidSpeed: 30,
  engineMidAcceleration: 11,
  highSpeedAcceleration: 13,
  reverseAcceleration: 8,
  // FWD is the preferred default; each tyre shares finite grip between drive,
  // brakes and cornering. The 2WD assist only extends powered longitudinal grip.
  frontDriveFraction: { awd: 0.45, fwd: 1, rwd: 0 },
  twoWheelDriveGripStartSpeed: 25,
  twoWheelDriveGripFullSpeed: 55,
  twoWheelDriveGripScale: 1.8,
  frontBrakeFraction: 0.70,
  brakeDeceleration: 14,
  brakeResponseExponent: 1.5,
  rollingResistance: 1.3,
  aerodynamicDrag: 0.0028,
  steeringResponse: 5.5,
  steeringReturnResponse: 14,
  countersteerResponse: 24,
  countersteerMinSpeed: 3,
  countersteerSlipStart: 2 * Math.PI / 180,
  countersteerSlipFull: 10 * Math.PI / 180,
  rwdCountersteerLookahead: 0.25,
  rwdCountersteerScrub: 0.1,
  rwdCountersteerScrubLockStart: 0.8,
  maxSteeringAngle: 0.34,
  steerOverdrive: 1.15,
  highSpeedSteerAllowance: 0.015,
  maxLateralAcceleration: 14.5,
  frontCorneringStiffness: 12,
  rearCorneringStiffness: 15,
  lowSpeedSlipReference: 4,
  // Effective-mass force cap avoids reversing a contact point's lateral
  // velocity within one tick. Numerical stabilization, not commanded yaw.
  tyreRelaxation: 0.8,
  handbrakeDrag: 6,
  handbrakeRearStiffness: 0.45,
  handbrakeRearGrip: 0.95,
  rwdDriveTractionShare: 0.85,
  rwdHighSpeedDriveTractionShare: 0.45,
  rwdSlideDriveTractionShare: 0.25,
  rwdSlideGripStart: 2 * Math.PI / 180,
  rwdSlideGripFull: 8 * Math.PI / 180,
  rwdStabilityStartSpeed: 22, // ~49 mph: begin restoring rear cornering authority
  rwdStabilityFullSpeed: 40, // ~89 mph
  reverseEngageSpeed: 0.5,
  gravityAlongGrade: 9.81,
  pitchResponse: 7.5,
  // Off the paved road (grass and bare ground past the pavement, where the world
  // reports ground) each tyre on it loses some grip, and the car loses some pace:
  // a lower governor and a little drag, both scaled by how many tyres are on it.
  // AWD pays none of it (2026-09-13). Every shortcut has a cost; this is the cost
  // of the ones across a lot. A world without ground drives exactly as before.
  // What a tyre loses when the pedals ask more of it than cornering has left it,
  // at the full excess (twice what it has), with the assist fully off
  // (`SimOptions.pedalAssist`). Sideways grip, so a floored tyre lets go of the
  // corner; and drive or braking itself, so the most push is at the limit and not
  // past it. With the assist on, as every car but a previewed player's has it,
  // neither is read.
  //
  // Rear tyres only. "A hard pedal cannot erase steering" is this model's own rule
  // (sampleWheelForces): a front tyre keeps its sideways grip whatever the pedals
  // ask. The first version took 45% of it, and a buried brake pushed the car
  // straight on, 13.7 degrees in a second where the forgiving car turns 19.1, and
  // every time on a keyboard, whose brake is all or nothing. An overwhelmed front
  // now only pushes or stops less. A rear tyre that lets go turns the car, and a
  // rear-drive car's rears already give cornering grip up to drive
  // (`rwdDriveTractionShare`): at 0.45 the Cinder was planted at an assist of 0.9
  // and spun at 0.8. At 0.12 the whole of 0 to 1 is drivable.
  pedalRearLateralLoss: 0.12,
  pedalLongitudinalLoss: 0.2,
  // Wheelspin (2026-09-20). The grip a tyre loses follows its `slip`, which
  // follows the pedals' excess with a lag, per second: a driven tyre flares in
  // about a seventh of a second and takes nearly half a second to hook up again,
  // so easing off does not give the grip straight back; a braked one locks and
  // frees faster. It is a lag on the excess and not wheel inertia: a wheel's own
  // speed is too stiff to integrate at 60 Hz without substeps, and the excess
  // already says which way it would go. The steady state is the excess itself,
  // so the trigger stays a gradient.
  wheelSpinUp: 7,
  wheelHookUp: 2.2,
  wheelLockUp: 12,
  wheelRelease: 5,
  // Drawn only: metres a second a fully spinning tyre's tread runs past the road's
  // speed, so that it visibly whirls from a standstill. A locked one stops turning.
  wheelSpinSurfaceSpeed: 18,
  groundGripScale: 0.85,
  groundTopSpeedScale: 0.85, // ~119 mph with all four tyres on the ground
  groundRollingResistance: 0.6,
} as const;

export type Drivetrain = keyof typeof HANDLING.frontDriveFraction;
export const DEFAULT_DRIVETRAIN: Drivetrain = "fwd";

export function isDrivetrain(value: unknown): value is Drivetrain {
  return typeof value === "string" && Object.hasOwn(HANDLING.frontDriveFraction, value);
}

/**
 * One car's numbers: the shared `HANDLING` bent by its tune (`car-handling.ts`).
 * Only these differ between cars; every other `HANDLING` value is the model and
 * is read directly. Mass sets the body's weight in contact, and every force the
 * car makes is an acceleration times it, so alone it changes nothing else.
 */
export interface CarHandling {
  /** The car, or null for the shared model that `createSim(drivetrain)` and the fixtures drive. */
  readonly car: string | null;
  /** The car's tune revision (`CarTune.revision`); 1 for the shared model. */
  readonly revision: number;
  readonly drivetrain: Drivetrain;
  readonly mass: number;
  readonly topSpeed: number;
  readonly engineAcceleration: number;
  readonly engineMidAcceleration: number;
  readonly highSpeedAcceleration: number;
  readonly maxLateralAcceleration: number;
  readonly frontCorneringStiffness: number;
  readonly rearCorneringStiffness: number;
  readonly brakeDeceleration: number;
  readonly steeringResponse: number;
  readonly handbrakeRearStiffness: number;
  readonly aerodynamicDrag: number;
  /** Multiplies the driven tyres' powered longitudinal grip only (`CarTune.traction`). */
  readonly traction: number;
}

// An absent knob returns the shared value itself, not a product with 1, so an
// untuned car is the shared model to the last bit.
const bend = (value: number, factor: number | undefined) => factor === undefined ? value : value * factor;
const resolvedHandling = new Map<string, CarHandling>();

/**
 * A car's handling, on its own drivetrain or, as a developer comparison
 * (`?drivetrain=`), another. A body with no tune -- the primitive "classic", or
 * null -- drives the shared model. Memoised: one car on one layout is one
 * object, so compare by identity.
 */
export function carHandling(car: string | null, drivetrain?: Drivetrain): CarHandling {
  const tune: CarTune | undefined = car === null || !Object.hasOwn(CAR_TUNES, car) ? undefined : CAR_TUNES[car];
  const layout = drivetrain ?? tune?.drivetrain ?? DEFAULT_DRIVETRAIN;
  const key = `${car ?? ""}/${layout}`;
  const known = resolvedHandling.get(key);
  if (known) return known;
  const handling = tunedHandling(car, tune, layout);
  resolvedHandling.set(key, handling);
  return handling;
}

/** What a tune does to the shared numbers, knob by knob. `carHandling` is this for the real cars. */
export function tunedHandling(car: string | null, tune: CarTune | undefined, drivetrain?: Drivetrain): CarHandling {
  const layout = drivetrain ?? tune?.drivetrain ?? DEFAULT_DRIVETRAIN;
  if (!isDrivetrain(layout)) throw new RangeError(`Unknown drivetrain: ${layout}`);
  const balance = tune?.balance === undefined ? undefined : Math.sqrt(tune.balance);
  return Object.freeze({
    car, revision: tune?.revision ?? 1, drivetrain: layout,
    mass: tune?.mass ?? HANDLING.mass,
    topSpeed: bend(HANDLING.topSpeed, tune?.topSpeed),
    engineAcceleration: bend(HANDLING.engineAcceleration, tune?.power),
    engineMidAcceleration: bend(HANDLING.engineMidAcceleration, tune?.power),
    highSpeedAcceleration: bend(HANDLING.highSpeedAcceleration, tune?.topEnd),
    maxLateralAcceleration: bend(HANDLING.maxLateralAcceleration, tune?.grip),
    frontCorneringStiffness: balance === undefined ? HANDLING.frontCorneringStiffness : HANDLING.frontCorneringStiffness / balance,
    rearCorneringStiffness: bend(HANDLING.rearCorneringStiffness, balance),
    brakeDeceleration: bend(HANDLING.brakeDeceleration, tune?.brakes),
    steeringResponse: bend(HANDLING.steeringResponse, tune?.steering),
    handbrakeRearStiffness: tune?.handbrake === undefined ? HANDLING.handbrakeRearStiffness
      : 1 - (1 - HANDLING.handbrakeRearStiffness) * tune.handbrake,
    aerodynamicDrag: bend(HANDLING.aerodynamicDrag, tune?.drag),
    traction: tune?.traction ?? 1,
  });
}

/** The shared model on the default drivetrain: what the planning helpers assume when not told the car. */
export const SHARED_HANDLING = carHandling(null);

/**
 * What a rival, cruiser or parked car drives: the car its definition names, else
 * the shared model on its declared drivetrain. Naming a car and a contradicting
 * drivetrain throws, as does naming a car with no tune: a rival must never drive
 * a different car from the one it is.
 */
export function handlingFor(definition: { readonly car?: string; readonly drivetrain?: Drivetrain }): CarHandling {
  if (definition.car === undefined) return carHandling(null, definition.drivetrain ?? DEFAULT_DRIVETRAIN);
  if (!Object.hasOwn(CAR_TUNES, definition.car)) throw new RangeError(`Unknown car: ${definition.car}`);
  const handling = carHandling(definition.car);
  if (definition.drivetrain !== undefined && definition.drivetrain !== handling.drivetrain) {
    throw new RangeError(`The ${definition.car} is ${handling.drivetrain}, not ${definition.drivetrain}`);
  }
  return handling;
}

const WHEELBASE = HANDLING.frontAxleDistance + HANDLING.rearAxleDistance;
const STATIC_FRONT_LOAD = HANDLING.rearAxleDistance / WHEELBASE;
const START_Y = 0.5;

// Fixed order is part of replay. Matches the car's named wheel pivots; no
// Three.js data flows back into the simulation, including visual stance.
export const WHEEL_LAYOUT = [
  { id: "front-left", forward: HANDLING.frontAxleDistance, right: -HANDLING.halfTrack, front: true },
  { id: "front-right", forward: HANDLING.frontAxleDistance, right: HANDLING.halfTrack, front: true },
  { id: "rear-left", forward: -HANDLING.rearAxleDistance, right: -HANDLING.halfTrack, front: false },
  { id: "rear-right", forward: -HANDLING.rearAxleDistance, right: HANDLING.halfTrack, front: false },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moveToward(current: number, target: number, maxDelta: number): number {
  return current + clamp(target - current, -maxDelta, maxDelta);
}

/** Steering assistance changes wheel angle, never chassis velocity or yaw. */
export function steeringAngleFor(speed: number, steering = 1, handling: CarHandling = SHARED_HANDLING): number {
  const gripAngle = Math.atan(WHEELBASE * handling.maxLateralAcceleration *
    HANDLING.steerOverdrive / Math.max(speed * speed, 1));
  const slipAllowance = HANDLING.highSpeedSteerAllowance * clamp(Math.abs(speed) / 15, 0, 1);
  return clamp(steering, -1, 1) * Math.min(HANDLING.maxSteeringAngle, gripAngle + slipAllowance);
}

/**
 * The wheel angle a steady turn takes (2026-09-20): the turn's geometry, plus the difference between the two axles'
 * slip angles. Each axle carries its share of the cornering force (the front `STATIC_FRONT_LOAD` of it, by the yaw
 * balance) against the grip its load gives it, and a tyre's force is `tanh(slip × stiffness)` of that grip. The
 * fronts are softer than the rears and, under power, lighter, so the car understeers: at 60 m/s a 5.5 m/s² turn takes
 * 0.82 degrees of wheel where its geometry is 0.25. `driveAcceleration` is what the tyres are pushing: an RWD car's
 * rears give the engine its share of their grip first (`sampleWheelForces`), slip more for it, and understeer less.
 * It describes the tyres below and has to be kept to them; it moves nothing. A test holds it to every drivetrain.
 */
export function steadyWheelAngleFor(speed: number, curvature: number, frontLoad: number, handling: CarHandling = SHARED_HANDLING, driveAcceleration = 0): number {
  const cornering = speed * speed * Math.abs(curvature);
  const grip = (load: number) => handling.maxLateralAcceleration * .5 * (2 * Math.max(.01, load)) ** HANDLING.tyreLoadExponent;
  let rearGrip = grip(1 - frontLoad);
  if (handling.drivetrain === "rwd" && driveAcceleration > 0) {
    const stable = clamp((speed - HANDLING.rwdStabilityStartSpeed) / (HANDLING.rwdStabilityFullSpeed - HANDLING.rwdStabilityStartSpeed), 0, 1);
    const share = HANDLING.rwdDriveTractionShare + (HANDLING.rwdHighSpeedDriveTractionShare - HANDLING.rwdDriveTractionShare) * stable * stable * (3 - 2 * stable);
    const assisted = clamp((speed - HANDLING.twoWheelDriveGripStartSpeed) / (HANDLING.twoWheelDriveGripFullSpeed - HANDLING.twoWheelDriveGripStartSpeed), 0, 1);
    const driveGripScale = (1 + (HANDLING.twoWheelDriveGripScale - 1) * assisted * assisted * (3 - 2 * assisted)) * handling.traction;
    const driven = Math.min(driveAcceleration / driveGripScale, rearGrip * share);
    rearGrip = Math.sqrt(Math.max(1e-6, rearGrip * rearGrip - driven * driven));
  }
  const slip = (force: number, axleGrip: number, stiffness: number) => Math.atanh(Math.min(.98, force / axleGrip)) / stiffness;
  return Math.sign(curvature) * (Math.atan(WHEELBASE * Math.abs(curvature))
    + slip(cornering * STATIC_FRONT_LOAD, grip(frontLoad), handling.frontCorneringStiffness)
    - slip(cornering * (1 - STATIC_FRONT_LOAD), rearGrip, handling.rearCorneringStiffness));
}

/** Driver-operated steering, with extra response/range only for a requested catch.
 * No slip-derived angle is added: centred input always targets centred wheels. */
export function steeringControlFor(current: number, requested: number, forwardSpeed: number,
  lateralSpeed = 0, yawRate = 0, recoveryLookahead = 0, handling: CarHandling = SHARED_HANDLING): { steering: number; steeringAngle: number } {
  const target = clamp(requested, -1, 1);
  const slipReference = Math.max(Math.abs(forwardSpeed), HANDLING.lowSpeedSlipReference);
  const bodySlip = Math.atan2(lateralSpeed, slipReference);
  const frontSlip = Math.atan2(lateralSpeed - yawRate * HANDLING.frontAxleDistance, slipReference);
  const progress = clamp((Math.abs(bodySlip) - HANDLING.countersteerSlipStart) /
    (HANDLING.countersteerSlipFull - HANDLING.countersteerSlipStart), 0, 1);
  // Requiring both slips plus a meaningful body angle avoids treating ordinary
  // turn-in (front-point velocity includes yaw) or resting noise as a catch.
  const countersteering = forwardSpeed > HANDLING.countersteerMinSpeed && progress > 0 &&
    target * bodySlip > 0 && target * frontSlip > 0;
  const unwinding = current * target < 0 || Math.abs(target) < Math.abs(current);
  const response = countersteering ? HANDLING.countersteerResponse
    : unwinding ? HANDLING.steeringReturnResponse : handling.steeringResponse;
  const steering = moveToward(current, target, response * DT);
  const normalLimit = steeringAngleFor(forwardSpeed, 1, handling);
  let limit = normalLimit;
  if (countersteering && steering * bodySlip > 0) {
    // Ease extra manual lock as yaw begins closing the slide, before slip
    // crosses zero and the catch becomes an opposite slide. This short yaw-only
    // estimate changes available steering range, never chassis motion.
    const projectedSlip = bodySlip + yawRate * recoveryLookahead;
    const remainingSlip = Math.max(0, projectedSlip * Math.sign(bodySlip));
    const recoveryProgress = Math.min(progress, clamp((remainingSlip - HANDLING.countersteerSlipStart) /
      (HANDLING.countersteerSlipFull - HANDLING.countersteerSlipStart), 0, 1));
    const blend = recoveryProgress * recoveryProgress * (3 - 2 * recoveryProgress);
    // Unlock enough range to aim across front-axle travel, not full lock on a
    // tiny slide. Holding half stick still requests half the available angle.
    const catchLimit = Math.min(HANDLING.maxSteeringAngle, Math.abs(frontSlip) + normalLimit);
    limit += (catchLimit - limit) * blend;
  }
  return { steering, steeringAngle: steering * limit };
}

/** Ackermann geometry: both front tyres aim around the same turn centre. */
export function frontWheelAngles(centerAngle: number): { left: number; right: number } {
  const tangent = Math.tan(clamp(centerAngle, -HANDLING.maxSteeringAngle, HANDLING.maxSteeringAngle));
  return {
    left: Math.atan(tangent / (1 + HANDLING.halfTrack * tangent / WHEELBASE)),
    right: Math.atan(tangent / (1 - HANDLING.halfTrack * tangent / WHEELBASE)),
  };
}

/** Concave load sensitivity: transferring weight cannot create total grip. */
export function wheelGripFor(loadFraction: number, handling: CarHandling = SHARED_HANDLING): number {
  return handling.mass * handling.maxLateralAcceleration * 0.25 *
    (Math.max(0, loadFraction) / 0.25) ** HANDLING.tyreLoadExponent;
}

/** Planning envelope, not a commanded yaw rate or a guarantee under braking. */
export function minimumTurnRadiusAtSpeed(speed: number, handling: CarHandling = SHARED_HANDLING): number {
  if (Math.abs(speed) < 0.01) return 0;
  return Math.max(WHEELBASE / Math.tan(HANDLING.maxSteeringAngle),
    speed * speed / handling.maxLateralAcceleration);
}

export function maxCorneringSpeed(radius: number, handling: CarHandling = SHARED_HANDLING): number {
  return Math.sqrt(handling.maxLateralAcceleration * Math.max(0, radius));
}

export function brakeDecelerationFor(brake: number, handling: CarHandling = SHARED_HANDLING): number {
  return handling.brakeDeceleration * clamp(brake, 0, 1) ** HANDLING.brakeResponseExponent;
}

export function gradeAccelerationFor(pitch: number, courseAlignment = 1): number {
  return -HANDLING.gravityAlongGrade * Math.sin(pitch) * clamp(courseAlignment, -1, 1);
}

function engineAccelerationFor(speed: number, handling: CarHandling): number {
  if (speed <= HANDLING.engineMidSpeed) {
    const blend = clamp(speed / HANDLING.engineMidSpeed, 0, 1);
    return handling.engineAcceleration * (1 - blend) + handling.engineMidAcceleration * blend;
  }
  const blend = clamp((speed - HANDLING.engineMidSpeed) /
    (handling.topSpeed - HANDLING.engineMidSpeed), 0, 1);
  return handling.engineMidAcceleration * (1 - blend) + handling.highSpeedAcceleration * blend;
}

function yawRotation(heading: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
}

function roadRotation(yaw: number, pitch: number): RAPIER.Rotation {
  return {
    x: Math.sin(yaw / 2) * Math.sin(pitch / 2),
    y: Math.sin(yaw / 2) * Math.cos(pitch / 2),
    z: Math.cos(yaw / 2) * Math.sin(pitch / 2),
    w: Math.cos(yaw / 2) * Math.cos(pitch / 2),
  };
}

function headingFromRotation(rotation: RAPIER.Rotation): number {
  return Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
}

function emptyAxle(): AxleState {
  return { slipAngle: 0, longitudinalForce: 0, lateralForce: 0, gripLimit: 0, longitudinalGripLimit: 0 };
}

function initialWheels(mass: number): Record<WheelId, WheelState> {
  return Object.fromEntries(WHEEL_LAYOUT.map(wheel => [wheel.id, {
    ...emptyAxle(), steeringAngle: 0, loadFraction: 0.25,
    normalLoad: mass * HANDLING.gravityAlongGrade * 0.25,
    longitudinalSpeed: 0, lateralSpeed: 0, rollingDistance: 0,
  }])) as Record<WheelId, WheelState>;
}

/** What the car rides on here: the driven surface when the world has one,
 *  the road otherwise. Blackglass has no surface and is unchanged. */
function drivenSurface(roadWorld: RoadWorld, x: number, z: number) {
  return roadWorld.surface ? roadWorld.surface(x, z) : roadWorld.project(x, z);
}

function initialVehicle(roadWorld: RoadWorld, handling: CarHandling): VehicleState {
  return {
    x: roadWorld.start.x, y: roadWorld.start.y, z: roadWorld.start.z,
    heading: roadWorld.start.heading, pitch: roadWorld.start.pitch, roll: 0,
    speed: 0, forwardSpeed: 0, lateralSpeed: 0, yawRate: 0,
    steering: 0, steeringAngle: 0, driveDirection: 1, slipAngle: 0,
    longitudinalAcceleration: 0, lateralAcceleration: 0,
    frontLoadFraction: STATIC_FRONT_LOAD, rightLoadFraction: 0.5, groundContact: 0, wheels: initialWheels(handling.mass),
    frontAxle: emptyAxle(), rearAxle: emptyAxle(),
  };
}

/** One collider for every body; its mass is the car's, so a heavier car shoves a lighter one. */
function createVehicleBody(world: RAPIER.World, start: RoadWorld["start"], mass: number): RAPIER.RigidBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y + START_Y, start.z)
      .setRotation(yawRotation(start.heading))
      .setCanSleep(false).setCcdEnabled(true),
  );
  body.setEnabledTranslations(true, false, true, true);
  body.setEnabledRotations(false, true, false, true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.92, 0.38, 2.08)
    .setMass(mass).setFriction(0.15).setRestitution(0.04), body);

  return body;
}

/**
 * A car (`carHandling`), or a bare drivetrain for the shared model on that layout,
 * which is what the regression fixtures drive.
 */
export function createSim(setup: Drivetrain | CarHandling = DEFAULT_DRIVETRAIN,
  roadWorld: RoadWorld = BLACKGLASS_WORLD, options: SimOptions = {}): Sim {
  if (typeof setup === "string" && !isDrivetrain(setup)) throw new RangeError(`Unknown drivetrain: ${setup}`);
  const handling = typeof setup === "string" ? carHandling(null, setup) : setup;
  if (!isDrivetrain(handling.drivetrain)) throw new RangeError(`Unknown drivetrain: ${handling.drivetrain}`);
  if (options.rival && !options.race) throw new Error("A rival requires a race");
  if ((options.encounter || options.encounterRoute || options.cruisers?.length || (options.parkedRivals?.length && options.race?.kind !== "drift")) && options.race) throw new Error("A cruising encounter belongs in free roam");
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  for (const wall of roadWorld.walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(wall.width * 0.5, 0.65, wall.depth * 0.5)
        .setTranslation(wall.x, wall.y + 0.65, wall.z)
        .setRotation(roadRotation(wall.rotation, wall.pitch))
        .setFriction(0.25).setRestitution(0.08),
    );
  }
  // Massing is solid. Driving through a building was invisible on a fixed route
  // and is the first thing free roam does. Rotated, because a building fronting
  // a street is not aligned to the world axes.
  //
  // NEGATED. A solid's rotation is in blockCorners' convention — a 2D rotation
  // in the (x, z) plane, width axis (cos, sin) — which is what placement, the
  // overlap and clearance tests, and the drawn mesh (rotation.y = -rotation)
  // all share. roadRotation is a rotation about +Y, whose width axis is
  // (cos, -sin): the same yaw number, the opposite handedness. With the sign
  // dropped every building's collider was the MIRROR of its footprint. The
  // core's near-square blocks hid it; a 32 x 11 warehouse on Crane Alley put an
  // invisible wall across the road at dead centre, which the first race found
  // 125 m in. Walls keep their own sign: their rotation was derived in
  // roadRotation's convention and six inspection drives verify it.
  for (const solid of roadWorld.solids ?? []) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(solid.width * 0.5, solid.height * 0.5, solid.depth * 0.5)
        .setTranslation(solid.x, (solid.base ?? 0) + solid.height * 0.5, solid.z)
        .setRotation(roadRotation(-(solid.rotation ?? 0), 0))
        .setFriction(0.25).setRestitution(0.08),
    );
  }
  const body = createVehicleBody(world, roadWorld.start, handling.mass);

  // Traffic is kinematic: it drives its lane and is not pushed by an impact.
  // That makes it an immovable hazard rather than a second handling model, and
  // it keeps the player's contact response the only dynamics in the tick — the
  // handling gate (GDD §22) must not move because a van exists.
  const network = options.traffic === false ? null : roadWorld.traffic;
  const traffic = network ? createTraffic(network, undefined, options.trafficSeed ?? 0) : null;
  const trafficBodies = (traffic?.vehicles ?? []).map(vehicle => {
    const spec = TRAFFIC_KINDS[vehicle.kind];
    const trafficBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(vehicle.x, vehicle.y + spec.height * 0.5, vehicle.z)
      .setRotation(yawRotation(vehicle.heading)));
    // Friction as a car's own (0.15, traffic-v9). At 0.35, set when traffic was a wall, a car clipped on a rear corner did
    // not turn at all: as the striking car's nose swung, friction along the struck car's rear face, 2.2 m behind its
    // centre, cancelled the push's 0.4 m lever to the hundredth of a radian a second (bare Rapier, .probe/spin2.mjs).
    const collider = RAPIER.ColliderDesc.cuboid(spec.width * 0.5, spec.height * 0.5, spec.length * 0.5).setFriction(0.15).setRestitution(0.1);
    // Its kind's mass counts only while it is a physics body (`TRAFFIC_KNOCK`); a kind with none is never one.
    world.createCollider(spec.mass === undefined ? collider : collider.setMass(spec.mass), trafficBody);
    return trafficBody;
  });

  const parkedRivalDefinitions = options.parkedRivals ?? [];
  const parkedRivalBodies = parkedRivalDefinitions.map(rival => createVehicleBody(world, rival.start, parkedHandling(rival).mass));
  const parkedRivals = parkedRivalDefinitions.map(rival => ({ id: rival.id, name: rival.name,
    vehicle: initialVehicle({ ...roadWorld, start: rival.start }, parkedHandling(rival)) }));
  const encounterRoute = options.encounterRoute ?? null;
  const encounterStart = encounterRoute?.start ?? options.encounter ?? null;
  const encounterHandling = handlingFor(encounterRoute ?? {});
  const encounterBody = encounterStart ? createVehicleBody(world, encounterStart, encounterHandling.mass) : null;
  const encounter = encounterStart ? initialVehicle({ ...roadWorld, start: encounterStart }, encounterHandling) : null;
  const cruiserDefinitions = options.cruisers ?? [];
  const cruiserBodies = cruiserDefinitions.map(cruiser => createVehicleBody(world, cruiser.route.start, handlingFor(cruiser.route).mass));
  const cruisers = cruiserDefinitions.map(cruiser => ({ id: cruiser.id, name: cruiser.name,
    vehicle: initialVehicle({ ...roadWorld, start: cruiser.route.start }, handlingFor(cruiser.route)), driver: createRivalDriver() }));
  const rivalDefinition = options.rival ?? null;
  // Paired with its rival's line, a race learns which way each gate is left:
  // the marker's arrow. A race without a rival has no reference route to read.
  const raceDefinition = options.race ? rivalDefinition ? withExits(options.race, rivalDefinition) : options.race : null;
  const rivalHandling = rivalDefinition ? handlingFor(rivalDefinition) : null;
  const rivalBody = rivalDefinition && rivalHandling ? createVehicleBody(world, rivalDefinition.start, rivalHandling.mass) : null;
  const rival: RivalState | null = rivalDefinition && rivalHandling && raceDefinition ? {
    drivetrain: rivalHandling.drivetrain, handling: rivalHandling,
    vehicle: initialVehicle({ ...roadWorld, start: rivalDefinition.start }, rivalHandling),
    race: createRace(raceDefinition), driver: createRivalDriver(),
    input: { throttle: 0, brake: 0, steer: 0, handbrake: 0 },
  } : null;
  const vehicle = initialVehicle(roadWorld, handling);
  if (raceDefinition?.kind === "drag") {
    vehicle.transmission = createTransmission();
    if (rival) rival.vehicle.transmission = createTransmission();
  } else if (raceDefinition) {
    // Every other race starts from a countdown the player can launch out of.
    vehicle.launch = createLaunch();
    if (rival) rival.vehicle.launch = createLaunch();
  } else {
    // Free roam has no flag, only the burnout.
    vehicle.launch = createLaunch(true);
  }
  return {
    roadWorld,
    pedalAssist: clamp(options.pedalAssist ?? 1, 0, 1), trafficSeed: options.trafficSeed ?? 0, pedalFeedback: { spin: 0, lock: 0 },
    state: { physicsVersion: PHYSICS_VERSION, drivetrain: handling.drivetrain, handling, tick: 0,
      vehicle, traffic, rival, encounter, parkedRivals, cruisers, encounterDriver: encounterRoute ? createRivalDriver() : null,
      race: raceDefinition ? createRace(raceDefinition) : null },
    world, body, rivalBody, rivalDefinition, encounterBody, encounterStart, encounterRoute, parkedRivalDefinitions, parkedRivalBodies, cruiserDefinitions, cruiserBodies, trafficBodies, race: raceDefinition,
  };
}

/** Parked cars have always been rear-drive; one that names its car drives that car. */
function parkedHandling(parked: ParkedRival): CarHandling {
  return handlingFor(parked.car !== undefined ? { car: parked.car } : { drivetrain: "rwd" });
}

/**
 * A fresh run. A car replaces the car; a bare drivetrain keeps the car and changes
 * only its layout, the developer comparison (`?drivetrain=`, `__ns.drivetrain`).
 */
export function resetSim(sim: Sim, setup: Drivetrain | CarHandling = sim.state.handling): void {
  if (typeof setup === "string" && !isDrivetrain(setup)) throw new RangeError(`Unknown drivetrain: ${setup}`);
  const handling = typeof setup === "string" ? carHandling(sim.state.handling.car, setup) : setup;
  // Rebuild contact warm-start caches too, so replay after a crash starts from
  // exactly the same world as a fresh run. Preserve the outer Sim object.
  const fresh = createSim(handling, sim.roadWorld, { pedalAssist: sim.pedalAssist, trafficSeed: sim.trafficSeed, traffic: sim.state.traffic !== null, race: sim.race ?? undefined, rival: sim.rivalDefinition ?? undefined, encounter: sim.encounterStart ?? undefined, encounterRoute: sim.encounterRoute ?? undefined, parkedRivals: sim.parkedRivalDefinitions, cruisers: sim.cruiserDefinitions });
  sim.world.free();
  sim.world = fresh.world;
  sim.body = fresh.body;
  sim.rivalBody = fresh.rivalBody;
  sim.encounterBody = fresh.encounterBody;
  sim.parkedRivalDefinitions = fresh.parkedRivalDefinitions;
  sim.parkedRivalBodies = fresh.parkedRivalBodies;
  sim.cruiserDefinitions = fresh.cruiserDefinitions;
  sim.cruiserBodies = fresh.cruiserBodies;
  sim.encounterStart = fresh.encounterStart;
  sim.encounterRoute = fresh.encounterRoute;
  sim.rivalDefinition = fresh.rivalDefinition;
  sim.state = fresh.state;
  sim.pedalFeedback = fresh.pedalFeedback;
  sim.trafficBodies = fresh.trafficBodies;
  sim.race = fresh.race;
  sim.trafficSeed = fresh.trafficSeed;
}

/** Return from a garage without restarting traffic or the rest of the world. */
export function leaveGarage(sim: Sim, start: RoadWorld["start"]): void {
  if (sim.state.race) return;
  sim.body.setTranslation({ x: start.x, y: start.y + START_Y, z: start.z }, true);
  sim.body.setRotation(yawRotation(start.heading), true);
  sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  sim.body.resetForces(true);
  sim.body.resetTorques(true);
  sim.state.vehicle = initialVehicle({ ...sim.roadWorld, start }, sim.state.handling);
  sim.state.vehicle.launch = createLaunch(true);
}

interface WheelInput {
  front: boolean;
  countersteerRecovery: number;
  bodySlip: number;
  driveGripScale: number;
  speed: number;
  forward: number;
  right: number;
  steeringAngle: number;
  loadFraction: number;
  driveForce: number;
  brakeForce: number;
  /** The service brake's share of `brakeForce`: what the pedal asks, without rolling drag or the handbrake, which has its own rules. */
  pedalBrake: number;
  /** 1 - the assist for the player's car, 0 for every other vehicle; and whether to report the excess at all. */
  pedalRaw: number;
  reportPedals: boolean;
  stiffness: number;
  gripScale: number;
}

interface TyreForces {
  point: { x: number; y: number; z: number };
  forward: { x: number; z: number };
  right: { x: number; z: number };
  lateralForce: number;
  brakingForce: number;
  driveForce: number;
  longitudinalBudget: number;
  /** How far past what cornering left it the pedals asked this tyre to go, 0 to 1 at twice that. */
  excess: number;
  telemetry: WheelState;
}

function sampleWheelForces(sim: VehicleRig, tyre: WheelInput, telemetry: WheelState): TyreForces {
  const { body } = sim;
  const position = body.translation();
  const heading = headingFromRotation(body.rotation());
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
  const wheelHeading = heading - tyre.steeringAngle;
  const wheelForward = { x: -Math.sin(wheelHeading), z: -Math.cos(wheelHeading) };
  const wheelRight = { x: Math.cos(wheelHeading), z: -Math.sin(wheelHeading) };
  const offset = { x: forward.x * tyre.forward + Math.cos(heading) * tyre.right,
    z: forward.z * tyre.forward - Math.sin(heading) * tyre.right };
  const point = { x: position.x + offset.x, y: position.y, z: position.z + offset.z };
  const velocity = body.velocityAtPoint(point);
  const longitudinalSpeed = velocity.x * wheelForward.x + velocity.z * wheelForward.z;
  const lateralSpeed = velocity.x * wheelRight.x + velocity.z * wheelRight.z;
  const slipAngle = Math.atan2(lateralSpeed,
    Math.max(Math.abs(longitudinalSpeed), HANDLING.lowSpeedSlipReference));
  const handling = sim.state.handling;
  const gripLimit = wheelGripFor(tyre.loadFraction, handling) * tyre.gripScale;
  const yawInertia = body.principalInertia().y;
  const lateralLever = offset.z * wheelRight.x - offset.x * wheelRight.z;
  const effectiveLateralMass = 1 / (1 / body.mass() + lateralLever * lateralLever / yawInertia);
  // Four simultaneous patches share the stop budget; duplicating the old
  // two-axle cap would over-correct a stationary chassis and inject energy.
  const lateralStopForce = Math.abs(lateralSpeed) * effectiveLateralMass / DT * HANDLING.tyreRelaxation * 0.5;

  // For front (steered) wheels, and for FWD/AWD historical baselines,
  // preserve full lateral grip for steering authority ("a hard pedal cannot
  // erase steering"). For RWD driven rear wheels, share the friction budget
  // with drive propulsion so the rear axle does not starve or bog down in
  // corners and responds to throttle.
  const driveDemand = (tyre.front || handling.drivetrain !== "rwd") ? 0 : Math.abs(tyre.driveForce);
  let lateralBudget = gripLimit;
  if (driveDemand > 0) {
    // Power rotation is useful in slower corners. At highway speeds, reserve
    // more lateral authority so a small steering correction cannot grow into
    // a spin under sustained throttle. This changes tyre allocation, not yaw.
    const progress = clamp((tyre.speed - HANDLING.rwdStabilityStartSpeed) /
      (HANDLING.rwdStabilityFullSpeed - HANDLING.rwdStabilityStartSpeed), 0, 1);
    const blend = progress * progress * (3 - 2 * progress);
    const speedDriveShare = HANDLING.rwdDriveTractionShare +
      (HANDLING.rwdHighSpeedDriveTractionShare - HANDLING.rwdDriveTractionShare) * blend;
    // Once sideways, asking for gas should help exit the turn instead of
    // continually sacrificing rear support. Restore cornering priority as slip
    // grows; remaining longitudinal capacity still supplies rear-wheel drive.
    const slideProgress = clamp((Math.abs(tyre.bodySlip) - HANDLING.rwdSlideGripStart) /
      (HANDLING.rwdSlideGripFull - HANDLING.rwdSlideGripStart), 0, 1);
    const slideBlend = slideProgress * slideProgress * (3 - 2 * slideProgress);
    const driveShare = speedDriveShare +
      (Math.min(speedDriveShare, HANDLING.rwdSlideDriveTractionShare) - speedDriveShare) * slideBlend;
    const maxDriveShare = gripLimit * driveShare;
    const effectiveDriveDemand = Math.min(driveDemand / tyre.driveGripScale, maxDriveShare);
    lateralBudget = Math.sqrt(Math.max(0, gripLimit * gripLimit - effectiveDriveDemand * effectiveDriveDemand));
  }
  // Near full manual counter-lock, a front tyre can still scrub in the same
  // direction as the rear because the wheel cannot aim far enough into travel.
  // Soften that resisting front force to let the rear straighten the chassis.
  // Never add grip or yaw torque; stop assisting once the front slip reverses.
  const scrubScale = tyre.front && tyre.steeringAngle * slipAngle > 0
    ? 1 - tyre.countersteerRecovery * (1 - HANDLING.rwdCountersteerScrub) : 1;
  // What the pedals ask of this tyre against what cornering would leave it. Worked
  // out only for the player's car, and applied only with its assist turned down:
  // every other vehicle, and the player's at the default, takes the lines below
  // with a scale of exactly one.
  let excess = 0;
  if (tyre.reportPedals) {
    const cornering = Math.min(Math.abs(lateralBudget * Math.tanh(slipAngle * tyre.stiffness) * scrubScale), lateralStopForce);
    const left = Math.sqrt(Math.max(0, gripLimit * gripLimit - cornering * cornering)) * tyre.driveGripScale;
    const asked = Math.abs(tyre.driveForce) + tyre.pedalBrake;
    excess = asked > left ? clamp((asked - left) / Math.max(left, 1), 0, 1) : 0;
  }
  // The tyre's slip follows the excess, quickly up and slowly down, and the grip
  // lost follows the slip: a tyre that has flared stays flared for a moment.
  let lost = 0;
  if (tyre.pedalRaw > 0) {
    const target = tyre.driveForce !== 0 ? excess : -excess, was = telemetry.slip ?? 0;
    const growing = Math.abs(target) > Math.abs(was) && target * was >= 0;
    const rate = (growing ? target : was) >= 0
      ? (growing ? HANDLING.wheelSpinUp : HANDLING.wheelHookUp) : (growing ? HANDLING.wheelLockUp : HANDLING.wheelRelease);
    telemetry.slip = was + (target - was) * (1 - Math.exp(-rate * DT));
    if (Math.abs(telemetry.slip) < 1e-4 && target === 0) telemetry.slip = 0;
    lost = Math.abs(telemetry.slip) * tyre.pedalRaw;
  }
  if (lost > 0 && !tyre.front) lateralBudget *= 1 - HANDLING.pedalRearLateralLoss * lost;
  const lateralRequest = -lateralBudget * Math.tanh(slipAngle * tyre.stiffness) * scrubScale;
  const lateralForce = clamp(lateralRequest, -lateralStopForce, lateralStopForce);

  // Service brakes oppose wheel travel. Near rest they cannot stop and reverse
  // a wheel within one tick. Forward/reverse drive is handled separately.
  const longitudinalLever = offset.z * wheelForward.x - offset.x * wheelForward.z;
  const effectiveLongitudinalMass = 1 / (1 / body.mass() + longitudinalLever * longitudinalLever / yawInertia);
  const stoppingForce = Math.abs(longitudinalSpeed) * effectiveLongitudinalMass / DT * 0.25;
  const brakingForce = -Math.sign(longitudinalSpeed) * Math.min(tyre.brakeForce, stoppingForce);
  // ABS/traction-style allocation: spend the remaining envelope on drive/brakes.
  // A deliberate arcade assist extends the powered 2WD axis at higher speed.
  // Lateral authority is unchanged; turning still consumes drive capacity.
  // The scale is one for AWD, coasting, braking, reverse and handbraking.
  const longitudinalGripLimit = gripLimit * tyre.driveGripScale;
  let longitudinalBudget = Math.sqrt(Math.max(0, gripLimit * gripLimit - lateralForce * lateralForce)) * tyre.driveGripScale;
  // Past its peak a tyre pushes less, not the same: the most drive is at the limit.
  if (lost > 0) longitudinalBudget *= 1 - HANDLING.pedalLongitudinalLoss * lost;
  Object.assign(telemetry, { slipAngle, lateralForce, gripLimit, longitudinalGripLimit,
    steeringAngle: tyre.steeringAngle, loadFraction: tyre.loadFraction,
    normalLoad: handling.mass * HANDLING.gravityAlongGrade * tyre.loadFraction });
  return { point, forward: wheelForward, right: wheelRight, lateralForce,
    brakingForce, driveForce: tyre.driveForce, longitudinalBudget, excess, telemetry };
}

function applyWheelForce(sim: VehicleRig, tyre: TyreForces, driveForce: number): { x: number; z: number } {
  const longitudinalForce = clamp(driveForce + tyre.brakingForce, -tyre.longitudinalBudget, tyre.longitudinalBudget);
  const force = {
    x: tyre.forward.x * longitudinalForce + tyre.right.x * tyre.lateralForce,
    y: 0,
    z: tyre.forward.z * longitudinalForce + tyre.right.z * tyre.lateralForce,
  };
  sim.body.addForceAtPoint(force, tyre.point, true);
  tyre.telemetry.longitudinalForce = longitudinalForce;
  return force;
}

function summarizeAxle(left: WheelState, right: WheelState, axle: AxleState): void {
  Object.assign(axle, {
    slipAngle: (left.slipAngle * left.loadFraction + right.slipAngle * right.loadFraction) /
      (left.loadFraction + right.loadFraction),
    longitudinalForce: left.longitudinalForce + right.longitudinalForce,
    lateralForce: left.lateralForce + right.lateralForce,
    gripLimit: left.gripLimit + right.gripLimit,
    longitudinalGripLimit: left.longitudinalGripLimit + right.longitudinalGripLimit,
  });
}

/**
 * The burnout (`launch.ts`): the front wheels hold their spot and the stick swings
 * the tail round them, as MC3's cars do. Forces, never a velocity written: a hold
 * at the front axle against whatever moves it, bounded by what front tyres could
 * grip, and a yaw torque toward the rate the stick asks for. Contact still shoves
 * the car; the hold is how hard it pushes back. The tyres are still sampled, so
 * their telemetry (and the scrub the audio hears) is what the swing does to them.
 */
function applyBurnout(sim: VehicleRig, steer: number, heading: number): void {
  const { body } = sim;
  const mass = body.mass(), position = body.translation(), velocity = body.linvel(), yaw = body.angvel().y;
  const reach = HANDLING.frontAxleDistance;
  const rx = -Math.sin(heading) * reach, rz = -Math.cos(heading) * reach;
  // The front axle's own velocity: the body's, plus its yaw carried out to the axle.
  let fx = -(velocity.x + yaw * rz) * mass / LAUNCH.burnoutHoldTime;
  let fz = -(velocity.z - yaw * rx) * mass / LAUNCH.burnoutHoldTime;
  const most = LAUNCH.burnoutHoldGrip * mass * HANDLING.gravityAlongGrade, size = Math.hypot(fx, fz);
  if (size > most) { fx *= most / size; fz *= most / size; }
  body.addForceAtPoint({ x: fx, y: 0, z: fz }, { x: position.x + rx, y: position.y, z: position.z + rz }, true);
  // Swung round the front axle, so the torque meets the body's own inertia plus its mass carried out there.
  const inertia = body.principalInertia().y + mass * reach * reach;
  body.addTorque({ x: 0, y: (-steer * LAUNCH.burnoutYawRate - yaw) * inertia / LAUNCH.burnoutYawTime, z: 0 }, true);
}

function applyVehicleInput(sim: VehicleRig, rawInput: Input, player = false): void {
  const input: Input = {
    throttle: raceHolding(sim.state.race) ? 0 : clamp(rawInput.throttle, 0, 1),
    brake: raceHolding(sim.state.race) ? 0 : clamp(rawInput.brake, 0, 1),
    steer: clamp(rawInput.steer, -1, 1), handbrake: clamp(rawInput.handbrake, 0, 1),
  };
  const { body } = sim;
  const car = sim.state.vehicle;
  const handling = sim.state.handling;
  const position = body.translation();
  const road = drivenSurface(sim.roadWorld, position.x, position.z);
  // Still a vertical road constraint; never reposition x/z or overwrite the
  // solver's linear/angular velocities. Tyre forces are refreshed every tick.
  body.setTranslation({ x: position.x, y: road.height + START_Y, z: position.z }, true);
  body.resetForces(true);
  body.resetTorques(true);
  const heading = headingFromRotation(body.rotation());
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  // Which tyres are on the ground, sampled where each tyre patch is (the same
  // offsets the tyre forces use). AWD is exempt from the cost, not from the reading.
  const onGround = WHEEL_LAYOUT.map(wheel => sim.roadWorld.ground?.(
    position.x + forwardX * wheel.forward + Math.cos(heading) * wheel.right,
    position.z + forwardZ * wheel.forward - Math.sin(heading) * wheel.right) ?? false);
  car.groundContact = onGround.filter(Boolean).length / onGround.length;
  const groundPenalty = handling.drivetrain === "awd" ? 0 : car.groundContact;
  const governedTopSpeed = handling.topSpeed * (1 - groundPenalty * (1 - HANDLING.groundTopSpeedScale));
  const velocity = body.linvel();
  const forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
  const speed = Math.hypot(velocity.x, velocity.z);
  // The gearbox turns torque into acceleration against the shared mass, not the
  // car's: a car's weight is what it does in contact, never how it pulls. Its power
  // is the car's own: `power` scales the gearbox as it scales the engine curve, or
  // on the drag strip every car would pull alike (2026-09-19). Exactly 1 untuned.
  const manualAcceleration = car.transmission ? sim.state.race?.finished ? 0
    : stepTransmission(car.transmission, rawInput, Math.max(0, forwardSpeed), sim.state.race?.countdown ?? 0,
      sim.state.race?.ticks ?? 0, HANDLING.mass, DT) * (handling.engineAcceleration / HANDLING.engineAcceleration) : null;
  const race = sim.state.race;
  // Only the player burns out, and never once a race is over.
  const launchScale = car.launch && (race || player)
    ? stepLaunch(car.launch, rawInput, race?.countdown ?? 0, race?.ticks ?? 0, player && !race?.finished ? { speed } : null) : 1;
  const effectiveThrottle = input.handbrake > 0.05 ? 0 : input.throttle * (1 - input.brake);
  // The player chooses the direction and amount. Slip only opens the manual
  // countersteering envelope; it never steers on the player's behalf.
  const lateralSpeed = velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading);
  const bodySlip = Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), HANDLING.lowSpeedSlipReference));
  Object.assign(car, steeringControlFor(car.steering, input.steer, forwardSpeed, lateralSpeed, body.angvel().y,
    handling.drivetrain === "rwd" ? HANDLING.rwdCountersteerLookahead : 0, handling));
  const countersteerRecovery = handling.drivetrain === "rwd" && forwardSpeed > HANDLING.countersteerMinSpeed &&
    input.steer * lateralSpeed > 0 && car.steering * lateralSpeed > 0
    ? Math.min(1, Math.abs(car.steering) / 0.5) *
      clamp((Math.abs(car.steeringAngle) / HANDLING.maxSteeringAngle - HANDLING.rwdCountersteerScrubLockStart) /
        (1 - HANDLING.rwdCountersteerScrubLockStart), 0, 1) : 0;

  // Longitudinal weight transfer follows last tick's applied tyre forces,
  // not impact acceleration. This changes axle grip, never commands rotation.
  const targetFrontLoad = clamp(STATIC_FRONT_LOAD - car.longitudinalAcceleration *
    HANDLING.centerOfMassHeight / (HANDLING.gravityAlongGrade * WHEELBASE),
    HANDLING.minFrontLoad, HANDLING.maxFrontLoad);
  car.frontLoadFraction = moveToward(car.frontLoadFraction, targetFrontLoad, HANDLING.loadResponse * DT);
  // Turning right loads the left (outside) tyres. Shares conserve total load;
  // bounds intentionally keep all four patches planted in this planar model.
  const targetRightLoad = clamp(0.5 - car.lateralAcceleration * HANDLING.centerOfMassHeight /
    (HANDLING.gravityAlongGrade * HANDLING.halfTrack * 2), HANDLING.minSideLoad, HANDLING.maxSideLoad);
  car.rightLoadFraction = moveToward(car.rightLoadFraction, targetRightLoad, HANDLING.loadResponse * DT);

  // Latch reverse only near rest: pointing backward during a spin is not a
  // gear change. Throttle always selects forward again, as in the old controls.
  if (effectiveThrottle > 0) car.driveDirection = 1;
  else if (input.brake > 0 && input.handbrake < 0.05 && speed < HANDLING.reverseEngageSpeed) {
    car.driveDirection = -1;
  }
  const reversing = !car.transmission && car.driveDirection === -1 && input.brake > 0 &&
    effectiveThrottle === 0 && input.handbrake < 0.05;
  const gradeAcceleration = gradeAccelerationFor(road.pitch, forwardX * road.ux + forwardZ * road.uz);
  const dragAcceleration = -Math.sign(forwardSpeed) * handling.aerodynamicDrag * forwardSpeed ** 2;
  // Ground drag is not compensated by the governor, so it costs acceleration as
  // well as top speed. It fades out below 2 m/s so a car at rest cannot chatter.
  const groundDragAcceleration = -Math.sign(forwardSpeed) * HANDLING.groundRollingResistance * groundPenalty *
    clamp(Math.abs(forwardSpeed) / 2, 0, 1);
  let driveAcceleration = reversing
    ? -HANDLING.reverseAcceleration * input.brake
    : manualAcceleration ?? engineAccelerationFor(Math.max(0, forwardSpeed), handling) * effectiveThrottle *
      // The launch scales the engine's push as well as the tyres' grip (below), so it
      // buys whichever limits the car. A car whose engine, not its tyres, limits it
      // off the line (a tune with less power) got nothing from grip alone (2026-09-19).
      (input.brake === 0 ? launchScale : 1);
  // Govern propulsion instead of hard-clamping impact/downhill velocity.
  if (driveAcceleration > 0) {
    driveAcceleration = Math.min(driveAcceleration,
      Math.max(0, (governedTopSpeed - forwardSpeed) / DT - dragAcceleration - gradeAcceleration));
  } else if (driveAcceleration < 0) {
    driveAcceleration = Math.max(driveAcceleration,
      Math.min(0, (-HANDLING.reverseSpeed - forwardSpeed) / DT - dragAcceleration - gradeAcceleration));
  }
  const serviceBrake = reversing ? 0 : brakeDecelerationFor(input.brake, handling) * handling.mass;
  const rollingBrake = effectiveThrottle === 0 ? HANDLING.rollingResistance * handling.mass : 0;
  const driveForce = driveAcceleration * handling.mass;
  const driveGripProgress = clamp((forwardSpeed - HANDLING.twoWheelDriveGripStartSpeed) /
    (HANDLING.twoWheelDriveGripFullSpeed - HANDLING.twoWheelDriveGripStartSpeed), 0, 1);
  const driveGripBlend = driveGripProgress * driveGripProgress * (3 - 2 * driveGripProgress);
  // A launch buys traction as well as torque: on shared power the tyres are already
  // at their limit off the line, so extra drive alone is clamped away and changes
  // nothing (measured 2026-09-16). It rides the same powered-axis scale, so steering
  // is untouched. The drive above is scaled too, for a car limited by its engine.
  const driveGripScale = (handling.drivetrain !== "awd" && driveForce > 0 && input.brake === 0
    ? 1 + (HANDLING.twoWheelDriveGripScale - 1) * driveGripBlend : 1)
    * (driveForce > 0 && input.brake === 0 ? launchScale * handling.traction : 1);
  const angles = frontWheelAngles(car.steeringAngle);
  let forceX = 0;
  let forceZ = 0;
  const patches = WHEEL_LAYOUT.map((wheel, index) => {
    const frontShare = wheel.front ? car.frontLoadFraction : 1 - car.frontLoadFraction;
    const sideShare = wheel.right > 0 ? car.rightLoadFraction : 1 - car.rightLoadFraction;
    const frontDriveShare = HANDLING.frontDriveFraction[handling.drivetrain];
    const driveShare = wheel.front ? frontDriveShare : 1 - frontDriveShare;
    const brakeShare = wheel.front ? HANDLING.frontBrakeFraction : 1 - HANDLING.frontBrakeFraction;
    const rollingShare = wheel.front ? STATIC_FRONT_LOAD : 1 - STATIC_FRONT_LOAD;
    const handbrake = wheel.front ? 0 : input.handbrake;
    return sampleWheelForces(sim, {
      front: wheel.front,
      countersteerRecovery,
      bodySlip,
      speed,
      driveGripScale: driveShare > 0 ? driveGripScale : 1,
      forward: wheel.forward, right: wheel.right,
      steeringAngle: wheel.front ? (wheel.right > 0 ? angles.right : angles.left) : 0,
      loadFraction: frontShare * sideShare,
      driveForce: driveForce * driveShare * 0.5,
      brakeForce: (serviceBrake * brakeShare + rollingBrake * rollingShare +
        HANDLING.handbrakeDrag * handling.mass * handbrake) * 0.5,
      pedalBrake: serviceBrake * brakeShare * 0.5,
      pedalRaw: player ? 1 - (sim.pedalAssist ?? 1) : 0,
      reportPedals: player,
      stiffness: wheel.front ? handling.frontCorneringStiffness :
        handling.rearCorneringStiffness * (1 - handbrake * (1 - handling.handbrakeRearStiffness)),
      gripScale: (1 - handbrake * (1 - HANDLING.handbrakeRearGrip)) *
        (onGround[index] && groundPenalty > 0 ? HANDLING.groundGripScale : 1),
    }, car.wheels[wheel.id]);
  });
  if (player && sim.pedalFeedback) {
    // With the assist turned down, what the tyres are doing: their slip, which
    // lingers. At the default there is no slip, only what the pedals are asking.
    const slips = patches.map(patch => patch.telemetry.slip);
    sim.pedalFeedback.spin = (sim.pedalAssist ?? 1) < 1 ? Math.max(0, ...slips.map(slip => slip ?? 0))
      : Math.max(0, ...patches.filter(patch => patch.driveForce !== 0).map(patch => patch.excess));
    sim.pedalFeedback.lock = (sim.pedalAssist ?? 1) < 1 ? Math.max(0, ...slips.map(slip => -(slip ?? 0)))
      : Math.max(0, ...patches.filter(patch => patch.driveForce === 0 && serviceBrake > 0).map(patch => patch.excess));
  }
  if (car.launch?.burnout) {
    for (const patch of patches) patch.telemetry.longitudinalForce = 0;
    summarizeAxle(car.wheels["front-left"], car.wheels["front-right"], car.frontAxle);
    summarizeAxle(car.wheels["rear-left"], car.wheels["rear-right"], car.rearAxle);
    car.longitudinalAcceleration = 0;
    car.lateralAcceleration = 0;
    applyBurnout(sim, input.steer, heading);
    return;
  }
  for (const [left, right] of [[patches[0]!, patches[1]!], [patches[2]!, patches[3]!]] as const) {
    // Equal-radius open-differential/traction-control approximation. Both sides
    // receive the same drive torque, bounded by the weaker tyre. Do not turn
    // unequal grip into accidental outside-wheel torque vectoring. Brakes still
    // use each wheel's own available grip, independently of this drive split.
    const direction = Math.sign(left.driveForce);
    const driveForce = direction * Math.min(Math.abs(left.driveForce), Math.abs(right.driveForce),
      Math.max(0, left.longitudinalBudget - direction * left.brakingForce),
      Math.max(0, right.longitudinalBudget - direction * right.brakingForce));
    for (const patch of [left, right]) {
      const force = applyWheelForce(sim, patch, driveForce);
      forceX += force.x;
      forceZ += force.z;
    }
  }
  summarizeAxle(car.wheels["front-left"], car.wheels["front-right"], car.frontAxle);
  summarizeAxle(car.wheels["rear-left"], car.wheels["rear-right"], car.rearAxle);
  car.longitudinalAcceleration = (forceX * forwardX + forceZ * forwardZ) / handling.mass;
  car.lateralAcceleration = (forceX * Math.cos(heading) - forceZ * Math.sin(heading)) / handling.mass;
  body.addForce({ x: forwardX * (dragAcceleration + gradeAcceleration + groundDragAcceleration) * handling.mass,
    y: 0, z: forwardZ * (dragAcceleration + gradeAcceleration + groundDragAcceleration) * handling.mass }, true);
}

export function step(sim: Sim, rawInput: Input): void {
  const parkedRigs: VehicleRig[] = sim.state.parkedRivals.map((rival, i) => ({
    roadWorld: sim.roadWorld, body: sim.parkedRivalBodies[i]!,
    state: { vehicle: rival.vehicle, handling: parkedHandling(sim.parkedRivalDefinitions[i]!), race: null },
  }));
  for (const parked of parkedRigs) applyVehicleInput(parked, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
  const cruiserRigs: VehicleRig[] = sim.state.cruisers.map((cruiser, i) => ({
    roadWorld: sim.roadWorld, body: sim.cruiserBodies[i]!,
    state: { vehicle: cruiser.vehicle, handling: handlingFor(sim.cruiserDefinitions[i]!.route), race: null },
  }));
  const trafficObstacles = () => (sim.state.traffic?.vehicles ?? []).map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }));
  const encounterRig: VehicleRig | null = sim.state.encounter && sim.encounterBody
    ? { roadWorld: sim.roadWorld, body: sim.encounterBody,
      // Read the route's own car: hardcoding the layout once quietly ignored a
      // field RivalDefinition offers, so setting it on a cruise route did nothing.
      state: { vehicle: sim.state.encounter, handling: handlingFor(sim.encounterRoute ?? {}), race: null } } : null;
  if (encounterRig) {
    const driver = sim.state.encounterDriver;
    const input = sim.encounterRoute && driver ? rivalInput(sim.encounterRoute,
      { vehicle: encounterRig.state.vehicle, driver, race: null },
      [sim.state.vehicle, ...sim.state.parkedRivals.map(r => r.vehicle), ...sim.state.cruisers.map(c => c.vehicle), ...trafficObstacles()])
      : { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    applyVehicleInput(encounterRig, input);
  }
  // Each cruiser drives its loop as Moth drives hers, around everyone else on the road.
  sim.state.cruisers.forEach((cruiser, i) => {
    const others = sim.state.cruisers.filter((_, j) => j !== i).map(c => c.vehicle);
    applyVehicleInput(cruiserRigs[i]!, rivalInput(sim.cruiserDefinitions[i]!.route, { vehicle: cruiser.vehicle, driver: cruiser.driver, race: null },
      [sim.state.vehicle, ...sim.state.parkedRivals.map(r => r.vehicle), ...(sim.state.encounter ? [sim.state.encounter] : []), ...others, ...trafficObstacles()]));
  });
  const rival = sim.state.rival;
  const rig: VehicleRig | null = rival && sim.rivalBody ? { roadWorld: sim.roadWorld, body: sim.rivalBody, state: rival } : null;
  if (rival && sim.rivalDefinition && !sim.race?.drag) {
    // The player is the rival's opponent, not one more obstacle: it races them
    // (RIVAL_RACING in rival.ts) and slows only for traffic, or a stopped player.
    // A street line is taken a corner at a time, by what traffic's own forecast shows (street-line.ts).
    ghostRival(sim);
    // Out of sight and behind, the road it reads is empty (`UNSEEN_ROAD`).
    const seen = rival.ghost ? [] : sim.state.traffic?.vehicles ?? [];
    if (sim.rivalDefinition.line && rival.race.countdown <= 0) readStreetLine(sim.rivalDefinition, rival.driver, rival.vehicle, rival.race.ticks, sim.roadWorld.traffic, seen);
    rival.input = rivalInput(sim.rivalDefinition, rival,
      seen.map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length })),
      sim.state.vehicle, sim.roadWorld.traffic ? { network: sim.roadWorld.traffic, vehicles: seen,
        tick: rival.race.ticks, ground: sim.roadWorld.ground, opponent: sim.state.vehicle } : undefined);
    // It launches as the player does, from its own skill: it holds the line for as
    // much of the countdown as its rank is worth, and lets go at the flag (`launch.ts`).
    const charge = rivalLaunchCharge(sim.rivalDefinition.launch ?? RIVAL_LAUNCH_SKILL);
    if (rival.race.countdown > 0 && rival.race.countdown <= charge) rival.input = { ...rival.input, throttle: 1, handbrake: 1 };
  }
  if (sim.race?.drag && sim.state.race) {
    rawInput = dragLaneInput(sim.race.drag, sim.state.race, sim.state.vehicle, rawInput);
    if (rival) {
      const transmission = rival.vehicle.transmission!;
      const shiftUp = transmission.shiftTicks === 0 && transmission.rpm >= TRANSMISSION.shiftMin + 150;
      // Rivet stages at 4700 RPM, reacts after 0.15 seconds, then shifts by RPM.
      const throttle = rival.race.countdown > 0 ? (4700 - TRANSMISSION.idle) / (TRANSMISSION.redline - TRANSMISSION.idle)
        : rival.race.ticks < 9 ? (4700 - TRANSMISSION.idle) / (TRANSMISSION.redline - TRANSMISSION.idle) : 1;
      rival.input = dragLaneInput(sim.race.drag, rival.race, rival.vehicle,
        { throttle, brake: 0, handbrake: rival.race.finished || (rival.race.countdown === 0 && rival.race.ticks < 9) ? 1 : 0, steer: 0, shiftUp });
    }
  }
  applyVehicleInput(sim, rawInput, true);
  if (rig && rival) applyVehicleInput(rig, rival.input);
  let armed: ArmedTraffic[] = [], trafficRacers: readonly TrafficRacer[] = [];
  // Traffic advances before the solver runs, so the player's contact this tick
  // is against where the traffic actually is rather than where it was.
  if (sim.state.traffic && sim.roadWorld.traffic) {
    // Traffic yields to the cars it does not drive (TrafficRacer in traffic.ts).
    // A rival out of sight (`UNSEEN_ROAD`) is nothing traffic meets: it neither yields to it nor turns body for it.
    const racers = [sim.state.vehicle, ...(sim.state.rival && !sim.state.rival.ghost ? [sim.state.rival.vehicle] : []),
      ...(sim.state.encounter ? [sim.state.encounter] : []), ...sim.state.cruisers.map(c => c.vehicle), ...sim.state.parkedRivals.map(r => r.vehicle)];
    // A wreck is an obstacle traffic queues behind and keeps out of a junction for (`TrafficRacer.obstacle`).
    const wrecks: TrafficRacer[] = sim.state.traffic.vehicles.filter(v => v.wreck).map(v => ({ x: v.x, z: v.z, heading: v.heading, speed: v.speed, obstacle: true }));
    stepTraffic(sim.roadWorld.traffic, sim.state.traffic, DT, wrecks.length ? [...racers, ...wrecks] : racers);
    armed = moveTrafficBodies(sim.roadWorld.traffic, sim.state.traffic, sim.trafficBodies, racers);
    trafficRacers = racers;
  }
  sim.world.step();
  if (sim.state.traffic && sim.roadWorld.traffic) settleTrafficBodies(sim.roadWorld.traffic, sim.state.traffic, sim.trafficBodies, armed, sim.state.vehicle, trafficRacers);
  finishVehicle(sim);
  if (rig) finishVehicle(rig);
  if (encounterRig) finishVehicle(encounterRig);
  for (const cruiser of cruiserRigs) finishVehicle(cruiser);
  for (const parked of parkedRigs) finishVehicle(parked);
  if (!sim.race?.drag) resetStalledRival(sim);
  if (sim.state.encounter && sim.state.encounterDriver && sim.encounterBody && sim.encounterRoute) {
    resetStalledDriver(sim, sim.encounterBody, sim.encounterRoute, sim.state.encounterDriver, null,
      (vehicle, driver) => { sim.state.encounter = vehicle; sim.state.encounterDriver = driver; }, undefined, false, sim.state.cruisers.map(c => c.vehicle));
  }
  sim.state.cruisers.forEach((cruiser, i) => {
    const others = [...(sim.state.encounter ? [sim.state.encounter] : []), ...sim.state.cruisers.filter((_, j) => j !== i).map(c => c.vehicle)];
    resetStalledDriver(sim, sim.cruiserBodies[i]!, sim.cruiserDefinitions[i]!.route, cruiser.driver, null,
      (vehicle, driver) => { cruiser.vehicle = vehicle; cruiser.driver = driver; }, undefined, false, others);
  });
  sim.state.tick++;
  // After syncState: the race reads the vehicle where this tick left it.
  let driftContact = false;
  if (sim.race?.kind === "drift") {
    const collider = sim.body.collider(0);
    sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, manifold => {
      if (manifold.numSolverContacts() > 0) driftContact = true;
    }));
  }
  if (sim.race && sim.state.race) stepRace(sim.race, sim.state.race, sim.state.vehicle, driftContact);
  if (sim.race && rival) stepRace(sim.race, rival.race, rival.vehicle);
}

/**
 * Give normal recovery twelve seconds, then rejoin locally without gaining a gate:
 * where it was or behind, never further along (2026-09-13). It used to try 8 m on
 * first, up to 24 m, so the one reset the player can watch was the one that could
 * gain ground. Only when it is stuck again within 30 m of where the last reset put
 * it, the way on blocked from behind and 24 s already lost, may it be put past.
 */
export const RIVAL_RESET_TICKS = 12 * TICK_HZ;
/** Metres from the last reset within which a second one counts as stuck at the same place. */
const RESET_REPEAT = 30;

/**
 * Traffic a racer can knock (2026-09-23, `traffic-v9`, Shawn: the MC3 feel). Traffic used to be kinematic without
 * exception, a wall of infinite mass that drove on: clipping a sedan at 30 mph stopped a car as hard as a bus would,
 * and any contact ended a rival's race. Now a car near a racer is, for that tick, a physics body of its kind's mass
 * (`TRAFFIC_KINDS`), driven along its lane by velocity, so a contact is resolved with both masses: what the racer
 * loses depends on what it hit and what it drives. Knocked off its lane's motion by more than `speed` or `yaw`, it is
 * a wreck (`knockTraffic`): it rolls on braking, its slide and spin dying away, traffic queues behind it, and once it has
 * been still `rest` seconds out of the player's sight (`UNSEEN_RECOVERY.sight`) it is put back on its lane
 * (`restoreTraffic`). A kind with no mass (the box truck) is never a body: still a wall. Bodies change type and are
 * never added or removed, so a replay makes the same solver the same way. Traffic alone never meets a racer, and is
 * what it was.
 */
export const TRAFFIC_KNOCK = {
  /** Metres from a racer, plus `lead` seconds of both cars' speed, inside which a car is a body for the tick. */
  reach: 9, lead: 0.15,
  /** m/s off its lane's velocity, or rad/s off its lane's turn, after a tick as a body that knock it off its lane. */
  speed: 1.2, yaw: 0.35,
  /** A wreck rolls on and is braked (`brake`, m/s²), and its slide across its own heading and its spin die away (per
   *  second). Damped the same way in every direction it stopped as if its wheels had locked, and the car that hit it
   *  ploughed on into it: 24 m/s lost from 30 into a sedan, where the wall it replaced cost 16. */
  brake: 4, slide: 4, spin: 1.2,
  /** Seconds a wreck has been still before it may go back, and below what it counts as still (m/s, rad/s). */
  rest: 2, still: 0.3, stillSpin: 0.2,
} as const;

interface ArmedTraffic { index: number; vx: number; vz: number; turn: number }

function wrapAngle(angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)); }

/** Before the solver: a wreck held on the ground, a car near a racer a body driven along its lane, the rest kinematic. */
function moveTrafficBodies(network: TrafficNetwork, state: TrafficState, bodies: readonly RAPIER.RigidBody[], racers: readonly TrafficRacer[]): ArmedTraffic[] {
  const armed: ArmedTraffic[] = [];
  state.vehicles.forEach((vehicle, index) => {
    const body = bodies[index]!, spec = TRAFFIC_KINDS[vehicle.kind];
    if (vehicle.wreck) {
      const at = body.translation(), velocity = body.linvel(), heading = headingFromRotation(body.rotation());
      const fx = -Math.sin(heading), fz = -Math.cos(heading), along = velocity.x * fx + velocity.z * fz;
      const rolling = Math.sign(along) * Math.max(0, Math.abs(along) - TRAFFIC_KNOCK.brake * DT), slide = Math.exp(-TRAFFIC_KNOCK.slide * DT);
      body.setTranslation({ x: at.x, y: network.height(at.x, at.z) + spec.height * 0.5, z: at.z }, true);
      body.setLinvel({ x: rolling * fx + (velocity.x - along * fx) * slide, y: 0, z: rolling * fz + (velocity.z - along * fz) * slide }, true);
      body.setAngvel({ x: 0, y: body.angvel().y * Math.exp(-TRAFFIC_KNOCK.spin * DT), z: 0 }, true);
      return;
    }
    const near = spec.mass !== undefined && racers.some(racer =>
      Math.hypot(racer.x - vehicle.x, racer.z - vehicle.z) < TRAFFIC_KNOCK.reach + (racer.speed + vehicle.speed) * TRAFFIC_KNOCK.lead);
    if (!near) {
      if (body.bodyType() !== RAPIER.RigidBodyType.KinematicPositionBased) {
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      body.setNextKinematicTranslation({ x: vehicle.x, y: vehicle.y + spec.height * 0.5, z: vehicle.z });
      body.setNextKinematicRotation(yawRotation(vehicle.heading));
      return;
    }
    if (body.bodyType() !== RAPIER.RigidBodyType.Dynamic) {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      body.setEnabledTranslations(true, false, true, true);
      body.setEnabledRotations(false, true, false, true);
    }
    // Driven to where its lane puts it this tick: unhit, a body lands exactly where kinematic traffic would.
    const at = body.translation(), turn = wrapAngle(vehicle.heading - headingFromRotation(body.rotation())) / DT;
    const vx = (vehicle.x - at.x) / DT, vz = (vehicle.z - at.z) / DT;
    body.setTranslation({ x: at.x, y: vehicle.y + spec.height * 0.5, z: at.z }, true);
    body.setLinvel({ x: vx, y: 0, z: vz }, true);
    body.setAngvel({ x: 0, y: turn, z: 0 }, true);
    armed.push({ index, vx, vz, turn });
  });
  return armed;
}

/** After the solver: a body knocked off its lane's motion is a wreck; a wreck's pose is its state; a still wreck out of
 *  the player's sight goes back on its lane. */
function settleTrafficBodies(network: TrafficNetwork, state: TrafficState, bodies: readonly RAPIER.RigidBody[], armed: readonly ArmedTraffic[],
  player: Readonly<VehicleState>, racers: readonly TrafficRacer[]): void {
  for (const { index, vx, vz, turn } of armed) {
    const body = bodies[index]!, velocity = body.linvel();
    if (Math.hypot(velocity.x - vx, velocity.z - vz) > TRAFFIC_KNOCK.speed || Math.abs(body.angvel().y - turn) > TRAFFIC_KNOCK.yaw) {
      knockTraffic(state.vehicles[index]!);
    }
  }
  state.vehicles.forEach((vehicle, index) => {
    if (!vehicle.wreck) return;
    const body = bodies[index]!, at = body.translation(), velocity = body.linvel();
    vehicle.x = at.x; vehicle.z = at.z; vehicle.y = network.height(at.x, at.z);
    vehicle.heading = headingFromRotation(body.rotation());
    vehicle.speed = Math.hypot(velocity.x, velocity.z);
    vehicle.wreck.still = vehicle.speed < TRAFFIC_KNOCK.still && Math.abs(body.angvel().y) < TRAFFIC_KNOCK.stillSpin ? vehicle.wreck.still + 1 : 0;
    if (vehicle.wreck.still < TRAFFIC_KNOCK.rest * TICK_HZ) return;
    if (Math.hypot(player.x - vehicle.x, player.z - vehicle.z) <= UNSEEN_RECOVERY.sight) return;
    if (!restoreTraffic(network, state, vehicle, racers)) return;
    const spec = TRAFFIC_KINDS[vehicle.kind];
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: vehicle.x, y: vehicle.y + spec.height * 0.5, z: vehicle.z }, true);
    body.setRotation(yawRotation(vehicle.heading), true);
  });
}

/**
 * The road out of sight (Shawn, 2026-09-23). Behind the player in the race (`racePosition`) and more than `ghostBeyond`
 * metres from them, the rival drives the road as if it were empty: its collider meets no traffic, it reads none, and
 * traffic neither yields to it nor turns body for it. It can never be faster than its own clear-road self, which is the
 * same car, tyres and driver on an empty street, and never further along than that driving gets it; only what traffic
 * would have cost it out of sight is given back. Within `solidWithin` metres, or ahead of the player, it is solid again,
 * but only where no traffic car is within `clear` metres of it, so it never appears inside one. Behind only: it is the
 * rival that cannot be shaken, never one that escapes through traffic the player is stuck in. Distance stands in for
 * sight as it does for `UNSEEN_RECOVERY`: the sim cannot ask the camera, and a replay cannot either.
 */
export const UNSEEN_ROAD = { ghostBeyond: 140, solidWithin: 120, clear: 6 } as const;
/**
 * Collision groups, (memberships << 16) | filter: while the rival is a ghost, traffic is bit 2 and the ghost's filter
 * leaves it out. Only then: traffic given its own membership for good, every filter still admitting it, moved five of
 * the golden master's fourteen runs though the same pairs collide (2026-09-23). Rapier's results depend on the groups,
 * not only on which pairs they allow.
 */
const TRAFFIC_GROUPS = 0x0002ffff, GHOST_GROUPS = 0xfffffffd, ALL_GROUPS = 0xffffffff;

function ghostRival(sim: Sim): void {
  const rival = sim.state.rival, body = sim.rivalBody;
  if (!rival || !body || !sim.race || !sim.state.race || !sim.state.traffic) return;
  const player = sim.state.vehicle, apart = Math.hypot(rival.vehicle.x - player.x, rival.vehicle.z - player.z);
  const racing = rival.race.countdown <= 0 && !rival.race.finished;
  const behind = racePosition(sim.race, { race: sim.state.race, x: player.x, z: player.z }, { race: rival.race, x: rival.vehicle.x, z: rival.vehicle.z }) === 1;
  if (!rival.ghost) {
    if (racing && behind && apart > UNSEEN_ROAD.ghostBeyond) {
      rival.ghost = true;
      body.collider(0).setCollisionGroups(GHOST_GROUPS);
      for (const traffic of sim.trafficBodies) traffic.collider(0).setCollisionGroups(TRAFFIC_GROUPS);
    }
    return;
  }
  if (racing && behind && apart > UNSEEN_ROAD.solidWithin) return;
  if (sim.state.traffic.vehicles.some(v => Math.hypot(v.x - rival.vehicle.x, v.z - rival.vehicle.z) < UNSEEN_ROAD.clear)) return;
  delete rival.ghost;
  body.collider(0).setCollisionGroups(ALL_GROUPS);
  for (const traffic of sim.trafficBodies) traffic.collider(0).setCollisionGroups(ALL_GROUPS);
}

/**
 * Recovery out of the player's sight (2026-09-13). Where NightShift may lie for
 * the AI, by Shawn's call: not in the handling, which the rival drives exactly as
 * the player does, but in getting unstuck where nobody is watching. A rival that
 * has made no progress for `seconds`, more than `sight` metres from the player,
 * is put back on its line at rest, where it already was or behind it, never
 * further along: a reset costs it time and never gains it any. Distance stands in
 * for sight because the sim cannot ask the camera and a replay cannot either.
 */
export const UNSEEN_RECOVERY = { seconds: 2.5, sight: 120 } as const;

function resetStalledRival(sim: Sim): void {
  const rival = sim.state.rival, body = sim.rivalBody, route = sim.rivalDefinition;
  if (!rival || !body || !route || !sim.race || sim.race.kind === "drag" || rival.race.countdown > 0 || rival.race.finished) return;
  const place = (vehicle: VehicleState, driver: RivalDriver) => {
    // A reset builds a fresh vehicle: carry the powertrain state across it rather
    // than silently dropping the launch (and, if a drag ever resets, the gearbox).
    rival.vehicle = { ...vehicle, launch: rival.vehicle.launch, transmission: rival.vehicle.transmission };
    rival.driver = driver;
    rival.input = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  };
  const unseen = Math.hypot(rival.vehicle.x - sim.state.vehicle.x, rival.vehicle.z - sim.state.vehicle.z) > UNSEEN_RECOVERY.sight;
  if (unseen && rival.driver.noProgressTicks < RIVAL_RESET_TICKS) {
    resetStalledDriver(sim, body, route, rival.driver, rival.race, place, Math.round(UNSEEN_RECOVERY.seconds * TICK_HZ), true);
  } else resetStalledDriver(sim, body, route, rival.driver, rival.race, place);
}

function resetStalledDriver(sim: Sim, body: RAPIER.RigidBody, route: RivalDefinition, driver: RivalDriver,
  race: RaceState | null, reset: (vehicle: VehicleState, driver: RivalDriver) => void,
  after = RIVAL_RESET_TICKS, unseen = false, others: readonly VehicleState[] = []): void {
  if (driver.noProgressTicks < after || driver.resetCheckIn > 0) return;
  driver.resetCheckIn = TICK_HZ;
  const gate = race ? sim.race!.checkpoints[race.targetIndex]! : null;
  const minimum = race && race.targetIndex > 0 ? route.gates[race.targetIndex - 1]! : 0;
  const maximum = race && gate ? route.gates[race.targetIndex]! - gate.radius - 5 : route.along.at(-1)!;
  if (maximum < minimum) return;
  const center = Math.max(minimum, Math.min(maximum, driver.along));
  const shape = new RAPIER.Cuboid(1.4, .65, 2.7);
  // Only where it was or behind: never further along. In sight and stuck again where
  // the last reset put it, past whatever is in the way.
  const repeat = !unseen && Math.abs(center - driver.resetAlong) < RESET_REPEAT;
  for (const delta of repeat ? [8, 16, 24, 0, -8, -16, -24] : [0, -8, -16, -24]) {
    const along = Math.max(minimum, Math.min(maximum, center + delta));
    const point = sampleRivalPath(route, along);
    for (const side of [0, 3, -3]) {
      const x = point.x - point.uz * side, z = point.z + point.ux * side;
      // Never materialize inside the next gate or ahead of it along the route.
      if (gate && Math.hypot(x - gate.x, z - gate.z) < gate.radius + 4) continue;
      const road = sim.roadWorld.project(x, z);
      if (road.distance > road.width / 2 - 1.5) continue;
      const surface = drivenSurface(sim.roadWorld, x, z);
      const heading = Math.atan2(-point.ux, -point.uz);
      const position = { x, y: surface.height + START_Y, z };
      let occupied = false;
      sim.world.intersectionsWithShape(position, yawRotation(heading), shape,
        () => { occupied = true; return false; }, undefined, undefined, undefined, body);
      if (occupied) continue;
      // Leave room for vehicles that will arrive immediately after the reset.
      const vehicles = [sim.state.vehicle, ...sim.state.parkedRivals.map(r => r.vehicle), ...others, ...(sim.state.traffic?.vehicles ?? [])];
      if (vehicles.some(vehicle => Math.abs(vehicle.y - surface.height) < 3 &&
        (Math.hypot(vehicle.x - x, vehicle.z - z) < 8 ||
         Math.hypot(vehicle.x - Math.sin(vehicle.heading) * vehicle.speed * .5 - x,
           vehicle.z - Math.cos(vehicle.heading) * vehicle.speed * .5 - z) < 8))) continue;
      body.setTranslation(position, true);
      body.setRotation(yawRotation(heading), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.resetForces(true);
      body.resetTorques(true);
      reset(initialVehicle({ ...sim.roadWorld, start: { x, y: surface.height, z,
        heading, pitch: surface.pitch * (point.ux * surface.ux + point.uz * surface.uz) } }, handlingFor(route)),
        { ...createRivalDriver(), along, progressMark: along, recoveries: driver.recoveries, resetAlong: along,
          resets: driver.resets + (unseen ? 0 : 1), unseenResets: driver.unseenResets + (unseen ? 1 : 0) });
      return;
    }
  }
}

function finishVehicle(sim: VehicleRig): void {
  const resolved = sim.body.translation();
  sim.body.setTranslation({ x: resolved.x, y: drivenSurface(sim.roadWorld, resolved.x, resolved.z).height + START_Y,
    z: resolved.z }, true);
  syncState(sim);
}

function syncState(sim: VehicleRig): void {
  const position = sim.body.translation();
  const heading = headingFromRotation(sim.body.rotation());
  const velocity = sim.body.linvel();
  const forwardSpeed = -velocity.x * Math.sin(heading) - velocity.z * Math.cos(heading);
  const lateralSpeed = velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading);
  const road = drivenSurface(sim.roadWorld, position.x, position.z);
  const alignment = -Math.sin(heading) * road.ux - Math.cos(heading) * road.uz;
  const car = sim.state.vehicle;
  for (const layout of WHEEL_LAYOUT) {
    const tyre = car.wheels[layout.id];
    const point = {
      x: position.x - Math.sin(heading) * layout.forward + Math.cos(heading) * layout.right,
      y: position.y,
      z: position.z - Math.cos(heading) * layout.forward - Math.sin(heading) * layout.right,
    };
    const wheelVelocity = sim.body.velocityAtPoint(point);
    const wheelHeading = heading - tyre.steeringAngle;
    tyre.longitudinalSpeed = -wheelVelocity.x * Math.sin(wheelHeading) - wheelVelocity.z * Math.cos(wheelHeading);
    tyre.lateralSpeed = wheelVelocity.x * Math.cos(wheelHeading) - wheelVelocity.z * Math.sin(wheelHeading);
    // A spinning tyre's tread outruns the road and a locked one stops turning. Drawn
    // only, and only where there is a slip; every other wheel rolls as it always did.
    if (tyre.slip) {
      tyre.rollingDistance += tyre.slip > 0
        ? (tyre.longitudinalSpeed + tyre.slip * HANDLING.wheelSpinSurfaceSpeed) * DT
        : tyre.longitudinalSpeed * (1 + tyre.slip) * DT;
    } else tyre.rollingDistance += tyre.longitudinalSpeed * DT;
  }
  // The body follows the ground, drawn only: the grade force reads the road
  // (gradeAccelerationFor), not this. On a landform the lean is the ground's own
  // slope along the nose and across it, so a road cut across a hillside tilts
  // the car with it; Queen Anne Climb falls 8 degrees across the carriageway,
  // and the car used to sit level on it. Authored track has no slope across it,
  // so there the car keeps the road's pitch and stays level.
  const landform = road.gradeX !== undefined && road.gradeZ !== undefined;
  const pitchTarget = landform ? Math.atan(-road.gradeX! * Math.sin(heading) - road.gradeZ! * Math.cos(heading)) : road.pitch * alignment;
  const rollTarget = landform ? Math.atan(road.gradeX! * Math.cos(heading) - road.gradeZ! * Math.sin(heading)) : 0;
  const settle = Math.min(1, HANDLING.pitchResponse * DT);
  Object.assign(car, {
    x: position.x, y: road.height, z: position.z, heading,
    pitch: car.pitch + (pitchTarget - car.pitch) * settle,
    roll: car.roll + (rollTarget - car.roll) * settle,
    speed: Math.hypot(velocity.x, velocity.z), forwardSpeed, lateralSpeed,
    yawRate: sim.body.angvel().y, slipAngle: Math.atan2(lateralSpeed, Math.abs(forwardSpeed) + 0.5),
  });
}
