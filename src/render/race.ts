/**
 * The next checkpoint, drawn as a column of light you can see over the roofs —
 * the Midnight Club marker — with an arrow floating inside it showing which
 * way the route leaves. Drawn from the state the tick left behind: the sim
 * says where the next gate is, which way it is left and whether the race is
 * done, and this places a mesh there. It never decides whether a gate was
 * passed, and the arrow is the sim's exit direction, never a guess of its own.
 *
 * The arrow is a sign: a vertical arrow that faces the camera and turns in its
 * own plane, so it points up for straight on and left or right for a turn,
 * the way the minimap's chevron turns with the heading. An arrow lying in the
 * world was tried first, flat on the road and then as a floating slab, and
 * from a chase camera an arrow pointing away from you is a sliver or a box.
 * Projecting the sim's direction into the view is presentation, not a choice.
 */
import * as THREE from "three";
import type { RaceState } from "../sim/race.ts";

export interface RaceView {
  readonly group: THREE.Group;
  readonly column: THREE.Mesh;
  readonly ring: THREE.Mesh;
  /** The sign, floating inside the ring; hidden when the gate has no exit,
   *  which is how the finish looks different. */
  readonly arrow: THREE.Mesh;
}

const COLUMN_HEIGHT = 48;
/** The arrow along its own +X, in metres: tip and tail. */
export const ARROW_TIP = 4.5;
export const ARROW_TAIL = -4.5;
/** The sign's centre this far above the road at the gate: clear of traffic,
 *  well under the column's top, and read against the sky from a chase camera. */
export const ARROW_LIFT = 8;

/** An arrow pointing along +X in its own plane; the plane is turned to the camera each frame. */
function arrowGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(ARROW_TIP, 0);
  shape.lineTo(0.6, 3.2);
  shape.lineTo(0.6, 1.3);
  shape.lineTo(ARROW_TAIL, 1.3);
  shape.lineTo(ARROW_TAIL, -1.3);
  shape.lineTo(0.6, -1.3);
  shape.lineTo(0.6, -3.2);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

const right = new THREE.Vector3(), forward = new THREE.Vector3(), orientation = new THREE.Quaternion();

/** The angle, in the sign's plane, that points a world (x, z) exit the way the
 *  camera sees it: 0 is the camera's right, π/2 is up, which is away. */
export function signAngle(exit: { x: number; z: number }, camera: THREE.Object3D): number {
  camera.getWorldQuaternion(orientation);
  right.set(1, 0, 0).applyQuaternion(orientation);
  forward.set(0, 0, -1).applyQuaternion(orientation);
  return Math.atan2(exit.x * forward.x + exit.z * forward.z, exit.x * right.x + exit.z * right.z);
}

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
  const arrow = new THREE.Mesh(arrowGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffd58a, side: THREE.DoubleSide, depthWrite: false }));
  arrow.name = "race-beacon-arrow";
  arrow.position.y = ARROW_LIFT;
  arrow.visible = false;
  group.add(column, ring, arrow);
  group.visible = false;
  scene.add(group);
  return { group, column, ring, arrow };
}

/** Put the beacon on the next gate and turn its sign to the camera, pointing
 *  the way the gate is left; hide the sign when there is no exit and the
 *  beacon once there is no gate. Call after the camera is placed for the frame. */
export function updateRaceBeacon(view: RaceView, race: RaceState | null,
  surfaceHeight: (x: number, z: number) => number, camera: THREE.Object3D): void {
  if (!race || !race.next) { view.group.visible = false; return; }
  view.group.visible = true;
  view.group.position.set(race.next.x, surfaceHeight(race.next.x, race.next.z), race.next.z);
  const exit = race.next.exit;
  view.arrow.visible = exit !== null;
  if (!exit) return;
  camera.getWorldQuaternion(view.arrow.quaternion);
  view.arrow.rotateZ(signAngle(exit, camera));
}
