import { createTransmission, stepTransmission, TRANSMISSION, type TransmissionState } from "./transmission.ts";
import { dragLaneInput } from "./drag-rules.ts";
import { createRivalDriver, rivalInput, sampleRivalPath, withExits, type RivalDefinition, type RivalDriver } from "./rival.ts";
/* Deterministic planar four-wheel model. Tyres supply four independent forces;
   Rapier integrates motion and contacts. Three.js only draws the result. */
import RAPIER from "@dimforge/rapier3d-compat";
import { BLACKGLASS_WORLD, type RoadWorld } from "./road-world.ts";
import { createTraffic, stepTraffic, TRAFFIC_KINDS, type TrafficState } from "./traffic.ts";
import { createRace, raceHolding, stepRace, type RaceDefinition, type RaceState } from "./race.ts";

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const PHYSICS_VERSION = "four-wheel-v5";

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
}

export interface VehicleState {
  transmission?: TransmissionState;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
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
  wheels: Record<WheelId, WheelState>;
  // Derived diagnostics retained for existing tools, never force generators.
  frontAxle: AxleState;
  rearAxle: AxleState;
}

export interface ParkedRival {
  readonly id: string;
  readonly name: string;
  readonly start: RoadWorld["start"];
}

export interface SimState {
  physicsVersion: typeof PHYSICS_VERSION;
  readonly drivetrain: Drivetrain;
  tick: number;
  vehicle: VehicleState;
  /** Null where the world has no lane graph, or where traffic is switched off
   *  for a geometry check. Never null in ordinary district play. */
  traffic: TrafficState | null;
  rival: RivalState | null;
  encounter?: VehicleState | null;
  encounterDriver: RivalDriver | null;
  parkedRivals: { id: string; name: string; vehicle: VehicleState }[];
  /** Null in free roam. Progress through an open-checkpoint race: rules about
   *  where the car has been, decided per tick, so a replay reproduces the
   *  splits. The definition itself is static and lives on `Sim.race`. */
  race: RaceState | null;
}

export interface RivalState {
  readonly drivetrain: Drivetrain;
  vehicle: VehicleState;
  race: RaceState;
  driver: RivalDriver;
  input: Input;
}
interface VehicleRig {
  roadWorld: RoadWorld;
  body: RAPIER.RigidBody;
  state: { vehicle: VehicleState; drivetrain: Drivetrain; race: RaceState | null };
}

export interface Sim {
  readonly roadWorld: RoadWorld;
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
  readonly traffic?: boolean;
  /** Run an open-checkpoint race on this world from its start pose. */
  readonly race?: RaceDefinition;
  readonly rival?: RivalDefinition;
  readonly encounter?: RoadWorld["start"];
  readonly encounterRoute?: RivalDefinition;
  readonly parkedRivals?: readonly ParkedRival[];
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
} as const;

export type Drivetrain = keyof typeof HANDLING.frontDriveFraction;
export const DEFAULT_DRIVETRAIN: Drivetrain = "fwd";

