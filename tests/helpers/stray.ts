import type { Sim } from "../../src/sim/sim.ts";
import { projectOntoAlder } from "../../src/sim/alder.ts";

/**
 * How far a rival wanders from a centreline, with being shunted by traffic told
 * apart from driving badly.
 *
 * A raw peak cannot tell them apart, and in traffic it is a lottery rather than
 * a measure of the rival. Measured on the Queen Anne Climb race over Moth's
 * `power` (2026-09-19, and the same chance is on the record from the launch
 * work): the peak reads 7.2, 7.2, **23.1**, 7.7, **24.3**, 8.1 m at 0.64 to
 * 0.70, where the peak CLEAR OF CONTACT reads 7.2, 7.2, 7.3, 7.7, 7.8, 7.9 m.
 * Both excursions were one traffic car met head on, at the same place, and both
 * were back inside 16 m in under two seconds.
 *
 * So the driving is `clearPeak`, and what a shunt must not do is leave the rival
 * out there: `worstRecovery` is the longest it stays past `limit` afterwards.
 */
export function watchStray(sim: Sim, limit = 16, settleTicks = 180) {
  const traffic = new Set(sim.trafficBodies.map(body => body.handle));
  let tick = 0, lastContact = -Infinity, peak = 0, peakAt = 0, clearPeak = 0, clearPeakAt = 0;
  let wideSince: number | null = null, worstRecovery = 0, worstRecoveryAt = 0;
  return {
    /** Call once per tick, after `step`. */
    sample() {
      tick++;
      const car = sim.state.rival!.vehicle;
      const stray = projectOntoAlder(car.x, car.z).distance;
      const collider = sim.rivalBody!.collider(0);
      let shunted = false;
      sim.world.contactPairsWith(collider, other => sim.world.contactPair(collider, other, manifold => {
        // Only traffic excuses a stray: a building or a kerb is the rival's own doing.
        if (manifold.numSolverContacts() > 0 && traffic.has(other.parent()?.handle ?? -1)) shunted = true;
      }));
      if (shunted) lastContact = tick;
      if (stray > peak) { peak = stray; peakAt = tick; }
      if (tick - lastContact > settleTicks && stray > clearPeak) { clearPeak = stray; clearPeakAt = tick; }
      if (stray > limit) {
        wideSince ??= tick;
        if (tick - wideSince > worstRecovery) { worstRecovery = tick - wideSince; worstRecoveryAt = wideSince; }
      } else wideSince = null;
    },
    /** Peak metres from a centreline while no traffic has touched the rival for `settleTicks`. */
    get clearPeak() { return clearPeak; },
    /** Longest unbroken stretch past `limit`, in ticks, however it got there. */
    get worstRecovery() { return worstRecovery; },
    /** For a failure message: every number, and when. */
    report(ticksPerSecond = 60) {
      return JSON.stringify({
        clearPeak: +clearPeak.toFixed(1), clearPeakAt: +(clearPeakAt / ticksPerSecond).toFixed(1),
        peak: +peak.toFixed(1), peakAt: +(peakAt / ticksPerSecond).toFixed(1),
        worstRecovery: +(worstRecovery / ticksPerSecond).toFixed(1),
        worstRecoveryFrom: +(worstRecoveryAt / ticksPerSecond).toFixed(1),
      });
    },
  };
}
