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
import { projectOntoPath } from "./street-path.ts";
import { RIVAL_CORNERING, RIVAL_LANE, RIVAL_STREET_LINE, sampleDrivingPath, sampleRivalPath, shiftAt, type RivalDefinition, type RivalDriver, type StreetLine } from "./rival.ts";
import { handlingFor, maxCorneringSpeed, TICK_HZ, type VehicleState } from "./sim.ts";
import { forecastTrafficPath, TRAFFIC_KINDS, type TrafficNetwork, type TrafficVehicleState } from "./traffic.ts";

export const STREET_LINE = {
  /** Metres of the route between stations. */
  spacing: 2,
  /** Metres either side of a corner's arc that the line may be out of its lane. */
  cornerReach: 60,
  /** Seconds a corner's line must save over the lane through it to be worth leaving the lane for. */
  worth: 0.1,
  /** Degrees a bend must turn to get a line. Below `roundFrom` (45) a vertex is not rounded, and its line is one arc
   *  (`bendArcs`), not the solver's. */
  bendFrom: 12,
  /** A bend is the run of vertices turning its way by at least `bendVertex` degrees, each within `bendJoin` metres of
   *  the last: the route is resampled about every 29 m, so one bend is often two or three vertices. */
  bendVertex: 1, bendJoin: 60,
  /** Metres at most from where a bend's arc leaves the lane to the point its lane lines meet, and metres kept between
   *  its window and the next. */
  /** Metres either side of a bend that the solver's window reaches: only where it joins a corner's (above). */
  bendReach: 60,
  bendTangent: 150, bendGap: 10,
  /** Metres past a bend's window that its reading looks, for a car in the lane it comes back into. */
  bendRejoin: 40,
  /** Metres across the lane its arc's ends may be: on the lane's straight, tangent to it. */
  bendEnds: 0.05,
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

/**
 * Each gentle bend's line (2026-09-23): one arc, tangent to the lane on the straight either side and as large as the
 * road lets it be, kept `edgeMargin` inside the edge at every point. Only ever inside the lane, never swinging out.
 *
 * The solver drew bends inside a window `bendReach` (60 m) either side, and held to its lane at both ends a line that
 * short has to swing out and back, which bends harder than the road: on gen-wake-42 every bend's line came out tighter
 * than the lane (81 m against 168, 101 against 294) and was dropped, and Wake braked to 77 mph for a 26 degree bend
 * Shawn took at 105 to 132, 3 to 6 m across the road. A longer reach merged neighbouring windows, and the solver
 * kinked in them. An arc is the line through a bend, and one bend's arc cannot touch another's window.
 */
function bendArcs(route: RivalDefinition, lane: readonly { x: number; z: number }[], taken: readonly { from: number; to: number }[],
  bendFrom: number, options: RacingLineOptions, tangentMost: number): { first: number; last: number; x: number[]; z: number[] }[] {
  const points = route.points, spacing = STREET_LINE.spacing, last = lane.length - 1, roundFrom = options.roundFrom ?? Infinity;
  const least = STREET_LINE.bendVertex * Math.PI / 180, end = route.along.at(-1)!;
  const turnAt = (i: number) => {
    const p = points[i - 1]!, q = points[i]!, r = points[i + 1]!, ax = q.x - p.x, az = q.z - p.z, bx = r.x - q.x, bz = r.z - q.z;
    return Math.hypot(ax, az) < 1e-6 || Math.hypot(bx, bz) < 1e-6 ? 0 : Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
  };
  const bend = (t: number, sign: number) => Math.sign(t) === sign && Math.abs(t) >= least && Math.abs(t) * 180 / Math.PI <= roundFrom;
  const groups: { a: number; b: number; turn: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const t = turnAt(i);
    if (!bend(t, Math.sign(t))) continue;
    let j = i, total = t;
    while (j + 1 < points.length - 1 && bend(turnAt(j + 1), Math.sign(t)) && route.along[j + 1]! - route.along[j]! <= STREET_LINE.bendJoin) total += turnAt(++j);
    if (Math.abs(total) * 180 / Math.PI >= bendFrom) groups.push({ a: i, b: j, turn: total });
    i = j;
  }
  const arcs: { first: number; last: number; x: number[]; z: number[] }[] = [];
  // How far across the road a point is, off the nearest segment, against how far it may be.
  const withinRoad = (x: number, z: number) => { const at = projectOntoPath(points, x, z); return at.distance <= at.width / 2 + (route.shoulder ?? 0) - options.edgeMargin; };
  // The lane station nearest a point, and how far the point is off the lane there: across it, not along it.
  const nearest = (x: number, z: number, around: number) => {
    let best = around, distance = Infinity;
    for (let k = Math.max(0, around - 200); k <= Math.min(last, around + 200); k++) {
      const d = Math.hypot(lane[k]!.x - x, lane[k]!.z - z);
      if (d < distance) { distance = d; best = k; }
    }
    const a = lane[Math.max(0, best - 1)]!, b = lane[Math.min(last, best + 1)]!, run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { k: best, off: Math.abs((x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x)) / run };
  };
  for (const [g, group] of groups.entries()) {
    const va = route.along[group.a]!, vb = route.along[group.b]!;
    // A bend inside a corner's window is the corner's.
    if (taken.some(w => w.from - STREET_LINE.bendGap < vb && w.to + STREET_LINE.bendGap > va)) continue;
    const before = Math.max(10, ...taken.filter(w => w.to <= va).map(w => w.to + STREET_LINE.bendGap), g > 0 ? (route.along[groups[g - 1]!.b]! + va) / 2 : 0);
    const after = Math.min(end - 10, ...taken.filter(w => w.from >= vb).map(w => w.from - STREET_LINE.bendGap), g < groups.length - 1 ? (vb + route.along[groups[g + 1]!.a]!) / 2 : Infinity);
    // The lane's straight either side: each leg's centreline, where the lane is, at its own width.
    const p0 = points[group.a - 1]!, pa = points[group.a]!, pb = points[group.b]!, p1 = points[group.b + 1]!;
    const l1 = Math.hypot(pa.x - p0.x, pa.z - p0.z), l2 = Math.hypot(p1.x - pb.x, p1.z - pb.z);
    const u1x = (pa.x - p0.x) / l1, u1z = (pa.z - p0.z) / l1, u2x = (p1.x - pb.x) / l2, u2z = (p1.z - pb.z) / l2;
    const r1 = laneRest(pa.width), r2 = laneRest(pb.width);
    const ax = pa.x - u1z * r1, az = pa.z + u1x * r1, bx = pb.x - u2z * r2, bz = pb.z + u2x * r2;
    const cross = u1x * u2z - u1z * u2x;
    if (Math.abs(cross) < 1e-6) continue;
    // Where the two lane lines meet, and the arc tangent to both `T` metres either side of it.
    const s = ((bx - ax) * u2z - (bz - az) * u2x) / cross, lx = ax + u1x * s, lz = az + u1z * s;
    const theta = Math.abs(Math.atan2(cross, u1x * u2x + u1z * u2z)), side = Math.sign(cross), fromA = Math.round(va / spacing);
    const draw = (T: number) => {
      const radius = T / Math.tan(theta / 2), x1 = lx - u1x * T, z1 = lz - u1z * T, x2 = lx + u2x * T, z2 = lz + u2z * T;
      const cx = x1 - u1z * side * radius, cz = z1 + u1x * side * radius;
      const start = nearest(x1, z1, fromA), finish = nearest(x2, z2, fromA);
      if (start.k * spacing < before || finish.k * spacing > after || finish.k <= start.k) return null;
      const x: number[] = [], z: number[] = [], vx = x1 - cx, vz = z1 - cz;
      for (let k = start.k; k <= finish.k; k++) {
        const angle = side * theta * (k - start.k) / (finish.k - start.k), c = Math.cos(angle), sn = Math.sin(angle);
        x.push(cx + vx * c - vz * sn); z.push(cz + vx * sn + vz * c);
        if (!withinRoad(x.at(-1)!, z.at(-1)!)) return null;
      }
      return { first: start.k, last: finish.k, x, z, ends: Math.max(start.off, finish.off) };
    };
    // The largest that fits: the road's edge and the windows either side only close in as it grows.
    let low = 5, high = tangentMost;
    if (!draw(low)) continue;
    for (let k = 0; k < 24; k++) { const mid = (low + high) / 2; if (draw(mid)) low = mid; else high = mid; }
    const arc = draw(low)!;
    // Tangent to the lane where it leaves it: its ends on the lane's straight, not on a lane arc that has already turned
    // (a bend towards the lane's own kerb leaves an arc no larger than the lane's, whose ends are 0.35 m off it).
    if (arc.ends > STREET_LINE.bendEnds || arc.last - arc.first < 10) continue;
    arcs.push({ first: arc.first, last: arc.last, x: arc.x, z: arc.z });
  }
  return arcs;
}

/** The route, carrying the line as a shift from its lane. `options` is the line to draw, with nothing held. */
export function withStreetLine(route: RivalDefinition, options: RacingLineOptions, cornering: number,
  tune: { readonly reach?: number; readonly bendFrom?: number; readonly bendTangent?: number; readonly worth?: number } = {}): RivalDefinition {
  // `tune` is for measuring (scripts/street-line-batch.ts): the game draws every line on STREET_LINE's own numbers.
  const reach = tune.reach ?? STREET_LINE.cornerReach, bendFrom = tune.bendFrom ?? STREET_LINE.bendFrom, worth = tune.worth ?? STREET_LINE.worth;
  if (route.lateral) throw new RangeError(`${route.id} is a racing line already; a street line rides on a centreline`);
  const { route: drawn, free } = drawRacingLine(route, { ...options, rest: laneRest, cornerReach: reach, entryInLane: true, bendFrom: Number.isFinite(bendFrom) ? bendFrom : undefined, bendReach: STREET_LINE.bendReach });
  const length = route.along.at(-1)!, count = Math.floor(length / STREET_LINE.spacing) + 1;
  const lane = Array.from({ length: count }, (_, k) => {
    const at = sampleDrivingPath(route, k * STREET_LINE.spacing), rest = laneRest(at.width);
    return { x: at.x - at.uz * rest, z: at.z + at.ux * rest };
  });
  // Each run of the line that was free to leave the lane is a window. Its ends are on the lane, on a straight, so the
  // station beside each is simply the nearest; between them the line is matched to the route by its own length.
  type Window = { first: number; last: number; x: number[]; z: number[] };
  const corners: Window[] = [], bends: Window[] = [];
  let station = 0;
  // Where the route turns enough to be rounded: a corner.
  const sharp = route.points.slice(1, -1).flatMap((q, v) => {
    const p = route.points[v]!, r = route.points[v + 2]!;
    const turn = Math.atan2((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.z - p.z) * (r.z - q.z));
    return Math.abs(turn) * 180 / Math.PI > (options.roundFrom ?? Infinity) ? [route.along[v + 1]!] : [];
  });
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
    const s0 = drawn.along[i]!, s1 = drawn.along[j]!, window: Window = { first, last, x: [], z: [] };
    for (let k = first; k <= last; k++) {
      const on = sampleRivalPath(drawn, s0 + (s1 - s0) * (k - first) / (last - first));
      // Eased in and out over the window's first and last 10 m, where what is left is the two paths' own arithmetic.
      const ease = Math.min(1, (k - first) * STREET_LINE.spacing / 10, (last - k) * STREET_LINE.spacing / 10);
      window.x.push(lane[k]!.x + (on.x - lane[k]!.x) * ease); window.z.push(lane[k]!.z + (on.z - lane[k]!.z) * ease);
    }
    // A window with a corner in it is the corner's; one with none is a bend's, and competes with its arc (below).
    (sharp.some(at => at >= first * STREET_LINE.spacing && at <= last * STREET_LINE.spacing) ? corners : bends).push(window);
    i = j;
  }
  const span = (window: Window) => ({ from: window.first * STREET_LINE.spacing, to: window.last * STREET_LINE.spacing });
  // A bend's other line is one arc, drawn clear of the corners (`bendArcs`).
  if (Number.isFinite(bendFrom)) bends.push(...bendArcs(route, lane, corners.map(span), bendFrom, options, tune.bendTangent ?? STREET_LINE.bendTangent));
  // A window is taken on its line only if the whole shift can be trusted: no further than a road and its corner can
  // be, and every point of it ground a car may be on. One that cannot is driven in its lane, as it was.
  const sound = (window: Window) => {
    for (let k = window.first; k <= window.last; k++) {
      const x = window.x[k - window.first]!, z = window.z[k - window.first]!, shift = Math.hypot(x - lane[k]!.x, z - lane[k]!.z);
      if (shift > STREET_LINE.widest) return false;
      if (options.paved && shift >= STREET_LINE.shift && !options.paved(x, z)) return false;
    }
    // Wider clear verges can expose a solver path that swings outward before
    // a sharp corner. Keep that approach in its lane instead of accepting it
    // merely because the shoulder underneath is paved.
    if (corners.includes(window)) {
      let apex=window.first, deepest=0;
      for(let k=window.first;k<=window.last;k++) {
        const shift=Math.hypot(window.x[k-window.first]!-lane[k]!.x,window.z[k-window.first]!-lane[k]!.z);
        if(shift>deepest){deepest=shift;apex=k;}
      }
      const entry=sampleDrivingPath(route,window.first*STREET_LINE.spacing),exit=sampleDrivingPath(route,window.last*STREET_LINE.spacing);
      const inward=Math.sign(entry.ux*exit.uz-entry.uz*exit.ux);
      for(let k=window.first;k<window.first+(apex-window.first)/2;k++) {
        const at=sampleDrivingPath(route,k*STREET_LINE.spacing);
        const across=((window.x[k-window.first]!-lane[k]!.x)*-at.uz+(window.z[k-window.first]!-lane[k]!.z)*at.ux)*inward;
        if(across<=-1)return false;
      }
    }
    return true;
  };
  // How tightly a path bends at each station: 8 m either way, as the driver reads it.
  const bendOf = (px: readonly number[], pz: readonly number[]) => px.map((_, k) => {
    const a = Math.max(0, k - 4), c = Math.min(count - 1, k + 4);
    const ab = Math.hypot(px[k]! - px[a]!, pz[k]! - pz[a]!), bc = Math.hypot(px[c]! - px[k]!, pz[c]! - pz[k]!), ac = Math.hypot(px[c]! - px[a]!, pz[c]! - pz[a]!);
    const cross = Math.abs((px[k]! - px[a]!) * (pz[c]! - pz[a]!) - (pz[k]! - pz[a]!) * (px[c]! - px[a]!));
    return cross < 1e-3 ? Infinity : ab * bc * ac / (2 * cross);
  });
  // And a window's line is kept only where it is QUICKER than the lane through it. At 150 mph a line that is a touch
  // less straight than the lane is planned slower than the lane, and the lane on a straight is perfectly straight:
  // given room at every gentle bend, Tally lost 2.4 s of a clear gen-tally-7 to lines through bends she had been
  // taking flat. Both paths are timed the same way: in at full speed, held to each one's own corner speeds, the
  // line's at the driver's share and the lane's at every rival's, gathering and slowing as `readStreetLine` assumes.
  const handling = handlingFor(route);
  const laneBend = bendOf(lane.map(p => p.x), lane.map(p => p.z));
  const seconds = (window: Window, bend: readonly number[], px: (k: number) => number, pz: (k: number) => number, share: number) => {
    const speed: number[] = [], step: number[] = [0];
    for (let k = window.first + 1; k <= window.last; k++) step.push(Math.hypot(px(k) - px(k - 1), pz(k) - pz(k - 1)));
    for (let k = window.first; k <= window.last; k++) {
      const limit = Math.min(handling.topSpeed, Math.max(7, maxCorneringSpeed(bend[k]!, handling) * share));
      speed.push(k === window.first ? limit : Math.min(limit, Math.sqrt(speed.at(-1)! ** 2 + 2 * STREET_LINE.gather * step[k - window.first]!)));
    }
    for (let k = speed.length - 2; k >= 0; k--) speed[k] = Math.min(speed[k]!, Math.sqrt(speed[k + 1]! ** 2 + 2 * STREET_LINE.slow * step[k + 1]!));
    let time = 0;
    for (let k = 1; k < speed.length; k++) time += step[k]! / Math.max(1, (speed[k]! + speed[k - 1]!) / 2);
    return time;
  };
  // Seconds a window's line saves over the lane through it, read as the driver would: its own line, the lane either side.
  const saves = (window: Window) => {
    const px = (k: number) => k >= window.first && k <= window.last ? window.x[k - window.first]! : lane[k]!.x;
    const pz = (k: number) => k >= window.first && k <= window.last ? window.z[k - window.first]! : lane[k]!.z;
    const bend = laneBend.slice();
    for (let k = Math.max(0, window.first - 4); k <= Math.min(count - 1, window.last + 4); k++) {
      const a = Math.max(0, k - 4), c = Math.min(count - 1, k + 4);
      const ab = Math.hypot(px(k) - px(a), pz(k) - pz(a)), bc = Math.hypot(px(c) - px(k), pz(c) - pz(k)), ac = Math.hypot(px(c) - px(a), pz(c) - pz(a));
      const cross = Math.abs((px(k) - px(a)) * (pz(c) - pz(a)) - (pz(k) - pz(a)) * (px(c) - px(a)));
      bend[k] = cross < 1e-3 ? Infinity : ab * bc * ac / (2 * cross);
    }
    return seconds(window, laneBend, k => lane[k]!.x, k => lane[k]!.z, RIVAL_CORNERING.speedFactor) - seconds(window, bend, px, pz, cornering);
  };
  const worthIt = (window: Window) => sound(window) && saves(window) > worth;
  // Where a bend has two lines, the solver's and its arc, the one that saves more; neither where both lose to the lane.
  const overlaps = (a: Window, b: Window) => a.first * STREET_LINE.spacing < b.last * STREET_LINE.spacing + STREET_LINE.bendGap
    && b.first * STREET_LINE.spacing < a.last * STREET_LINE.spacing + STREET_LINE.bendGap;
  const taken: Window[] = [];
  for (const candidate of bends.filter(worthIt).map(window => ({ window, saves: saves(window) })).sort((a, b) => b.saves - a.saves)) {
    if (!taken.some(window => overlaps(window, candidate.window))) taken.push(candidate.window);
  }
  const kept = [...corners.filter(worthIt), ...taken].sort((a, b) => a.first - b.first);
  const dx = new Array<number>(count).fill(0), dz = new Array<number>(count).fill(0);
  for (const window of kept) for (let k = window.first; k <= window.last; k++) {
    dx[k] = window.x[k - window.first]! - lane[k]!.x; dz[k] = window.z[k - window.first]! - lane[k]!.z;
  }
  // How tightly the shifted path bends at each station, for when the rival will be where.
  const x = lane.map((p, k) => p.x + dx[k]!), z = lane.map((p, k) => p.z + dz[k]!), radius = bendOf(x, z);
  const line: StreetLine = { spacing: STREET_LINE.spacing, dx, dz, x, z, radius, corners: kept.map(window => taken.includes(window) ? { ...span(window), bend: true as const } : span(window)), cornering, clearance: options.cutMargin ?? options.edgeMargin };
  return { ...route, line, trafficPassing: true };
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
  // A bend's line is joined where it leaves the lane, never partway round (2026-09-23). Given go 35 m into a bend's arc,
  // gen-61 at seed 0 blended onto a line already 2 to 4 m across in about 15 m of road, at full lock with its tyres at
  // 94%, ran 3.7 m wide of it and came out of the swerve over the centre line into an oncoming box truck. Off the line,
  // a bend is taken only if the shift where the blend would be complete is still the lane's. Not a corner's window: it
  // is slow and eased, and held to this too it gave up lines it had been taking cleanly, went off the pavement for
  // 287 ticks where it had for 2, and reset 25 times to 15 (seeds 0, 1 and 42).
  if (corner.bend && !driver.lineGo && (driver.lineBlend ?? 0) < 0.05) {
    const joined = shiftAt(line, Math.min(corner.to, driver.along + Math.max(0, car.speed) / (TICK_HZ * RIVAL_STREET_LINE.blendRate)));
    if (driver.along > corner.from - 1 && Math.hypot(joined.x, joined.z) >= STREET_LINE.shift) { driver.lineGo = false; return; }
  }
  if (tick % STREET_LINE.every) return;
  // When it would be at each station from here to the end of the window: its speed now, the line's own corner
  // speeds, gathering speed and slowing for them as a driver does.
  // A bend's is read on to where it has rejoined its lane (`bendRejoin`): an arc brings it out of the bend faster than
  // the lane would, and gen-31 at seed 42 came off one at 130 mph onto a sedan doing 33 in its lane, 13 ticks of contact.
  const handling = handlingFor(route), first = Math.max(0, Math.ceil(driver.along / line.spacing));
  const last = Math.min(line.x.length - 1, Math.floor((corner.to + (corner.bend ? STREET_LINE.bendRejoin : 0)) / line.spacing));
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
      // A corner's ends are its lane, and the ordinary traffic loop's business; a bend's are where it comes back into it.
      if (!corner.bend && Math.hypot(line.dx[k]!, line.dz[k]!) < STREET_LINE.shift) continue;
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