export function isDrivetrain(value: unknown): value is Drivetrain {
  return typeof value === "string" && Object.hasOwn(HANDLING.frontDriveFraction, value);
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
export function steeringAngleFor(speed: number, steering = 1): number {
  const gripAngle = Math.atan(WHEELBASE * HANDLING.maxLateralAcceleration *
    HANDLING.steerOverdrive / Math.max(speed * speed, 1));
  const slipAllowance = HANDLING.highSpeedSteerAllowance * clamp(Math.abs(speed) / 15, 0, 1);
  return clamp(steering, -1, 1) * Math.min(HANDLING.maxSteeringAngle, gripAngle + slipAllowance);
}

/** Driver-operated steering, with extra response/range only for a requested catch.
 * No slip-derived angle is added: centred input always targets centred wheels. */
export function steeringControlFor(current: number, requested: number, forwardSpeed: number,
  lateralSpeed = 0, yawRate = 0, recoveryLookahead = 0): { steering: number; steeringAngle: number } {
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
    : unwinding ? HANDLING.steeringReturnResponse : HANDLING.steeringResponse;
  const steering = moveToward(current, target, response * DT);
  const normalLimit = steeringAngleFor(forwardSpeed);
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
export function wheelGripFor(loadFraction: number): number {
  return HANDLING.mass * HANDLING.maxLateralAcceleration * 0.25 *
    (Math.max(0, loadFraction) / 0.25) ** HANDLING.tyreLoadExponent;
}

/** Planning envelope, not a commanded yaw rate or a guarantee under braking. */
export function minimumTurnRadiusAtSpeed(speed: number): number {
  if (Math.abs(speed) < 0.01) return 0;
  return Math.max(WHEELBASE / Math.tan(HANDLING.maxSteeringAngle),
    speed * speed / HANDLING.maxLateralAcceleration);
}

export function maxCorneringSpeed(radius: number): number {
  return Math.sqrt(HANDLING.maxLateralAcceleration * Math.max(0, radius));
}

export function brakeDecelerationFor(brake: number): number {
  return HANDLING.brakeDeceleration * clamp(brake, 0, 1) ** HANDLING.brakeResponseExponent;
}

export function gradeAccelerationFor(pitch: number, courseAlignment = 1): number {
  return -HANDLING.gravityAlongGrade * Math.sin(pitch) * clamp(courseAlignment, -1, 1);
}

function engineAccelerationFor(speed: number): number {
  if (speed <= HANDLING.engineMidSpeed) {
    const blend = clamp(speed / HANDLING.engineMidSpeed, 0, 1);
    return HANDLING.engineAcceleration * (1 - blend) + HANDLING.engineMidAcceleration * blend;
  }
  const blend = clamp((speed - HANDLING.engineMidSpeed) /
    (HANDLING.topSpeed - HANDLING.engineMidSpeed), 0, 1);
  return HANDLING.engineMidAcceleration * (1 - blend) + HANDLING.highSpeedAcceleration * blend;
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

function initialWheels(): Record<WheelId, WheelState> {
  return Object.fromEntries(WHEEL_LAYOUT.map(wheel => [wheel.id, {
    ...emptyAxle(), steeringAngle: 0, loadFraction: 0.25,
    normalLoad: HANDLING.mass * HANDLING.gravityAlongGrade * 0.25,
    longitudinalSpeed: 0, lateralSpeed: 0, rollingDistance: 0,
  }])) as Record<WheelId, WheelState>;
}

/** What the car rides on here: the driven surface when the world has one,
 *  the road otherwise. Blackglass has no surface and is unchanged. */
function drivenSurface(roadWorld: RoadWorld, x: number, z: number) {
  return roadWorld.surface ? roadWorld.surface(x, z) : roadWorld.project(x, z);
}

function initialVehicle(roadWorld: RoadWorld): VehicleState {
  return {
    x: roadWorld.start.x, y: roadWorld.start.y, z: roadWorld.start.z,
    heading: roadWorld.start.heading, pitch: roadWorld.start.pitch,
    speed: 0, forwardSpeed: 0, lateralSpeed: 0, yawRate: 0,
    steering: 0, steeringAngle: 0, driveDirection: 1, slipAngle: 0,
    longitudinalAcceleration: 0, lateralAcceleration: 0,
    frontLoadFraction: STATIC_FRONT_LOAD, rightLoadFraction: 0.5, wheels: initialWheels(),
    frontAxle: emptyAxle(), rearAxle: emptyAxle(),
  };
}

function createVehicleBody(world: RAPIER.World, start: RoadWorld["start"]): RAPIER.RigidBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y + START_Y, start.z)
      .setRotation(yawRotation(start.heading))
      .setCanSleep(false).setCcdEnabled(true),
  );
  body.setEnabledTranslations(true, false, true, true);
  body.setEnabledRotations(false, true, false, true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.92, 0.38, 2.08)
    .setMass(HANDLING.mass).setFriction(0.15).setRestitution(0.04), body);

  return body;
}

