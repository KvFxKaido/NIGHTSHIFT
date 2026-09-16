import type { Input } from "./sim.ts";

/**
 * The launch (2026-09-16, Shawn: MC3's start boost). Hold the handbrake and the
 * throttle through the countdown to charge it, let the handbrake go as the flag
 * drops, and the first seconds carry extra drive. Let it go late, or with a
 * half-charge, and the launch costs you instead: the same scale and length of
 * penalty the drag strip already gives a bogged start (`transmission.ts`), whose
 * words this borrows so the two launches read alike.
 *
 * The handbrake is the switch on purpose. Throttle is ignored during a countdown
 * (`raceHolding`), so a player who only holds the gas, as every lap recorded
 * before today does, charges nothing and launches exactly as they always have:
 * no physics revision, and `pnpm laps --verify` still replays those sessions.
 *
 * Drag races keep their own launch through the gearbox and never use this one.
 */
export const LAUNCH = {
  /** Ticks of holding both to charge fully, and how fast a release bleeds it away. */
  chargeTicks: 66,
  dischargeScale: 2,
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
} as const;

/** An authored rival with no rank behind it: a decent start, neither late nor perfect. */
export const RIVAL_LAUNCH_SKILL = .6;
/**
 * How each Blacklist name launches. It climbs the list: Moth leaves half a second
 * of her lead on the line, Tally never does. The ladder itself is
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
}

export const createLaunch = (): LaunchState =>
  ({ heldTicks: 0, charge: 0, resolved: false, quality: 0, boostTicks: 0, penaltyTicks: 0, feedback: "", feedbackTicks: 0 });

/** What the launch does to drive this tick: over 1 while boosting, under it while paying for a bad one. */
export function launchDrive(state: LaunchState): number {
  if (state.penaltyTicks > 0) return LAUNCH.penaltyScale;
  if (state.boostTicks > 0) return 1 + LAUNCH.boost * state.quality * (state.boostTicks / LAUNCH.boostTicks);
  return 1;
}

/**
 * One fixed tick of the launch, before the flag and through the boost. `countdown`
 * and `raceTicks` are the race's own; a vehicle in no race holds still at rest.
 */
export function stepLaunch(state: LaunchState, input: Input, countdown: number, raceTicks: number): number {
  const holding = input.handbrake > .05 && input.throttle > .1;
  const say = (feedback: string, ticks = 105) => { state.feedback = feedback; state.feedbackTicks = ticks; };
  if (countdown > 0) {
    // Charging. Releasing early bleeds it away, so anticipating the flag is fine and idling on the brake is not.
    state.heldTicks = holding
      ? Math.min(LAUNCH.chargeTicks, state.heldTicks + 1)
      : Math.max(0, state.heldTicks - LAUNCH.dischargeScale);
    state.charge = state.heldTicks / LAUNCH.chargeTicks;
    Object.assign(state, { resolved: false, quality: 0, boostTicks: 0, penaltyTicks: 0 });
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
  const drive = launchDrive(state);
  state.boostTicks = Math.max(0, state.boostTicks - 1);
  state.penaltyTicks = Math.max(0, state.penaltyTicks - 1);
  state.feedbackTicks = Math.max(0, state.feedbackTicks - 1);
  return drive;
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
