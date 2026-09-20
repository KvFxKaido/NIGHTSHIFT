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
 * `topEnd`, `topSpeed`, `drag`, `traction` -- may climb gently up the Blacklist; temperament --
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
  /** The governor. It limits the engine's push, never the car's speed: downhill it
   *  runs past. It is also where the engine curve reaches its top end, so raising it
   *  alone stretches the curve: stock power runs out at about 152 mph, and a higher
   *  governor without `topEnd` makes the car slower there (design/HANDLING.md, "The ceiling"). */
  readonly topSpeed?: number;
  /** Air resistance. Below 1 the car slips through the air: a higher ceiling, a
   *  stronger top end and a longer coast. On the flat the tyres can push against
   *  drag only so hard, so past about 161 mph (146 FWD) no power helps and only
   *  this does (design/HANDLING.md, "The ceiling"). */
  readonly drag?: number;
  /** How hard the driven tyres can push, and nothing else: it widens the powered
   *  longitudinal grip (`driveGripScale`, as the 2WD assist and the launch do) and
   *  leaves cornering alone. A 2WD car is traction-bound to about 100 mph, so
   *  `power` barely shows there and `grip` would move the corners too; this is
   *  how a car is quick in a line without being quick in a bend. */
  readonly traction?: number;
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

// Sable's NS-01 (2026-09-19): the drift coupe. A loose tail and a handbrake that
// loosens it further, on tyres that let go early; it swings further than any other
// car and is caught from all of it (tests/helpers/handling.ts, CAR_PEAKS).
const NS01: CarTune = { drivetrain: "rwd", revision: 2, mass: 1_250, topSpeed: 1.0143, topEnd: 1.05,
  traction: 1.03, balance: 0.85, handbrake: 1.25, steering: 1.1 };

export const CAR_TUNES: Readonly<Record<string, CarTune>> = {
  // The anchor. Every recorded lap was driven in it, and RIVAL_CORNERING and the
  // route-choice PACE were fitted to those laps: tune other cars against it, never it.
  cinder: { drivetrain: "rwd", revision: 1 },
  // Heavy and planted (2026-09-19): the best launch and the only grass-proof car you
  // can buy, paid for in top end, braking, cornering and a lazy rack. Before this it
  // was the Cinder with a better launch, and lapped 4-8% faster (design/HANDLING.md).
  bulwark: { drivetrain: "awd", revision: 2, mass: 1_700, power: 0.7, topEnd: 0.75, topSpeed: 0.9,
    grip: 0.95, balance: 1.1, brakes: 0.75, steering: 0.7 },
  // Sable's NS-01 under both of its ids: "blender" is the asset Sable drives, and
  // "ns01" the same car once won back. One tune, so they cannot drift apart.
  blender: NS01,
  ns01: NS01,
  // Moth's rally hatch (2026-09-19): geared short, light, a quick rack. The opener's
  // car, so about even with the Cinder: before this it lapped 4-8% faster on the
  // shared AWD numbers. Launches as hard as the Bulwark, runs out at 130.
  kestrel: { drivetrain: "awd", revision: 2, mass: 1_150, power: 0.7, topSpeed: 0.93, steering: 1.1 },
  vesper: { drivetrain: "rwd", revision: 1 },  // Tally: cab-forward coupe; visual mid-engine layout
  // Stray's sport liftback, the kid's first tuner (2026-09-19): sticky tyres and a
  // chassis that turns on a lift, just under the Cinder at 138. On the shared FWD
  // numbers it lapped about 1.9% slower than the Cinder; now about even.
  latch: { drivetrain: "fwd", revision: 2, mass: 1_160, topSpeed: 0.986, grip: 1.05, balance: 0.9, steering: 1.1, handbrake: 0.8 },
  // Bollard's enclosed off-roader (2026-09-19): the heaviest car and the slowest,
  // stopped by its own air rather than a governor, and it wins every shove. All the
  // pace it has is the launch: past 60 mph the drag takes it back.
  breakwater: { drivetrain: "awd", revision: 2, mass: 1_900, power: 0.85, drag: 1.4,
    grip: 0.95, brakes: 0.8, steering: 0.85 },
  // Deuce's rotary (2026-09-19): it needs revs. Skinnier tyres off the line
  // (traction 0.96) and the strongest top end on the list to 148, on the best
  // tyres anyone has in a bend. A looser tail, so a gentler handbrake with it.
  wager: { drivetrain: "rwd", revision: 2, mass: 1_250, power: 0.92, topEnd: 1.25, topSpeed: 1.0571,
    traction: 0.96, grip: 1.07, balance: 0.95, steering: 1.1, handbrake: 0.95 },
  // Plumb's fast wagon (2026-09-19): long, heavy and quick everywhere, with the
  // traction that pays most on her own ground, the generated street circuits.
  meridian: { drivetrain: "awd", revision: 2, mass: 1_550, power: 0.75, topEnd: 1.1,
    topSpeed: 1.0429, brakes: 0.95, steering: 0.95 },
  // Crest's hardtop roadster (2026-09-19): the lightest car on the best tyres,
  // and the traction to use them out of a junction, which is what front drive
  // otherwise gives away on her streets. A looser tail, so a gentler handbrake.
  skim: { drivetrain: "fwd", revision: 2, mass: 1_050, topSpeed: 0.986, grip: 1.1,
    traction: 1.2, balance: 0.95, steering: 1.15, handbrake: 0.85 },
  // Wake's legend coupe (2026-09-19): good at everything, which is what second
  // place should feel like -- the grip, the brakes and 152 mph, with the power cut
  // that keeps a #2 below #1. Its grip scrubs speed in a long slide, so a gentler
  // handbrake keeps it above the gate's floor.
  reign: { drivetrain: "awd", revision: 2, mass: 1_430, power: 0.8, topEnd: 1.15, topSpeed: 1.0857,
    grip: 1.05, brakes: 1.05, steering: 1.05, handbrake: 0.9 },
  // Rivet's muscle notchback (2026-09-19): heavy, fat rear tyres, a strong top end to
  // 150 mph, poor in a bend. Her race is the drag strip, so her traction is capped
  // where a clean run in the Cinder still wins the quarter by a hair.
  hammer: { drivetrain: "rwd", revision: 2, mass: 1_500, power: 1.05, topEnd: 1.2, topSpeed: 1.0714,
    traction: 1.06, grip: 0.95, brakes: 0.85, steering: 0.9 },
};

/** Falls back to the sim default, which cars.test.ts pins to this same value. */
export function drivetrainFor(car: string): Drivetrain {
  return CAR_TUNES[car]?.drivetrain ?? "fwd";
}