export function createSim(drivetrain: Drivetrain = DEFAULT_DRIVETRAIN,
  roadWorld: RoadWorld = BLACKGLASS_WORLD, options: SimOptions = {}): Sim {
  if (!isDrivetrain(drivetrain)) throw new RangeError(`Unknown drivetrain: ${drivetrain}`);
  if (options.rival && !options.race) throw new Error("A rival requires a race");
  if ((options.encounter || options.encounterRoute || options.parkedRivals?.length) && options.race) throw new Error("A cruising encounter belongs in free roam");
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
  const body = createVehicleBody(world, roadWorld.start);

  // Traffic is kinematic: it drives its lane and is not pushed by an impact.
  // That makes it an immovable hazard rather than a second handling model, and
  // it keeps the player's contact response the only dynamics in the tick — the
  // handling gate (GDD §22) must not move because a van exists.
  const network = options.traffic === false ? null : roadWorld.traffic;
  const traffic = network ? createTraffic(network) : null;
  const trafficBodies = (traffic?.vehicles ?? []).map(vehicle => {
    const spec = TRAFFIC_KINDS[vehicle.kind];
    const trafficBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(vehicle.x, vehicle.y + spec.height * 0.5, vehicle.z)
      .setRotation(yawRotation(vehicle.heading)));
    world.createCollider(RAPIER.ColliderDesc
      .cuboid(spec.width * 0.5, spec.height * 0.5, spec.length * 0.5)
      .setFriction(0.35).setRestitution(0.1), trafficBody);
    return trafficBody;
  });

  const parkedRivalDefinitions = options.parkedRivals ?? [];
  const parkedRivalBodies = parkedRivalDefinitions.map(rival => createVehicleBody(world, rival.start));
  const parkedRivals = parkedRivalDefinitions.map(rival => ({ id: rival.id, name: rival.name,
    vehicle: initialVehicle({ ...roadWorld, start: rival.start }) }));
  const encounterRoute = options.encounterRoute ?? null;
  const encounterStart = encounterRoute?.start ?? options.encounter ?? null;
  const encounterBody = encounterStart ? createVehicleBody(world, encounterStart) : null;
  const encounter = encounterStart ? initialVehicle({ ...roadWorld, start: encounterStart }) : null;
  const rivalDefinition = options.rival ?? null;
  // Paired with its rival's line, a race learns which way each gate is left:
  // the marker's arrow. A race without a rival has no reference route to read.
  const raceDefinition = options.race ? rivalDefinition ? withExits(options.race, rivalDefinition) : options.race : null;
  const rivalBody = rivalDefinition ? createVehicleBody(world, rivalDefinition.start) : null;
  const rival: RivalState | null = rivalDefinition && raceDefinition ? {
    drivetrain: rivalDefinition.drivetrain ?? "fwd", vehicle: initialVehicle({ ...roadWorld, start: rivalDefinition.start }),
    race: createRace(raceDefinition), driver: createRivalDriver(),
    input: { throttle: 0, brake: 0, steer: 0, handbrake: 0 },
  } : null;
  const vehicle = initialVehicle(roadWorld);
  if (raceDefinition?.kind === "drag") {
    vehicle.transmission = createTransmission();
    if (rival) rival.vehicle.transmission = createTransmission();
  }
  return {
    roadWorld,
    state: { physicsVersion: PHYSICS_VERSION, drivetrain, tick: 0,
      vehicle, traffic, rival, encounter, parkedRivals, encounterDriver: encounterRoute ? createRivalDriver() : null,
      race: raceDefinition ? createRace(raceDefinition) : null },
    world, body, rivalBody, rivalDefinition, encounterBody, encounterStart, encounterRoute, parkedRivalDefinitions, parkedRivalBodies, trafficBodies, race: raceDefinition,
  };
}

