/**
 * Which rival a recording was raced against (2026-09-21). A recording with a rival replays only against the same
 * rival, and until now "the same" was one hand-bumped string for every race, `RIVAL_REVISION`: 32 values in eight
 * days, eleven of them one name's car, four of them one race's line, and every one of them refused every raced
 * recording in the library, Ridge Circuit's for a change to a street line in traffic included.
 *
 * It is composed instead from what THIS race's rival is made of, so a change refuses the recordings it moves and
 * leaves the rest replaying:
 *
 * - what it is told to be is read off the route: its car and that car's tune revision, its launch, its share of the
 *   grip, and a fingerprint of the line it drives, the drawn numbers themselves. Redrawing a line, retuning a rival's
 *   car or moving one name's share needs no bump and cannot be forgotten: the identity moves where the thing moved.
 * - how it drives is code, which cannot describe itself, so each layer keeps a token that is bumped by hand, with a
 *   fingerprint of that layer's tables beside it so that a number changed without the bump is still caught. The
 *   driver is every raced recording's; the street line's reader and the pass planner are only a route's that has them.
 *
 * The record of what each `full-line-vN` was is kept where it was, above `RIVAL_TABLES` in rival.ts.
 */
import { layoutFingerprint } from "./building-layout.ts";
import { RIVAL_LAUNCH_SKILL } from "./launch.ts";
import { RIVAL_TABLES, RIVAL_STREET_LINE, type RivalDefinition } from "./rival.ts";
import { handlingFor, RIVAL_RESET_TICKS, UNSEEN_RECOVERY, UNSEEN_ROAD } from "./sim.ts";
import { STREET_LINE } from "./street-line.ts";
import { TRAFFIC_PASS } from "./traffic-pass.ts";

/** Bump a layer when its CODE changes how a rival drives. Its tables and a route's own numbers name themselves. */
export const RIVAL_REVISIONS = {
  /** `rivalInput`, the launch and recovery: steering, the speed plan, reading traffic, racing the player. */
  driver: "driver-v9",
  /** Taking a street line a corner at a time on traffic's forecast (`readStreetLine`, and the blend in `rivalInput`). */
  streetLine: "street-line-v3",
  /** Committed traffic passes (traffic-pass.ts, and the pass branches of `rivalInput`). */
  pass: "pass-v5",
} as const;

/**
 * A drawn line is named to the millimetre, not to the bit. A session is recorded in a browser and replayed in Node, and
 * the two are not the same arithmetic: Chrome 152 and Node 24 differ in the last bit of `Math.atan2(0.3, 1.7)` and of
 * `Math.tanh(0.7)`, so a line drawn in each differs somewhere in its sixteenth digit, and hashed exactly Ridge Circuit's
 * was one rival in the game and another in `pnpm laps --verify`. Replay compares positions at a centimetre
 * (lap-recorder.ts), so a millimetre is ten times finer than anything it can see and some nine orders coarser than
 * that noise. (The tyres use `tanh` too: a browser's lap and Node's replay of it agree to the recorder's rounding, not
 * to the bit, which is the cross-runtime caveat in CLAUDE.md's law 2 and not something this file can mend.)
 */
const toTheMillimetre = (values: readonly number[]) => values.map(value => Math.round(value * 1000));

/** What a solo session records: nobody was raced, and replay asks nothing of it. */
export const NO_RIVAL = "none";

/** The parts of a rival's identity, in the order they are written. */
export function rivalRevisionParts(route: RivalDefinition): string[] {
  const handling = handlingFor(route), parts: string[] = [];
  parts.push(`${RIVAL_REVISIONS.driver}.${layoutFingerprint({ ...RIVAL_TABLES, RIVAL_RESET_TICKS, UNSEEN_RECOVERY, UNSEEN_ROAD, RIVAL_LAUNCH_SKILL })}`);
  parts.push(`${route.car ?? `shared-${handling.drivetrain}`}-r${handling.revision}`);
  if (route.launch !== undefined) parts.push(`launch-${route.launch}`);
  if (route.cornering !== undefined) parts.push(`cornering-${route.cornering}`);
  if (route.speedLimit !== undefined) parts.push(`limit-${route.speedLimit}`);
  if (route.shoulder !== undefined) parts.push(`shoulder-${route.shoulder}`);
  // A route that IS a line: Ridge Circuit's, Uptown / Clear's. The centreline under any route is the world's and the
  // race's, which a recording names already; what is the rival's own is where it was drawn across the road.
  if (route.lateral) parts.push(`line-${layoutFingerprint([toTheMillimetre(route.lateral), toTheMillimetre(route.points.flatMap(p => [p.x, p.z])), toTheMillimetre(route.gates), route.clearance ?? null])}`);
  if (route.line) {
    const { dx, dz, corners, cornering, clearance } = route.line;
    parts.push(`${RIVAL_REVISIONS.streetLine}.${layoutFingerprint({ STREET_LINE, RIVAL_STREET_LINE })}.${layoutFingerprint([toTheMillimetre(dx), toTheMillimetre(dz), corners, cornering, clearance])}`);
    if (route.skill !== undefined) parts.push(`skill-${route.skill}`);
  }
  if (route.trafficPassing) parts.push(`${RIVAL_REVISIONS.pass}.${layoutFingerprint(TRAFFIC_PASS)}`);
  return parts;
}

/** What a session records as `rival`, and what replay compares it with. */
export function rivalRevision(route: RivalDefinition): string {
  return rivalRevisionParts(route).join(" ");
}

/** Why a recording's rival is not this build's, in words: the parts that differ, by their names. */
export function rivalDifference(recorded: string | undefined, route: RivalDefinition): string | null {
  const now = rivalRevisionParts(route);
  if (recorded === now.join(" ")) return null;
  if (!recorded) return "raced a rival from before rival revisions";
  if (!recorded.includes(" ")) return `raced rival ${recorded}, from before a rival was named by what it is made of (${now[0]!.split(".")[0]} on)`;
  // What a part is about: its layer or its number, and anything else is the car.
  const kind = (part: string) => ["driver-", "street-line-", "pass-", "line-", "skill-", "launch-", "cornering-", "limit-"].find(prefix => part.startsWith(prefix)) ?? "car";
  const was = recorded.split(" ");
  const moved = now.filter(part => !was.includes(part)).map(part => `${was.find(old => kind(old) === kind(part)) ?? "nothing"} -> ${part}`);
  const gone = was.filter(part => !now.some(next => kind(next) === kind(part))).map(part => `${part} -> nothing`);
  return `raced another rival: ${[...moved, ...gone].join(", ")}`;
}
