/**
 * A circuit as a plan: a closed polygon of named corners, each rounded to a radius, sampled into a lap with its
 * start/finish line and ordered gates. Ridge Circuit's construction (`arena.ts`, 2026-09-13), shared since
 * 2026-09-25 with the stadium's circuits (`stadium-circuits.ts`). Moved here unchanged: Ridge's laps, lines and
 * the recordings that name them depend on this arithmetic to the last bit, so it is not to be tidied.
 *
 * Plan geometry only; nothing here knows the ground it lies on.
 */

export type PlanPoint = { readonly x: number; readonly z: number };

export interface CircuitLayout<C extends string = string, L extends string = string> {
  readonly id: L;
  readonly name: string;
  /** Corners in driving order with the radius each is rounded to; 0 is a straight-through vertex. */
  readonly corners: readonly (readonly [C, number])[];
  /** A point on a straight: the start/finish line. Laps run from it, in corner order. */
  readonly line: PlanPoint;
  /** Race gates, in order, as points the centreline is snapped to. The finish line is added after them. */
  readonly gates: readonly { readonly name: string; readonly x: number; readonly z: number }[];
}

export interface CircuitCorner<C extends string = string> {
  readonly id: C;
  readonly radius: number;
  /** Signed turn in radians: positive turns toward +x of a car heading -z (right). */
  readonly turn: number;
  /** Distance round the lap, from the line, where the corner's arc begins and ends. */
  readonly from: number;
  readonly to: number;
}

export interface CircuitLap<C extends string = string, Layout extends CircuitLayout<C> = CircuitLayout<C>> {
  readonly layout: Layout;
  /** Plan-view samples from the line round to just before it; the lap closes back to points[0]. */
  readonly points: readonly PlanPoint[];
  /** Distance round the lap of each sample. */
  readonly along: readonly number[];
  readonly length: number;
  /** Distance round the lap of each gate, the finish (= length) last. */
  readonly gates: readonly { readonly name: string; readonly along: number; readonly x: number; readonly z: number }[];
  readonly corners: readonly CircuitCorner<C>[];
}

type Primitive =
  | { kind: "line"; ax: number; az: number; bx: number; bz: number; length: number }
  | { kind: "arc"; cx: number; cz: number; radius: number; start: number; sweep: number; length: number };

function primitives<C extends string>(cornerAt: Readonly<Record<C, PlanPoint>>, layout: CircuitLayout<C>):
  { parts: Primitive[]; corners: { id: C; radius: number; turn: number; arc: number }[] } {
  const n = layout.corners.length;
  const tangent: { a: { x: number; z: number }; b: { x: number; z: number }; arc: Primitive | null; turn: number }[] = [];
  for (let k = 0; k < n; k++) {
    const [id, radius] = layout.corners[k]!;
    const p = cornerAt[layout.corners[(k + n - 1) % n]![0]], c = cornerAt[id], q = cornerAt[layout.corners[(k + 1) % n]![0]];
    const l1 = Math.hypot(c.x - p.x, c.z - p.z), l2 = Math.hypot(q.x - c.x, q.z - c.z);
    const d1 = { x: (c.x - p.x) / l1, z: (c.z - p.z) / l1 }, d2 = { x: (q.x - c.x) / l2, z: (q.z - c.z) / l2 };
    const cross = d1.x * d2.z - d1.z * d2.x;
    const theta = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z)));
    // In x-east, z-south plan coordinates a positive cross product is a right turn.
    const side = cross >= 0 ? 1 : -1;
    if (radius <= 0 || theta < 1e-9) { tangent.push({ a: c, b: c, arc: null, turn: side * theta }); continue; }
    const t = radius * Math.tan(theta / 2);
    const a = { x: c.x - d1.x * t, z: c.z - d1.z * t }, b = { x: c.x + d2.x * t, z: c.z + d2.z * t };
    const cx = a.x - d1.z * side * radius, cz = a.z + d1.x * side * radius;
    tangent.push({ a, b, turn: side * theta,
      arc: { kind: "arc", cx, cz, radius, start: Math.atan2(a.z - cz, a.x - cx), sweep: side * theta, length: radius * theta } });
  }
  const parts: Primitive[] = [];
  const corners: { id: C; radius: number; turn: number; arc: number }[] = [];
  for (let k = 0; k < n; k++) {
    const here = tangent[k]!, next = tangent[(k + 1) % n]!;
    if (here.arc) { corners.push({ id: layout.corners[k]![0], radius: layout.corners[k]![1], turn: here.turn, arc: parts.length }); parts.push(here.arc); }
    const length = Math.hypot(next.a.x - here.b.x, next.a.z - here.b.z);
    // Two corners whose tangents overlap would draw a straight that runs backwards.
    const forward = (next.a.x - here.b.x) * (cornerAt[layout.corners[(k + 1) % n]![0]].x - cornerAt[layout.corners[k]![0]].x)
      + (next.a.z - here.b.z) * (cornerAt[layout.corners[(k + 1) % n]![0]].z - cornerAt[layout.corners[k]![0]].z);
    if (forward < -1e-6) throw new RangeError(`${layout.id}: corners ${layout.corners[k]![0]} and ${layout.corners[(k + 1) % n]![0]} overlap`);
    if (length > 1e-6) parts.push({ kind: "line", ax: here.b.x, az: here.b.z, bx: next.a.x, bz: next.a.z, length });
  }
  return { parts, corners };
}

