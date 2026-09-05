/* The deterministic handling simulation. Three.js never enters this file.
   Rapier owns collision resolution; NIGHTSHIFT owns the intentionally arcade
   forces that decide how the car accelerates, rotates, slides, and recovers. */

import RAPIER from "@dimforge/rapier3d-compat";
import { COURSE, COURSE_WALLS, projectOntoCourse } from "./track.ts";

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export interface Input {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: number;
}

export interface VehicleState {
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
  slipAngle: number;
}

export interface SimState {
  tick: number;
  vehicle: VehicleState;
}

export interface Sim {
  state: SimState;
  world: RAPIER.World;
  body: RAPIER.RigidBody;
}

// The first tuning surface. These are feel values, not claims about a real car.
export const HANDLING = {
  topSpeed: 53,
  reverseSpeed: 11,
  engineAcceleration: 18,
  highSpeedAcceleration: 5.5,
  reverseAcceleration: 8,
  brakeDeceleration: 29,
  rollingResistance: 1.3,
  aerodynamicDrag: 0.0028,
  steeringResponse: 5.5,
  maxSteerCurvature: 1 / 8.5,
  maxLateralAcceleration: 18,
  maxBodyYawRate: 2.1,
  handbrakeYawBonus: 0.95,
  handbrakeYawResponse: 10.5,
  yawResponse: 7.5,
  coastYawResponse: 4.2,
  lateralGrip: 8.8,
  driftGrip: 2.25,
  handbrakeDrag: 2.4,
  gravityAlongGrade: 9.81,
  pitchResponse: 7.5,
} as const;

/**
 * The normal steering envelope. Steering requests curvature, while available
 * tyre grip caps the resulting yaw rate as speed rises. This is deliberately
 * more generous than a road car, but it makes a 190 km/h corner materially
 * wider than a 70 km/h corner.
 */
export function normalYawRateFor(speed: number, steering = 1): number {
  const absoluteSpeed = Math.abs(speed);
  if (absoluteSpeed < 0.01 || Math.abs(steering) < 0.001) return 0;

  const requestedYawRate = absoluteSpeed * HANDLING.maxSteerCurvature * Math.abs(steering);
  const gripLimitedYawRate = HANDLING.maxLateralAcceleration / Math.max(absoluteSpeed, 1);
  return Math.min(requestedYawRate, gripLimitedYawRate, HANDLING.maxBodyYawRate);
}

export function minimumTurnRadiusAtSpeed(speed: number): number {
  const absoluteSpeed = Math.abs(speed);
  if (absoluteSpeed < 0.01) return 0;
  return absoluteSpeed / normalYawRateFor(absoluteSpeed);
}

export function maxCorneringSpeed(radius: number): number {
  if (radius <= 0) return 0;
  return Math.sqrt(HANDLING.maxLateralAcceleration * radius);
}

export function gradeAccelerationFor(pitch: number, courseAlignment = 1): number {
  return -HANDLING.gravityAlongGrade * Math.sin(pitch) * clamp(courseAlignment, -1, 1);
}

const START_Y = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function yawRotation(heading: number): RAPIER.Rotation {
  const half = heading * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function roadRotation(yaw: number, pitch: number): RAPIER.Rotation {
  const halfYaw = yaw * 0.5;
  const halfPitch = pitch * 0.5;
  const sinYaw = Math.sin(halfYaw);
  const cosYaw = Math.cos(halfYaw);
  const sinPitch = Math.sin(halfPitch);
  const cosPitch = Math.cos(halfPitch);
  return {
    x: sinYaw * sinPitch,
    y: sinYaw * cosPitch,
    z: cosYaw * sinPitch,
    w: cosYaw * cosPitch,
  };
}

function headingFromRotation(rotation: RAPIER.Rotation): number {
  return Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );
}

function initialVehicle(): VehicleState {
  return {
    x: COURSE.start.x,
    y: COURSE.start.y,
    z: COURSE.start.z,
    heading: COURSE.start.heading,
    pitch: COURSE.start.pitch,
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    steering: 0,
    slipAngle: 0,
  };
}

