/**
 * The street the car is on, for the HUD's street plate (MCLA's, 2026-09-26). A readout: it reads positions the
 * simulation has already produced and the street data, and nothing in the simulation reads it back.
 *
 * At a junction two streets overlap, and the nearest centreline flips between them as the car crosses, so the plate
 * would flicker. It keeps the street it has while the car is still on that street's asphalt, and takes another only
 * once the car has left it; off every street (a lot, the open ground) it keeps the last name for `grace`, then clears.
 */

export interface NamedStreet {
  readonly name: string;
  /** Centreline points; `width` is the carriageway there. */
  readonly points: readonly { readonly x: number; readonly z: number; readonly width?: number }[];
}

export interface StreetNamerOptions {
  /** Metres past the carriageway's half-width still counted as on the street: the shoulder and a little. */
  readonly margin?: number;
  /** Milliseconds a name stays after the car leaves every street. */
  readonly grace?: number;
}

/** Street names as the plate prints them: upper case, one space between words ("1St Ave S" becomes "1ST AVE S"). */
export function plateName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

interface Segment { street: number; ax: number; az: number; bx: number; bz: number; reach: number }

const CELL = 64;

export function createStreetNamer(streets: readonly NamedStreet[], options: StreetNamerOptions = {}) {
  const margin = options.margin ?? 7.6, grace = options.grace ?? 1500;
  const cells = new Map<string, Segment[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  streets.forEach((street, index) => {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!, b = street.points[i]!;
      const reach = Math.max(a.width ?? 10, b.width ?? 10) / 2 + margin;
      const segment: Segment = { street: index, ax: a.x, az: a.z, bx: b.x, bz: b.z, reach };
      // Every cell the segment's reach can touch holds it, so a query looks at its own cell only.
      const x0 = Math.floor((Math.min(a.x, b.x) - reach) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + reach) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - reach) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + reach) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const list = cells.get(key(cx, cz));
        if (list) list.push(segment); else cells.set(key(cx, cz), [segment]);
      }
    }
  });
  // A road is often several entries under one name, so what the plate holds on to is the name, never the entry: at
  // the seam between two pieces of 1st Ave the car is on both and the name does not move.
  const names = streets.map(street => plateName(street.name));
  /** Each name whose asphalt the point is on, with how far it is from that street's centreline. */
  const under = (x: number, z: number) => {
    const found = new Map<string, number>();
    for (const s of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, length2 = dx * dx + dz * dz;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / length2)) : 0;
      const distance = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z), name = names[s.street]!;
      if (distance <= s.reach && distance < (found.get(name) ?? Infinity)) found.set(name, distance);
    }
    return found;
  };
  let current: string | null = null, leftAt: number | null = null;
  return {
    /** The plate's text for a car at (x, z) at time `now` (ms), or null for no plate. */
    at(x: number, z: number, now: number): string | null {
      const on = under(x, z);
      if (current !== null && on.has(current)) { leftAt = null; return current; }
      if (on.size) {
        let best: string | null = null, bestDistance = Infinity;
        for (const [name, distance] of on) if (distance < bestDistance) { best = name; bestDistance = distance; }
        current = best; leftAt = null;
        return current;
      }
      if (current === null) return null;
      leftAt ??= now;
      if (now - leftAt > grace) { current = null; leftAt = null; }
      return current;
    },
  };
}
