import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TRAFFIC_KINDS, trafficSignal, type TrafficKind, type TrafficNetwork, type TrafficState } from "../sim/traffic.ts";

/**
 * Traffic, drawn. The sim decides where every vehicle is and which way it
 * points; this turns that into instances and nothing else.
 *
 * One instanced body and one instanced lamp set per kind — eight draw calls for
 * the lot — because the count is fixed at load and never changes, which is the
 * same property that keeps the simulation's collider set constant.
 */

export interface TrafficView {
  readonly root: THREE.Group;
  readonly bodies: Map<TrafficKind, THREE.InstancedMesh>;
  readonly lamps: Map<TrafficKind, THREE.InstancedMesh>;
  /** Amber indicators, one set per side, shown per vehicle by `trafficSignal`. */
  readonly indicators: Map<TrafficKind, Record<"left" | "right", THREE.InstancedMesh>>;
  /** Brake lamps, shown per vehicle while it is `braking`. */
  readonly brakes: Map<TrafficKind, THREE.InstancedMesh>;
  /** Where each vehicle sits in its kind's instance buffer. */
  readonly slots: number[];
  readonly network: TrafficNetwork | null;
  /** Seconds into the indicators' flash. Presentation only. */
  blink: number;
  /** The ground's slope under a point, so a vehicle leans with a hillside the
   *  way the player's car does. The traffic state carries only a heading, and
   *  keeping the lean here leaves it, and TRAFFIC_REVISION, alone. */
  readonly ground: ((x: number, z: number) => { gradeX?: number; gradeZ?: number }) | null;
}

/** Indicator rate: about 90 flashes a minute, lit a little over half of each. */
const BLINK_PERIOD = 0.66, BLINK_LIT = 0.38;
const AMBER = new THREE.Color(0xffa21a);
const BRAKE_RED = new THREE.Color(0xff3322);

// Muted on purpose. Traffic has to be legible as a hazard without reading as
// brighter than the buildings behind it; the lamps do the announcing.
const PAINT: readonly number[] = [0x6b7581, 0x272e38, 0x5c2618, 0x18304a, 0x8a867b, 0x2a4033];
const TAXI_PAINT = 0xb9861f;

/** Body and cabin, sized from the same spec the collider uses. */
function bodyGeometry(kind: TrafficKind): THREE.BufferGeometry {
  const spec = TRAFFIC_KINDS[kind];
  const parts: THREE.BufferGeometry[] = [];
  const lower = new THREE.BoxGeometry(spec.width, spec.height * 0.55, spec.length);
  lower.translate(0, spec.height * 0.275, 0);
  parts.push(lower);
  // A van and a lorry are a box on the load bed; a car has a cabin set back.
  const boxy = kind === "van" || kind === "box-truck";
  const cabin = new THREE.BoxGeometry(spec.width * (boxy ? 1 : 0.86),
    spec.height * 0.45, spec.length * (boxy ? 0.72 : 0.5));
  cabin.translate(0, spec.height * 0.775, boxy ? -spec.length * 0.1 : spec.length * 0.02);
  parts.push(cabin);
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return merged;
}

/**
 * Head and tail lamps. Cross traffic has to be readable before the vehicle
 * itself is (GDD §12 asks for exactly that), and at night on an unlit street
 * the lamps are all you see of it.
 */