export function createSim(): Sim {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;

  for (const wall of COURSE_WALLS) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(wall.width * 0.5, 0.65, wall.depth * 0.5)
        .setTranslation(wall.x, wall.y + 0.65, wall.z)
        .setRotation(roadRotation(wall.rotation, wall.pitch))
        .setFriction(0.25)
        .setRestitution(0.08),
    );
  }

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(COURSE.start.x, COURSE.start.y + START_Y, COURSE.start.z)
      .setRotation(yawRotation(COURSE.start.heading))
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  body.setEnabledTranslations(true, false, true, true);
  body.setEnabledRotations(false, true, false, true);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.92, 0.38, 2.08)
      .setMass(1_180)
      .setFriction(0.15)
      .setRestitution(0.04),
    body,
  );

  const sim: Sim = { state: { tick: 0, vehicle: initialVehicle() }, world, body };
  return sim;
}

export function resetSim(sim: Sim): void {
  sim.body.setTranslation(
    { x: COURSE.start.x, y: COURSE.start.y + START_Y, z: COURSE.start.z },
    true,
  );
  sim.body.setRotation(yawRotation(COURSE.start.heading), true);
  sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  sim.state.tick = 0;
  sim.state.vehicle = initialVehicle();
}

export function step(sim: Sim, rawInput: Input): void {
  const input: Input = {
    throttle: clamp(rawInput.throttle, 0, 1),
    brake: clamp(rawInput.brake, 0, 1),
    steer: clamp(rawInput.steer, -1, 1),
    handbrake: clamp(rawInput.handbrake, 0, 1),
  };
  // The handbrake has control priority. Keeping the throttle held can prepare
  // the exit, but it must not keep driving the car while the rear is locked.
  const effectiveThrottle = input.handbrake > 0.05 ? 0 : input.throttle;

  const { body } = sim;
  const vehicle = sim.state.vehicle;
  const currentPosition = body.translation();
  const road = projectOntoCourse(currentPosition.x, currentPosition.z);
  body.setTranslation(
    { x: currentPosition.x, y: road.height + START_Y, z: currentPosition.z },
    true,
  );
  const heading = headingFromRotation(body.rotation());
  const velocity = body.linvel();
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);

  let forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
  let lateralSpeed = velocity.x * rightX + velocity.z * rightZ;

  if (effectiveThrottle > 0) {
    const speedRatio = clamp(Math.max(0, forwardSpeed) / HANDLING.topSpeed, 0, 1);
    const acceleration =
      HANDLING.engineAcceleration * (1 - speedRatio) + HANDLING.highSpeedAcceleration * speedRatio;
    forwardSpeed += acceleration * effectiveThrottle * DT;
  }

  if (input.brake > 0) {
    if (forwardSpeed > 0.7) {
      forwardSpeed = Math.max(0, forwardSpeed - HANDLING.brakeDeceleration * input.brake * DT);
    } else {
      forwardSpeed -= HANDLING.reverseAcceleration * input.brake * DT;
    }
  }

  if (effectiveThrottle === 0 && input.brake === 0 && input.handbrake === 0) {
    forwardSpeed = moveToward(forwardSpeed, 0, HANDLING.rollingResistance * DT);
  }
  forwardSpeed -=
    Math.sign(forwardSpeed) * HANDLING.aerodynamicDrag * forwardSpeed * forwardSpeed * DT;
  if (input.handbrake > 0) {
    forwardSpeed = moveToward(forwardSpeed, 0, HANDLING.handbrakeDrag * input.handbrake * DT);
  }
  const courseAlignment = forwardX * road.ux + forwardZ * road.uz;
  forwardSpeed += gradeAccelerationFor(road.pitch, courseAlignment) * DT;
  forwardSpeed = clamp(forwardSpeed, -HANDLING.reverseSpeed, HANDLING.topSpeed);

  vehicle.steering = moveToward(
    vehicle.steering,
    input.steer,
    HANDLING.steeringResponse * DT,
  );

  const absoluteSpeed = Math.abs(forwardSpeed);
  const steeringAuthority = clamp(absoluteSpeed / 4.5, 0, 1);
  const reverseDirection = forwardSpeed < -0.25 ? -1 : 1;
  const steeringSign = Math.sign(vehicle.steering);
  const normalYawRate = normalYawRateFor(absoluteSpeed, vehicle.steering);
  // Handbrake rotation is body yaw, not extra cornering grip: the velocity
  // keeps travelling while the rear steps out. That distinction is what makes
  // the move a slide instead of a supernatural high-speed turn.
  const handbrakeYawRate =
    Math.abs(vehicle.steering) *
    steeringAuthority *
    input.handbrake *
    HANDLING.handbrakeYawBonus;
  const targetYawRate = clamp(
    -steeringSign * (normalYawRate + handbrakeYawRate) * reverseDirection,
    -HANDLING.maxBodyYawRate,
    HANDLING.maxBodyYawRate,
  );
  const yawResponse = input.handbrake > 0.05
    ? HANDLING.handbrakeYawResponse
    : effectiveThrottle > 0 || input.brake > 0
      ? HANDLING.yawResponse
      : HANDLING.coastYawResponse;
  // Rapier may produce a large spin impulse on a barrier corner. Preserve the
  // hit, but cap it before the assist takes over so contact costs time instead
  // of turning the car into a pinwheel.
  const impactYawRate = clamp(
    body.angvel().y,
    -HANDLING.maxBodyYawRate * 1.25,
    HANDLING.maxBodyYawRate * 1.25,
  );
  const yawRate = moveToward(impactYawRate, targetYawRate, yawResponse * DT);

  const deliberateDrift = clamp(
    input.handbrake + Math.abs(vehicle.steering) * effectiveThrottle * clamp((absoluteSpeed - 12) / 18, 0, 1),
    0,
    1,
  );
  const grip = HANDLING.lateralGrip * (1 - deliberateDrift) + HANDLING.driftGrip * deliberateDrift;
  lateralSpeed = clamp(
    lateralSpeed * Math.max(0, 1 - grip * DT),
    -HANDLING.topSpeed * 0.55,
    HANDLING.topSpeed * 0.55,
  );

  body.setLinvel(
    {
      x: forwardX * forwardSpeed + rightX * lateralSpeed,
      y: 0,
      z: forwardZ * forwardSpeed + rightZ * lateralSpeed,
    },
    true,
  );
  body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);

  sim.world.step();
  const resolvedPosition = body.translation();
  const resolvedRoad = projectOntoCourse(resolvedPosition.x, resolvedPosition.z);
  body.setTranslation(
    { x: resolvedPosition.x, y: resolvedRoad.height + START_Y, z: resolvedPosition.z },
    true,
  );
  const resolvedYawRate = clamp(
    body.angvel().y,
    -HANDLING.maxBodyYawRate * 1.25,
    HANDLING.maxBodyYawRate * 1.25,
  );
  if (resolvedYawRate !== body.angvel().y) {
    body.setAngvel({ x: 0, y: resolvedYawRate, z: 0 }, true);
  }
  sim.state.tick++;
  syncState(sim);
}

function syncState(sim: Sim): void {
  const translation = sim.body.translation();
  const heading = headingFromRotation(sim.body.rotation());
  const velocity = sim.body.linvel();
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
  const lateralSpeed = velocity.x * rightX + velocity.z * rightZ;
  const road = projectOntoCourse(translation.x, translation.z);
  const courseAlignment = forwardX * road.ux + forwardZ * road.uz;
  const targetPitch = road.pitch * courseAlignment;
  const pitchBlend = Math.min(1, HANDLING.pitchResponse * DT);

  Object.assign(sim.state.vehicle, {
    x: translation.x,
    y: road.height,
    z: translation.z,
    heading,
    pitch: sim.state.vehicle.pitch + (targetPitch - sim.state.vehicle.pitch) * pitchBlend,
    speed: Math.hypot(velocity.x, velocity.z),
    forwardSpeed,
    lateralSpeed,
    yawRate: sim.body.angvel().y,
    slipAngle: Math.atan2(lateralSpeed, Math.abs(forwardSpeed) + 0.5),
  });
}
