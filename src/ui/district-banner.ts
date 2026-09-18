/**
 * The neighbourhood's name on screen as you cross into it, the way Midnight Club
 * and GTA do it, now that the districts look different enough to be worth naming
 * (design/LOOK.md, Districts).
 *
 * Boundaries run along street centrelines (sim/alder-neighbourhoods.ts), so
 * driving along a border street moves the car between two neighbourhoods every
 * few metres. A name is announced only once the car has stayed in its
 * neighbourhood for `settle` seconds, so a border street never flickers between
 * two names. It is shown for `hold` seconds; leaving every neighbourhood names
 * nothing, and coming back names the one you came back to.
 */

/** Seconds in a neighbourhood before it is named. */
export const DISTRICT_SETTLE = 1.2;
/** Seconds the name stays up. */
export const DISTRICT_HOLD = 2.8;

export interface DistrictBanner {
  /** Where the car is this frame (a neighbourhood id, or null outside them all);
   *  returns the id to name on screen now, or null for nothing. */
  update(here: string | null, frameDelta: number): string | null;
}

export function createDistrictBanner(settle = DISTRICT_SETTLE, hold = DISTRICT_HOLD): DistrictBanner {
  let named: string | null = null, candidate: string | null = null, held = 0, showing = 0;
  return {
    update(here, frameDelta) {
      if (here === named) { candidate = null; held = 0; }
      else {
        if (here !== candidate) { candidate = here; held = 0; }
        held += frameDelta;
        if (held >= settle) {
          named = here; candidate = null; held = 0;
          showing = here ? hold : 0;
        }
      }
      showing = Math.max(0, showing - frameDelta);
      return showing > 0 ? named : null;
    },
  };
}
