import * as THREE from "three";
import { addNightSky, ALDER_SKY } from "./sky.ts";
import { STADIUM, STADIUM_FLOOR, STADIUM_GATES, STADIUM_MARKER, inStadium } from "../sim/stadium.ts";
import { STADIUM_SHELL_MESH } from "../sim/stadium-shell.ts";
import { STADIUM_CIRCUIT, STADIUM_LAYOUT_IDS, stadiumLap } from "../sim/stadium-circuits.ts";
import { frames, merged, strip } from "./track-strips.ts";
import type { DistrictLighting } from "./scene.ts";

/**
 * The stadium venue's world, drawn (src/sim/stadium.ts): the night, the bowl's dirt floor, a dark apron beyond the
 * shell so nothing is void over the rim, the two gates' markers and doors, the circuits. The shell itself and Sable's yard
 * are added by main.ts as they are for the city (`addWharfArena`, `addDriftYard` with its venue floor).
 */
export function addStadium(scene: THREE.Scene, lighting: DistrictLighting): void {
  const night = lighting === "night";
  if (night) addNightSky(scene, ALDER_SKY);
  if (night) scene.add(new THREE.HemisphereLight(0x9abbd0, 0x39444c, 1.0));

  // Bare ground beyond the shell, a little under the floor, in case the camera ever looks over a wall.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(3200, 2000), new THREE.MeshStandardMaterial({ color: 0x1a1d1c, roughness: 1 }));
  outside.name = "stadium-outside"; outside.rotation.x = -Math.PI / 2;
  outside.position.set(-600, STADIUM.base - .3, 1000);
  scene.add(outside);

  // The floor: dirt wall to wall, the shape of the bowl at car height. Sable's apron is laid over it as asphalt.
  // A shape is drawn in (x, y) and laid flat by -90 degrees about x, which sends its y to -z: so it is given -z.
  const shape = new THREE.Shape(STADIUM_FLOOR.map(p => new THREE.Vector2(p.x, -p.z)));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1 }));
  floor.name = "stadium-floor"; floor.rotation.x = -Math.PI / 2; floor.position.y = STADIUM.base + .01;
  floor.receiveShadow = true;
  scene.add(floor);

  addStadiumMarkers(scene, "venue");
  addStadiumDoors(scene, night);
  addStadiumCircuits(scene, night);
  if (night) addStadiumLights(scene);
}

/** Floods round the rim: how many, and how bright. The yard's own masts were four at 160 and 15 m up over one apron. */
const RIM_LIGHTS = { count: 8, intensity: 420, distance: 340, decay: 1 } as const;

/**
 * The bowl's light, from its rim (2026-09-25). The yard's four floodlight masts were props on the floor and went with
 * the rest of them, and they had lit Sable's apron alone; floods on the shell's top ring take no floor and reach every
 * run. Evenly spaced round the wall, each head on the rim vertex nearest its stretch of wall, its light a few metres
 * in over the floor. Drawing only.
 */
export function addStadiumLights(scene: THREE.Scene): void {
  const group = new THREE.Group(); group.name = "stadium-rim-lights"; scene.add(group);
  const v = STADIUM_SHELL_MESH.vertices, rim: THREE.Vector3[] = [];
  for (let i = 0; i < v.length; i += 3) if (v[i + 1]! > 24 && v[i + 1]! < 30) rim.push(new THREE.Vector3(v[i]!, v[i + 1]!, v[i + 2]!));
  const loop = STADIUM_FLOOR, start = [0];
  for (let i = 1; i < loop.length; i++) start.push(start[i - 1]! + Math.hypot(loop[i]!.x - loop[i - 1]!.x, loop[i]!.z - loop[i - 1]!.z));
  const total = start.at(-1)!;
  const head = new THREE.MeshBasicMaterial({ color: 0xe7ecf2 });
  for (let k = 0; k < RIM_LIGHTS.count; k++) {
    const s = total * (k + .5) / RIM_LIGHTS.count;
    let i = 1;
    while (start[i]! < s) i++;
    const a = loop[i - 1]!, b = loop[i]!, t = (s - start[i - 1]!) / (start[i]! - start[i - 1]!);
    const wall = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
    // Into the bowl: whichever side of the wall is its floor.
    const side = inStadium(wall.x - tz * 3, wall.z + tx * 3) ? 1 : -1, nx = -tz * side, nz = tx * side;
    const top = rim.reduce((best, r) => Math.hypot(r.x - wall.x, r.z - wall.z) < Math.hypot(best.x - wall.x, best.z - wall.z) ? r : best);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, .5, 1.4), head);
    lamp.name = "stadium-rim-flood";
    lamp.position.set(top.x, top.y + .6, top.z);
    lamp.rotation.y = Math.atan2(-tz, tx);
    group.add(lamp);
    const light = new THREE.PointLight(0xc2def0, RIM_LIGHTS.intensity, RIM_LIGHTS.distance, RIM_LIGHTS.decay);
    light.name = "stadium-rim-light";
    light.position.set(wall.x + nx * 6, top.y - 2, wall.z + nz * 6);
    group.add(light);
  }
}

