import type { RaceDefinition } from "./race.ts";

/**
 * How much of the pedals' excess the player's tyres forgive by default
 * (`SimOptions.pedalAssist`): none, since 2026-09-20, by Shawn's decision after
 * driving it. "Flooring it should be a choice", and the computer could not beat
 * him: taking the player's traction control and ABS away was the most direct way
 * to close that gap without touching a rival.
 *
 * **The rivals are not given an advantage by this.** A rival keeps the clamp
 * (an assist of 1), and at an assist of 0 a tyre asked for exactly what it has
 * left delivers exactly that, with no excess and nothing lost. So a rival on the
 * clamp drives, force for force, as a rival on the player's tyres with a perfect
 * right foot would. The car is the same whoever drives it; the driver is not.
 * That is also why a car's measured card (`pnpm cars`) still stands: it is what
 * the car does under a perfect foot.
 *
 * **The drag strip keeps the assist.** Its skill is the gearbox, and its balance
 * is a fiftieth of a second: the Hammer is tuned so that a clean Cinder just wins
 * (12.95 s against 12.97). Without the assist a floored Cinder loses by 0.60 s and
 * a feathered one by 0.22, so only a foot held at the tyre's limit for a quarter
 * of a mile would win, and Rivet would be a wall in the career. Until the Hammer
 * is retuned for it, a drag race is driven as it was.
 *
 * `createSim` itself still defaults to 1. Tests, fixtures, the golden master and
 * the cars' cards drive the clamp and are unchanged; only the game asks for this.
 */
export function defaultPedalAssist(race: Pick<RaceDefinition, "kind"> | null | undefined): number {
  return race?.kind === "drag" ? 1 : 0;
}