export function resetSim(sim: Sim, drivetrain: Drivetrain = sim.state.drivetrain): void {
  // Rebuild contact warm-start caches too, so replay after a crash starts from
  // exactly the same world as a fresh run. Preserve the outer Sim object.
  const fresh = createSim(drivetrain, sim.roadWorld, { traffic: sim.state.traffic !== null, race: sim.race ?? undefined, rival: sim.rivalDefinition ?? undefined, encounter: sim.encounterStart ?? undefined, encounterRoute: sim.encounterRoute ?? undefined, parkedRivals: sim.parkedRivalDefinitions });
  sim.world.free();
  sim.world = fresh.world;
  sim.body = fresh.body;
  sim.rivalBody = fresh.rivalBody;
  sim.encounterBody = fresh.encounterBody;
  sim.parkedRivalDefinitions = fresh.parkedRivalDefinitions;
  sim.parkedRivalBodies = fresh.parkedRivalBodies;
  sim.encounterStart = fresh.encounterStart;
  sim.encounterRoute = fresh.encounterRoute;
  sim.rivalDefinition = fresh.rivalDefinition;
  sim.state = fresh.state;
  sim.trafficBodies = fresh.trafficBodies;
  sim.race = fresh.race;
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
  const gripLimit = wheelGripFor(tyre.loadFraction) * tyre.gripScale;
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
  const driveDemand = (tyre.front || sim.state.drivetrain !== "rwd") ? 0 : Math.abs(tyre.driveForce);
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
  const longitudinalBudget = Math.sqrt(Math.max(0, gripLimit * gripLimit - lateralForce * lateralForce)) * tyre.driveGripScale;
  Object.assign(telemetry, { slipAngle, lateralForce, gripLimit, longitudinalGripLimit,
    steeringAngle: tyre.steeringAngle, loadFraction: tyre.loadFraction,
    normalLoad: HANDLING.mass * HANDLING.gravityAlongGrade * tyre.loadFraction });
  return { point, forward: wheelForward, right: wheelRight, lateralForce,
    brakingForce, driveForce: tyre.driveForce, longitudinalBudget, telemetry };
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

function applyVehicleInput(sim: VehicleRig, rawInput: Input): void {
  const input: Input = {
    throttle: raceHolding(sim.state.race) ? 0 : clamp(rawInput.throttle, 0, 1),
    brake: raceHolding(sim.state.race) ? 0 : clamp(rawInput.brake, 0, 1),
    steer: clamp(rawInput.steer, -1, 1), handbrake: clamp(rawInput.handbrake, 0, 1),
  };
  const { body } = sim;
  const car = sim.state.vehicle;
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
  const velocity = body.linvel();
  const forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
  const speed = Math.hypot(velocity.x, velocity.z);
  const manualAcceleration = car.transmission ? sim.state.race?.finished ? 0
    : stepTransmission(car.transmission, rawInput, Math.max(0, forwardSpeed), sim.state.race?.countdown ?? 0,
      sim.state.race?.ticks ?? 0, HANDLING.mass, DT) : null;
  const effectiveThrottle = input.handbrake > 0.05 ? 0 : input.throttle * (1 - input.brake);
  // The player chooses the direction and amount. Slip only opens the manual
  // countersteering envelope; it never steers on the player's behalf.
  const lateralSpeed = velocity.x * Math.cos(heading) - velocity.z * Math.sin(heading);
  const bodySlip = Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), HANDLING.lowSpeedSlipReference));
  Object.assign(car, steeringControlFor(car.steering, input.steer, forwardSpeed, lateralSpeed, body.angvel().y,
    sim.state.drivetrain === "rwd" ? HANDLING.rwdCountersteerLookahead : 0));
  const countersteerRecovery = sim.state.drivetrain === "rwd" && forwardSpeed > HANDLING.countersteerMinSpeed &&
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
  const dragAcceleration = -Math.sign(forwardSpeed) * HANDLING.aerodynamicDrag * forwardSpeed ** 2;
  let driveAcceleration = reversing
    ? -HANDLING.reverseAcceleration * input.brake
    : manualAcceleration ?? engineAccelerationFor(Math.max(0, forwardSpeed)) * effectiveThrottle;
  // Govern propulsion instead of hard-clamping impact/downhill velocity.
  if (driveAcceleration > 0) {
    driveAcceleration = Math.min(driveAcceleration,
      Math.max(0, (HANDLING.topSpeed - forwardSpeed) / DT - dragAcceleration - gradeAcceleration));
  } else if (driveAcceleration < 0) {
    driveAcceleration = Math.max(driveAcceleration,
      Math.min(0, (-HANDLING.reverseSpeed - forwardSpeed) / DT - dragAcceleration - gradeAcceleration));
  }
  const serviceBrake = reversing ? 0 : brakeDecelerationFor(input.brake) * HANDLING.mass;
  const rollingBrake = effectiveThrottle === 0 ? HANDLING.rollingResistance * HANDLING.mass : 0;
  const driveForce = driveAcceleration * HANDLING.mass;
  const driveGripProgress = clamp((forwardSpeed - HANDLING.twoWheelDriveGripStartSpeed) /
    (HANDLING.twoWheelDriveGripFullSpeed - HANDLING.twoWheelDriveGripStartSpeed), 0, 1);
  const driveGripBlend = driveGripProgress * driveGripProgress * (3 - 2 * driveGripProgress);
  const driveGripScale = sim.state.drivetrain !== "awd" && driveForce > 0 && input.brake === 0
    ? 1 + (HANDLING.twoWheelDriveGripScale - 1) * driveGripBlend : 1;
  const angles = frontWheelAngles(car.steeringAngle);
  let forceX = 0;
  let forceZ = 0;
  const patches = WHEEL_LAYOUT.map(wheel => {
    const frontShare = wheel.front ? car.frontLoadFraction : 1 - car.frontLoadFraction;
    const sideShare = wheel.right > 0 ? car.rightLoadFraction : 1 - car.rightLoadFraction;
    const frontDriveShare = HANDLING.frontDriveFraction[sim.state.drivetrain];
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
        HANDLING.handbrakeDrag * HANDLING.mass * handbrake) * 0.5,
      stiffness: wheel.front ? HANDLING.frontCorneringStiffness :
        HANDLING.rearCorneringStiffness * (1 - handbrake * (1 - HANDLING.handbrakeRearStiffness)),
      gripScale: 1 - handbrake * (1 - HANDLING.handbrakeRearGrip),
    }, car.wheels[wheel.id]);
  });
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
  car.longitudinalAcceleration = (forceX * forwardX + forceZ * forwardZ) / HANDLING.mass;
  car.lateralAcceleration = (forceX * Math.cos(heading) - forceZ * Math.sin(heading)) / HANDLING.mass;
  body.addForce({ x: forwardX * (dragAcceleration + gradeAcceleration) * HANDLING.mass,
    y: 0, z: forwardZ * (dragAcceleration + gradeAcceleration) * HANDLING.mass }, true);
}

