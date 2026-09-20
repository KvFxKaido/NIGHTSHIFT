import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TRAFFIC_KINDS, type TrafficKind } from "../sim/traffic.ts";

/** Small, shared traffic models. Forward is -Z; dimensions come from collision
 * specs. Paint is instanced separately from fixed-colour glass, tyres and trim. */
export function trafficCabin(kind: TrafficKind) {
  const { length: l, height: h } = TRAFFIC_KINDS[kind];
  return kind === "box-truck" ? { front: -l * .46, rear: -l * .19, floor: h * .32, roof: h * .68 }
    : kind === "van" ? { front: -l * .32, rear: l * .47, floor: h * .43, roof: h * .98 }
    : kind === "suv" ? { front: -l * .27, rear: l * .43, floor: h * .5, roof: h * .98 }
    : { front: -l * .27, rear: l * .29, floor: h * .55, roof: h * .98 };
}

/**
 * `silhouette` is for an ink outline (`?look=cel-traffic`, render/cel.ts): the
 * solids that give a vehicle its shape and nothing fixed to them, since a hull
 * round every handle, rail and mirror is a scribble. Its normals point out of
 * each solid's corners, shared by the faces that meet there, so the hull pushed
 * along them has no cracks at the hard edges. A corner's push is split between
 * three faces, which draws traffic a finer line than a named car's.
 */
export function trafficBodyGeometry(kind: TrafficKind): { paint: THREE.BufferGeometry; detail: THREE.BufferGeometry; silhouette: THREE.BufferGeometry } {
  const { length: l, width: w, height: h } = TRAFFIC_KINDS[kind];
  const painted: THREE.BufferGeometry[] = [], details: THREE.BufferGeometry[] = [], outlined: THREE.BufferGeometry[] = [];
  const rubber = 0x171b20, glass = 0x283c46, metal = 0x777b7b;
  const outline = (solid: THREE.BufferGeometry) => {
    solid.computeBoundingBox();
    const centre = solid.boundingBox!.getCenter(new THREE.Vector3()), corner = new THREE.Vector3();
    const position = solid.getAttribute("position"), normals: number[] = [];
    for (let i = 0; i < position.count; i++) {
      corner.set(Math.sign(position.getX(i) - centre.x), Math.sign(position.getY(i) - centre.y), Math.sign(position.getZ(i) - centre.z)).normalize();
      normals.push(corner.x, corner.y, corner.z);
    }
    const part = new THREE.BufferGeometry();
    part.setAttribute("position", position.clone());
    part.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    part.setIndex(solid.index!.clone());
    outlined.push(part);
  };
  const add = (g: THREE.BufferGeometry, color?: number) => {
    if (color === undefined) painted.push(g);
    else {
      const c = new THREE.Color(color), colors: number[] = [];
      for (let i = 0; i < g.getAttribute("position").count; i++) colors.push(c.r, c.g, c.b);
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      details.push(g);
    }
  };
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color?: number, shape = false) => {
    const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z);
    if (shape) outline(g);
    add(g, color);
  };
  const truck = kind === "box-truck", van = kind === "van", suv = kind === "suv";
  const wheelRadius = truck ? .46 : van ? .37 : suv ? .36 : .30;
  // Raised sill leaves the tyres visible instead of burying them inside a box.
  const sill = wheelRadius * .9, belt = truck ? h * .35 : h * .55;
  box(w * .95, belt - sill, l, 0, (belt + sill) / 2, 0, undefined, true);
  box(w * .84, .13, l * .85, 0, sill, 0, rubber);
  const cabin = trafficCabin(kind), depth = cabin.rear - cabin.front;
  const cabinHeight = cabin.roof - cabin.floor;
  // A tapered glasshouse gives sedan/SUV windscreen rake with flat hard edges.
  const shell = new THREE.BoxGeometry(w * .88, cabinHeight, depth);
  const vertices = shell.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    if (vertices.getY(i) > 0) {
      vertices.setX(i, vertices.getX(i) * .86);
      vertices.setZ(i, vertices.getZ(i) * (truck || van ? .88 : .7));
    }
  }
  shell.computeVertexNormals();
  shell.translate(0, (cabin.roof + cabin.floor) / 2, (cabin.front + cabin.rear) / 2);
  outline(shell);
  add(shell, glass);
  box(w * .77, .065, depth * (truck || van ? .88 : .7), 0, cabin.roof, (cabin.front + cabin.rear) / 2);
  // B pillars and door handles; commercial cargo uses solid panels.
  for (const side of [-1, 1]) {
    const x = side * w * .432;
    box(.045, cabinHeight * .85, .09, x, (cabin.floor + cabin.roof) / 2, truck ? cabin.rear - .1 : -l * .035, rubber);
    box(.05, .055, .20, side * w * .48, belt * .92, -l * .02, metal);
    box(.09, .14, .24, side * w * .475, cabin.floor + .12, cabin.front + .12, rubber);
    if (suv) box(.045, .07, depth * .72, side * w * .32, h * .985, l * .08, rubber);
  }
  if (van) {
    // Plain panel van: short glazed cab, tall enclosed cargo, split rear doors.
    box(w * .94, h * .53, l * .55, 0, h * .705, l * .205, undefined, true);
    box(.025, h * .68, .025, 0, h * .58, l * .483, rubber);
    box(w * .76, .07, .045, 0, h * .25, l * .485, metal);
  }
  if (truck) {
    box(w, h * .72, l * .65, 0, h * .64, l * .175, undefined, true);
    // Roll-up cargo door, rails and rear step make the rear unmistakable.
    box(w * .89, h * .62, .025, 0, h * .63, l * .502, 0x9b9b91);
    for (let i = 0; i < 7; i++) box(w * .89, .018, .03, 0, h * (.35 + i * .09), l * .505, metal);
    box(w * .96, .14, .16, 0, .48, l * .49, rubber);
  }
  for (const z of [-l * .5, l * .5]) {
    box(w * .92, .13, .08, 0, belt * .65, z, rubber);
    box(w * .2, .11, .025, 0, belt * .9, z * 1.01, 0xb5b3a4);
  }
  box(w * .45, .18, .035, 0, belt * .92, -l * .505, rubber);
  // Low-poly tyres with plain steel hubs. Wheel centres stay inside the spec.
  for (const side of [-1, 1]) for (const z of [-l * .31, l * (truck ? .30 : .32)]) {
    for (const hub of [false, true]) {
      const radius = wheelRadius * (hub ? .55 : 1);
      const wheel = new THREE.CylinderGeometry(radius, radius, hub ? .022 : .19, 12);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(side * (w / 2 - (hub ? .014 : .11)), wheelRadius, z);
      add(wheel, hub ? metal : rubber);
    }
  }
  if (kind === "taxi") box(.58, .16, .25, 0, cabin.roof + .10, 0, 0xd1bb71);
  const merge = (parts: THREE.BufferGeometry[]) => {
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  };
  return { paint: merge(painted), detail: merge(details), silhouette: merge(outlined) };
}
