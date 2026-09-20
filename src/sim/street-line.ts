/**
 * A racing line a street rival may take in traffic, one corner at a time
 * (2026-09-20).
 *
 * On clear streets the rival drives a line that cuts the corners that are not
 * grass (`STREET_RACING_LINE`), and it is a race; in traffic it could not, because
 * a line ignores lanes and traffic cannot be pushed, so every race with traffic
 * fielded a rival ten seconds a lap off the player, lane arcs in its own half.
 * Measured first (design/PORT_ALDER.md, "Could the line be taken corner by
 * corner"): over 83 races the line through a corner is clear of forecast traffic
 * four times in five, what blocks it is oncoming cars, and a rival that decides
 * once, 30 m out, meets something about every eighth race, always from a long look
 * ahead or a car changing speed.
 *
 * So the route stays what it is, the centreline with its lane arcs, its gates,
 * its distances and its resets, and the line rides on it as a SHIFT: at stations
 * along the route, where the line is from the lane the rival rests in. Nothing
 * outside the windows round corners. It is drawn held to the lane outside those
 * windows (`rest`, `cornerReach` in racing-line.ts), so it leaves the lane for a
 * corner and comes back to it, and a rival that takes no shift is the rival as it
 * was, to the bit.
 *
 * The shift is a position, matched to the route's distance by the line's own
 * length through each window. It was first an offset across the lane's corner arc,
 * and folded: on a narrow street that arc has a radius of 8 to 10 m and the line
 * cuts deeper than that, so every normal of the arc met it at once (gen-39: from
 * +0.4 m to -10.8 m in 10 m of road, and the corner was lost).
 *
 * Whether to take the next corner is read here, from the forecast the indicators
 * show the player (`forecastTrafficPath`), every tenth of a second, and taken back
 * the moment it stops being true. Nothing here moves the car: the driver
 * (`rivalInput`) blends onto the shift while `lineGo` holds and plans its speed
 * from the path it then means to drive.
 */
import { laneOffset } from "./lanes.ts";
import { drawRacingLine, type RacingLineOptions } from "./racing-line.ts";
import { RIVAL_LANE, sampleDrivingPath, sampleRivalPath, type RivalDefinition, type RivalDriver, type StreetLine } from "./rival.ts";
import { handlingFor, maxCorneringSpeed, type VehicleState } from "./sim.ts";
import { forecastTrafficPath, TRAFFIC_KINDS, type TrafficNetwork, type TrafficVehicleState } from "./traffic.ts";

export const STREET_LINE = {
  /** Metres of the route between stations. */
  spacing: 2,
  /** Metres either side of a corner's arc that the line may be out of its lane. */
  cornerReach: 60,
  /** A shift smaller than this is the lane, and the ordinary traffic loop's business. */
  shift: 0.75,
  /** A shift wider than this is not a line through a street corner, whatever drew it: the corner stays in its lane. */
  widest: 18,
  /** Metres before a window that its verdict starts being read: before the braking for a lane arc would begin. */
  decide: 150,
  /** Ticks between readings, and ticks a corner stays refused once something is forecast on it. */
  every: 6,
  refuse: 90,
  /** Seconds either side of the moment the rival should be at a station that a car there counts. */
  slack: 0.75,
  /** A car doing less than this within `stoppedReach` metres of the line may pull out: refused. */
  stopped: 1, stoppedReach: 9,
  /** Half a Kestrel and room, added to a traffic car's own box. */
  ahead: 3.1, beside: 1.55,
  /** m/s² assumed getting to the corner and slowing for it, for when it will be where. */
  gather: 4, slow: 10,
} as const;

/** The lane a street rival rests in, as `rivalInput` works it out from a road's width. */
export const laneRest = (width: number) => RIVAL_LANE.share * laneOffset(width, { direction: 1, index: 0 }, width > 14 ? "collector" : "local");