function pointOn(part: Primitive, s: number): { x: number; z: number } {
  if (part.kind === "line") {
    const t = s / part.length;
    return { x: part.ax + (part.bx - part.ax) * t, z: part.az + (part.bz - part.az) * t };
  }
  const angle = part.start + part.sweep * (s / part.length);
  return { x: part.cx + Math.cos(angle) * part.radius, z: part.cz + Math.sin(angle) * part.radius };
}

/** Spacing of samples: arcs are sampled finely, straights coarsely enough to follow the terrain. */
const ARC_STEP = 3, LINE_STEP = 5;

/** A layout's lap, sampled from its start/finish line. Throws for corners that overlap, or a gate off the line. */
export function circuitLap<C extends string, Layout extends CircuitLayout<C>>(cornerAt: Readonly<Record<C, PlanPoint>>, layout: Layout): CircuitLap<C, Layout> {
  const id = layout.id;
  const { parts, corners } = primitives(cornerAt, layout);
  const offsets = [0];
  for (const part of parts) offsets.push(offsets.at(-1)! + part.length);
  const total = offsets.at(-1)!;
  // Where a point lands round the unrotated loop: the nearest point on any primitive.
  const locate = (x: number, z: number) => {
    let best = { distance: Infinity, s: 0 };
    parts.forEach((part, i) => {
      let s: number;
      if (part.kind === "line") {
        const dx = part.bx - part.ax, dz = part.bz - part.az;
        s = Math.max(0, Math.min(part.length, ((x - part.ax) * dx + (z - part.az) * dz) / part.length));
      } else {
        let angle = Math.atan2(z - part.cz, x - part.cx) - part.start;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        s = Math.max(0, Math.min(part.length, angle / part.sweep * part.length));
      }
      const p = pointOn(part, s), distance = Math.hypot(p.x - x, p.z - z);
      if (distance < best.distance) best = { distance, s: offsets[i]! + s };
    });
    if (best.distance > 1) throw new RangeError(`${id}: (${x}, ${z}) is ${best.distance.toFixed(1)} m off the centreline`);
    return best.s;
  };
  const origin = locate(layout.line.x, layout.line.z);
  const lapOf = (s: number) => ((s - origin) % total + total) % total;
  const gateAlong = layout.gates.map(gate => ({ ...gate, along: lapOf(locate(gate.x, gate.z)) }));
  for (let i = 1; i < gateAlong.length; i++) {
    if (gateAlong[i]!.along <= gateAlong[i - 1]!.along) throw new RangeError(`${id}: gate ${gateAlong[i]!.name} is out of order`);
  }
  // Sample distances in loop terms: every primitive's ends and subdivisions, and the gates exactly.
  const exact = [0, ...gateAlong.map(gate => gate.along)];
  const stops = [...exact];
  parts.forEach((part, i) => {
    const count = Math.max(1, Math.ceil(part.length / (part.kind === "arc" ? ARC_STEP : LINE_STEP)));
    for (let k = 0; k < count; k++) {
      const s = lapOf(offsets[i]! + part.length * k / count);
      // A subdivision this close to the line or a gate would only be a sliver segment.
      if (exact.every(e => Math.abs(s - e) > 0.5 && Math.abs(s - e - total) > 0.5)) stops.push(s);
    }
  });
  const along = stops.sort((a, b) => a - b);
  const at = (lap: number) => {
    let s = (lap + origin) % total;
    let i = 0;
    while (i < parts.length - 1 && offsets[i + 1]! <= s) i++;
    s -= offsets[i]!;
    return pointOn(parts[i]!, Math.min(parts[i]!.length, s));
  };
  const points = along.map(at);
  const gates = [...gateAlong.map(gate => ({ name: gate.name, along: gate.along, ...at(gate.along) })),
    { name: "Finish", along: total, x: points[0]!.x, z: points[0]!.z }];
  const lapCorners = corners.map(corner => {
    const from = lapOf(offsets[corner.arc]!);
    return { id: corner.id, radius: corner.radius, turn: corner.turn, from, to: from + parts[corner.arc]!.length };
  });
  return { layout, points, along, length: total, gates, corners: lapCorners };
}
