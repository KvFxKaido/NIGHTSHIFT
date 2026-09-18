import type { Input } from "./sim.ts";

/**
 * The launch (2026-09-16, Shawn: MC3's start boost). Hold the handbrake and the
 * throttle through the countdown to charge it, let the handbrake go as the flag
 * drops, and the first seconds carry extra traction. Let it go late, or with a
 * half-charge, and the launch costs you instead: the same scale and length of
 * penalty the drag strip already gives a bogged start (`transmission.ts`), whose
 * words this borrows so the two launches read alike.
 *
 * The burnout (2026-09-18, Shawn: MC3 again) is the same hold anywhere else. Stopped
 * outside a countdown, e-brake and gas hold the front wheels and spin the rears,
 * the stick swings the tail round them (sim.ts, `applyBurnout`), and letting the
 * handbrake go on the gas launches with the boost the hold has charged. At a race
 * start the car is held until the flag, as MC3 holds it: letting go early is a
 * plain start, never a jump and never a penalty.
 *
 * The handbrake is the switch on purpose. Throttle is ignored during a countdown
 * (`raceHolding`) and cut by the handbrake everywhere else, so a player who only
 * holds the gas, as every lap recorded before today does, charges nothing and
 * launches exactly as they always have: no physics revision, and
 * `pnpm laps --verify` still replays those sessions.
 *
 * Drag races keep their own launch through the gearbox and never use this one.
 */
export const LAUNCH = {
  /** Ticks of holding both to charge fully: at the line or in a burnout. */
  chargeTicks: 66,
  /** Release this close to the flag for the whole boost; past `windowTicks` there is none. */
  perfectTicks: 9,
  windowTicks: 30,
  /** Still on the handbrake this long after the flag and the tyres light up. */
  spinTicks: 45,
  /** An attempt with less charge than this bogs. */
  bogCharge: .5,
  /** Extra traction at a perfect launch, fading linearly over `boostTicks`. Tuned
   *  2026-09-16 to about two car lengths by five seconds: +5.3 m at 3 s, +8.9 m at 5 s. */
  boost: .35,
  boostTicks: 96,
  /** A bogged or spun launch. Lighter than the strip's 0.65 because holding the
   *  handbrake past the flag already costs 23 m by five seconds on its own; this
   *  adds about 5 m to a spin and costs a bog a car length against a plain start. */
  penaltyScale: .85,
  penaltyTicks: 75,
  /** Below this speed, e-brake and gas outside a countdown is a burnout rather
   *  than a handbrake turn; once started it lasts as long as both are held. */
  burnoutSpeed: 1.5,
  /** How fast full stick swings the tail round the front wheels (100 degrees a
   *  second; a guess at MC3's, to be tuned on the pad), and how quickly it gets there. */
  burnoutYawRate: 1.75,
  burnoutYawTime: .12,
  /** How quickly the front wheels cancel anything moving them, and the most they
   *  hold against, in g: a car in a burnout can still be shoved. */
  burnoutHoldTime: .05,
  burnoutHoldGrip: 1.2,
} as const;

/** An authored rival with no rank behind it: a decent start, neither late nor perfect. */
export const RIVAL_LAUNCH_SKILL = .6;
/**
 * How each Blacklist name launches: the share of a full charge it holds. It climbs
 * the list: Moth leaves on half the boost, Tally on all of it. The ladder itself is
 * `settings/blacklist.ts`, above the sim; a test holds these to its order.
 */
export const BLACKLIST_LAUNCH: Readonly<Record<string, number>> = {
  moth: .5, stray: .55, rivet: .6, bollard: .65, deuce: .7, sable: .75, plumb: .8, crest: .85, wake: .9, tally: 1,
};

export interface LaunchState {
  /** Ticks of holding both, counted not accumulated so a half charge is exactly a half. */
  heldTicks: number;
  /** 0-1: what the launch is worth, `heldTicks` over `chargeTicks`. */
  charge: number;
  /** Set once the flag has dropped and the launch has been resolved, good or bad. */
  resolved: boolean;
  /** The share of the boost granted: timing times charge. */
  quality: number;
  boostTicks: number;
  penaltyTicks: number;
  feedback: string;
  feedbackTicks: number;
  /** In a burnout: held off the line, front wheels planted, swinging on the stick. */
  burnout: boolean;
}

/** A race's launch is unresolved until its flag; the player's everywhere else has no flag to wait for. */
export const createLaunch = (resolved = false): LaunchState =>
  ({ heldTicks: 0, charge: 0, resolved, quality: 0, boostTicks: 0, penaltyTicks: 0, feedback: "", feedbackTicks: 0, burnout: false });

/** What the launch does to drive this tick: over 1 while boosting, under it while paying for a bad one. */
export function launchDrive(state: LaunchState): number {
  if (state.penaltyTicks > 0) return LAUNCH.penaltyScale;
  if (state.boostTicks > 0) return 1 + LAUNCH.boost * state.quality * (state.boostTicks / LAUNCH.boostTicks);
  return 1;
}

