import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { frontPoint, type FrontPlan } from "../sim/building-fronts.ts";
import { drawnBuilding } from "./drawn-buildings.ts";
import { glowTexture, tint } from "./night.ts";
import { addPlaceActivity } from "./place-activity.ts";

/**
 * HOLGATE COLD STORE, 1st Ave S in SoDo: the first place adopted through design/CITY_ADOPTION.md (2026-09-27).
 *
 * A cold store in the freight row keeps food cold for the port, and the one thing it has that its neighbours do not is
 * the refrigeration plant on its roof: four condensers along the street edge, the machine room behind them, the
 * pipes between. That is the silhouette a driver reads over the roofline on the way up 1st Ave S. Below it dock 01
 * stands open on its lit inside (the `open` shutter, saved in alder-frontages.json) and a forklift works it, a dark
 * shape against the light with its amber beacon turning: the sign that somebody is on shift.
 *
 * All drawn, nothing solid: the plant is on the roof and the forklift is inside the wall, so the sim, the colliders
 * and every course are untouched. The forklift's round is the sim's clock read by the renderer, as the junction
 * flashers are; it decides nothing.
 */
export const COLD_STORAGE_ID = "plot--44.000-617.000";

const AMBER = new THREE.Color("#ffa227");
const AMBER_DARK = new THREE.Color("#3a2408");
const WORK_LIGHT = new THREE.Color("#eef3ff");
/** The open dock's light on its apron: the district's open-dock white (DOCK_INSIDE in night.ts), a little brighter. */
const DOCK_SPILL = new THREE.Color("#b9c9e6").multiplyScalar(.4);

/** The forklift's round: across the dock, a stop, a turn in place, back, a stop, a turn. Seconds, and metres from
 * the dock's centre (the truck is 2.45 m long with its load and the doorway 5.7 m wide inside its frame). */
const DRIVE = 3.2, STOP = 1.6, TURN = 1.2, TRAVEL = 1.2;
export const COLD_STORAGE_ROUND_SECONDS = 2 * (DRIVE + STOP + TURN);
const BEACON_HZ = 1.4;

export interface ForkliftPose {
  /** Across the dock from its centre, in metres. */
  readonly x: number;
  /** How much of its side the truck shows: 1 with the forks towards +x, -1 towards -x, through 0 mid-turn. */
  readonly facing: number;
  /** How much of its end it shows: 0 side on, 1 mid-turn, facing the street or away from it. */
  readonly endOn: number;
}

/**
 * A turn in place is drawn as its projection: the side view narrows through nothing to its mirror while the end
 * view widens and narrows again, as a box turned by an angle shows its length times its cosine and its width times
 * its sine. Mirroring the side view at once, however wide, jumps the forks a metre in a tick (Codex, PR #20).
 */
export function forkliftPose(seconds: number): ForkliftPose {
  let t = ((seconds % COLD_STORAGE_ROUND_SECONDS) + COLD_STORAGE_ROUND_SECONDS) % COLD_STORAGE_ROUND_SECONDS;
  const ease = (u: number) => u * u * (3 - 2 * u);
  const turn = (x: number, from: number, u: number): ForkliftPose =>
    ({ x, facing: Math.cos(Math.PI * Math.min(1, u)) * from, endOn: Math.sin(Math.PI * Math.min(1, u)) });
  if (t < DRIVE) return { x: -TRAVEL + 2 * TRAVEL * ease(t / DRIVE), facing: 1, endOn: 0 };
  t -= DRIVE; if (t < STOP) return { x: TRAVEL, facing: 1, endOn: 0 };
  t -= STOP; if (t < TURN) return turn(TRAVEL, 1, t / TURN);
  t -= TURN; if (t < DRIVE) return { x: TRAVEL - 2 * TRAVEL * ease(t / DRIVE), facing: -1, endOn: 0 };
  t -= DRIVE; if (t < STOP) return { x: -TRAVEL, facing: -1, endOn: 0 };
  t -= STOP; return turn(-TRAVEL, -1, t / TURN);
}

/** A turning beacon seen from one side: a short flash each turn, dark between. 0 to 1. */
export function beaconPulse(seconds: number): number {
  return Math.max(0, Math.cos(2 * Math.PI * BEACON_HZ * seconds)) ** 8;
}