export function step(sim: Sim, rawInput: Input): void {
  const parkedRigs: VehicleRig[] = sim.state.parkedRivals.map((rival, i) => ({
    roadWorld: sim.roadWorld, body: sim.parkedRivalBodies[i]!,
    state: { vehicle: rival.vehicle, drivetrain: "rwd", race: null },
  }));
  for (const parked of parkedRigs) applyVehicleInput(parked, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
  const encounterRig: VehicleRig | null = sim.state.encounter && sim.encounterBody
    ? { roadWorld: sim.roadWorld, body: sim.encounterBody,
      state: { vehicle: sim.state.encounter, drivetrain: "fwd", race: null } } : null;
  if (encounterRig) {
    const driver = sim.state.encounterDriver;
    const input = sim.encounterRoute && driver ? rivalInput(sim.encounterRoute,
      { vehicle: encounterRig.state.vehicle, driver, race: null },
      [sim.state.vehicle, ...sim.state.parkedRivals.map(r => r.vehicle), ...(sim.state.traffic?.vehicles ?? []).map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }))])
      : { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    applyVehicleInput(encounterRig, input);
  }
  const rival = sim.state.rival;
  const rig: VehicleRig | null = rival && sim.rivalBody ? { roadWorld: sim.roadWorld, body: sim.rivalBody, state: rival } : null;
  if (rival && sim.rivalDefinition && !sim.race?.drag) {
    rival.input = rivalInput(sim.rivalDefinition, rival, [sim.state.vehicle,
      ...(sim.state.traffic?.vehicles ?? []).map(vehicle => ({ ...vehicle, length: TRAFFIC_KINDS[vehicle.kind].length }))]);
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
  applyVehicleInput(sim, rawInput);
  if (rig && rival) applyVehicleInput(rig, rival.input);
  // Traffic advances before the solver runs, so the player's contact this tick
  // is against where the traffic actually is rather than where it was.
  if (sim.state.traffic && sim.roadWorld.traffic) {
    stepTraffic(sim.roadWorld.traffic, sim.state.traffic, DT);
    sim.state.traffic.vehicles.forEach((vehicle, i) => {
      const trafficBody = sim.trafficBodies[i]!;
      const spec = TRAFFIC_KINDS[vehicle.kind];
      trafficBody.setNextKinematicTranslation({
        x: vehicle.x, y: vehicle.y + spec.height * 0.5, z: vehicle.z });
      trafficBody.setNextKinematicRotation(yawRotation(vehicle.heading));
    });
  }
  sim.world.step();
  finishVehicle(sim);
  if (rig) finishVehicle(rig);
  if (encounterRig) finishVehicle(encounterRig);
  for (const parked of parkedRigs) finishVehicle(parked);
  if (!sim.race?.drag) resetStalledRival(sim);
  if (sim.state.encounter && sim.state.encounterDriver && sim.encounterBody && sim.encounterRoute) {
    resetStalledDriver(sim, sim.encounterBody, sim.encounterRoute, sim.state.encounterDriver, null,
      (vehicle, driver) => { sim.state.encounter = vehicle; sim.state.encounterDriver = driver; });
  }
  sim.state.tick++;
  // After syncState: the race reads the vehicle where this tick left it.
  if (sim.race && sim.state.race) stepRace(sim.race, sim.state.race, sim.state.vehicle);
  if (sim.race && rival) stepRace(sim.race, rival.race, rival.vehicle);
}