/** Kerbs go on every turn's arc and this far either side of it: every stadium turn is tight. */
const KERB_RUN = 6;

/**
 * The stadium's circuits, drawn as Ridge Circuit is (render/arena.ts): asphalt to the shoulder, white edge lines, red
 * and white kerbs on the turns, a chequered line at each layout's start. Both layouts are laid whichever is raced,
 * as the sim paves both (`onStadiumCircuit`). Where one crosses Sable's apron its asphalt lies under the apron's and
 * its lines and kerbs over it. Nothing drawn here decides anything.
 */
export function addStadiumCircuits(scene: THREE.Scene, night: boolean): THREE.Group {
  const group = new THREE.Group(); group.name = "stadium-circuits"; scene.add(group);
  const floor = () => STADIUM.base;
  const paved = new THREE.MeshStandardMaterial({ color: night ? 0x232d35 : 0x3d474d, roughness: .7, metalness: .06,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const paint = (color: number) => new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const half = STADIUM_CIRCUIT.width / 2, reach = half + STADIUM_CIRCUIT.shoulder;
  const asphalt: (THREE.BufferGeometry | null)[] = [], lines: (THREE.BufferGeometry | null)[] = [];
  const red: (THREE.BufferGeometry | null)[] = [], white: (THREE.BufferGeometry | null)[] = [];
  const laps = STADIUM_LAYOUT_IDS.map(id => stadiumLap(id));
  /** Is a plan point on another layout's racing surface? Edge paint and kerbs stop at the mouths where they meet. */
  const onOther = (x: number, z: number, self: number) => laps.some((lap, index) => index !== self && lap.points.some((a, i) => {
    const b = lap.points[(i + 1) % lap.points.length]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < half - .3;
  }));
  laps.forEach((lap, index) => {
    const frame = frames(lap.points, true);
    // Overlapping layouts are the same asphalt; a few millimetres keeps coplanar copies from shimmering.
    asphalt.push(strip(frame, true, -reach, reach, .025 + index * .004, () => true, floor));
    for (const side of [-1, 1]) {
      const edge = (half - .15) * side;
      lines.push(strip(frame, true, edge - .125, edge + .125, .06, i => {
        const f = frame[i]!, g = frame[(i + 1) % frame.length]!;
        return !onOther((f.x + g.x) / 2 + f.nx * edge, (f.z + g.z) / 2 + f.nz * edge, index);
      }, floor));
    }
    for (const corner of lap.corners) {
      const within = (i: number) => lap.along[i]! >= corner.from - KERB_RUN && lap.along[i]! <= corner.to + KERB_RUN;
      const kerbOnOther = (i: number, side: number) => {
        const f = frame[i]!;
        return onOther(f.x + f.nx * (half + .5) * side, f.z + f.nz * (half + .5) * side, index);
      };
      for (const side of [-1, 1]) {
        // A side that crosses the other layout anywhere is a junction mouth: no kerb on it at all.
        if (frame.some((_, i) => within(i) && lap.along[i]! >= corner.from && lap.along[i]! <= corner.to && kerbOnOther(i, side))) continue;
        for (const colour of [0, 1]) {
          (colour ? white : red).push(strip(frame, true, (half + .05) * side, (half + 1.05) * side, .07,
            i => within(i) && i % 2 === colour && !kerbOnOther(i, side), floor));
        }
      }
    }
  });
  for (const mesh of [merged("stadium-circuit-asphalt", asphalt, paved), merged("stadium-circuit-edge-lines", lines, paint(0xe8e4d8)),
    merged("stadium-circuit-kerbs-red", red, paint(0xb73a2e)), merged("stadium-circuit-kerbs-white", white, paint(0xe8e4d8))]) if (mesh) group.add(mesh);

  // A chequered band across the track at each layout's start line.
  const checks: THREE.BufferGeometry[][] = [[], []];
  for (const lap of laps) {
    const a = lap.points[0]!, b = lap.points[1]!, l = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
    const cells = 12, size = STADIUM_CIRCUIT.width / cells;
    for (let row = 0; row < 2; row++) for (let cell = 0; cell < cells; cell++) {
      const right = -STADIUM_CIRCUIT.width / 2 + (cell + .5) * size, back = (row - .5) * size;
      const x = a.x - ux * back - uz * right, z = a.z - uz * back + ux * right;
      const tile = new THREE.PlaneGeometry(size, size); tile.rotateX(-Math.PI / 2); tile.rotateY(Math.atan2(-ux, -uz));
      tile.translate(x, STADIUM.base + .075, z);
      checks[(row + cell) % 2]!.push(tile);
    }
  }
  for (const [i, colour] of [[0, 0xe8e4d8], [1, 0x14181c]] as const) {
    const mesh = merged(`stadium-circuit-start-${i ? "dark" : "light"}`, checks[i]!, paint(colour));
    if (mesh) group.add(mesh);
  }
  return group;
}

/** The barrier wall's top where the gates were: the shell's vertices there stand at 1.86 and 6.95 m (measured
 *  2026-09-25), the stands stepping back 16 m above it. A door and its frame stay under it; the sign stands on it. */
const BARRIER_TOP = 6.95;
const DOOR = { width: 12, height: 4.2, header: .6, jamb: .5, inset: .06, frameDepth: .3 } as const;
/** What the sign over each door says. Harbor Way is the east gate's street; the north driveway's is left unnamed. */
const DOOR_SIGNS: Record<string, string> = { east: "EAST GATE · HARBOR WAY", north: "NORTH GATE" };

/** The venue's wall at car height, walked by arc length from where it passes nearest (x, z): a point and the
 *  wall's direction there. The wall curves at the east gate, so a door drawn along it stays on its face. */
function wallFrom(x: number, z: number): (s: number) => { x: number; z: number; tx: number; tz: number } {
  const loop = STADIUM_FLOOR, n = loop.length, start = [0];
  for (let i = 0; i < n; i++) start.push(start[i]! + Math.hypot(loop[(i + 1) % n]!.x - loop[i]!.x, loop[(i + 1) % n]!.z - loop[i]!.z));
  const total = start[n]!;
  let origin = 0, nearest = Infinity;
  for (let i = 0; i < n; i++) {
    const a = loop[i]!, b = loop[(i + 1) % n]!, dx = b.x - a.x, dz = b.z - a.z, length = start[i + 1]! - start[i]!;
    if (!length) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < nearest) { nearest = d; origin = start[i]! + t * length; }
  }
  return (s: number) => {
    const at = ((origin + s) % total + total) % total;
    let i = 0;
    while (start[i + 1]! <= at && i < n - 1) i++;
    const a = loop[i]!, b = loop[(i + 1) % n]!, length = start[i + 1]! - start[i]! || 1, t = (at - start[i]!) / length;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / length, tz: (b.z - a.z) / length };
  };
}