/**
 * One fixed tick of the launch, before the flag and through the boost. `countdown`
 * and `raceTicks` are the race's own, both 0 outside a race. `burnout` carries the
 * car's speed for a vehicle that may burn out, which is the player's alone: an AI
 * car holding both at rest keeps doing exactly what it did before burnouts existed.
 */
export function stepLaunch(state: LaunchState, input: Input, countdown: number, raceTicks: number,
  burnout: { speed: number } | null = null): number {
  const holding = input.handbrake > .05 && input.throttle > .1;
  const say = (feedback: string, ticks = 105) => { state.feedback = feedback; state.feedbackTicks = ticks; };
  if (countdown > 0) {
    // Charging, held at the line. Letting go before the flag is a plain start, as
    // MC3 blocks a false start: the car cannot go early and the charge is gone.
    if (holding) state.heldTicks = Math.min(LAUNCH.chargeTicks, state.heldTicks + 1);
    else {
      if (state.heldTicks > 0) say("TOO EARLY", 60);
      state.heldTicks = 0;
    }
    state.charge = state.heldTicks / LAUNCH.chargeTicks;
    Object.assign(state, { resolved: false, quality: 0, boostTicks: 0, penaltyTicks: 0, burnout: false });
    if (state.charge > 0) say(`LAUNCH ${Math.round(state.charge * 100)}%`, 2);
    return 1;
  }
  if (!state.resolved) {
    // The flag is down. The launch resolves when the handbrake comes up, or when holding it has spun the tyres.
    const stillHolding = input.handbrake > .05 && raceTicks < LAUNCH.spinTicks;
    if (state.charge > 0 && stillHolding) return launchDrive(state);
    state.resolved = true;
    if (state.charge > 0) {
      const late = Math.max(0, raceTicks);
      const timing = late <= LAUNCH.perfectTicks ? 1
        : Math.max(0, 1 - (late - LAUNCH.perfectTicks) / (LAUNCH.windowTicks - LAUNCH.perfectTicks));
      if (late >= LAUNCH.spinTicks) { state.penaltyTicks = LAUNCH.penaltyTicks; say("WHEELSPIN"); }
      else if (state.charge < LAUNCH.bogCharge) { state.penaltyTicks = LAUNCH.penaltyTicks; say("BOGGED LAUNCH"); }
      else if (timing === 0) say("MISSED LAUNCH");
      else {
        state.quality = timing * state.charge;
        state.boostTicks = LAUNCH.boostTicks;
        say(timing === 1 && state.charge === 1 ? "PERFECT LAUNCH" : "LAUNCH");
      }
      state.charge = 0;
      state.heldTicks = 0;
    }
  }
  if (burnout && state.resolved) stepBurnout(state, input, holding, burnout.speed, say);
  const drive = launchDrive(state);
  state.boostTicks = Math.max(0, state.boostTicks - 1);
  state.penaltyTicks = Math.max(0, state.penaltyTicks - 1);
  state.feedbackTicks = Math.max(0, state.feedbackTicks - 1);
  return drive;
}

/**
 * The burnout: the launch's hold with no flag to wait for. It starts only from
 * rest and never over a boost or a penalty still running, so holding through a
 * spun race start cannot turn the spin into a launch. Letting the handbrake go
 * on the gas launches with what the hold charged, timed perfectly because there
 * is no flag to be late for; letting the gas go first is only stopping.
 */
function stepBurnout(state: LaunchState, input: Input, holding: boolean, speed: number,
  say: (feedback: string) => void): void {
  if (!state.burnout) {
    if (!holding || speed >= LAUNCH.burnoutSpeed || state.boostTicks > 0 || state.penaltyTicks > 0) return;
    state.burnout = true;
    state.heldTicks = 0;
  }
  if (holding) {
    state.heldTicks = Math.min(LAUNCH.chargeTicks, state.heldTicks + 1);
    state.charge = state.heldTicks / LAUNCH.chargeTicks;
    return;
  }
  state.burnout = false;
  if (input.throttle > .1 && state.charge > 0) {
    state.quality = state.charge;
    state.boostTicks = LAUNCH.boostTicks;
    say(state.charge === 1 ? "PERFECT LAUNCH" : "LAUNCH");
  }
  state.heldTicks = 0;
  state.charge = 0;
}

/**
 * How a rival launches, from its `launch` skill (0-1, by Blacklist rank): it holds
 * the line for this many ticks of countdown and lets go exactly at the flag, so the
 * same code grants it the same boost. Rank is how well it hooks up, not how late it
 * reacts: Tally leaves on the whole boost, Moth on half of it, and none of them sits
 * on the line after the flag — a rival parked at the lights is bad racing, and its
 * first seconds moved enough to walk a raced recording into a crash it used to miss.
 */
export const rivalLaunchCharge = (skill: number): number =>
  Math.round(LAUNCH.chargeTicks * Math.max(0, Math.min(1, skill)));