/** The route, carrying the line as a shift from its lane. `options` is the line to draw, with nothing held. */
export function withStreetLine(route: RivalDefinition, options: RacingLineOptions, cornering: number, reach: number = STREET_LINE.cornerReach): RivalDefinition {
  if (route.lateral) throw new RangeError(`${route.id} is a racing line already; a street line rides on a centreline`);
  const { route: drawn, free } = drawRacingLine(route, { ...options, rest: laneRest, cornerReach: reach, entryInLane: true });
  const length = route.along.at(-1)!, count = Math.floor(length / STREET_LINE.spacing) + 1;
  const lane = Array.from({ length: count }, (_, k) => {
    const at = sampleDrivingPath(route, k * STREET_LINE.spacing), rest = laneRest(at.width);
    return { x: at.x - at.uz * rest, z: at.z + at.ux * rest };
  });
  const dx = new Array<number>(count).fill(0), dz = new Array<number>(count).fill(0);
  // Each run of the line that was free to leave the lane is a window. Its ends are on the lane, on a straight, so the
  // station beside each is simply the nearest; between them the line is matched to the route by its own length.
  const corners: { from: number; to: number }[] = [];
  let station = 0;
  // Looked for where the line's own length says it should be, never behind the last one found.
  const nearest = (index: number) => {
    const p = drawn.points[index]!, expected = Math.round(drawn.along[index]! / drawn.along.at(-1)! * length / STREET_LINE.spacing);
    let best = station, bestDistance = Infinity;
    for (let k = Math.max(station, expected - 150); k < Math.min(count, expected + 150); k++) {
      const d = Math.hypot(lane[k]!.x - p.x, lane[k]!.z - p.z);
      if (d < bestDistance) { bestDistance = d; best = k; }
    }
    return best;
  };
  for (let i = 0; i < free.length; i++) {
    if (!free[i] || (i > 0 && free[i - 1])) continue;
    let j = i; while (j + 1 < free.length && free[j + 1]) j++;
    const first = station = nearest(i), last = station = nearest(j);
    if (last - first < 10) continue;
    const s0 = drawn.along[i]!, s1 = drawn.along[j]!;
    for (let k = first; k <= last; k++) {
      const on = sampleRivalPath(drawn, s0 + (s1 - s0) * (k - first) / (last - first));
      // Eased in and out over the window's first and last 10 m, where what is left is the two paths' own arithmetic.
      const ease = Math.min(1, (k - first) * STREET_LINE.spacing / 10, (last - k) * STREET_LINE.spacing / 10);
      dx[k] = (on.x - lane[k]!.x) * ease; dz[k] = (on.z - lane[k]!.z) * ease;
    }
    corners.push({ from: first * STREET_LINE.spacing, to: last * STREET_LINE.spacing });
    i = j;
  }
  // A corner is taken on its line only if the whole shift can be trusted: no further than a road and its corner can
  // be, and every point of it ground a car may be on. One that cannot is driven in its lane, as it was.
  const sound = (corner: { from: number; to: number }) => {
    for (let k = corner.from / STREET_LINE.spacing; k <= corner.to / STREET_LINE.spacing; k++) {
      const shift = Math.hypot(dx[k]!, dz[k]!);
      if (shift > STREET_LINE.widest) return false;
      if (options.paved && shift >= STREET_LINE.shift && !options.paved(lane[k]!.x + dx[k]!, lane[k]!.z + dz[k]!)) return false;
    }
    return true;
  };
  const kept = corners.filter(corner => {
    if (sound(corner)) return true;
    for (let k = corner.from / STREET_LINE.spacing; k <= corner.to / STREET_LINE.spacing; k++) dx[k] = dz[k] = 0;
    return false;
  });
  // How tightly the shifted path bends at each station, for when the rival will be where: 8 m either way.
  const x = lane.map((p, k) => p.x + dx[k]!), z = lane.map((p, k) => p.z + dz[k]!), radius: number[] = [];
  for (let k = 0; k < count; k++) {
    const a = Math.max(0, k - 4), c = Math.min(count - 1, k + 4);
    const ab = Math.hypot(x[k]! - x[a]!, z[k]! - z[a]!), bc = Math.hypot(x[c]! - x[k]!, z[c]! - z[k]!), ac = Math.hypot(x[c]! - x[a]!, z[c]! - z[a]!);
    const cross = Math.abs((x[k]! - x[a]!) * (z[c]! - z[a]!) - (z[k]! - z[a]!) * (x[c]! - x[a]!));
    radius.push(cross < 1e-3 ? Infinity : ab * bc * ac / (2 * cross));
  }
  const line: StreetLine = { spacing: STREET_LINE.spacing, dx, dz, x, z, radius, corners: kept, cornering, clearance: options.cutMargin ?? options.edgeMargin };
  return { ...route, line };
}