/**
 * A roller door where each city gate was, so the way out reads from across the bowl: a ribbed shutter drawn on the
 * barrier's face and following its curve, a steel frame, a lit sign standing on the barrier above it, amber beacons
 * on the jambs, and a warm light on the door at night. Drawing only: the shell's wall is the collision, and nothing
 * here stands more than the frame's 0.3 m off it.
 */
export function addStadiumDoors(scene: THREE.Scene, night: boolean): void {
  const group = new THREE.Group(); group.name = "stadium-doors"; scene.add(group);
  const steel = new THREE.MeshStandardMaterial({ color: 0x46545e, roughness: .6, metalness: .3, side: THREE.DoubleSide });
  const rib = new THREE.MeshStandardMaterial({ color: 0x7c929b, roughness: .5, metalness: .3, side: THREE.DoubleSide });
  const frame = new THREE.MeshStandardMaterial({ color: 0x26333d, roughness: .7, side: THREE.DoubleSide });
  const beacon = new THREE.MeshBasicMaterial({ color: 0xffb04d });
  for (const gate of STADIUM_GATES) {
    const marker = gate.venue.marker, along = wallFrom(marker.x, marker.z);
    // Inward is toward the marker, whichever way round the loop runs.
    const middle = along(0), toward = (middle.x - marker.x) * -middle.tz + (middle.z - marker.z) * middle.tx < 0 ? 1 : -1;
    const inward = (p: { tx: number; tz: number }) => ({ x: -p.tz * toward, z: p.tx * toward });
    /** A strip on the wall from `s0` to `s1` round it, `bottom` to `top` above the floor, `out` metres off its face. */
    const strip = (s0: number, s1: number, bottom: number, top: number, out: number, into: number[], index: number[]) => {
      const steps = Math.max(1, Math.ceil((s1 - s0) / .5));
      const first = into.length / 3;
      for (let k = 0; k <= steps; k++) {
        const p = along(s0 + (s1 - s0) * k / steps), n = inward(p);
        into.push(p.x + n.x * out, STADIUM.base + bottom, p.z + n.z * out, p.x + n.x * out, STADIUM.base + top, p.z + n.z * out);
      }
      for (let k = 0; k < steps; k++) {
        const a = first + k * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };
    const mesh = (name: string, material: THREE.Material, build: (into: number[], index: number[]) => void) => {
      const into: number[] = [], index: number[] = [];
      build(into, index);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(into, 3));
      geometry.setIndex(index); geometry.computeVertexNormals();
      const made = new THREE.Mesh(geometry, material); made.name = name; made.receiveShadow = true;
      group.add(made);
      return made;
    };
    const half = DOOR.width / 2;
    mesh(`stadium-door-${gate.id}`, steel, (into, index) => strip(-half, half, 0, DOOR.height, DOOR.inset, into, index));
    mesh(`stadium-door-ribs-${gate.id}`, rib, (into, index) => {
      for (let y = .35; y < DOOR.height - .1; y += .35) strip(-half, half, y, y + .06, DOOR.inset + .04, into, index);
    });
    mesh(`stadium-door-frame-${gate.id}`, frame, (into, index) => {
      strip(-half - DOOR.jamb, half + DOOR.jamb, DOOR.height, DOOR.height + DOOR.header, DOOR.frameDepth, into, index);
      for (const side of [-1, 1]) strip(side * half, side * (half + DOOR.jamb), 0, DOOR.height, DOOR.frameDepth, into, index);
    });
    for (const side of [-1, 1]) {
      const p = along(side * (half + DOOR.jamb / 2)), n = inward(p);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.35, .35, .35), beacon);
      lamp.name = `stadium-door-beacon-${gate.id}`;
      lamp.position.set(p.x + n.x * DOOR.frameDepth, STADIUM.base + DOOR.height + DOOR.header + .2, p.z + n.z * DOOR.frameDepth);
      group.add(lamp);
    }
    const n = inward(middle);
    if (night) {
      const light = new THREE.PointLight(0xffc98a, 60, 45, 1.4);
      light.name = `stadium-door-light-${gate.id}`;
      light.position.set(middle.x + n.x * 6, STADIUM.base + 5, middle.z + n.z * 6);
      group.add(light);
    }
    if (typeof document === "undefined") continue;   // Headless: the door and frame still build.
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#101f2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffc268"; ctx.font = "bold 64px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(DOOR_SIGNS[gate.id] ?? gate.name.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    sign.name = `stadium-door-sign-${gate.id}`;
    // Standing on the barrier's top over the door, facing into the bowl.
    sign.position.set(middle.x + n.x * DOOR.inset, BARRIER_TOP + .8, middle.z + n.z * DOOR.inset);
    sign.rotation.y = Math.atan2(n.x, n.z);
    group.add(sign);
  }
}

