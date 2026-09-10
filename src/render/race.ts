/**
 * The next checkpoint, drawn as a column of light you can see over the roofs —
 * the Midnight Club marker. Drawn from the state the tick left behind: the sim
 * says where the next gate is and whether the race is done, and this places a
 * mesh there. It never decides whether a gate was passed.
 */
import * as THREE from "three";
import type { RaceState } from "../sim/race.ts";

export interface RaceView {
  readonly group: THREE.Group;
  readonly column: THREE.Mesh;
  readonly ring: THREE.Mesh;
}

const COLUMN_HEIGHT = 48;

export function addRaceBeacon(scene: THREE.Scene, radius: number): RaceView {
  const group = new THREE.Group();
  group.name = "race-beacon";
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, COLUMN_HEIGHT, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    }));
  column.name = "race-beacon-column";
  column.position.y = COLUMN_HEIGHT / 2;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.45, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd58a }));
  ring.name = "race-beacon-ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.6;
  group.add(column, ring);
  group.visible = false;
  scene.add(group);
  return { group, column, ring };
}

/** Put the beacon on the next gate, or hide it once there is none. */
export function updateRaceBeacon(view: RaceView, race: RaceState | null,
  surfaceHeight: (x: number, z: number) => number): void {
  if (!race || !race.next) { view.group.visible = false; return; }
  view.group.visible = true;
  view.group.position.set(race.next.x, surfaceHeight(race.next.x, race.next.z), race.next.z);
}
