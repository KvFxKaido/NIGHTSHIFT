import type { Drivetrain } from "./sim.ts";

/**
 * What makes each car itself (GDD 8.5): a few adjustments to the one shared
 * model in `HANDLING` (sim.ts), which stays the only place the model's own
 * numbers live. Everything that keeps the model well-behaved -- countersteer
 * rates, slip regularisation, tyre relaxation, the RWD stability tapers -- is
 * shared by every car and is not a knob here: a car may be harder to catch,
 * never uncatchable with full countersteer.
 *
 * Two kinds of knob (design/HANDLING.md, "Cars"). Strength -- `power`,
 * `topEnd`, `topSpeed` -- may climb gently up the Blacklist; temperament --
 * `balance`, `steering`, `handbrake` -- varies freely. Each is a multiplier on
 * the shared value, absent meaning 1. `mass` is kilograms, and changes only what
 * happens in contact: every force the car makes scales with it, so on its own it
 * drives exactly as it would at any other weight.
 *
 * The profile belongs to the car, never to its driver: a rival names a car and
 * gets that car's numbers, which are the numbers the player gets on winning it.
 *
 * Its own module, not sim.ts, so the UI can read a car's drivetrain without
 * importing Rapier. sim.ts resolves these against `HANDLING` (`carHandling`).
 */
export interface CarTune {
  readonly drivetrain: Drivetrain;
  /** Bump on any change to this car's numbers: lap recordings carry it, and
   *  replay refuses another. A rival's car changing is also a `RIVAL_REVISION` bump. */
  readonly revision: number;
  /** Kilograms. Absent is `HANDLING.mass`. Contact only (above). */
  readonly mass?: number;
  /** Drive below about 67 mph: the launch and the pull out of a corner. */
  readonly power?: number;
  /** Drive as the car nears its governor. */
  readonly topEnd?: number;
  /** The governor. */
  readonly topSpeed?: number;
  /** Lateral grip, and therefore how fast a corner can be taken. */
  readonly grip?: number;
  /** Rear against front cornering stiffness: above 1 the car settles, below it rotates. */
  readonly balance?: number;
  /** Service brake deceleration. */
  readonly brakes?: number;
  /** How quickly the wheels follow the stick into a turn. Unwinding and catches are shared. */
  readonly steering?: number;
  /** How much the handbrake loosens the rear. */
  readonly handbrake?: number;
}

const NS01: CarTune = { drivetrain: "rwd", revision: 1 };

export const CAR_TUNES: Readonly<Record<string, CarTune>> = {
  // The anchor. Every recorded lap was driven in it, and RIVAL_CORNERING and the
  // route-choice PACE were fitted to those laps: tune other cars against it, never it.
  cinder: { drivetrain: "rwd", revision: 1 },
  bulwark: { drivetrain: "awd", revision: 1 },
  // Sable's NS-01 under both of its ids: "blender" is the asset Sable drives, and
  // "ns01" the same car once won back. One tune, so they cannot drift apart.
  blender: NS01,
  ns01: NS01,
  kestrel: { drivetrain: "awd", revision: 1 },  // Moth runs a rally hatch
  vesper: { drivetrain: "rwd", revision: 1 },  // Tally: cab-forward coupe; visual mid-engine layout
  latch: { drivetrain: "fwd", revision: 1 },  // Stray: sport liftback
  breakwater: { drivetrain: "awd", revision: 1 },  // Bollard: enclosed off-roader
  wager: { drivetrain: "rwd", revision: 1 },  // Deuce: rotary-inspired sports car
  meridian: { drivetrain: "awd", revision: 1 },  // Plumb: fast wagon
  skim: { drivetrain: "fwd", revision: 1 },  // Crest: hardtop roadster
  reign: { drivetrain: "awd", revision: 1 },  // Wake: upright legend coupe
  hammer: { drivetrain: "rwd", revision: 1 },  // Rivet drag races
};

/** Falls back to the sim default, which cars.test.ts pins to this same value. */
export function drivetrainFor(car: string): Drivetrain {
  return CAR_TUNES[car]?.drivetrain ?? "fwd";
}