/** Give normal recovery twelve seconds, then rejoin locally without gaining a gate. */
export const RIVAL_RESET_TICKS = 12 * TICK_HZ;
function resetStalledRival(sim: Sim): void {
  const rival = sim.state.rival, body = sim.rivalBody, route = sim.rivalDefinition;
  if (!rival || !body || !route || !sim.race || sim.race.kind === "drag" || rival.race.countdown > 0 || rival.race.finished) return;
  resetStalledDriver(sim, body, route, rival.driver, rival.race, (vehicle, driver) => {
    rival.vehicle = vehicle; rival.driver = driver;
    rival.input = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
  });
}

function resetStalledDriver(sim: Sim, body: RAPIER.RigidBody, route: RivalDefinition, driver: RivalDriver,
  race: RaceState | null, reset: (vehicle: VehicleState, driver: RivalDriver) => void): void {
  if (driver.noProgressTicks < RIVAL_RESET_TICKS || driver.resetCheckIn > 0) return;
  driver.resetCheckIn = TICK_HZ;
  const gate = race ? sim.race!.checkpoints[race.targetIndex]! : null;
  const minimum = race && race.targetIndex > 0 ? route.gates[race.targetIndex - 1]! : 0;
  const maximum = race && gate ? route.gates[race.targetIndex]! - gate.radius - 5 : route.along.at(-1)!;
  if (maximum < minimum) return;
  const center = Math.max(minimum, Math.min(maximum, driver.along));
  const shape = new RAPIER.Cuboid(1.4, .65, 2.7);
  for (const delta of [8, -8, 16, -16, 24, -24, 0]) {
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
      const vehicles = [sim.state.vehicle, ...sim.state.parkedRivals.map(r => r.vehicle), ...(sim.state.traffic?.vehicles ?? [])];
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
        heading, pitch: surface.pitch * (point.ux * surface.ux + point.uz * surface.uz) } }),
        { ...createRivalDriver(), along, progressMark: along, recoveries: driver.recoveries, resets: driver.resets + 1 });
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
    tyre.rollingDistance += tyre.longitudinalSpeed * DT;
  }
  Object.assign(car, {
    x: position.x, y: road.height, z: position.z, heading,
    pitch: car.pitch + (road.pitch * alignment - car.pitch) * Math.min(1, HANDLING.pitchResponse * DT),
    speed: Math.hypot(velocity.x, velocity.z), forwardSpeed, lateralSpeed,
    yawRate: sim.body.angvel().y, slipAngle: Math.atan2(lateralSpeed, Math.abs(forwardSpeed) + 0.5),
  });
}