const hits = (vehicle: TrafficVehicleState, at: { x: number; z: number; heading: number }, px: number, pz: number) => {
  const fx = -Math.sin(at.heading), fz = -Math.cos(at.heading), ox = px - at.x, oz = pz - at.z, spec = TRAFFIC_KINDS[vehicle.kind];
  return Math.abs(ox * fx + oz * fz) < spec.length / 2 + STREET_LINE.ahead && Math.abs(ox * -fz + oz * fx) < spec.width / 2 + STREET_LINE.beside;
};

/**
 * Reads the next corner: sets `driver.lineCorner` to it and `driver.lineGo` to whether its line may be taken now.
 * With no traffic to read, every corner may.
 */
export function readStreetLine(route: RivalDefinition, driver: RivalDriver, car: VehicleState, tick: number,
  network: TrafficNetwork | undefined, vehicles: readonly TrafficVehicleState[]): void {
  const line = route.line;
  if (!line) return;
  let index = driver.lineCorner ?? 0;
  while (index < line.corners.length && line.corners[index]!.to < driver.along) index++;
  if (index !== driver.lineCorner) { driver.lineCorner = index; driver.lineGo = false; driver.lineRefused = 0; }
  const corner = line.corners[index];
  if (!corner || driver.along < corner.from - STREET_LINE.decide) { driver.lineGo = false; return; }
  if (!network || !vehicles.length) { driver.lineGo = true; return; }
  if (tick < (driver.lineRefused ?? 0)) { driver.lineGo = false; return; }
  if (tick % STREET_LINE.every) return;
  // When it would be at each station from here to the end of the window: its speed now, the line's own corner
  // speeds, gathering speed and slowing for them as a driver does.
  const handling = handlingFor(route), first = Math.max(0, Math.ceil(driver.along / line.spacing)), last = Math.floor(corner.to / line.spacing);
  if (last <= first) return;
  const speed: number[] = [];
  for (let k = first; k <= last; k++) {
    const limit = k * line.spacing >= corner.from ? Math.min(handling.topSpeed, Math.max(7, maxCorneringSpeed(line.radius[k]!, handling) * line.cornering)) : handling.topSpeed;
    speed.push(k === first ? Math.max(5, car.speed) : Math.min(limit, Math.sqrt(speed.at(-1)! ** 2 + 2 * STREET_LINE.gather * line.spacing)));
  }
  for (let k = speed.length - 2; k >= 0; k--) speed[k] = Math.min(speed[k]!, Math.sqrt(speed[k + 1]! ** 2 + 2 * STREET_LINE.slow * line.spacing));
  const when = [0];
  for (let k = 1; k < speed.length; k++) when.push(when[k - 1]! + line.spacing / Math.max(1, (speed[k]! + speed[k - 1]!) / 2));
  const from = Math.max(first, Math.floor(corner.from / line.spacing)), middle = Math.floor((from + last) / 2), horizon = when.at(-1)! + STREET_LINE.slack;
  let clear = true;
  for (const vehicle of vehicles) {
    if (Math.hypot(vehicle.x - line.x[middle]!, vehicle.z - line.z[middle]!) > 120 + horizon * 20) continue;
    const path = forecastTrafficPath(network, vehicle, horizon, 0.25);
    for (let k = from; k <= last && clear; k++) {
      if (Math.hypot(line.dx[k]!, line.dz[k]!) < STREET_LINE.shift) continue;
      if (vehicle.speed < STREET_LINE.stopped && Math.hypot(vehicle.x - line.x[k]!, vehicle.z - line.z[k]!) < STREET_LINE.stoppedReach) clear = false;
      for (const slack of [-STREET_LINE.slack, 0, STREET_LINE.slack]) {
        const at = path[Math.max(0, Math.min(path.length - 1, Math.round((when[k - first]! + slack) / 0.25)))]!;
        if (hits(vehicle, at, line.x[k]!, line.z[k]!)) clear = false;
      }
    }
    if (!clear) break;
  }
  driver.lineGo = clear;
  if (!clear) driver.lineRefused = tick + STREET_LINE.refuse;
}