function lampGeometry(kind: TrafficKind): THREE.BufferGeometry {
  const spec = TRAFFIC_KINDS[kind];
  const parts: THREE.BufferGeometry[] = [];
  const colors: number[] = [];
  const add = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const count = geometry.getAttribute("position").count;
    for (let i = 0; i < count; i++) colors.push(color.r, color.g, color.b);
    parts.push(geometry);
  };
  const white = new THREE.Color(0xfff2d0), red = new THREE.Color(0xff2a1c);
  for (const side of [-1, 1]) {
    const head = new THREE.BoxGeometry(spec.width * 0.22, 0.16, 0.08);
    head.translate(side * spec.width * 0.32, spec.height * 0.42, -spec.length / 2 - 0.03);
    add(head, white);
    const tail = new THREE.BoxGeometry(spec.width * 0.2, 0.13, 0.08);
    tail.translate(side * spec.width * 0.33, spec.height * 0.45, spec.length / 2 + 0.03);
    add(tail, red);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

/** Brake lamps: over the tail lamps, larger and brighter, and a third high in the middle. */
function brakeGeometry(kind: TrafficKind): THREE.BufferGeometry {
  const spec = TRAFFIC_KINDS[kind];
  const parts = [-1, 1].map(side => {
    const lamp = new THREE.BoxGeometry(spec.width * 0.24, 0.2, 0.1);
    lamp.translate(side * spec.width * 0.33, spec.height * 0.45, spec.length / 2 + 0.06);
    return lamp;
  });
  const high = new THREE.BoxGeometry(spec.width * 0.3, 0.08, 0.08);
  high.translate(0, spec.height * 0.96, spec.length / 2 * (kind === "van" || kind === "box-truck" ? 0.42 : 0.1) + 0.06);
  parts.push(high);
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return merged;
}

/** One side's indicators, front and rear at the outer corners. Forward is -Z, so the left is -X. */
function indicatorGeometry(kind: TrafficKind, side: "left" | "right"): THREE.BufferGeometry {
  const spec = TRAFFIC_KINDS[kind], x = (side === "left" ? -1 : 1) * spec.width * 0.44;
  const front = new THREE.BoxGeometry(spec.width * 0.14, 0.14, 0.1);
  front.translate(x, spec.height * 0.42, -spec.length / 2 - 0.04);
  const rear = new THREE.BoxGeometry(spec.width * 0.14, 0.14, 0.1);
  rear.translate(x, spec.height * 0.45, spec.length / 2 + 0.04);
  const merged = mergeGeometries([front, rear])!;
  front.dispose(); rear.dispose();
  return merged;
}

export function addTraffic(scene: THREE.Scene, traffic: TrafficState, network: TrafficNetwork | null = null,
  ground: TrafficView["ground"] = null): TrafficView {
  const root = new THREE.Group();
  root.name = "district-traffic";
  const bodies = new Map<TrafficKind, THREE.InstancedMesh>();
  const lamps = new Map<TrafficKind, THREE.InstancedMesh>();
  const indicators = new Map<TrafficKind, Record<"left" | "right", THREE.InstancedMesh>>();
  const brakes = new Map<TrafficKind, THREE.InstancedMesh>();
  const counts = new Map<TrafficKind, number>();
  const slots: number[] = [];
  for (const vehicle of traffic.vehicles) {
    const next = counts.get(vehicle.kind) ?? 0;
    slots.push(next);
    counts.set(vehicle.kind, next + 1);
  }

  const paint = new THREE.Color();
  for (const [kind, count] of counts) {
    const body = new THREE.InstancedMesh(bodyGeometry(kind),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }), count);
    body.name = `traffic-body-${kind}`;
    body.castShadow = true;
    body.frustumCulled = false;
    bodies.set(kind, body);
    root.add(body);

    const lamp = new THREE.InstancedMesh(lampGeometry(kind),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), count);
    lamp.name = `traffic-lamps-${kind}`;
    lamp.frustumCulled = false;
    lamps.set(kind, lamp);
    root.add(lamp);

    const sides = {} as Record<"left" | "right", THREE.InstancedMesh>;
    for (const side of ["left", "right"] as const) {
      const indicator = new THREE.InstancedMesh(indicatorGeometry(kind, side),
        new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }), count);
      indicator.name = `traffic-indicators-${kind}-${side}`;
      indicator.frustumCulled = false;
      root.add(indicator);
      sides[side] = indicator;
    }
    indicators.set(kind, sides);

    const brake = new THREE.InstancedMesh(brakeGeometry(kind), new THREE.MeshBasicMaterial({ color: BRAKE_RED, toneMapped: false }), count);
    brake.name = `traffic-brakes-${kind}`;
    brake.frustumCulled = false;
    root.add(brake);
    brakes.set(kind, brake);
  }
  // Paint is per vehicle and never changes, so it is written once. Taxis are a
  // fixed colour: a taxi you cannot pick out of the queue is just a car.
  traffic.vehicles.forEach((vehicle, index) => {
    paint.setHex(vehicle.kind === "taxi" ? TAXI_PAINT
      : PAINT[(vehicle.id * 7 + index) % PAINT.length]!);
    bodies.get(vehicle.kind)!.setColorAt(slots[index]!, paint);
  });
  for (const body of bodies.values()) if (body.instanceColor) body.instanceColor.needsUpdate = true;

  scene.add(root);
  return { root, bodies, lamps, indicators, brakes, slots, network, blink: 0, ground };
}

const placement = new THREE.Object3D();
placement.rotation.order = "YXZ";
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

/** `elapsed` is the frame's seconds, for the indicators' flash; where cars are is the tick's alone. */
export function updateTraffic(view: TrafficView, traffic: TrafficState, elapsed = 0): void {
  view.blink = (view.blink + elapsed) % BLINK_PERIOD;
  const lit = view.blink < BLINK_LIT;
  traffic.vehicles.forEach((vehicle, index) => {
    placement.position.set(vehicle.x, vehicle.y, vehicle.z);
    const slope = view.ground?.(vehicle.x, vehicle.z);
    const gx = slope?.gradeX ?? 0, gz = slope?.gradeZ ?? 0;
    const sin = Math.sin(vehicle.heading), cos = Math.cos(vehicle.heading);
    placement.rotation.set(Math.atan(-gx * sin - gz * cos), vehicle.heading, Math.atan(gx * cos - gz * sin));
    placement.updateMatrix();
    const slot = view.slots[index]!;
    view.bodies.get(vehicle.kind)!.setMatrixAt(slot, placement.matrix);
    view.lamps.get(vehicle.kind)!.setMatrixAt(slot, placement.matrix);
    const signal = lit && view.network ? trafficSignal(view.network, vehicle) : null;
    const sides = view.indicators.get(vehicle.kind)!;
    sides.left.setMatrixAt(slot, signal === "left" ? placement.matrix : hidden);
    sides.right.setMatrixAt(slot, signal === "right" ? placement.matrix : hidden);
    view.brakes.get(vehicle.kind)!.setMatrixAt(slot, vehicle.braking ? placement.matrix : hidden);
  });
  const indicatorMeshes = [...view.indicators.values()].flatMap(sides => [sides.left, sides.right]);
  for (const mesh of [...view.bodies.values(), ...view.lamps.values(), ...indicatorMeshes, ...view.brakes.values()]) {
    mesh.instanceMatrix.needsUpdate = true;
  }
}