/**
 * A gate's marker, where a car stops to cross to the other side: an amber ring on the ground with the gate's name
 * beside it. Drawn on the venue's floor inside each restored wall, and in the city at each gate.
 */
export function addStadiumMarkers(scene: THREE.Scene, side: "city" | "venue"): void {
  const group = new THREE.Group(); group.name = `stadium-markers-${side}`; scene.add(group);
  for (const gate of STADIUM_GATES) {
    const { x, z } = gate[side].marker;
    const ring = new THREE.Mesh(new THREE.RingGeometry(STADIUM_MARKER.radius - .6, STADIUM_MARKER.radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc268, transparent: true, opacity: .8, depthWrite: false }));
    ring.name = `stadium-gate-${gate.id}`; ring.rotation.x = -Math.PI / 2; ring.position.set(x, STADIUM.base + .09, z);
    group.add(ring);
    if (typeof document === "undefined") continue;   // Headless: the ring still builds.
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#101f2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffc268"; ctx.font = "bold 52px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(side === "city" ? STADIUM.name.toUpperCase() : gate.name.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    sign.name = `stadium-gate-sign-${gate.id}`;
    // Flat on the ground inside the ring, where the car stops on it.
    sign.rotation.x = -Math.PI / 2;
    sign.position.set(x, STADIUM.base + .1, z);
    group.add(sign);
  }
}
