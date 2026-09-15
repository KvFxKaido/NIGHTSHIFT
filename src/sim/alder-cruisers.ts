/**
 * The Blacklist on the map (2026-09-15, phase 1): every name but Moth, Rivet and
 * Sable cruises a loop inside its own turf, and a flash starts a generated race of
 * the type nearest its Blacklist challenge, leaning toward that turf, raced in its
 * own car. Moth keeps her freight block and her career stages (`encounter.ts`,
 * `progress.ts`); Rivet and Sable stay parked at their drag strip and drift yard.
 * Nothing here pays or advances the career; that is phase 2.
 *
 * The loops were chosen by search, then pinned here as street lists so a change to
 * the map or the generator shows up as a failing test, not a rival quietly driving
 * somewhere else. Each is a closed loop of 1.5-2.8 km whose junction turns are at
 * most 100°, lying entirely inside its turf's 800 m (Tally, whose turf is the whole
 * city, near the map's middle), sharing no street segment with another rival's
 * loop, and, checked every 60 m the way it is driven, a flash anywhere along it
 * draws a race of that rival's type. Bollard keeps Elliott Ave and Deuce the
 * Broadcast Tower streets: the Belltown waterfront is too small for two loops that
 * each want both. Blacklist challenges with no race of their own yet take the
 * nearest that exists: a rival duel or an uphill sprint is a sprint for now, and
 * Tally's citywide open checkpoint is an unordered race.
 */
import { CAR_DRIVETRAIN } from "../customization/cars.ts";
import { cruiseLoop } from "./encounter.ts";
import type { GeneratedKind } from "./race-id.ts";
import type { RivalDefinition } from "./rival.ts";

export interface CruisingRival {
  readonly id: string;
  readonly name: string;
  /** The car's display name and its asset id (`BLENDER_CARS`). */
  readonly carName: string;
  readonly car: string;
  /** Where the contact card says they run. */
  readonly turf: string;
  /** The race a flash draws: the nearest existing type to their Blacklist challenge. */
  readonly kind: GeneratedKind;
  readonly route: RivalDefinition;
}

type Drives = readonly { street: string; reversed: boolean }[];
const rival = (id: string, name: string, carName: string, car: string, turf: string, kind: GeneratedKind, drives: Drives): CruisingRival =>
  ({ id, name, carName, car, turf, kind, route: cruiseLoop(`${id}-cruise`, drives, CAR_DRIVETRAIN[car] ?? "fwd") });
const loop = (...streets: [string, boolean][]): Drives => streets.map(([street, reversed]) => ({ street, reversed }));

export const BLACKLIST_CRUISERS: readonly CruisingRival[] = [
  // 1,814 m: Pike St, 6th Ave, Yesler Way, Western Ave, Madison St, 4th Ave.
  rival("stray", "Stray", "Latch", "latch", "Alder Center", "unordered", loop(
    ["sea-19", false], ["sea-38", true], ["sea-47", true], ["sea-61", true], ["sea-60", true], ["sea-43", true], ["sea-36", true],
    ["sea-30", true], ["sea-16", true], ["sea-17", false], ["sea-21", false], ["sea-25", false], ["sea-22", false], ["sea-18", false])),
  // 1,808 m: Wall St, Elliott Ave, Cedar St, 4th Ave, Pike St, 2nd Ave.
  rival("bollard", "Bollard", "Breakwater", "breakwater", "Elliott Ave waterfront", "sprint", loop(
    ["sea-north-23", true], ["sea-north-22", true], ["sea-north-16", false], ["sea-north-25", false], ["sea-north-26", false], ["sea-north-27", false],
    ["sea-north-12", true], ["sea-north-11", true], ["sea-north-10", true], ["sea-13", true], ["sea-north-5", false], ["sea-north-6", false])),
  // 1,810 m: Broad St, 5th Ave N, Taylor Terrace, Uptown Link, Queen Anne Climb, Queen Anne Ave N, Denny Way.
  rival("deuce", "Deuce", "Wager", "wager", "Broadcast Tower", "sprint", loop(
    ["sea-north-32", false], ["sea-north-41", false], ["sea-east-5", false], ["sea-east-25", true], ["sea-east-0", true],
    ["sea-north-38", true], ["sea-north-33", false], ["sea-north-34", false], ["sea-north-35", false])),
  // 1,615 m: Denny East, Ridge Scenic Way, Pine East, Valley Parkway.
  rival("plumb", "Plumb", "Meridian", "meridian", "Madrona Ridge", "circuit", loop(
    ["sea-east-39", false], ["sea-east-171", false], ["sea-east-94", true], ["sea-east-160", true])),
  // 1,552 m: Galer Terrace, Queen Anne Climb, Crown Loop, Taylor Terrace.
  rival("crest", "Crest", "Skim", "skim", "Queen Anne", "sprint", loop(
    ["sea-east-18", true], ["sea-east-4", false], ["sea-east-23", false], ["sea-east-9", true], ["sea-east-19", true])),
  // 1,794 m: 12th Avenue, Aloha Street, 23rd Avenue, Bellevue Court, Belmont Passage, Roy Street.
  rival("wake", "Wake", "Reign", "reign", "Capitol Hill", "sprint", loop(
    ["sea-east-52", true], ["sea-east-69", true], ["sea-east-134", true], ["sea-east-133", true], ["sea-east-132", true],
    ["sea-east-197", false], ["sea-east-198", false], ["sea-east-187", false], ["sea-east-77", true], ["sea-east-53", true])),
  // 2,813 m: Aloha Street, Belmont Passage, Mercer East, Republic Street, Valley Parkway, Roy Street, Madrona Drive.
  rival("tally", "Tally", "Vesper", "vesper", "The whole city", "unordered", loop(
    ["sea-east-71", true], ["sea-east-190", false], ["sea-east-181", false], ["sea-east-177", false], ["sea-east-178", false],
    ["sea-east-158", true], ["sea-east-157", true], ["sea-east-80", true], ["sea-east-147", false], ["sea-east-72", true])),
];

export function cruiserFor(id: string | null | undefined): CruisingRival | null {
  return BLACKLIST_CRUISERS.find(c => c.id === id) ?? null;
}