const glowMaterial = (color: THREE.Color) => new THREE.MeshBasicMaterial({
  color, toneMapped: false, map: glowTexture(), transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

export function addColdStorage(scene: THREE.Scene, plan: FrontPlan, heightAt: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group(); group.name = "alder-cold-storage";
  // The building's frame and then its street wall's, as the fronts are placed (render/building-fronts.ts): x across
  // the wall, y up from the building's base, z out from the wall face (negative is inboard, over the roof).
  const site = new THREE.Group(); site.name = "cold-storage-site";
  site.position.set(plan.block.x, plan.block.base, plan.block.z); site.rotation.y = -plan.block.rotation;
  const wall = new THREE.Group(); wall.name = "cold-storage-wall";
  wall.position.set(plan.wallX, 0, plan.wallZ); wall.rotation.y = plan.turn;
  site.add(wall); group.add(site);

  const plant: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
  const at = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, color: string | THREE.Color, into = plant) => {
    geometry.translate(x, y, z); into.push(tint(geometry, new THREE.Color(color)));
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, into = plant) =>
    at(new THREE.BoxGeometry(w, h, d), x, y, z, color, into);
  const drum = (x: number, y: number, z: number, radius: number, length: number, color: string, axis: "x" | "y" | "z" = "y") => {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 14);
    if (axis === "x") geometry.rotateZ(Math.PI / 2); else if (axis === "z") geometry.rotateX(Math.PI / 2);
    at(geometry, x, y, z, color);
  };
  const roof = plan.block.height, steel = "#1f2427", casing = "#525c61", shroud = "#3f484c", lagging = "#6f787b";

  // Four evaporative condensers on a steel skid, set 1.35 m back from the roof's street edge, coil faces to the
  // street and two fan stacks each on top.
  for (const z of [-1.6, -4]) box(0, roof + .15, z, 20.6, .3, .22, steel);
  for (const x of [-7.65, -2.55, 2.55, 7.65]) {
    box(x, roof + 1.6, -2.8, 3.9, 2.6, 2.9, casing);
    box(x, roof + 1.05, -1.33, 3.5, 1.5, .06, "#2a3135");
    for (const side of [-.95, .95]) {
      drum(x + side, roof + 3.15, -2.8, .78, .5, shroud);
      at(new THREE.CircleGeometry(.7, 14).rotateX(-Math.PI / 2), x + side, roof + 3.41, -2.8, "#15191c");
    }
  }
  // The lagged header behind them and the two runs back to the machine room.
  drum(0, roof + .75, -4.75, .16, 19.4, lagging, "x");
  for (const x of [-8.5, -3, 3, 8.5]) box(x, roof + .3, -4.75, .12, .6, .12, steel);
  for (const x of [-6.3, -5.7]) drum(x, roof + .75, -7, .16, 4.5, lagging, "z");
  // The machine room: a door with a work light over it, a louvre, an exhaust stack.
  box(-6, roof + 1.8, -11.5, 7.2, 3.6, 5, "#3b4347");
  box(-6, roof + 3.66, -11.5, 7.5, .12, 5.3, steel);
  box(-4, roof + 1.1, -8.97, 1.1, 2.2, .06, "#1b2024");
  box(-7.4, roof + 2.3, -8.97, 2.4, 1.1, .06, "#30383c");
  drum(-8.4, roof + 4.8, -12.5, .3, 2.4, shroud);
  box(-4, roof + 2.45, -8.93, .5, .14, .08, "#eef3ff", lit);
  at(new THREE.PlaneGeometry(2.6, 1.6), -4, roof + 2.45, -8.85, WORK_LIGHT.clone().multiplyScalar(.3), glows);

  const plantMesh = new THREE.Mesh(mergeGeometries(plant)!, drawnBuilding(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .78 })));
  plantMesh.name = "cold-storage-plant"; plantMesh.castShadow = true; wall.add(plantMesh);
  const litMesh = new THREE.Mesh(mergeGeometries(lit)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  litMesh.name = "cold-storage-work-light"; wall.add(litMesh);
  const glow = glowMaterial(new THREE.Color(0xffffff)); glow.vertexColors = true;
  const glowMesh = new THREE.Mesh(mergeGeometries(glows)!, glow);
  glowMesh.name = "cold-storage-glow"; glowMesh.renderOrder = 2; wall.add(glowMesh);
  [...plant, ...lit, ...glows].forEach(g => g.dispose());

  const dock = plan.modules.find(m => m.kind === "shutter" && m.open);
  if (dock) {
    // The open dock's white on its apron, fading out from the doorway: a grid on the ground as the paving is, since
    // the ground is only level to 15 cm. Its inside half lies under the building and is never seen.
    const cols = 8, rows = 8, half = dock.width / 2 + 1, reach = 3.3, positions: number[] = [], uvs: number[] = [], index: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const p = frontPoint(plan, dock.x - half + 2 * half * i / cols, -reach + 2 * reach * j / rows);
      positions.push(p.x, heightAt(p.x, p.z) + .05, p.z); uvs.push(i / cols, j / rows);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    const spill = new THREE.BufferGeometry();
    spill.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    spill.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); spill.setIndex(index);
    const spillMesh = new THREE.Mesh(spill, glowMaterial(DOCK_SPILL.clone()));
    spillMesh.name = "cold-storage-dock-spill"; spillMesh.renderOrder = 2; group.add(spillMesh);

    // The forklift, flat as the dock's inside is, just in front of its racking: a silhouette against the light.
    const parts: THREE.BufferGeometry[] = [];
    let layer = 0;
    const shape = (geometry: THREE.BufferGeometry, x: number, y: number, color = "#07090b") => {
      geometry.translate(x, y, layer++ * .002); parts.push(tint(geometry, new THREE.Color(color)));
    };
    for (const x of [-.5, .38]) shape(new THREE.CircleGeometry(.27, 12), x, .27);
    shape(new THREE.PlaneGeometry(1.3, .8), -.12, .66);
    shape(new THREE.PlaneGeometry(.4, .5), -.62, .95);
    shape(new THREE.PlaneGeometry(.3, .55), -.36, 1.3);
    for (const x of [-.66, .28]) shape(new THREE.PlaneGeometry(.07, 1.2), x, 1.66);
    shape(new THREE.PlaneGeometry(1.05, .08), -.19, 2.24);
    shape(new THREE.PlaneGeometry(.14, 2.3), .6, 1.2);
    shape(new THREE.PlaneGeometry(.08, .6), .72, .42);
    shape(new THREE.PlaneGeometry(.78, .06), 1.1, .1);
    shape(new THREE.PlaneGeometry(.9, .14), 1.1, .2, "#10151a");
    shape(new THREE.PlaneGeometry(.84, .82), 1.1, .68, "#161c21");
    const truck = new THREE.Group(); truck.name = "cold-storage-forklift";
    const silhouette = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
    const body = new THREE.Mesh(mergeGeometries(parts)!, silhouette);
    body.name = "cold-storage-forklift-body"; truck.add(body); parts.forEach(g => g.dispose());
    parts.length = 0; layer = 0;
    // End on, mid-turn: 1.1 m across, the overhead guard over the body and the mast's two uprights.
    for (const x of [-.42, .42]) shape(new THREE.PlaneGeometry(.2, .5), x, .25);
    shape(new THREE.PlaneGeometry(1.1, .8), 0, .66);
    for (const x of [-.5, .5]) shape(new THREE.PlaneGeometry(.07, 1.2), x, 1.66);
    shape(new THREE.PlaneGeometry(1.1, .08), 0, 2.24);
    for (const x of [-.3, .3]) shape(new THREE.PlaneGeometry(.1, 2.3), x, 1.2);
    const end = new THREE.Mesh(mergeGeometries(parts)!, silhouette);
    end.name = "cold-storage-forklift-end"; truck.add(end); parts.forEach(g => g.dispose());
    const lens = new THREE.MeshBasicMaterial({ color: AMBER_DARK.clone(), toneMapped: false });
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(.13, .12, .13), lens);
    beacon.name = "cold-storage-beacon"; beacon.position.set(-.5, 2.34, .04); truck.add(beacon);
    const flare = glowMaterial(new THREE.Color(0x000000));
    const flareMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), flare);
    flareMesh.name = "cold-storage-beacon-glow"; flareMesh.position.set(-.5, 2.34, .08); flareMesh.renderOrder = 2; truck.add(flareMesh);
    // Its turn on the apron floor, lying where the doorway lets it out.
    const pool = glowMaterial(new THREE.Color(0x000000));
    const front = frontPoint(plan, dock.x, 1.2), floor = heightAt(front.x, front.z) - plan.block.base + .06;
    const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4).rotateX(-Math.PI / 2), pool);
    poolMesh.name = "cold-storage-beacon-pool"; poolMesh.position.set(-.2, floor, 1.07); poolMesh.renderOrder = 2; truck.add(poolMesh);
    truck.position.set(dock.x, 0, .13); wall.add(truck);

    const activity = (seconds: number) => {
      const pose = forkliftPose(seconds), pulse = beaconPulse(seconds);
      truck.position.x = dock.x + pose.x;
      body.scale.x = pose.facing; body.visible = Math.abs(pose.facing) > 1e-3;
      end.scale.x = pose.endOn; end.visible = pose.endOn > 1e-3;
      beacon.position.x = flareMesh.position.x = -.5 * pose.facing; poolMesh.position.x = -.2 * pose.facing;
      lens.color.copy(AMBER_DARK).lerp(AMBER, pulse);
      flare.color.copy(AMBER).multiplyScalar(.08 + .92 * pulse);
      pool.color.copy(AMBER).multiplyScalar(.3 * pulse);
    };
    activity(0);
    addPlaceActivity(scene, COLD_STORAGE_ID, activity);
  }
  scene.add(group);
  return group;
}
